import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyGeminiError, retryDelayMs, shouldOpenCircuit } from './geminiPolicy.js';

test('quota exhaustion is retried with exponential backoff and jitter', () => {
  assert.equal(classifyGeminiError({ status: 429 }), 'RETRY');
  assert.equal(retryDelayMs(0, () => 0), 30_000);
  assert.equal(retryDelayMs(2, () => 0), 120_000);
});

test('invalid Gemini requests are final and never retried', () => {
  assert.equal(classifyGeminiError({ status: 400 }), 'FINAL');
  assert.equal(classifyGeminiError({ status: 403 }), 'FINAL');
});

test('three quota failures open the circuit breaker', () => {
  assert.equal(shouldOpenCircuit(2), false);
  assert.equal(shouldOpenCircuit(3), true);
});
