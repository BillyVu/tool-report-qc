export type PhotoType = string;

export interface PhotoTypeOption {
  type: PhotoType;
  label: string;
  category: 'VISUAL' | 'ANIMATION' | 'IMEI' | 'CAMERA' | 'BLUETOOTH' | 'MMI' | 'OTHER';
  iconEmoji: string;
  verificationMode?: 'OCR_ID' | 'OCR_TEXT' | 'SCREEN_STATE' | 'VISUAL' | 'MEASUREMENT' | 'EVIDENCE_ONLY';
  schemaVersion?: string;
  outputSchema?: Record<string, unknown>;
  aiPromptInstruction: string;
  promptVerifiedAt?: string | null;
  promptVerifiedBy?: string | null;
  promptVerifiedHash?: string | null;
  isSystem?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_PHOTO_TYPE_OPTIONS: PhotoTypeOption[] = [
  // Ngoại quan
  {
    type: 'VISUAL_FRONT',
    label: 'Mặt trước (Kính màn hình)',
    category: 'VISUAL',
    iconEmoji: '📱',
    verificationMode: 'VISUAL',
    schemaVersion: '1.0',
    outputSchema: { type: 'object', required: [], properties: { primaryObservation: { type: 'string' } } },
    aiPromptInstruction: 'Phân tích kính mặt trước: Kiểm tra vết trầy xước, nứt vỡ, hở viền kính hoặc bụi lọt.'
  },
  {
    type: 'VISUAL_BACK',
    label: 'Mặt sau (Mặt lưng / Camera bump)',
    category: 'VISUAL',
    iconEmoji: '📲',
    aiPromptInstruction: 'Phân tích mặt lưng: Kiểm tra trầy nắp lưng, móp méo cụm camera, tem sê-ri lưng.'
  },
  {
    type: 'VISUAL_SIDES',
    label: 'Các cạnh máy (Trái/Phải/Đỉnh/Đáy)',
    category: 'VISUAL',
    iconEmoji: '📐',
    aiPromptInstruction: 'Phân tích khung viền: Kiểm tra vết va đập, tróc sơn cạnh kim loại, dải ăng-ten.'
  },

  // Khởi động
  {
    type: 'ANIMATION_BOOT',
    label: 'Màn hình Logo Khởi động (Bootup)',
    category: 'ANIMATION',
    iconEmoji: '⚡',
    aiPromptInstruction: 'Kiểm tra màn hình khởi động: Xác minh logo hiển thị đúng mẫu, không giật sọc hay lệch màu.'
  },
  {
    type: 'ANIMATION_SHUTDOWN',
    label: 'Màn hình Tắt máy (Power Down)',
    category: 'ANIMATION',
    iconEmoji: '🌙',
    aiPromptInstruction: 'Kiểm tra màn hình tắt máy: Đảm bảo hiệu ứng tắt mượt mà, không lưu ảnh hay lóe sáng.'
  },

  // IMEI & Thông số
  {
    type: 'IMEI_DIAL',
    label: 'Màn hình bấm *#06# (Mã IMEI)',
    category: 'IMEI',
    iconEmoji: '🔢',
    aiPromptInstruction: 'Trích xuất mã IMEI: Đọc chính xác 15 chữ số IMEI hiển thị trên màn hình bấm *#06#.'
  },
  {
    type: 'SETTINGS_ABOUT',
    label: 'Settings -> About Phone (Thông số máy)',
    category: 'IMEI',
    iconEmoji: '⚙️',
    aiPromptInstruction: 'Trích xuất thông số Settings: Đọc Model Number, phiên bản OS, IMEI2 và Serial Number.'
  },
  {
    type: 'LABEL_BARCODE',
    label: 'Tem nhãn IMEI / Mã vạch sản phẩm',
    category: 'IMEI',
    iconEmoji: '🏷️',
    aiPromptInstruction: 'Đọc tem nhãn & Mã vạch: Quét trích xuất mã vạch Barcode, Sê-ri và mã IMEI trên tem nhãn.'
  },

  // Camera & Mic
  {
    type: 'CAMERA_COLOR_WHEEL',
    label: 'Chụp Vòng Màu (Color Wheel)',
    category: 'CAMERA',
    iconEmoji: '🎨',
    aiPromptInstruction: 'Phân tích màu sắc Camera: Đánh giá độ trung thực dải màu RGB, cân bằng trắng và độ sắc nét.'
  },
  {
    type: 'CAMERA_WHITE_BG',
    label: 'Chụp Phông Nền Trắng (Đốm thấu kính)',
    category: 'CAMERA',
    iconEmoji: '⚪',
    aiPromptInstruction: 'Kiểm tra đốm Camera trên nền trắng: Phát hiện vết bụi cảm biến, đốm mờ (dust spots) hoặc ám vàng.'
  },
  {
    type: 'CAMERA_BLACK_BG',
    label: 'Chụp Phông Nền Đen (Hở sáng / Pixel)',
    category: 'CAMERA',
    iconEmoji: '⬛',
    aiPromptInstruction: 'Kiểm tra camera trên nền đen: Phát hiện nhiễu hạt, hở sáng ống kính hoặc điểm sáng bất thường.'
  },
  {
    type: 'CAMERA_MIC_TEST',
    label: 'Preview Camera & Kiểm tra Mic',
    category: 'CAMERA',
    iconEmoji: '🎙️',
    aiPromptInstruction: 'Phân tích preview camera & ghi âm mic: Kiểm tra giao diện xem trước mượt và sóng âm mic.'
  },

  // Bluetooth
  {
    type: 'BLUETOOTH_SCAN',
    label: 'Màn hình Quét Thiết Bị Bluetooth',
    category: 'BLUETOOTH',
    iconEmoji: '📶',
    aiPromptInstruction: 'Phân tích danh sách Bluetooth: Trích xuất danh sách thiết bị quét được và tín hiệu RSSI.'
  },
  {
    type: 'BLUETOOTH_PAIRED',
    label: 'Màn hình Ghép Nối (Paired Device)',
    category: 'BLUETOOTH',
    iconEmoji: '🔗',
    aiPromptInstruction: 'Xác nhận kết nối Bluetooth: Đọc tên thiết bị đã ghép nối thành công và địa chỉ MAC.'
  },
  {
    type: 'BLUETOOTH_TRANSFER',
    label: 'Kết Quả Truyền Tệp Bluetooth',
    category: 'BLUETOOTH',
    iconEmoji: '📤',
    aiPromptInstruction: 'Kiểm tra tốc độ & trạng thái truyền file Bluetooth sample.'
  },

  // MMI Screen Colors
  {
    type: 'MMI_RED',
    label: 'Màn hình MMI Đỏ (Red)',
    category: 'MMI',
    iconEmoji: '🔴',
    aiPromptInstruction: 'Phân tích màn hình Đỏ: Kiểm tra độ phủ màu đỏ nguyên chất (R:255), điểm chết (dead pixels) hoặc điểm đen.'
  },
  {
    type: 'MMI_GREEN',
    label: 'Màn hình MMI Xanh Lá (Green)',
    category: 'MMI',
    iconEmoji: '🟢',
    aiPromptInstruction: 'Phân tích màn hình Xanh lá: Kiểm tra độ phủ màu xanh lá (G:255), điểm chết hoặc vệt sọc.'
  },
  {
    type: 'MMI_BLUE',
    label: 'Màn hình MMI Xanh Dương (Blue)',
    category: 'MMI',
    iconEmoji: '🔵',
    aiPromptInstruction: 'Phân tích màn hình Xanh dương: Kiểm tra độ phủ màu xanh dương (B:255) và đốm sáng.'
  },
  {
    type: 'MMI_WHITE',
    label: 'Màn hình MMI Trắng (White)',
    category: 'MMI',
    iconEmoji: '🏳️',
    aiPromptInstruction: 'Phân tích màn hình Trắng: Kiểm tra độ sáng đều, góc ám ố, đốm vàng hoặc vết ố lót.'
  },
  {
    type: 'MMI_BLACK',
    label: 'Màn hình MMI Đen nghiêng 45° (Black)',
    category: 'MMI',
    iconEmoji: '🏴',
    aiPromptInstruction: 'Phân tích màn hình Đen 45°: Phân tích hở sáng viền (backlight bleed) và điểm chết sáng.'
  },

  // Khác
  {
    type: 'GENERAL_OTHER',
    label: 'Ảnh Tổng Quan / Tùy Chỉnh Khác',
    category: 'OTHER',
    iconEmoji: '📷',
    verificationMode: 'EVIDENCE_ONLY',
    schemaVersion: '1.0',
    outputSchema: { type: 'object', required: [], properties: { primaryObservation: { type: 'string' } } },
    aiPromptInstruction: 'Phân tích tổng quan hình ảnh kiểm định QC sản phẩm điện tử.'
  }
];

export const PHOTO_TYPE_OPTIONS = DEFAULT_PHOTO_TYPE_OPTIONS;

export function getPhotoTypeInfo(type?: PhotoType, options: PhotoTypeOption[] = PHOTO_TYPE_OPTIONS): PhotoTypeOption {
  const fallback = options.find((p) => p.type === 'GENERAL_OTHER') || DEFAULT_PHOTO_TYPE_OPTIONS[DEFAULT_PHOTO_TYPE_OPTIONS.length - 1];
  if (!type) return fallback;
  return options.find(p => p.type === type) || DEFAULT_PHOTO_TYPE_OPTIONS.find(p => p.type === type) || fallback;
}
