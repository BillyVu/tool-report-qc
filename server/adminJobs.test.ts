import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStepResultsUpdate, attachEvidencePhotosToStepResults, attachUploadedPhotoToStepResults, buildInitialStepResults, calculateExtendedSessionExpiry, moderateStepResults, replacePhotoInStepResults, updateJobStatusSql } from './adminJobs';

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
      sampleSize: '120 pcs',
      timestamp: now,
    },
    {
      stepId: 'S2',
      status: 'PENDING',
      note: 'Chờ công nhân kiểm tra và tải ảnh thực tế.',
      sampleSize: '120 pcs',
      timestamp: now,
    },
  ]);
});

test('job status update SQL casts the admin status parameter to qc_job_status', () => {
  assert.match(updateJobStatusSql, /status = \$2::qc_job_status/);
  assert.match(updateJobStatusSql, /WHEN \$2::qc_job_status = 'COMPLETED'/);
});

test('extends active worker sessions from the current expiry time', () => {
  const now = new Date('2026-08-05T10:00:00.000Z');
  const currentExpiry = new Date('2026-08-05T18:00:00.000Z');

  const extendedExpiry = calculateExtendedSessionExpiry(currentExpiry, 4, now);

  assert.equal(extendedExpiry.toISOString(), '2026-08-05T22:00:00.000Z');
});

test('extends expired worker sessions from the admin action time', () => {
  const now = new Date('2026-08-05T10:00:00.000Z');
  const currentExpiry = new Date('2026-08-05T08:00:00.000Z');

  const extendedExpiry = calculateExtendedSessionExpiry(currentExpiry, 2, now);

  assert.equal(extendedExpiry.toISOString(), '2026-08-05T12:00:00.000Z');
});

test('moderates a single step result while preserving worker data', () => {
  const result = moderateStepResults(
    [
      { stepId: 'S1', status: 'PASS', note: 'Ảnh đạt' },
      { stepId: 'S2', status: 'FAIL', note: 'Màn hình lỗi' },
    ],
    'S2',
    'REJECTED',
    'Ảnh bằng chứng chưa đủ rõ.',
    'QC Admin',
    '2026-08-02T01:00:00.000Z',
  );

  assert.equal(result.found, true);
  assert.equal(result.previousStatus, 'PENDING_REVIEW');
  assert.deepEqual(result.updatedSteps[1], {
    stepId: 'S2',
    status: 'FAIL',
    note: 'Màn hình lỗi',
    moderationStatus: 'REJECTED',
    adminReviewNote: 'Ảnh bằng chứng chưa đủ rõ.',
    moderatedBy: 'QC Admin',
    moderatedAt: '2026-08-02T01:00:00.000Z',
  });
});

test('attaches uploaded photo URLs to the matching step slot', () => {
  const result = attachUploadedPhotoToStepResults(
    [
      {
        stepId: 'S1',
        status: 'PASS',
        note: 'Ảnh đạt',
        photoSlotsData: [
          { slotIndex: 1, label: 'Mặt trước', photoUrl: '/uploads/old.jpg' },
          { slotIndex: 2, label: 'Mặt sau' },
        ],
      },
    ],
    {
      stepId: 'S1',
      slotIndex: 2,
      photoUrl: '/uploads/new.jpg',
    },
  );

  assert.equal(result.found, true);
  assert.deepEqual(result.updatedSteps[0], {
    stepId: 'S1',
    status: 'PASS',
    note: 'Ảnh đạt',
    photoUrl: '/uploads/new.jpg',
    photoSlotsData: [
      { slotIndex: 1, label: 'Mặt trước', photoUrl: '/uploads/old.jpg' },
      { slotIndex: 2, label: 'Mặt sau', photoUrl: '/uploads/new.jpg' },
    ],
  });
});

test('hydrates existing evidence photos into step results for exports', () => {
  const result = attachEvidencePhotosToStepResults(
    [
      {
        stepId: 'S1',
        status: 'PASS',
        note: 'Worker submitted',
        moderationStatus: 'APPROVED',
      },
    ],
    [
      {
        step_id: 'S1',
        slot_index: 1,
        photo_url: '/uploads/evidence.jpg',
      },
    ],
  );

  assert.deepEqual(result, [
    {
      stepId: 'S1',
      status: 'PASS',
      note: 'Worker submitted',
      moderationStatus: 'APPROVED',
      photoUrl: '/uploads/evidence.jpg',
      photoSlotsData: [
        { slotIndex: 1, label: 'Slot 1', photoUrl: '/uploads/evidence.jpg' },
      ],
      photos: [
        { slotName: 'Slot 1', url: '/uploads/evidence.jpg', slotIndex: 1 },
      ],
    },
  ]);
});

