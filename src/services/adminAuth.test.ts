import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adminAuthStorageKey,
  clearStoredAdminApiKey,
  hasStoredAdminSession,
  loadStoredAdminApiKey,
  saveStoredAdminApiKey,
} from './adminAuth';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

test('stores the admin API key so admin users do not need to login again', () => {
  const storage = createMemoryStorage();

  const saved = saveStoredAdminApiKey('  secret-key  ', storage);

  assert.equal(saved, 'secret-key');
  assert.equal(loadStoredAdminApiKey(storage), 'secret-key');
  assert.equal(hasStoredAdminSession(storage), true);
});

test('clears the stored admin session on logout or empty update', () => {
  const storage = createMemoryStorage({ [adminAuthStorageKey]: 'secret-key' });

  clearStoredAdminApiKey(storage);

  assert.equal(loadStoredAdminApiKey(storage), '');
  assert.equal(hasStoredAdminSession(storage), false);

  saveStoredAdminApiKey('new-key', storage);
  saveStoredAdminApiKey('', storage);

  assert.equal(loadStoredAdminApiKey(storage), '');
});
