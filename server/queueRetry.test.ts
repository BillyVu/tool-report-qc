import assert from 'node:assert/strict';
import test from 'node:test';
import { retryConnection } from './queue.js';

test('retryConnection retries transient startup failures before succeeding', async () => {
  let attempts = 0;

  const result = await retryConnection(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('broker is booting');
    return 'connected';
  }, { maxAttempts: 4, delayMs: 0, label: 'test broker' });

  assert.equal(result, 'connected');
  assert.equal(attempts, 3);
});

test('retryConnection throws after the configured attempts are exhausted', async () => {
  let attempts = 0;

  await assert.rejects(
    () => retryConnection(async () => {
      attempts += 1;
      throw new Error('still unavailable');
    }, { maxAttempts: 2, delayMs: 0, label: 'test broker' }),
    /still unavailable/,
  );

  assert.equal(attempts, 2);
});
