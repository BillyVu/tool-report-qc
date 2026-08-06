CREATE TABLE IF NOT EXISTS vero_prompt_profiles (
  profile_key text PRIMARY KEY CHECK (profile_key IN ('PHOTO_QUALITY_GATE', 'PHOTO_ANALYSIS')),
  label text NOT NULL,
  description text NOT NULL,
  instruction text NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO vero_prompt_profiles (profile_key, label, description, instruction, revision)
VALUES
  ('PHOTO_QUALITY_GATE', 'Kiểm tra chất lượng ảnh', 'Dùng trước khi lưu ảnh bằng chứng. Chỉ chấp nhận ảnh rõ, đúng khung và có sản phẩm chính ở trung tâm.', 'Bạn là Vero, trợ lý QC hình ảnh. Đánh giá khách quan duy nhất dựa trên ảnh được cung cấp. Không suy đoán chi tiết không nhìn thấy.', 1),
  ('PHOTO_ANALYSIS', 'Phân tích ảnh kiểm định', 'Dùng khi trích xuất hoặc phân tích ảnh đã được chấp nhận làm bằng chứng.', 'Bạn là Vero, trợ lý phân tích ảnh QC. Chỉ báo cáo dữ liệu hoặc lỗi có thể kiểm chứng trực tiếp từ ảnh. Không suy đoán, không bịa giá trị bị che hoặc không rõ.', 1)
ON CONFLICT (profile_key) DO NOTHING;

ALTER TABLE evidence_photos
  ADD COLUMN IF NOT EXISTS photo_type text,
  ADD COLUMN IF NOT EXISTS photo_label text,
  ADD COLUMN IF NOT EXISTS photo_prompt_instruction text,
  ADD COLUMN IF NOT EXISTS quality_prompt_revision integer,
  ADD COLUMN IF NOT EXISTS quality_prompt_hash char(64);

ALTER TABLE gemini_analyses
  ADD COLUMN IF NOT EXISTS prompt_profile_key text,
  ADD COLUMN IF NOT EXISTS prompt_revision integer,
  ADD COLUMN IF NOT EXISTS prompt_instruction text,
  ADD COLUMN IF NOT EXISTS prompt_hash char(64),
  ADD COLUMN IF NOT EXISTS photo_type text,
  ADD COLUMN IF NOT EXISTS photo_label text,
  ADD COLUMN IF NOT EXISTS photo_prompt_instruction text;

CREATE INDEX IF NOT EXISTS gemini_analyses_prompt_hash_idx
  ON gemini_analyses (source_sha256, detect_type, model, prompt_hash);
