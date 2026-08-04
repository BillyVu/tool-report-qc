import assert from 'node:assert/strict';
import test from 'node:test';
import { TESTER_AUDIT_LOGS, TESTER_JOBS, TESTER_TEMPLATES } from './testerDefaults.js';

test('tester environment starts without seeded QC records', () => {
  assert.deepEqual(TESTER_TEMPLATES, []);
  assert.deepEqual(TESTER_JOBS, []);
  assert.deepEqual(TESTER_AUDIT_LOGS, []);
});
