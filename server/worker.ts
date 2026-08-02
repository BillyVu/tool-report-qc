import 'dotenv/config';
import { db } from './db.js';
import { dispatchPendingJobs, markPhotoFailed, markPhotoProcessed } from './outbox.js';
import { canRetry, createQueueChannel, nextRetry, parseJobMessage, PHOTO_DEAD_LETTER_QUEUE, PHOTO_RETRY_QUEUE, publishJob, retryConnection } from './queue.js';

async function startWorker() {
  const { connection, channel } = await retryConnection(() => createQueueChannel(), { label: 'RabbitMQ photo worker' });
  await channel.prefetch(Number(process.env.WORKER_PREFETCH || 2));

  const dispatch = async () => {
    try {
      await dispatchPendingJobs(channel);
    } catch (error) {
      console.error('Outbox dispatch failed; jobs remain in PostgreSQL for a later retry.', error);
    }
  };
  await dispatch();
  const timer = setInterval(dispatch, 10_000);

  await channel.consume('qc.photo-processing', async (raw) => {
    if (!raw) return;
    let message;
    try {
      message = parseJobMessage(raw.content);
      const photo = await db.query(`SELECT id FROM evidence_photos WHERE id = $1`, [message.photoId]);
      if (!photo.rowCount) throw new Error('Evidence photo no longer exists');
      await markPhotoProcessed(message.photoId);
      channel.ack(raw);
    } catch (error) {
      try {
        if (!message) {
          channel.sendToQueue(PHOTO_DEAD_LETTER_QUEUE, raw.content, { persistent: true, contentType: raw.properties.contentType });
          await channel.waitForConfirms();
          channel.ack(raw);
          return;
        }
        const retry = nextRetry(message);
        await markPhotoFailed(message.photoId, retry.attempts, error);
        await publishJob(channel, retry, canRetry(message) ? PHOTO_RETRY_QUEUE : PHOTO_DEAD_LETTER_QUEUE);
        channel.ack(raw);
      } catch (secondaryError) {
        console.error('Worker could not safely requeue a job; it remains unacknowledged for RabbitMQ recovery.', secondaryError);
        channel.nack(raw, false, true);
      }
    }
  }, { noAck: false });

  const close = async () => {
    clearInterval(timer);
    await channel.close();
    await connection.close();
    await db.end();
    process.exit(0);
  };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
}

startWorker().catch((error) => {
  console.error('Worker failed to start', error);
  process.exit(1);
});