test('keeps multiple evidence photos for the same test slot', () => {
  const result = attachEvidencePhotosToStepResults(
    [
      {
        stepId: 'STEP_4',
        status: 'PASS',
        note: 'Worker submitted',
        photoSlotsData: [
          { slotIndex: 1, label: 'Bàn phím bật sáng' },
          { slotIndex: 2, label: 'Góc phím bấm chi tiết' },
        ],
      },
    ],
    [
      { step_id: 'STEP_4', slot_index: 1, photo_url: '/uploads/first.png' },
      { step_id: 'STEP_4', slot_index: 1, photo_url: '/uploads/second.png' },
    ],
  );

  assert.deepEqual(result[0].photos, [
    { slotName: 'Bàn phím bật sáng', url: '/uploads/first.png', slotIndex: 1 },
    { slotName: 'Bàn phím bật sáng', url: '/uploads/second.png', slotIndex: 1 },
  ]);
});

function recordingStepResultsClient(initial: unknown) {
  const queries: string[] = [];
  const client = {
    queries,
    query: async (text: string) => {
      queries.push(text);
      if (/SELECT step_results/.test(text)) return { rows: [{ step_results: initial }], rowCount: 1 };
      if (/UPDATE inspection_jobs/.test(text)) return { rows: [{ step_results: [] }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  return client;
}

test('applies step result updates under a row lock with a version bump', async () => {
  const client = recordingStepResultsClient([{ stepId: 'S1', status: 'PASS', note: 'ok' }]);

  const outcome = await applyStepResultsUpdate(
    'job-1',
    (current) => ({ found: true, updatedSteps: [{ stepId: 'S1', status: 'PASS', note: 'updated' }] }),
    async () => client,
  );

  assert.equal(outcome.found, true);
  const select = client.queries.find((text) => /SELECT step_results/.test(text));
  assert.match(select || '', /FOR UPDATE/);
  const update = client.queries.find((text) => /UPDATE inspection_jobs/.test(text));
  assert.match(update || '', /version = version \+ 1/);
});

test('returns found=false when the mutator does not match a step', async () => {
  const client = recordingStepResultsClient([{ stepId: 'S1', status: 'PASS', note: 'ok' }]);

  const outcome = await applyStepResultsUpdate(
    'job-1',
    () => ({ found: false, updatedSteps: [] }),
    async () => client,
  );

  assert.equal(outcome.found, false);
  assert.equal(client.queries.some((text) => /UPDATE inspection_jobs/.test(text)), false);
});

test('replaces a photo URL for a matching step slot and keeps the slot label', () => {
  const result = replacePhotoInStepResults(
    [
      {
        stepId: 'S1',
        status: 'PASS',
        note: 'Ảnh đạt',
        photoSlotsData: [
          { slotIndex: 1, label: 'Mặt trước', photoUrl: '/uploads/old.jpg' },
          { slotIndex: 2, label: 'Mặt sau' },
        ],
        photos: [
          { slotName: 'Mặt trước', url: '/uploads/old.jpg', slotIndex: 1 },
        ],
      },
    ],
    {
      stepId: 'S1',
      slotIndex: 1,
      photoUrl: '/uploads/new.jpg',
      manualOverride: true,
      aiQualityStatus: 'UNAVAILABLE',
    },
  );

  assert.equal(result.found, true);
  assert.deepEqual(result.updatedSteps[0], {
    stepId: 'S1',
    status: 'PASS',
    note: 'Ảnh đạt',
    photoUrl: '/uploads/new.jpg',
    photoSlotsData: [
      { slotIndex: 1, label: 'Mặt trước', photoUrl: '/uploads/new.jpg', manualOverride: true, aiQualityStatus: 'UNAVAILABLE' },
      { slotIndex: 2, label: 'Mặt sau' },
    ],
    photos: [
      { slotName: 'Mặt trước', url: '/uploads/new.jpg', slotIndex: 1 },
    ],
  });
});

test('appends a new slot entry when replacing a slot that has no photo yet', () => {
  const result = replacePhotoInStepResults(
    [
      {
        stepId: 'S1',
        status: 'PENDING',
        note: 'Chờ công nhân kiểm tra và tải ảnh thực tế.',
      },
    ],
    {
      stepId: 'S1',
      slotIndex: 3,
      photoUrl: '/uploads/new.jpg',
    },
  );

  assert.equal(result.found, true);
  assert.deepEqual(result.updatedSteps[0].photoSlotsData, [
    { slotIndex: 3, label: 'Slot 3', photoUrl: '/uploads/new.jpg' },
  ]);
  assert.deepEqual(result.updatedSteps[0].photos, [
    { slotName: 'Slot 3', url: '/uploads/new.jpg', slotIndex: 3 },
  ]);
});

test('returns found=false when no step matches the replace patch', () => {
  const result = replacePhotoInStepResults(
    [{ stepId: 'S1', status: 'PASS', note: 'ok' }],
    { stepId: 'S2', slotIndex: 1, photoUrl: '/uploads/new.jpg' },
  );
  assert.equal(result.found, false);
  assert.deepEqual(result.updatedSteps, [{ stepId: 'S1', status: 'PASS', note: 'ok' }]);
});
