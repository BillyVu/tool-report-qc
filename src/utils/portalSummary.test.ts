import assert from 'node:assert/strict';
import test from 'node:test';
import { InspectionStep, StepResult } from '../types/qc';
import { overallSummary, stepPhotoProgress, stepRailStatus } from './portalSummary';

function makeStep(partial: Partial<InspectionStep>): InspectionStep {
  return {
    stepId: partial.stepId || 'STEP_1',
    title: partial.title || 'Mặt trước',
    referenceImageUrl: partial.referenceImageUrl || '',
    isPhotoRequired: partial.isPhotoRequired ?? true,
    passCriteria: partial.passCriteria || '',
    mapping: { imageTag: '', noteTag: '', imageWidthMm: 0, imageHeightMm: 0 },
    ...partial,
  };
}

test('counts required photos from photoSlotConfigs, photoSlots, then requiredPhotoCount', () => {
  assert.equal(stepPhotoProgress(makeStep({ photoSlotConfigs: [
    { slotIndex: 1, label: 'S1', photoType: 'PHONE_FRONT' },
    { slotIndex: 2, label: 'S2', photoType: 'PHONE_BACK' },
  ] })).required, 2);
  assert.equal(stepPhotoProgress(makeStep({ photoSlots: ['A', 'B', 'C'] })).required, 3);
  assert.equal(stepPhotoProgress(makeStep({ requiredPhotoCount: 4 })).required, 4);
  assert.equal(stepPhotoProgress(makeStep({})).required, 0);
});

test('counts actual photos from uploaded slots only', () => {
  const step = makeStep({ photoSlots: ['A', 'B'] });
  const stepRes: StepResult = {
    stepId: 'STEP_1',
    status: 'PENDING',
    note: '',
    photoSlotsData: [
      { slotIndex: 1, label: 'A', photoUrl: '/uploads/1.jpg' },
      { slotIndex: 2, label: 'B' },
    ],
  };
  const progress = stepPhotoProgress(step, stepRes);
  assert.equal(progress.required, 2);
  assert.equal(progress.actual, 1);
});

test('falls back to the legacy single photoUrl field when no slot data exists', () => {
  const step = makeStep({ requiredPhotoCount: 1 });
  const stepRes: StepResult = { stepId: 'STEP_1', status: 'PASS', note: '', photoUrl: '/uploads/legacy.jpg' };
  assert.equal(stepPhotoProgress(step, stepRes).actual, 1);
});

test('summarizes passed, failed, pending, total and photo counts', () => {
  const steps = [
    makeStep({ stepId: 'S1', photoSlots: ['A'] }),
    makeStep({ stepId: 'S2', photoSlots: ['A', 'B'] }),
    makeStep({ stepId: 'S3', photoSlots: ['A'] }),
  ];
  const results: StepResult[] = [
    { stepId: 'S1', status: 'PASS', note: '', photoSlotsData: [{ slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' }] },
    { stepId: 'S2', status: 'FAIL', note: '' },
    { stepId: 'S3', status: 'PENDING', note: '' },
  ];
  const summary = overallSummary(steps, results);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.total, 3);
  assert.equal(summary.photosRequired, 4);
  assert.equal(summary.photosActual, 1);
});

test('classifies step rail status from result and photo progress', () => {
  const step = makeStep({ photoSlots: ['A'] });
  assert.equal(stepRailStatus(step, { stepId: 'S1', status: 'PASS', note: '' }), 'PASS');
  assert.equal(stepRailStatus(step, { stepId: 'S1', status: 'FAIL', note: '' }), 'FAIL');
  assert.equal(
    stepRailStatus(step, { stepId: 'S1', status: 'PENDING', note: '', photoSlotsData: [{ slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' }] }),
    'IN_PROGRESS',
  );
  assert.equal(stepRailStatus(step, { stepId: 'S1', status: 'PENDING', note: '' }), 'NOT_STARTED');
  assert.equal(stepRailStatus(step), 'NOT_STARTED');
});
