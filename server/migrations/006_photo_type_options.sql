CREATE TABLE IF NOT EXISTS photo_type_options (
  type text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('VISUAL', 'ANIMATION', 'IMEI', 'CAMERA', 'BLUETOOTH', 'MMI', 'OTHER')),
  icon_emoji text NOT NULL DEFAULT '📷',
  ai_prompt_instruction text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 999,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO photo_type_options (type, label, category, icon_emoji, ai_prompt_instruction, is_system, is_active, sort_order)
VALUES
  ('VISUAL_FRONT', 'Mặt trước (Kính màn hình)', 'VISUAL', '📱', 'Phân tích kính mặt trước: Kiểm tra vết trầy xước, nứt vỡ, hở viền kính hoặc bụi lọt.', true, true, 10),
  ('VISUAL_BACK', 'Mặt sau (Mặt lưng / Camera bump)', 'VISUAL', '📲', 'Phân tích mặt lưng: Kiểm tra trầy nắp lưng, móp méo cụm camera, tem sê-ri lưng.', true, true, 20),
  ('VISUAL_SIDES', 'Các cạnh máy (Trái/Phải/Đỉnh/Đáy)', 'VISUAL', '📐', 'Phân tích khung viền: Kiểm tra vết va đập, tróc sơn cạnh kim loại, dải ăng-ten.', true, true, 30),
  ('ANIMATION_BOOT', 'Màn hình Logo Khởi động (Bootup)', 'ANIMATION', '⚡', 'Kiểm tra màn hình khởi động: Xác minh logo hiển thị đúng mẫu, không giật sọc hay lệch màu.', true, true, 40),
  ('ANIMATION_SHUTDOWN', 'Màn hình Tắt máy (Power Down)', 'ANIMATION', '🌙', 'Kiểm tra màn hình tắt máy: Đảm bảo hiệu ứng tắt mượt mà, không lưu ảnh hay lóe sáng.', true, true, 50),
  ('IMEI_DIAL', 'Màn hình bấm *#06# (Mã IMEI)', 'IMEI', '🔢', 'Trích xuất mã IMEI: Đọc chính xác 15 chữ số IMEI hiển thị trên màn hình bấm *#06#.', true, true, 60),
  ('SETTINGS_ABOUT', 'Settings -> About Phone (Thông số máy)', 'IMEI', '⚙️', 'Trích xuất thông số Settings: Đọc Model Number, phiên bản OS, IMEI2 và Serial Number.', true, true, 70),
  ('LABEL_BARCODE', 'Tem nhãn IMEI / Mã vạch sản phẩm', 'IMEI', '🏷️', 'Đọc tem nhãn & Mã vạch: Quét trích xuất mã vạch Barcode, Sê-ri và mã IMEI trên tem nhãn.', true, true, 80),
  ('CAMERA_COLOR_WHEEL', 'Chụp Vòng Màu (Color Wheel)', 'CAMERA', '🎨', 'Phân tích màu sắc Camera: Đánh giá độ trung thực dải màu RGB, cân bằng trắng và độ sắc nét.', true, true, 90),
  ('CAMERA_WHITE_BG', 'Chụp Phông Nền Trắng (Đốm thấu kính)', 'CAMERA', '⚪', 'Kiểm tra đốm Camera trên nền trắng: Phát hiện vết bụi cảm biến, đốm mờ (dust spots) hoặc ám vàng.', true, true, 100),
  ('CAMERA_BLACK_BG', 'Chụp Phông Nền Đen (Hở sáng / Pixel)', 'CAMERA', '⬛', 'Kiểm tra camera trên nền đen: Phát hiện nhiễu hạt, hở sáng ống kính hoặc điểm sáng bất thường.', true, true, 110),
  ('CAMERA_MIC_TEST', 'Preview Camera & Kiểm tra Mic', 'CAMERA', '🎙️', 'Phân tích preview camera & ghi âm mic: Kiểm tra giao diện xem trước mượt và sóng âm mic.', true, true, 120),
  ('BLUETOOTH_SCAN', 'Màn hình Quét Thiết Bị Bluetooth', 'BLUETOOTH', '📶', 'Phân tích danh sách Bluetooth: Trích xuất danh sách thiết bị quét được và tín hiệu RSSI.', true, true, 130),
  ('BLUETOOTH_PAIRED', 'Màn hình Ghép Nối (Paired Device)', 'BLUETOOTH', '🔗', 'Xác nhận kết nối Bluetooth: Đọc tên thiết bị đã ghép nối thành công và địa chỉ MAC.', true, true, 140),
  ('BLUETOOTH_TRANSFER', 'Kết Quả Truyền Tệp Bluetooth', 'BLUETOOTH', '📤', 'Kiểm tra tốc độ & trạng thái truyền file Bluetooth sample.', true, true, 150),
  ('MMI_RED', 'Màn hình MMI Đỏ (Red)', 'MMI', '🔴', 'Phân tích màn hình Đỏ: Kiểm tra độ phủ màu đỏ nguyên chất (R:255), điểm chết (dead pixels) hoặc điểm đen.', true, true, 160),
  ('MMI_GREEN', 'Màn hình MMI Xanh Lá (Green)', 'MMI', '🟢', 'Phân tích màn hình Xanh lá: Kiểm tra độ phủ màu xanh lá (G:255), điểm chết hoặc vệt sọc.', true, true, 170),
  ('MMI_BLUE', 'Màn hình MMI Xanh Dương (Blue)', 'MMI', '🔵', 'Phân tích màn hình Xanh dương: Kiểm tra độ phủ màu xanh dương (B:255) và đốm sáng.', true, true, 180),
  ('MMI_WHITE', 'Màn hình MMI Trắng (White)', 'MMI', '🏳️', 'Phân tích màn hình Trắng: Kiểm tra độ sáng đều, góc ám ố, đốm vàng hoặc vết ố lót.', true, true, 190),
  ('MMI_BLACK', 'Màn hình MMI Đen nghiêng 45° (Black)', 'MMI', '🏴', 'Phân tích màn hình Đen 45°: Phân tích hở sáng viền (backlight bleed) và điểm chết sáng.', true, true, 200),
  ('GENERAL_OTHER', 'Ảnh Tổng Quan / Tùy Chỉnh Khác', 'OTHER', '📷', 'Phân tích tổng quan hình ảnh kiểm định QC sản phẩm điện tử.', true, true, 210)
ON CONFLICT (type) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  icon_emoji = EXCLUDED.icon_emoji,
  ai_prompt_instruction = EXCLUDED.ai_prompt_instruction,
  is_system = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE INDEX IF NOT EXISTS photo_type_options_active_sort_idx
  ON photo_type_options (is_active, sort_order, label);
