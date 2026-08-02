import assert from 'node:assert/strict';
import test from 'node:test';
import { nextRetry, parseJobMessage } from './queue.js';

test('a new background job starts at attempt zero', () => {
  const message = parseJobMessage(Buffer.from(JSON.stringify({ type: 'PHOTO_PROCESS', photoId: 'photo-1' })));
  assert.deepEqual(message, { type: 'PHOTO_PROCESS', photoId: 'photo-1', attempts: 0 });
});

test('a failed background job retries with an incremented attempt count', () => {
  assert.deepEqual(nextRetry({ type: 'PHOTO_PROCESS', photoId: 'photo-1', attempts: 1 }), {
    type: 'PHOTO_PROCESS', photoId: 'photo-1', attempts: 2,
  });
});

test('a malformed background job is rejected before a worker processes it', () => {
  assert.throws(() => parseJobMessage(Buffer.from('{')));
  assert.throws(() => parseJobMessage(Buffer.from(JSON.stringify({ type: 'OTHER', photoId: 'photo-1' }))));
});
