ALTER TABLE evidence_photos
  ADD COLUMN processing_status text NOT NULL DEFAULT 'PENDING'
  CHECK (processing_status IN ('PENDING', 'READY', 'FAILED'));

CREATE TABLE background_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('PHOTO_PROCESS')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX background_jobs_dispatch_idx ON background_jobs (status, created_at)
  WHERE status IN ('PENDING', 'DISPATCHED');
