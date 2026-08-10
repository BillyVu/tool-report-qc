import assert from 'node:assert/strict';
import test from 'node:test';
import { InspectionStep, StepResult } from '../types/qc';
import {
  overallSummary,
  stepIsDone,
  stepMissingItems,
  stepPhotoProgress,
  stepRailStatus,
  stepRequiredText,
} from './portalSummary';

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

function slot(stepId: string, slotIndex: number, photoUrl?: string): StepResult {
  return { stepId, status: 'PENDING', note: '', photoSlotsData: [{ slotIndex, label: `Slot ${slotIndex}`, photoUrl }] };
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

test('detects required text only for TEXT/PHOTO_AND_TEXT steps flagged required', () => {
  assert.equal(stepRequiredText(makeStep({ inputType: 'TEXT', isRequiredText: true })), true);
  assert.equal(stepRequiredText(makeStep({ inputType: 'PHOTO_AND_TEXT', isRequiredText: true })), true);
  assert.equal(stepRequiredText(makeStep({ inputType: 'TEXT', isRequiredText: false })), false);
  assert.equal(stepRequiredText(makeStep({ inputType: 'PHOTO' })), false);
});

test('a step is done only when all required photos and required text are filled', () => {
  const photoStep = makeStep({ inputType: 'PHOTO', photoSlots: ['A', 'B'] });
  assert.equal(stepIsDone(photoStep, slot('S', 1, '/uploads/a.jpg')), false, 'one of two photos missing');
  assert.equal(stepIsDone(photoStep, slot('S', 1, '/uploads/a.jpg')), false);
  assert.equal(stepIsDone(photoStep, {
    stepId: 'S', status: 'PENDING', note: '',
    photoSlotsData: [
      { slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' },
      { slotIndex: 2, label: 'B', photoUrl: '/uploads/b.jpg' },
    ],
  }), true);

  const textStep = makeStep({ inputType: 'TEXT', isRequiredText: true, textInputLabel: 'IMEI' });
  assert.equal(stepIsDone(textStep, { stepId: 'S', status: 'PENDING', note: '' }), false);
  assert.equal(stepIsDone(textStep, { stepId: 'S', status: 'PENDING', note: '', textValue: '  ' }), false);
  assert.equal(stepIsDone(textStep, { stepId: 'S', status: 'PENDING', note: '', textValue: 'IMEI-123' }), true);

  const mixed = makeStep({ inputType: 'PHOTO_AND_TEXT', isRequiredText: true, photoSlots: ['A'] });
  assert.equal(stepIsDone(mixed, { stepId: 'S', status: 'PENDING', note: '', photoSlotsData: [{ slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' }], textValue: '' }), false);
  assert.equal(stepIsDone(mixed, { stepId: 'S', status: 'PENDING', note: '', photoSlotsData: [{ slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' }], textValue: 'X' }), true);
});

test('a step with no required fields is always done', () => {
  const step = makeStep({ inputType: 'PHOTO' });
  assert.equal(stepIsDone(step), true);
  assert.deepEqual(stepMissingItems(step), []);
});

test('lists exactly which required items are missing', () => {
  const step = makeStep({ inputType: 'PHOTO_AND_TEXT', isRequiredText: true, textInputLabel: 'Số serial', photoSlots: ['Mặt trước', 'Mặt sau'] });
  assert.deepEqual(stepMissingItems(step), [
    'Slot 1 (Mặt trước): chưa chụp ảnh',
    'Slot 2 (Mặt sau): chưa chụp ảnh',
    'Thiếu Số serial',
  ]);
  assert.deepEqual(stepMissingItems(step, slot('S', 1, '/uploads/a.jpg')), [
    'Slot 2 (Mặt sau): chưa chụp ảnh',
    'Thiếu Số serial',
  ]);
  assert.deepEqual(stepMissingItems(step, {
    stepId: 'S', status: 'PENDING', note: '',
    photoSlotsData: [
      { slotIndex: 1, label: 'Mặt trước', photoUrl: '/uploads/a.jpg' },
      { slotIndex: 2, label: 'Mặt sau', photoUrl: '/uploads/b.jpg' },
    ],
    textValue: 'SER-001',
  }), []);
});

test('classifies step rail status as DONE, INCOMPLETE, or NOT_STARTED', () => {
  const step = makeStep({ photoSlots: ['A', 'B'] });
  assert.equal(stepRailStatus(step), 'NOT_STARTED');
  assert.equal(stepRailStatus(step, slot('S', 1, '/uploads/a.jpg')), 'INCOMPLETE');
  assert.equal(stepRailStatus(step, {
    stepId: 'S', status: 'PENDING', note: '',
    photoSlotsData: [
      { slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' },
      { slotIndex: 2, label: 'B', photoUrl: '/uploads/b.jpg' },
    ],
  }), 'DONE');
});

test('summarizes done, incomplete, not-started and photo counts', () => {
  const steps = [
    makeStep({ stepId: 'S1', photoSlots: ['A'] }),
    makeStep({ stepId: 'S2', photoSlots: ['A', 'B'] }),
    makeStep({ stepId: 'S3', photoSlots: ['A'] }),
  ];
  const results: StepResult[] = [
    { stepId: 'S1', status: 'PENDING', note: '', photoSlotsData: [{ slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' }] },
    { stepId: 'S2', status: 'PENDING', note: '', photoSlotsData: [{ slotIndex: 1, label: 'A', photoUrl: '/uploads/a.jpg' }] },
    { stepId: 'S3', status: 'PENDING', note: '' },
  ];
  const summary = overallSummary(steps, results);
  assert.equal(summary.done, 1);
  assert.equal(summary.incomplete, 1);
  assert.equal(summary.notStarted, 1);
  assert.equal(summary.total, 3);
  assert.equal(summary.photosRequired, 4);
  assert.equal(summary.photosActual, 2);
});
