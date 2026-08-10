-- Deduplicate Gemini analyses by the exact prompt snapshot (prompt_hash) instead of
-- a generic version string. Backfills rows created while prompt_version held the hash.

UPDATE gemini_analyses
   SET prompt_hash = prompt_version
 WHERE prompt_hash IS NULL
   AND prompt_version ~ '^[0-9a-f]{64}$';

ALTER TABLE gemini_analyses
  DROP CONSTRAINT IF EXISTS gemini_analyses_source_sha256_detect_type_model_prompt_version_key;

DROP INDEX IF EXISTS gemini_analyses_prompt_hash_idx;
CREATE UNIQUE INDEX gemini_analyses_prompt_hash_dedup_idx
  ON gemini_analyses (source_sha256, detect_type, model, prompt_hash)
  WHERE prompt_hash IS NOT NULL;
