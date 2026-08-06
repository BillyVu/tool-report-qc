type TemplateLike = {
  steps?: Array<{ stepId?: string } & Record<string, unknown>>;
};

export type StepModerationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

interface UploadedPhotoPatch {
  stepId: string;
  slotIndex: number;
  photoUrl: string;
  slotLabel?: string;
  manualOverride?: boolean;
  aiQualityStatus?: 'APPROVED' | 'UNAVAILABLE';
}

interface EvidencePhotoPatch {
  stepId?: string;
  step_id?: string;
  slotIndex?: number;
  slot_index?: number;
  photoUrl?: string;
  photo_url?: string;
  manualOverride?: boolean;
  manual_override?: boolean;
  aiQualityStatus?: 'APPROVED' | 'UNAVAILABLE';
  ai_quality_status?: 'APPROVED' | 'UNAVAILABLE';
}

interface AnalysisSummaryPatch {
  stepId: string;
  slotIndex: number;
  aiDetectedText: string;
  aiDetectedValue: string;
  aiDetectStatus: 'SUCCESS' | 'WARNING' | 'FAILED';
}

function evidencePhotoFields(photo: unknown) {
  if (!photo || typeof photo !== 'object') return null;
  const currentPhoto = photo as EvidencePhotoPatch;
  const stepId = currentPhoto.stepId || currentPhoto.step_id;
  const slotIndex = Number(currentPhoto.slotIndex ?? currentPhoto.slot_index);
  const photoUrl = currentPhoto.photoUrl || currentPhoto.photo_url;
  if (!stepId || !Number.isInteger(slotIndex) || !photoUrl) return null;
  return {
    stepId,
    slotIndex,
    photoUrl,
    manualOverride: currentPhoto.manualOverride ?? currentPhoto.manual_override,
    aiQualityStatus: currentPhoto.aiQualityStatus || currentPhoto.ai_quality_status,
  };
}

export const updateJobStatusSql = `
UPDATE inspection_jobs
   SET status = $2::qc_job_status,
       admin_notes = COALESCE($3, admin_notes),
       completed_at = CASE WHEN $2::qc_job_status = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
       updated_at = now(),
       version = version + 1
 WHERE external_id = $1
 RETURNING *`;

export function calculateExtendedSessionExpiry(currentExpiresAt: Date | string, extensionHours: number, now = new Date()) {
  const currentExpiry = currentExpiresAt instanceof Date ? currentExpiresAt : new Date(currentExpiresAt);
  const baseTime = Number.isFinite(currentExpiry.getTime()) && currentExpiry.getTime() > now.getTime()
    ? currentExpiry.getTime()
    : now.getTime();
  return new Date(baseTime + extensionHours * 60 * 60 * 1000);
}

export function buildInitialStepResults(templateSnapshot: TemplateLike, timestamp = new Date().toISOString()) {
  const steps = Array.isArray(templateSnapshot?.steps) ? templateSnapshot.steps : [];
  return steps
    .filter((step) => typeof step?.stepId === 'string' && step.stepId.trim())
    .map((step) => ({
      stepId: step.stepId,
      status: 'PENDING' as const,
      note: 'Chờ công nhân kiểm tra và tải ảnh thực tế.',
      timestamp,
    }));
}

export function moderateStepResults(
  stepResults: unknown,
  stepId: string,
  moderationStatus: StepModerationStatus,
  adminReviewNote = '',
  moderatedBy = 'QC Admin',
  moderatedAt = new Date().toISOString(),
) {
  const steps = Array.isArray(stepResults) ? stepResults : [];
  let previousStatus = '';
  let found = false;

  const updatedSteps = steps.map((step) => {
    if (!step || typeof step !== 'object' || (step as { stepId?: unknown }).stepId !== stepId) return step;
    found = true;
    const current = step as Record<string, unknown>;
    previousStatus = typeof current.moderationStatus === 'string' ? current.moderationStatus : 'PENDING_REVIEW';
    return {
      ...current,
      moderationStatus,
      adminReviewNote,
      moderatedBy,
      moderatedAt,
    };
  });

  return { found, previousStatus, updatedSteps };
}

