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

function stepSlotLabels(step: InspectionStep): Array<{ slotIndex: number; label: string }> {
  if (Array.isArray(step.photoSlotConfigs) && step.photoSlotConfigs.length > 0) {
    return step.photoSlotConfigs.map((cfg) => ({ slotIndex: cfg.slotIndex, label: cfg.label || `Slot ${cfg.slotIndex}` }));
  }
  if (Array.isArray(step.photoSlots) && step.photoSlots.length > 0) {
    return step.photoSlots.map((label, index) => ({ slotIndex: index + 1, label: label || `Slot ${index + 1}` }));
  }
  return Array.from({ length: step.requiredPhotoCount || 0 }, (_, index) => ({ slotIndex: index + 1, label: `Slot ${index + 1}` }));
}

function slotHasPhoto(stepRes: StepResult | undefined, slotIndex: number): boolean {
  if (Array.isArray(stepRes?.photoSlotsData)) {
    const slot = stepRes.photoSlotsData.find((item) => Number(item?.slotIndex) === slotIndex);
    if (slot) return Boolean(slot.photoUrl);
  }
  return false;
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

export function stepRequiredText(step: InspectionStep): boolean {
  return (step.inputType === 'TEXT' || step.inputType === 'PHOTO_AND_TEXT') && Boolean(step.isRequiredText);
}

export function stepIsDone(step: InspectionStep, stepRes?: StepResult): boolean {
  const photos = stepPhotoProgress(step, stepRes);
  if (photos.required > 0 && photos.actual < photos.required) return false;
  if (stepRequiredText(step) && !(stepRes?.textValue && stepRes.textValue.trim())) return false;
  return true;
}

export function stepMissingItems(step: InspectionStep, stepRes?: StepResult): string[] {
  const items: string[] = [];
  for (const slot of stepSlotLabels(step)) {
    if (!slotHasPhoto(stepRes, slot.slotIndex)) {
      items.push(`Slot ${slot.slotIndex} (${slot.label}): chưa chụp ảnh`);
    }
  }
  if (stepRequiredText(step) && !(stepRes?.textValue && stepRes.textValue.trim())) {
    items.push(`Thiếu ${step.textInputLabel || 'thông số kiểm tra'}`);
  }
  return items;
}

export interface OverallSummary {
  done: number;
  incomplete: number;
  notStarted: number;
  total: number;
  photosRequired: number;
  photosActual: number;
}

export type StepRailStatus = 'DONE' | 'INCOMPLETE' | 'NOT_STARTED';

export function stepRailStatus(step: InspectionStep, stepRes?: StepResult): StepRailStatus {
  if (stepIsDone(step, stepRes)) return 'DONE';
  return stepPhotoProgress(step, stepRes).actual > 0 ? 'INCOMPLETE' : 'NOT_STARTED';
}

export function stepRailStatusLabel(status: StepRailStatus): string {
  switch (status) {
    case 'DONE': return 'Xong';
    case 'INCOMPLETE': return 'Đang làm';
    default: return 'Chưa làm';
  }
}

export function overallSummary(steps: InspectionStep[], stepResults: StepResult[]): OverallSummary {
  let done = 0;
  let incomplete = 0;
  let notStarted = 0;
  let photosRequired = 0;
  let photosActual = 0;
  for (const step of steps) {
    const stepRes = stepResults.find((result) => result.stepId === step.stepId);
    const status = stepRailStatus(step, stepRes);
    if (status === 'DONE') done += 1;
    else if (status === 'INCOMPLETE') incomplete += 1;
    else notStarted += 1;
    const progress = stepPhotoProgress(step, stepRes);
    photosRequired += progress.required;
    photosActual += progress.actual;
  }
  return { done, incomplete, notStarted, total: steps.length, photosRequired, photosActual };
}
