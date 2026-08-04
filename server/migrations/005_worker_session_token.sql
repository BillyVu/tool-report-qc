ALTER TABLE worker_sessions
  ADD COLUMN IF NOT EXISTS token_value text;
