import assert from 'node:assert/strict';
import test from 'node:test';
import { publishWorkerSessionEvent, startRealtimeRelay, WORKER_SESSION_EVENT_CHANNEL, RealtimeListenClient } from './realtimeBridge.js';

test('publishes worker session events to the PostgreSQL notify channel', async () => {
  const calls: Array<[string, unknown[] | undefined]> = [];
  const client = {
    query: async (text: string, values?: unknown[]) => {
      calls.push([text, values]);
      return {};
    },
  };

  await publishWorkerSessionEvent(client, 'JOB-001', {
    type: 'PHOTO_SAVED',
    photoId: 'photo-1',
    stepId: 'STEP_1',
    slotIndex: 1,
    photoUrl: '/uploads/photo-1.jpg',
    manualOverride: false,
    aiQualityStatus: 'APPROVED',
    message: 'Ảnh đã được lưu trên server.',
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /pg_notify/);
  const [channel, payload] = calls[0][1] as [string, string];
  assert.equal(channel, WORKER_SESSION_EVENT_CHANNEL);
  assert.deepEqual(JSON.parse(payload).jobId, 'JOB-001');
  assert.equal(JSON.parse(payload).event.type, 'PHOTO_SAVED');
});

test('relays cross-process notify events to the local realtime handler', async () => {
  const received: Array<[string, unknown]> = [];
  const handlers: Record<string, (message: unknown) => void> = {};
  const listenCalls: string[] = [];
  let endCalled = false;
  const fake = {
    on: (event: string, handler: (message: unknown) => void) => {
      handlers[event] = handler;
      return fake;
    },
    connect: async () => undefined,
    query: async (text: string) => {
      listenCalls.push(text);
      return {};
    },
    end: async () => {
      endCalled = true;
    },
  } as unknown as RealtimeListenClient;

  const handle = await startRealtimeRelay({
    createClient: () => fake,
    onEvent: (jobId, event) => received.push([jobId, event]),
  });

  assert.deepEqual(listenCalls, [`LISTEN ${WORKER_SESSION_EVENT_CHANNEL}`]);

  handlers.notification!({
    channel: WORKER_SESSION_EVENT_CHANNEL,
    payload: JSON.stringify({
      jobId: 'JOB-002',
      event: {
        type: 'ANALYSIS_COMPLETED',
        photoId: 'photo-2',
        stepId: 'STEP_2',
        slotIndex: 1,
        summaryText: 'IMEI: 123456789012345',
        resultJson: { imei: '123456789012345' },
        message: 'Vero đã phân tích xong ảnh này.',
      },
    }),
  });

  assert.equal(received.length, 1);
  assert.equal(received[0][0], 'JOB-002');
  assert.equal((received[0][1] as { type: string }).type, 'ANALYSIS_COMPLETED');

  handlers.notification!({ channel: 'other-channel', payload: '{}' });
  assert.equal(received.length, 1, 'ignores events on other channels');

  await handle.stop();
  assert.equal(endCalled, true);
});
