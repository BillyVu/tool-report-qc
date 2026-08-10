import { basename, join } from 'node:path';
import { db } from './db.js';
import { toJsonbParam } from './jsonParam.js';
import { validatePhotoWithAi } from './photoQuality.js';
import { WorkerSessionEvent } from './workerRealtime.js';

export const PHOTO_QUALITY_JOB = 'PHOTO_QUALITY';

export interface PhotoQualityPayload {
  photoId: string;
  jobId: string;
  stepId: string;
  slotIndex: number;
  mimeType: string;
  storagePath: string;
  prompt: string;
  promptHash: string;
  profileRevision: number;
}

export interface PhotoQualityRunOptions {
  uploadsDirectory: string;
  onPublish: (jobId: string, event: WorkerSessionEvent) => void;
  limit?: number;
}

export async function enqueuePhotoQualityCheck(payload: PhotoQualityPayload): Promise<void> {
  await db.query(`INSERT INTO background_jobs (type, payload) VALUES ('PHOTO_QUALITY', $1)`, [payload]);
}

async function finishJob(jobId: string, status: 'COMPLETED' | 'FAILED', error?: unknown): Promise<void> {
  const detail = error instanceof Error ? error.message.slice(0, 500) : null;
  await db.query(
    `UPDATE background_jobs
        SET status = $2,
            dispatched_at = NULL,
            last_error = $3,
            completed_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE completed_at END,
            updated_at = now()
      WHERE id = $1`,
    [jobId, status, detail],
  );
}

async function processQualityJob(
  job: { id: string; payload: PhotoQualityPayload },
  options: PhotoQualityRunOptions,
): Promise<void> {
  const { photoId, jobId, stepId, slotIndex, mimeType, storagePath, prompt } = job.payload;
  try {
    const photo = await db.query(`SELECT id FROM evidence_photos WHERE id = $1`, [photoId]);
    if (!photo.rowCount) {
      await finishJob(job.id, 'COMPLETED');
      return;
    }
    const filePath = join(options.uploadsDirectory, basename(storagePath));
    const aiQuality = await validatePhotoWithAi(filePath, mimeType, prompt);

    await db.query(
      `UPDATE evidence_photos
          SET ai_quality_status = $2,
              ai_quality_message = $3,
              quality_reason_code = $4,
              quality_result_json = $5,
              updated_at = now()
        WHERE id = $1`,
      [photoId, aiQuality.status, aiQuality.message, aiQuality.reasonCode, aiQuality.resultJson ? toJsonbParam(aiQuality.resultJson) : null],
    );
    await finishJob(job.id, 'COMPLETED');

    if (aiQuality.status === 'REJECTED') {
      await db.query(
        `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
         VALUES ($1, 'SYSTEM', 'Vero', 'PHOTO_QUALITY_REJECTED', $2)`,
        [jobId, toJsonbParam({ photoId, stepId, slotIndex: Number(slotIndex), reason: aiQuality.message })],
      );
    }

    options.onPublish(jobId, {
      type: 'PHOTO_QUALITY_RESULT',
      photoId,
      stepId,
      slotIndex: Number(slotIndex),
      photoUrl: `/uploads/${encodeURIComponent(basename(storagePath))}`,
      status: aiQuality.status,
      message: aiQuality.message,
      manualOverrideAvailable: aiQuality.status === 'UNAVAILABLE',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.slice(0, 500) : 'Photo quality check failed';
    const updated = await db.query(
      `UPDATE background_jobs
          SET attempts = attempts + 1,
              last_error = $2,
              status = CASE WHEN attempts + 1 >= 3 THEN 'FAILED' ELSE 'PENDING' END,
              dispatched_at = NULL,
              completed_at = CASE WHEN attempts + 1 >= 3 THEN now() ELSE completed_at END,
              updated_at = now()
        WHERE id = $1
        RETURNING attempts`,
      [job.id, detail],
    );
    if (updated.rowCount && Number(updated.rows[0].attempts) >= 3) {
      options.onPublish(jobId, {
        type: 'PHOTO_QUALITY_RESULT',
        photoId,
        stepId,
        slotIndex: Number(slotIndex),
        photoUrl: `/uploads/${encodeURIComponent(basename(storagePath))}`,
        status: 'UNAVAILABLE',
        message: 'Vero chưa thể kiểm tra ảnh. Công nhân có thể căn lại ảnh và xác nhận tải thủ công.',
        manualOverrideAvailable: true,
      });
    }
  }
}

/**
 * Returns PHOTO_QUALITY jobs stranded as DISPATCHED by a crashed pump back to
 * PENDING so they are retried, mirroring the outbox reclaim model.
 */
async function reclaimStaleQualityJobs(): Promise<void> {
  await db.query(
    `UPDATE background_jobs
        SET status = 'PENDING', dispatched_at = NULL, updated_at = now()
      WHERE type = 'PHOTO_QUALITY' AND status = 'DISPATCHED'
        AND dispatched_at < now() - interval '5 minutes'`,
  );
}

/**
 * Picks pending PHOTO_QUALITY jobs, claims them as DISPATCHED, and runs the
 * (slow) Gemini quality check outside the transaction. Rows stay claimable so a
 * crash mid-run is reclaimed after 5 minutes instead of double-processing on the
 * next pump tick.
 */
export async function runPhotoQualityJobs(options: PhotoQualityRunOptions): Promise<number> {
  await reclaimStaleQualityJobs();
  const client = await db.connect();
  let rows: { id: string; payload: PhotoQualityPayload }[];
  try {
    await client.query('BEGIN');
    const jobs = await client.query(
      `SELECT id, payload FROM background_jobs
        WHERE status = 'PENDING' AND type = 'PHOTO_QUALITY'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [options.limit ?? 5],
    );
    rows = jobs.rows;
    for (const job of rows) {
      await client.query(
        `UPDATE background_jobs SET status = 'DISPATCHED', dispatched_at = now(), updated_at = now() WHERE id = $1`,
        [job.id],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await Promise.allSettled(rows.map((job) => processQualityJob(job, options)));
  return rows.length;
}
