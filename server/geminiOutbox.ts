import { ConfirmChannel } from 'amqplib';
import { db } from './db.js';
import { publishGeminiJob } from './queue.js';

export async function enqueueGeminiAnalysis(analysisId: string, photoId: string): Promise<void> {
  await db.query(`INSERT INTO background_jobs (type, payload) VALUES ('GEMINI_ANALYZE', $1)`, [{ analysisId, photoId }]);
}

export async function dispatchPendingGeminiJobs(channel: ConfirmChannel): Promise<number> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const jobs = await client.query(`SELECT id, payload FROM background_jobs WHERE type = 'GEMINI_ANALYZE' AND status = 'PENDING' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 10`);
    for (const job of jobs.rows) {
      await publishGeminiJob(channel, { type: 'GEMINI_ANALYZE', analysisId: job.payload.analysisId, photoId: job.payload.photoId, attempts: 0 });
      await client.query(`UPDATE background_jobs SET status = 'DISPATCHED', dispatched_at = now(), updated_at = now() WHERE id = $1`, [job.id]);
    }
    await client.query('COMMIT');
    return jobs.rowCount || 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
