import assert from 'node:assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { WorkerSessionRealtime } from './workerRealtime.js';

test('publishes photo events only to worker sockets for the matching job', () => {
  const realtime = new WorkerSessionRealtime();
  const jobMessages: string[] = [];
  const otherJobMessages: string[] = [];
  const makeSocket = (messages: string[]) => ({
    readyState: WebSocket.OPEN,
    send: (payload: string) => messages.push(payload),
    once: () => undefined,
  }) as unknown as WebSocket;

  realtime.add('JOB-001', makeSocket(jobMessages));
  realtime.add('JOB-002', makeSocket(otherJobMessages));
  realtime.publish('JOB-001', {
    type: 'PHOTO_SAVED',
    photoId: 'photo-1',
    stepId: 'STEP_1',
    slotIndex: 1,
    photoUrl: '/uploads/photo-1.jpg',
    manualOverride: false,
    aiQualityStatus: 'APPROVED',
    message: 'Ảnh đã được lưu trên server.',
  });

  assert.equal(jobMessages.length, 1);
  assert.equal(otherJobMessages.length, 0);
  assert.equal(JSON.parse(jobMessages[0]).photoUrl, '/uploads/photo-1.jpg');
});
