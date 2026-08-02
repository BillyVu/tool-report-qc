import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInitialStepResults, updateJobStatusSql } from './adminJobs';

test('builds initial step results from the saved checklist template snapshot', () => {
  const now = '2026-08-02T00:00:00.000Z';

  const stepResults = buildInitialStepResults({
    steps: [
      { stepId: 'S1', title: 'Check serial' },
      { stepId: 'S2', title: 'Check screen' },
    ],
  }, now);

  assert.deepEqual(stepResults, [
    {
      stepId: 'S1',
      status: 'PENDING',
      note: 'Chờ công nhân kiểm tra và tải ảnh thực tế.',
      timestamp: now,
    },
    {
      stepId: 'S2',
      status: 'PENDING',
      note: 'Chờ công nhân kiểm tra và tải ảnh thực tế.',
      timestamp: now,
    },
  ]);
});

test('job status update SQL casts the admin status parameter to qc_job_status', () => {
  assert.match(updateJobStatusSql, /status = \$2::qc_job_status/);
  assert.match(updateJobStatusSql, /WHEN \$2::qc_job_status = 'COMPLETED'/);
});
