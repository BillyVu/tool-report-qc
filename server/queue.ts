import amqp, { ChannelModel, ConfirmChannel } from 'amqplib';

export const PHOTO_PROCESSING_QUEUE = 'qc.photo-processing';
export const PHOTO_RETRY_QUEUE = 'qc.photo-processing.retry';
export const PHOTO_DEAD_LETTER_QUEUE = 'qc.photo-processing.dlq';
export const GEMINI_ANALYSIS_QUEUE = 'qc.gemini-analysis';
export const GEMINI_RETRY_QUEUE = 'qc.gemini-analysis.retry';
export const GEMINI_DEAD_LETTER_QUEUE = 'qc.gemini-analysis.dlq';
const MAX_ATTEMPTS = 3;

export interface PhotoProcessMessage {
  type: 'PHOTO_PROCESS';
  photoId: string;
  attempts: number;
}

export interface GeminiAnalysisMessage {
  type: 'GEMINI_ANALYZE';
  analysisId: string;
  photoId: string;
  attempts: number;
}

export function parseJobMessage(buffer: Buffer): PhotoProcessMessage {
  const parsed = JSON.parse(buffer.toString('utf8'));
  if (parsed?.type !== 'PHOTO_PROCESS' || typeof parsed.photoId !== 'string' || !parsed.photoId || (parsed.attempts !== undefined && (!Number.isInteger(parsed.attempts) || parsed.attempts < 0))) {
    throw new Error('Invalid background job message');
  }
  return { type: parsed.type, photoId: parsed.photoId, attempts: parsed.attempts ?? 0 };
}

export function parseGeminiMessage(buffer: Buffer): GeminiAnalysisMessage {
  const parsed = JSON.parse(buffer.toString('utf8'));
  if (parsed?.type !== 'GEMINI_ANALYZE' || typeof parsed.analysisId !== 'string' || !parsed.analysisId || typeof parsed.photoId !== 'string' || !parsed.photoId || (parsed.attempts !== undefined && (!Number.isInteger(parsed.attempts) || parsed.attempts < 0))) {
    throw new Error('Invalid Gemini analysis message');
  }
  return { type: 'GEMINI_ANALYZE', analysisId: parsed.analysisId, photoId: parsed.photoId, attempts: parsed.attempts ?? 0 };
}

export function nextRetry(message: PhotoProcessMessage): PhotoProcessMessage {
  return { ...message, attempts: message.attempts + 1 };
}

export function canRetry(message: PhotoProcessMessage): boolean {
  return message.attempts < MAX_ATTEMPTS;
}

export async function createQueueChannel(url = process.env.RABBITMQ_URL): Promise<{ connection: ChannelModel; channel: ConfirmChannel }> {
  if (!url) throw new Error('RABBITMQ_URL is required');
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  await channel.assertQueue(PHOTO_PROCESSING_QUEUE, { durable: true });
  await channel.assertQueue(PHOTO_RETRY_QUEUE, {
    durable: true,
    arguments: {
      'x-message-ttl': 30_000,
      'x-dead-letter-exchange': '',
      'x-dead-letter-routing-key': PHOTO_PROCESSING_QUEUE,
    },
  });
  await channel.assertQueue(PHOTO_DEAD_LETTER_QUEUE, { durable: true });
  return { connection, channel };
}

export async function createGeminiQueueChannel(url = process.env.RABBITMQ_URL): Promise<{ connection: ChannelModel; channel: ConfirmChannel }> {
  if (!url) throw new Error('RABBITMQ_URL is required');
  const connection = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  await channel.assertQueue(GEMINI_ANALYSIS_QUEUE, { durable: true });
  await channel.assertQueue(GEMINI_RETRY_QUEUE, {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': GEMINI_ANALYSIS_QUEUE },
  });
  await channel.assertQueue(GEMINI_DEAD_LETTER_QUEUE, { durable: true });
  return { connection, channel };
}

export async function publishJob(channel: ConfirmChannel, message: PhotoProcessMessage, queue = PHOTO_PROCESSING_QUEUE): Promise<void> {
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true, contentType: 'application/json' });
  await channel.waitForConfirms();
}

export async function publishGeminiJob(channel: ConfirmChannel, message: GeminiAnalysisMessage, queue = GEMINI_ANALYSIS_QUEUE, delayMs?: number): Promise<void> {
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: 'application/json',
    ...(delayMs ? { expiration: String(delayMs) } : {}),
  });
  await channel.waitForConfirms();
}
