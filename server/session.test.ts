import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken, hashSessionToken, verifySessionToken } from './session.js';

test('a generated worker-session token verifies only against its own hash', () => {
  const token = createSessionToken();
  const hash = hashSessionToken(token);

  assert.equal(verifySessionToken(token, hash), true);
  assert.equal(verifySessionToken(`${token}x`, hash), false);
});

test('generated worker-session tokens have sufficient entropy and URL-safe form', () => {
  const token = createSessionToken();

  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
});
