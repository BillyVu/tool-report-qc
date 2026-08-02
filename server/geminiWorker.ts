import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { db } from './db.js';
import { dispatchPendingGeminiJobs } from './geminiOutbox.js';
import { classifyGeminiError, retryDelayMs, shouldOpenCircuit } from './geminiPolicy.js';
import { createGeminiQueueChannel, GEMINI_ANALYSIS_QUEUE, GEMINI_DEAD_LETTER_QUEUE, GEMINI_RETRY_QUEUE, parseGeminiMessage, publishGeminiJob } from './queue.js';

const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const uploadsDirectory = process.env.UPLOADS_DIR || '/srv/tool-report-qc/uploads';
const minIntervalMs = Math.ceil(60_000 / Math.max(1, Number(process.env.GEMINI_MAX_RPM || 10)));
const circuitCooldownMs = Number(process.env.GEMINI_CIRCUIT_COOLDOWN_MS || 300_000);
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

function promptFor(detectType: string): string {
  if (detectType === 'IMEI_SERIAL') return 'Trích xuất chính xác IMEI 15 số hoặc số serial. Chỉ trả về dữ liệu nhìn thấy, không suy đoán.';
  if (detectType === 'OCR_TEXT') return 'Trích xuất văn bản và thông số nhìn thấy trong ảnh. Không tự suy đoán.';
  if (detectType === 'COLOR_SCREEN') return 'Mô tả tình trạng màu màn hình và lỗi nhìn thấy trong ảnh. Không kết luận nếu ảnh không đủ dữ liệu.';
  return 'Phân tích ảnh kiểm định QC, chỉ nêu quan sát có thể xác minh từ ảnh.';
}

async function waitForGeminiSlot(): Promise<number> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT next_allowed_at, circuit_open_until FROM gemini_control WHERE id = true FOR UPDATE`);
    const row = result.rows[0];
    const now = Date.now();
    const blockedUntil = Math.max(new Date(row.next_allowed_at).getTime(), row.circuit_open_until ? new Date(row.circuit_open_until).getTime() : 0);
    if (blockedUntil > now) {
      await client.query('COMMIT');
      return blockedUntil - now;
    }
    await client.query(`UPDATE gemini_control SET next_allowed_at = now() + ($1 * interval '1 millisecond'), updated_at = now() WHERE id = true`, [minIntervalMs]);
    await client.query('COMMIT');
    return 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function scheduleRetry(analysisId: string, attempts: number, delayMs: number, error: unknown, quotaFailure: boolean) {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Gemini request failed';
  const control = await db.query(`UPDATE gemini_control SET consecutive_quota_failures = CASE WHEN $1 THEN consecutive_quota_failures + 1 ELSE 0 END, updated_at = now() WHERE id = true RETURNING consecutive_quota_failures`, [quotaFailure]);
  const failures = control.rows[0].consecutive_quota_failures;
  if (quotaFailure && shouldOpenCircuit(failures)) {
    await db.query(`UPDATE gemini_control SET circuit_open_until = now() + ($1 * interval '1 millisecond'), updated_at = now() WHERE id = true`, [Math.max(delayMs, circuitCooldownMs)]);
  }
  await db.query(`UPDATE gemini_analyses SET status = 'WAITING_FOR_QUOTA', attempts = $2, next_retry_at = now() + ($3 * interval '1 millisecond'), error_message = $4, updated_at = now() WHERE id = $1`, [analysisId, attempts, delayMs, message]);
}

async function startGeminiWorker() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
  const { connection, channel } = await createGeminiQueueChannel();
  await channel.prefetch(1);
  const dispatch = async () => { try { await dispatchPendingGeminiJobs(channel); } catch (error) { console.error('Gemini outbox dispatch failed', error); } };
  await dispatch();
  const timer = setInterval(dispatch, 10_000);

  await channel.consume(GEMINI_ANALYSIS_QUEUE, async (raw) => {
    if (!raw) return;
    let message;
    try {
      message = parseGeminiMessage(raw.content);
      const waitMs = await waitForGeminiSlot();
      if (waitMs > 0) {
        await scheduleRetry(message.analysisId, message.attempts, waitMs, new Error('Gemini circuit or rate limiter is active'), false);
        await publishGeminiJob(channel, message, GEMINI_RETRY_QUEUE, waitMs);
        channel.ack(raw);
        return;
      }
      const analysis = await db.query(`SELECT a.*, p.storage_path, p.mime_type FROM gemini_analyses a JOIN evidence_photos p ON p.id = a.photo_id WHERE a.id = $1 AND a.photo_id = $2`, [message.analysisId, message.photoId]);
      if (!analysis.rowCount || analysis.rows[0].status === 'COMPLETED') { channel.ack(raw); return; }
      const row = analysis.rows[0];
      await db.query(`UPDATE gemini_analyses SET status = 'PROCESSING', updated_at = now() WHERE id = $1`, [message.analysisId]);
      const image = await readFile(`${uploadsDirectory}/${row.storage_path}`);
      const response = await ai.models.generateContent({ model, contents: [{ inlineData: { data: image.toString('base64'), mimeType: row.mime_type } }, { text: promptFor(row.detect_type) }] });
      await db.query(`UPDATE gemini_analyses SET status = 'COMPLETED', result_text = $2, error_message = NULL, completed_at = now(), updated_at = now() WHERE id = $1`, [message.analysisId, response.text || '']);
      await db.query(`UPDATE background_jobs SET status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE type = 'GEMINI_ANALYZE' AND payload->>'analysisId' = $1`, [message.analysisId]);
      await db.query(`UPDATE gemini_control SET consecutive_quota_failures = 0, circuit_open_until = NULL, updated_at = now() WHERE id = true`);
      channel.ack(raw);
    } catch (error) {
      if (!message) { channel.sendToQueue(GEMINI_DEAD_LETTER_QUEUE, raw.content, { persistent: true }); await channel.waitForConfirms(); channel.ack(raw); return; }
      const retryable = classifyGeminiError(error) === 'RETRY';
      const attempts = message.attempts + 1;
      if (retryable && attempts <= 6) {
        const delayMs = retryDelayMs(message.attempts);
        const errorCode = error as { status?: number; code?: number };
        await scheduleRetry(message.analysisId, attempts, delayMs, error, errorCode.status === 429 || errorCode.code === 429);
        await publishGeminiJob(channel, { ...message, attempts }, GEMINI_RETRY_QUEUE, delayMs);
      } else {
        const detail = error instanceof Error ? error.message.slice(0, 500) : 'Gemini analysis failed';
        await db.query(`UPDATE gemini_analyses SET status = 'FAILED_FINAL', attempts = $2, error_message = $3, updated_at = now() WHERE id = $1`, [message.analysisId, attempts, detail]);
        await db.query(`UPDATE background_jobs SET status = 'FAILED', attempts = $2, last_error = $3, updated_at = now() WHERE type = 'GEMINI_ANALYZE' AND payload->>'analysisId' = $1`, [message.analysisId, attempts, detail]);
        await publishGeminiJob(channel, { ...message, attempts }, GEMINI_DEAD_LETTER_QUEUE);
      }
      channel.ack(raw);
    }
  }, { noAck: false });
  const close = async () => { clearInterval(timer); await channel.close(); await connection.close(); await db.end(); process.exit(0); };
  process.on('SIGTERM', close); process.on('SIGINT', close);
}

startGeminiWorker().catch((error) => { console.error('Gemini worker failed to start', error); process.exit(1); });
