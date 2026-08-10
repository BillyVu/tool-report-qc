import { InspectionStep, StepResult } from '../types/qc';

export interface StepPhotoProgress {
  required: number;
  actual: number;
}

export function stepRequiredPhotoCount(step: InspectionStep): number {
  if (Array.isArray(step.photoSlotConfigs) && step.photoSlotConfigs.length > 0) {
    return step.photoSlotConfigs.length;
  }
  if (Array.isArray(step.photoSlots) && step.photoSlots.length > 0) {
    return step.photoSlots.length;
  }
  return step.requiredPhotoCount || 0;
}

export function stepPhotoProgress(step: InspectionStep, stepRes?: StepResult): StepPhotoProgress {
  const required = stepRequiredPhotoCount(step);
  let actual = 0;
  if (stepRes) {
    if (Array.isArray(stepRes.photoSlotsData)) {
      actual = stepRes.photoSlotsData.filter((slot) => Boolean(slot?.photoUrl)).length;
    }
    if (actual === 0 && stepRes.photoUrl) actual = 1;
  }
  return { required, actual };
}

export interface OverallSummary {
  passed: number;
  failed: number;
  pending: number;
  total: number;
  photosRequired: number;
  photosActual: number;
}

export type StepRailStatus = 'PASS' | 'FAIL' | 'IN_PROGRESS' | 'NOT_STARTED';

export function stepRailStatus(step: InspectionStep, stepRes?: StepResult): StepRailStatus {
  if (stepRes?.status === 'PASS') return 'PASS';
  if (stepRes?.status === 'FAIL') return 'FAIL';
  return stepPhotoProgress(step, stepRes).actual > 0 ? 'IN_PROGRESS' : 'NOT_STARTED';
}

export function stepRailStatusLabel(status: StepRailStatus): string {
  switch (status) {
    case 'PASS': return 'Đạt';
    case 'FAIL': return 'Lỗi';
    case 'IN_PROGRESS': return 'Đang kiểm';
    default: return 'Chưa làm';
  }
}

export function overallSummary(steps: InspectionStep[], stepResults: StepResult[]): OverallSummary {
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let photosRequired = 0;
  let photosActual = 0;
  for (const step of steps) {
    const stepRes = stepResults.find((result) => result.stepId === step.stepId);
    if (stepRes?.status === 'PASS') passed += 1;
    else if (stepRes?.status === 'FAIL') failed += 1;
    else pending += 1;
    const progress = stepPhotoProgress(step, stepRes);
    photosRequired += progress.required;
    photosActual += progress.actual;
  }
  return { passed, failed, pending, total: steps.length, photosRequired, photosActual };
}
