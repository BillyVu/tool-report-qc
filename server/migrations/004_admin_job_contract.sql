ALTER TABLE inspection_jobs DROP CONSTRAINT IF EXISTS inspection_jobs_template_id_fkey;
ALTER TABLE inspection_jobs ALTER COLUMN template_id TYPE text USING template_id::text;
ALTER TABLE inspection_jobs ADD COLUMN export_count integer NOT NULL DEFAULT 0 CHECK (export_count >= 0);
ALTER TABLE inspection_jobs ADD COLUMN last_exported_at timestamptz;