export function attachUploadedPhotoToStepResults(stepResults: unknown, patch: UploadedPhotoPatch) {
  const steps = Array.isArray(stepResults) ? stepResults : [];
  let found = false;

  const updatedSteps = steps.map((step) => {
    if (!step || typeof step !== 'object' || (step as { stepId?: unknown }).stepId !== patch.stepId) return step;
    found = true;
    const current = step as Record<string, unknown>;
    const existingSlots = Array.isArray(current.photoSlotsData) ? current.photoSlotsData : [];
    let slotFound = false;
    const photoSlotsData = existingSlots.map((slot) => {
      if (!slot || typeof slot !== 'object' || Number((slot as { slotIndex?: unknown }).slotIndex) !== patch.slotIndex) return slot;
      slotFound = true;
      return {
        ...slot,
        photoUrl: patch.photoUrl,
        ...(patch.manualOverride ? { manualOverride: true } : {}),
        ...(patch.aiQualityStatus ? { aiQualityStatus: patch.aiQualityStatus } : {}),
      };
    });

    if (!slotFound) {
      photoSlotsData.push({
        slotIndex: patch.slotIndex,
        label: patch.slotLabel || `Slot ${patch.slotIndex}`,
        photoUrl: patch.photoUrl,
        ...(patch.manualOverride ? { manualOverride: true } : {}),
        ...(patch.aiQualityStatus ? { aiQualityStatus: patch.aiQualityStatus } : {}),
      });
    }

    return {
      ...current,
      photoUrl: typeof current.photoUrl === 'string' && current.photoUrl.trim() ? current.photoUrl : patch.photoUrl,
      photoSlotsData,
    };
  });

  return { found, updatedSteps };
}

export function attachEvidencePhotosToStepResults(stepResults: unknown, evidencePhotos: unknown) {
  const photos = Array.isArray(evidencePhotos) ? evidencePhotos : [];
  const hydratedSteps = photos.reduce((currentSteps, photo) => {
    const fields = evidencePhotoFields(photo);
    if (!fields) return currentSteps;
    return attachUploadedPhotoToStepResults(currentSteps, fields).updatedSteps;
  }, stepResults);

  if (!Array.isArray(hydratedSteps)) return hydratedSteps;

  return hydratedSteps.map((step) => {
    if (!step || typeof step !== 'object') return step;
    const current = step as Record<string, unknown>;
    const stepId = typeof current.stepId === 'string' ? current.stepId : '';
    if (!stepId) return step;

    const slotLabels = new Map<number, string>();
    if (Array.isArray(current.photoSlotsData)) {
      current.photoSlotsData.forEach((slot) => {
        if (!slot || typeof slot !== 'object') return;
        const slotIndex = Number((slot as { slotIndex?: unknown }).slotIndex);
        const label = (slot as { label?: unknown }).label;
        if (Number.isInteger(slotIndex) && typeof label === 'string' && label.trim()) {
          slotLabels.set(slotIndex, label.trim());
        }
      });
    }

    const existingPhotos = Array.isArray(current.photos) ? current.photos : [];
    const seenUrls = new Set(
      existingPhotos
        .map((photo) => photo && typeof photo === 'object' ? (photo as { url?: unknown }).url : undefined)
        .filter((url): url is string => typeof url === 'string' && !!url.trim()),
    );
    const evidenceForStep = photos.flatMap((photo) => {
      const fields = evidencePhotoFields(photo);
      if (!fields || fields.stepId !== stepId || seenUrls.has(fields.photoUrl)) return [];
      seenUrls.add(fields.photoUrl);
      return [{
        url: fields.photoUrl,
        slotName: slotLabels.get(fields.slotIndex) || `Slot ${fields.slotIndex}`,
      }];
    });

    return evidenceForStep.length
      ? { ...current, photos: [...existingPhotos, ...evidenceForStep] }
      : current;
  });
}

export function attachAnalysisSummaryToStepResults(stepResults: unknown, patch: AnalysisSummaryPatch) {
  const steps = Array.isArray(stepResults) ? stepResults : [];
  let found = false;

  const updatedSteps = steps.map((step) => {
    if (!step || typeof step !== 'object' || (step as { stepId?: unknown }).stepId !== patch.stepId) return step;
    found = true;
    const current = step as Record<string, unknown>;
    const photoSlotsData = Array.isArray(current.photoSlotsData)
      ? current.photoSlotsData.map((slot) => {
          if (!slot || typeof slot !== 'object' || Number((slot as { slotIndex?: unknown }).slotIndex) !== patch.slotIndex) return slot;
          return {
            ...slot,
            aiDetectedText: patch.aiDetectedText,
          };
        })
      : current.photoSlotsData;
    return {
      ...current,
      photoSlotsData,
      aiDetectedValue: patch.aiDetectedValue,
      aiDetectStatus: patch.aiDetectStatus,
    };
  });

  return { found, updatedSteps };
}
