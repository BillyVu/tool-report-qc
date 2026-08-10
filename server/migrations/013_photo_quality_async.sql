-- Photo quality gate becomes asynchronous: uploads are saved immediately as
-- 'PENDING' and a background job runs the Gemini quality check, so weak-signal
-- devices are not blocked on a synchronous AI round-trip. 'REJECTED' can now be
-- stored because the check no longer rejects before the row is inserted.

ALTER TABLE evidence_photos
  DROP CONSTRAINT IF EXISTS evidence_photos_ai_quality_status_check,
  ADD CONSTRAINT evidence_photos_ai_quality_status_check
    CHECK (ai_quality_status IN ('PENDING', 'APPROVED', 'REJECTED', 'UNAVAILABLE', 'NOT_CHECKED'));

ALTER TABLE background_jobs
  DROP CONSTRAINT IF EXISTS background_jobs_type_check,
  ADD CONSTRAINT background_jobs_type_check
    CHECK (type IN ('PHOTO_PROCESS', 'PHOTO_QUALITY'));
