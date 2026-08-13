import assert from 'node:assert/strict';
import test from 'node:test';
import { getEvidenceCountText, getStepApprovalDisplay, getStepEvidenceSlots, getStepReportImages, resolveEvidenceImageUrl } from './docxExportService';
import { InspectionStep, StepResult } from '../types/qc';

test('docx export collects multi-slot worker photos before legacy photo fields', () => {
  const result: StepResult = {
    stepId: 'S1',
    status: 'PASS',
    note: 'OK',
    photoUrl: 'data:image/png;base64,legacy',
    photoSlotsData: [
      { slotIndex: 1, label: 'Mặt trước', photoUrl: 'data:image/png;base64,front' },
      { slotIndex: 2, label: 'Mặt sau', photoUrl: 'data:image/png;base64,back' },
    ],
    photos: [
      { slotName: 'Ảnh tổng quan', url: 'data:image/png;base64,front' },
      { slotName: 'Tem serial', url: 'data:image/jpeg;base64,serial' },
    ],
  };

  assert.deepEqual(getStepReportImages(result), [
    { label: 'Mặt trước', url: 'data:image/png;base64,front' },
    { label: 'Mặt sau', url: 'data:image/png;base64,back' },
    { label: 'Tem serial', url: 'data:image/jpeg;base64,serial' },
    { label: 'S1', url: 'data:image/png;base64,legacy' },
  ]);
});

test('docx export ignores empty and duplicated photo URLs', () => {
  const result: StepResult = {
    stepId: 'S2',
    status: 'PENDING',
    note: '',
    photoUrl: 'data:image/png;base64,same',
    photoSlotsData: [
      { slotIndex: 1, label: 'Slot 1', photoUrl: '  ' },
      { slotIndex: 2, label: 'Slot 2', photoUrl: 'data:image/png;base64,same' },
    ],
  };

  assert.deepEqual(getStepReportImages(result), [
    { label: 'Slot 2', url: 'data:image/png;base64,same' },
  ]);
});

test('docx export uses admin moderation status as the approval display', () => {
  assert.equal(getStepApprovalDisplay({
    stepId: 'S1',
    status: 'PENDING',
    note: '',
    moderationStatus: 'APPROVED',
  }).text, 'ADMIN ĐÃ DUYỆT');

  assert.equal(getStepApprovalDisplay({
    stepId: 'S2',
    status: 'PASS',
    note: '',
  }).text, 'CHỜ ADMIN DUYỆT');
});

test('docx export reports evidence counts instead of raw placeholder tags', () => {
  assert.equal(getEvidenceCountText(3), '3 ảnh bằng chứng đã đính kèm');
  assert.equal(getEvidenceCountText(0), 'Chưa có ảnh bằng chứng');
  assert.doesNotMatch(getEvidenceCountText(3), /\{\{photo_/);
});

test('docx export keeps evidence aligned to each expected test slot', () => {
  const step: InspectionStep = {
    stepId: 'STEP_7',
    title: 'Wi-Fi & Bluetooth Verification',
    requiredPhotoCount: 3,
    photoSlots: [
      'Danh sách Wi-Fi đã kết nối',
      'Danh sách Bluetooth Paired',
      'Màn hình File Transfer Sample (1pcs)',
    ],
    referenceImageUrl: '',
    isPhotoRequired: true,
    passCriteria: 'OK',
    mapping: {
      imageTag: '{{photo_connectivity}}',
      noteTag: '{{note_connectivity}}',
      statusTag: '{{status_connectivity}}',
      imageWidthMm: 60,
      imageHeightMm: 45,
    },
  };
  const result: StepResult = {
    stepId: 'STEP_7',
    status: 'PASS',
    note: '',
    photoSlotsData: [
      { slotIndex: 1, label: 'Danh sách Wi-Fi đã kết nối', photoUrl: '/uploads/wifi.png' },
      { slotIndex: 2, label: 'Danh sách Bluetooth Paired' },
      { slotIndex: 3, label: 'Màn hình File Transfer Sample (1pcs)' },
    ],
  };

  assert.deepEqual(getStepEvidenceSlots(result, step), [
    { label: 'Danh sách Wi-Fi đã kết nối', url: '/uploads/wifi.png' },
    { label: 'Danh sách Bluetooth Paired', url: undefined },
    { label: 'Màn hình File Transfer Sample (1pcs)', url: undefined },
  ]);
});

test('docx export keeps empty placeholders for configured slots and fills submitted photoSlotConfigs by slot index', () => {
  const step: InspectionStep = {
    stepId: 'STEP_2',
    title: 'IMEI Verification',
    requiredPhotoCount: 2,
    photoSlotConfigs: [
      { slotIndex: 1, label: 'IMEI tem', photoType: 'IMEI_LABEL', captureFrame: 'RECTANGLE' },
      { slotIndex: 2, label: 'IMEI màn hình', photoType: 'IMEI_SCREEN', captureFrame: 'RECTANGLE' },
    ],
    referenceImageUrl: '',
    isPhotoRequired: true,
    passCriteria: 'OK',
    mapping: {
      imageTag: '{{photo_imei}}',
      noteTag: '{{note_imei}}',
      statusTag: '{{status_imei}}',
      imageWidthMm: 60,
      imageHeightMm: 45,
    },
  };
  const result: StepResult = {
    stepId: 'STEP_2',
    status: 'PASS',
    note: '',
    photoSlotsData: [
      { slotIndex: 2, label: 'IMEI màn hình', photoUrl: '/uploads/screen.png' },
    ],
  };

  assert.deepEqual(getStepEvidenceSlots(result, step), [
    { label: 'IMEI tem', url: undefined },
    { label: 'IMEI màn hình', url: '/uploads/screen.png' },
  ]);
});

test('docx export routes submitted upload photos through the admin evidence endpoint', () => {
  (globalThis as unknown as { window: { location: { origin: string } } }).window = {
    location: { origin: 'https://qc.apexdev.website' },
  };

  assert.equal(
    resolveEvidenceImageUrl('JOB-001', '/uploads/evidence photo.png'),
    '/api/admin/jobs/JOB-001/photos/evidence%20photo.png',
  );
  assert.equal(
    resolveEvidenceImageUrl('JOB-001', 'data:image/png;base64,abc'),
    'data:image/png;base64,abc',
  );
});
