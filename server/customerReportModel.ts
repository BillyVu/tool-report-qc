export interface CustomerReportSourcePhoto {
  step_id: string;
  slot_index: number;
  storage_path: string;
  created_at: string | Date;
}

export interface CustomerReportSourceJob {
  template_snapshot?: {
    steps?: Array<{
      stepId?: string;
      title?: string;
      sampleSize?: string | number;
      mapping?: {
        imageTag?: string;
        noteTag?: string;
        statusTag?: string;
        imageWidthMm?: number;
        imageHeightMm?: number;
        photosPerRow?: number;
      };
    }>;
    orderQty?: string | number;
  };
  stepResults?: Array<{
    stepId?: string;
    status?: string;
    sampleSize?: string | number;
    note?: string;
    textValue?: string;
    aiDetectedValue?: string;
    adminReviewNote?: string;
  }>;
}

export interface ReportPhoto {
  stepId: string;
  slotIndex: number;
  storagePath: string;
  createdAt: string | Date;
}

export interface ReportPhotoRow {
  left?: ReportPhoto;
  right?: ReportPhoto;
}

export interface ReportStep {
  id: string;
  ordinal: number;
  title: string;
  sampleSize: string;
  resultText: string;
  commentText: string;
  imageTag?: string;
  noteTag?: string;
  statusTag?: string;
  imageWidthMm: number;
  imageHeightMm: number;
  photosPerRow: 1 | 2;
  photos: ReportPhoto[];
  photoRows: ReportPhotoRow[];
}

const DEFAULT_IMAGE_WIDTH_MM = 42;
const DEFAULT_IMAGE_HEIGHT_MM = 32;

function normalizeStepId(value: string | undefined): string {
  return (value || '').toLowerCase().replace(/[-_]/g, '');
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function photosForStep(
  photos: CustomerReportSourcePhoto[],
  stepId: string,
  stepIndex: number,
): CustomerReportSourcePhoto[] {
  const normalizedStepId = normalizeStepId(stepId);
  const fallbackStepId = `step${stepIndex + 1}`;

  return photos.filter((photo) => {
    const photoStepId = normalizeStepId(photo.step_id);
    return photoStepId === normalizedStepId || photoStepId === fallbackStepId;
  });
}

function latestPhotoPerSlot(photos: CustomerReportSourcePhoto[]): ReportPhoto[] {
  const bySlot = new Map<number, CustomerReportSourcePhoto>();
  const sorted = [...photos].sort(
    (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
  );

  for (const photo of sorted) {
    const slotIndex = Number(photo.slot_index);
    if (!Number.isInteger(slotIndex) || slotIndex < 1) continue;
    bySlot.set(slotIndex, photo);
  }

  return [...bySlot.entries()]
    .sort(([left], [right]) => left - right)
    .map(([slotIndex, photo]) => ({
      stepId: photo.step_id,
      slotIndex,
      storagePath: photo.storage_path,
      createdAt: photo.created_at,
    }));
}

export function buildReportPhotoRows(
  photos: ReportPhoto[],
  photosPerRow: 1 | 2 = 2,
): ReportPhotoRow[] {
  const rows: ReportPhotoRow[] = [];
  for (let index = 0; index < photos.length; index += photosPerRow) {
    rows.push({
      left: photos[index],
      right: photosPerRow === 2 ? photos[index + 1] : undefined,
    });
  }
  return rows;
}

function buildCommentText(stepResult: NonNullable<CustomerReportSourceJob['stepResults']>[number]): string {
  const lines = [stepResult.note || 'Không có ghi chú'];
  if (stepResult.textValue) lines.push(`Dữ liệu nhập: ${stepResult.textValue}`);
  if (stepResult.aiDetectedValue) lines.push(`Vero: ${stepResult.aiDetectedValue}`);
  if (stepResult.adminReviewNote) lines.push(`Ghi chú Admin: ${stepResult.adminReviewNote}`);
  return lines.join('\n');
}

function buildResultText(
  status: string | undefined,
  sampleSize: string,
): string {
  if (status === 'PASS') return `${sampleSize} Pass`;
  if (status === 'FAIL') return 'Defective';
  return 'Pending';
}

export function buildCustomerReportSteps(
  job: CustomerReportSourceJob,
  sourcePhotos: CustomerReportSourcePhoto[],
): ReportStep[] {
  const stepResults = Array.isArray(job.stepResults) ? job.stepResults : [];
  const templateSteps = Array.isArray(job.template_snapshot?.steps) ? job.template_snapshot.steps : [];

  return stepResults.map((stepResult, index) => {
    const id = stepResult.stepId || `STEP_${index + 1}`;
    const definition = templateSteps.find((step) => step.stepId === id);
    const sampleSize = String(
      stepResult.sampleSize
        || definition?.sampleSize
        || job.template_snapshot?.orderQty
        || '117 pcs',
    );
    const photosPerRow: 1 | 2 = definition?.mapping?.photosPerRow === 1 ? 1 : 2;
    const photos = latestPhotoPerSlot(photosForStep(sourcePhotos, id, index));

    return {
      id,
      ordinal: index + 1,
      title: definition?.title || `Bước ${id}`,
      sampleSize,
      resultText: buildResultText(stepResult.status, sampleSize),
      commentText: buildCommentText(stepResult),
      imageTag: definition?.mapping?.imageTag,
      noteTag: definition?.mapping?.noteTag,
      statusTag: definition?.mapping?.statusTag,
      imageWidthMm: normalizePositiveNumber(definition?.mapping?.imageWidthMm, DEFAULT_IMAGE_WIDTH_MM),
      imageHeightMm: normalizePositiveNumber(definition?.mapping?.imageHeightMm, DEFAULT_IMAGE_HEIGHT_MM),
      photosPerRow,
      photos,
      photoRows: buildReportPhotoRows(photos, photosPerRow),
    };
  });
}
