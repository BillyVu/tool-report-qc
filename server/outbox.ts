import { db } from './db.js';
import { ConfirmChannel } from 'amqplib';
import { PHOTO_PROCESSING_QUEUE, publishJob } from './queue.js';

export async function enqueuePhotoProcessing(photoId: string): Promise<void> {
  await db.query(`INSERT INTO background_jobs (type, payload) VALUES ('PHOTO_PROCESS', $1)`, [{ photoId }]);
}

export async function dispatchPendingJobs(channel: ConfirmChannel): Promise<number> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const jobs = await client.query(
      `SELECT id, payload FROM background_jobs
        WHERE status = 'PENDING' AND type = 'PHOTO_PROCESS'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 25`,
    );
    for (const job of jobs.rows) {
      await publishJob(channel, { type: 'PHOTO_PROCESS', photoId: job.payload.photoId, attempts: 0 }, PHOTO_PROCESSING_QUEUE);
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

export async function markPhotoProcessed(photoId: string): Promise<void> {
  await db.query(`UPDATE evidence_photos SET processing_status = 'READY' WHERE id = $1`, [photoId]);
  await db.query(`UPDATE background_jobs SET status = 'COMPLETED', completed_at = now(), updated_at = now() WHERE type = 'PHOTO_PROCESS' AND payload->>'photoId' = $1 AND status <> 'COMPLETED'`, [photoId]);
}

export async function markPhotoFailed(photoId: string, attempts: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown worker error';
  await db.query(`UPDATE background_jobs SET attempts = $2, last_error = $3, updated_at = now(), status = CASE WHEN $2 >= 3 THEN 'FAILED' ELSE status END WHERE type = 'PHOTO_PROCESS' AND payload->>'photoId' = $1 AND status <> 'COMPLETED'`, [photoId, attempts, message]);
  if (attempts >= 3) await db.query(`UPDATE evidence_photos SET processing_status = 'FAILED' WHERE id = $1`, [photoId]);
}
