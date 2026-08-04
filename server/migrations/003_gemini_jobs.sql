ALTER TABLE background_jobs DROP CONSTRAINT background_jobs_type_check;
ALTER TABLE background_jobs ADD CONSTRAINT background_jobs_type_check CHECK (type IN ('PHOTO_PROCESS', 'GEMINI_ANALYZE'));

CREATE TABLE gemini_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES evidence_photos(id) ON DELETE CASCADE,
  source_sha256 char(64) NOT NULL,
  detect_type text NOT NULL CHECK (detect_type IN ('IMEI_SERIAL', 'OCR_TEXT', 'COLOR_SCREEN', 'GENERAL')),
  model text NOT NULL,
  prompt_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'WAITING_FOR_QUOTA', 'COMPLETED', 'FAILED_FINAL')),
  result_text text,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (source_sha256, detect_type, model, prompt_version)
);

CREATE TABLE gemini_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  circuit_open_until timestamptz,
  consecutive_quota_failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO gemini_control (id) VALUES (true) ON CONFLICT DO NOTHING;
