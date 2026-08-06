ALTER TABLE photo_type_options
  ADD COLUMN IF NOT EXISTS verification_mode text NOT NULL DEFAULT 'EVIDENCE_ONLY'
    CHECK (verification_mode IN ('OCR_ID', 'OCR_TEXT', 'SCREEN_STATE', 'VISUAL', 'MEASUREMENT', 'EVIDENCE_ONLY')),
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS output_schema jsonb NOT NULL DEFAULT '{"type":"object","required":[],"properties":{}}'::jsonb;

UPDATE photo_type_options
   SET verification_mode = CASE
     WHEN category = 'IMEI' THEN 'OCR_ID'
     WHEN category IN ('ANIMATION', 'MMI', 'BLUETOOTH', 'CAMERA') THEN 'SCREEN_STATE'
     WHEN category = 'VISUAL' THEN 'VISUAL'
     ELSE 'EVIDENCE_ONLY'
   END
 WHERE verification_mode = 'EVIDENCE_ONLY';

ALTER TABLE evidence_photos
  ADD COLUMN IF NOT EXISTS photo_verification_mode text,
  ADD COLUMN IF NOT EXISTS photo_schema_version text,
  ADD COLUMN IF NOT EXISTS photo_output_schema jsonb,
  ADD COLUMN IF NOT EXISTS quality_reason_code text,
  ADD COLUMN IF NOT EXISTS quality_result_json jsonb;

ALTER TABLE gemini_analyses
  ADD COLUMN IF NOT EXISTS verification_mode text,
  ADD COLUMN IF NOT EXISTS schema_version text,
  ADD COLUMN IF NOT EXISTS output_schema jsonb,
  ADD COLUMN IF NOT EXISTS result_json jsonb,
  ADD COLUMN IF NOT EXISTS validation_status text
    CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID_SCHEMA', 'FAILED_MODEL')),
  ADD COLUMN IF NOT EXISTS validation_errors jsonb;

UPDATE gemini_analyses
   SET validation_status = COALESCE(validation_status, 'PENDING');

CREATE INDEX IF NOT EXISTS gemini_analyses_result_json_idx
  ON gemini_analyses USING gin (result_json);
