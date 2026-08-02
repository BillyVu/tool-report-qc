type TemplateLike = {
  steps?: Array<{ stepId?: string } & Record<string, unknown>>;
};

export const updateJobStatusSql = `
UPDATE inspection_jobs
   SET status = $2::qc_job_status,
       admin_notes = COALESCE($3, admin_notes),
       completed_at = CASE WHEN $2::qc_job_status = 'COMPLETED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
       updated_at = now(),
       version = version + 1
 WHERE external_id = $1
 RETURNING *`;

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
