const ADMIN_API_KEY_STORAGE_KEY = 'tool-report-qc.adminApiKey';

export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): BrowserStorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage;
}

function sanitizeKey(key: string) {
  return key.trim();
}

export function loadStoredAdminApiKey(storage: BrowserStorageLike | undefined = getBrowserStorage()) {
  return sanitizeKey(storage?.getItem(ADMIN_API_KEY_STORAGE_KEY) || '');
}

export function saveStoredAdminApiKey(key: string, storage: BrowserStorageLike | undefined = getBrowserStorage()) {
  const nextKey = sanitizeKey(key);
  if (!storage) return nextKey;
  if (nextKey) {
    storage.setItem(ADMIN_API_KEY_STORAGE_KEY, nextKey);
  } else {
    storage.removeItem(ADMIN_API_KEY_STORAGE_KEY);
  }
  return nextKey;
}

export function clearStoredAdminApiKey(storage: BrowserStorageLike | undefined = getBrowserStorage()) {
  storage?.removeItem(ADMIN_API_KEY_STORAGE_KEY);
}

export function hasStoredAdminSession(storage: BrowserStorageLike | undefined = getBrowserStorage()) {
  return Boolean(loadStoredAdminApiKey(storage));
}

export const adminAuthStorageKey = ADMIN_API_KEY_STORAGE_KEY;
