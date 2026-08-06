import assert from 'node:assert/strict';
import test from 'node:test';
import { attachEvidencePhotosToStepResults, attachUploadedPhotoToStepResults, buildInitialStepResults, calculateExtendedSessionExpiry, moderateStepResults, updateJobStatusSql } from './adminJobs';

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
        { slotName: 'Slot 1', url: '/uploads/evidence.jpg' },
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
    { slotName: 'Bàn phím bật sáng', url: '/uploads/first.png' },
    { slotName: 'Bàn phím bật sáng', url: '/uploads/second.png' },
  ]);
});
