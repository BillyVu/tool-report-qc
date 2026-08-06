ALTER TABLE vero_prompt_profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text,
  ADD COLUMN IF NOT EXISTS verified_revision integer,
  ADD COLUMN IF NOT EXISTS verified_prompt_hash char(64);

ALTER TABLE photo_type_options
  ADD COLUMN IF NOT EXISTS prompt_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS prompt_verified_by text,
  ADD COLUMN IF NOT EXISTS prompt_verified_hash char(64);
