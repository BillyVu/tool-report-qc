import assert from 'node:assert/strict';
import test from 'node:test';
import { QUICK_TOUR_STORAGE_KEY, hasQuickTourBeenSeen, markQuickTourSeen } from './onboarding/QuickTour';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

test('Quick Tour only treats the explicit seen marker as completed', () => {
  assert.equal(hasQuickTourBeenSeen(createStorage()), false);
  assert.equal(hasQuickTourBeenSeen(createStorage({ [QUICK_TOUR_STORAGE_KEY]: 'false' })), false);
  assert.equal(hasQuickTourBeenSeen(createStorage({ [QUICK_TOUR_STORAGE_KEY]: 'true' })), true);
});

test('Quick Tour stores its seen marker under the Vero QC key', () => {
  const storage = createStorage();

  markQuickTourSeen(storage);

  assert.equal(storage.getItem(QUICK_TOUR_STORAGE_KEY), 'true');
});

test('Quick Tour tolerates browser storage failures', () => {
  const unavailableStorage = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => undefined,
  };

  assert.equal(hasQuickTourBeenSeen(unavailableStorage), false);
  assert.doesNotThrow(() => markQuickTourSeen(unavailableStorage));
});
