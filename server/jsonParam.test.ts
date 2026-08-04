import assert from 'node:assert/strict';
import test from 'node:test';
import { toJsonbParam } from './jsonParam.js';

test('serializes arrays as JSON strings for pg jsonb parameters', () => {
  const value = [{ stepId: 'STEP-001', photoUrl: 'data:image/png;base64,abc==' }];

  assert.equal(toJsonbParam(value), JSON.stringify(value));
});
