ALTER TABLE inspection_jobs ADD COLUMN IF NOT EXISTS defects_finding_data jsonb DEFAULT '[]'::jsonb;
ALTER TABLE inspection_jobs ADD COLUMN IF NOT EXISTS packaging_info_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE inspection_jobs ADD COLUMN IF NOT EXISTS other_info_data jsonb DEFAULT '{}'::jsonb;

ALTER TABLE templates ADD COLUMN IF NOT EXISTS defects_finding_data jsonb DEFAULT '[]'::jsonb;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS packaging_info_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS other_info_data jsonb DEFAULT '{}'::jsonb;
