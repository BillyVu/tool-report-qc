CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE qc_job_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
CREATE TYPE qc_step_status AS ENUM ('PENDING', 'PASS', 'FAIL');

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  title text NOT NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  version text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inspection_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text NOT NULL UNIQUE,
  batch_number text NOT NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  status qc_job_status NOT NULL DEFAULT 'IN_PROGRESS',
  worker_id text,
  worker_name text,
  shift text,
  line text,
  template_id uuid REFERENCES templates(id) ON DELETE RESTRICT,
  template_snapshot jsonb NOT NULL,
  step_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  admin_notes text,
  version integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES inspection_jobs(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  token_value text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  checked_in_at timestamptz,
  worker_name text,
  worker_id text,
  device_info text,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);

CREATE INDEX worker_sessions_active_idx ON worker_sessions (job_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE evidence_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES inspection_jobs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES worker_sessions(id) ON DELETE SET NULL,
  step_id text NOT NULL,
  slot_index integer NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  sha256 char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_photos_job_step_idx ON evidence_photos (job_id, step_id, slot_index);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid REFERENCES inspection_jobs(id) ON DELETE SET NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('ADMIN', 'WORKER', 'SYSTEM')),
  actor_label text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_job_created_idx ON audit_events (job_id, created_at DESC);
