ALTER TABLE evidence_photos
  ADD COLUMN capture_source text NOT NULL DEFAULT 'UPLOAD' CHECK (capture_source IN ('CAMERA', 'UPLOAD')),
  ADD COLUMN crop_ratio numeric(8,5),
  ADD COLUMN sharpness_score numeric(12,4),
  ADD COLUMN ai_quality_status text NOT NULL DEFAULT 'NOT_CHECKED' CHECK (ai_quality_status IN ('APPROVED', 'UNAVAILABLE', 'NOT_CHECKED')),
  ADD COLUMN ai_quality_message text,
  ADD COLUMN manual_override boolean NOT NULL DEFAULT false;
