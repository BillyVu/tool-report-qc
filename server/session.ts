import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifySessionToken(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashSessionToken(token), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
