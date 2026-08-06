export interface PhotoTypeInferenceContext {
  stepTitle?: string;
  slotLabel?: string;
  aiDetectType?: string;
}

function normalizedText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

export function inferPhotoTypeFromContext(context: PhotoTypeInferenceContext): string {
  const slot = normalizedText(context.slotLabel);
  const step = normalizedText(context.stepTitle);
  const combined = `${step} ${slot}`.trim();

  if (includesAny(combined, ['*#06#', 'imei'])) {
    if (includesAny(combined, ['tem', 'label', 'barcode', 'serial'])) return 'LABEL_BARCODE';
    return 'IMEI_DIAL';
  }
  if (includesAny(combined, ['about phone', 'build number', 'hardware', 'system version', 'settings about'])) return 'SETTINGS_ABOUT';
  if (includesAny(combined, ['bootup', 'logo khoi dong', 'animation', 'boot'])) return 'ANIMATION_BOOT';
  if (includesAny(combined, ['power down', 'tat may', 'shutdown'])) return 'ANIMATION_SHUTDOWN';
  if (includesAny(combined, ['preview video', 'quay video', 'video da quay'])) return 'CAMERA_VIDEO_PREVIEW';
  if (includesAny(combined, ['mat truoc', 'kinh man hinh', 'protect film', 'mang bao ve'])) return 'VISUAL_FRONT';
  if (includesAny(combined, ['mat sau', 'nap lung', 'back cover'])) return 'VISUAL_BACK';
  if (includesAny(combined, ['canh trai', 'canh phai', 'nut tang giam', 'nut nguon', 'side button', 'khung vien'])) return 'VISUAL_SIDES';
  if (includesAny(combined, ['ban phim bat sang', 'keypad light', 'den nen'])) return 'KEYPAD_BACKLIGHT';
  if (includesAny(combined, ['goc phim bam', 'keypad'])) return 'KEYPAD_DETAIL';
  if (includesAny(combined, ['speakerphone', 'loa ngoai', 'voice command', 'lenh thoai'])) return 'SPEAKERPHONE_VOICE';
  if (includesAny(combined, ['anh chup mau', 'camera', 'color wheel'])) return 'CAMERA_COLOR_WHEEL';
  if (includesAny(combined, ['wi-fi', 'wifi'])) return 'WIFI_CONNECTED';
  if (includesAny(combined, ['bluetooth paired', 'paired'])) return 'BLUETOOTH_PAIRED';
  if (includesAny(combined, ['bluetooth', 'quet thiet bi'])) return 'BLUETOOTH_SCAN';
  if (includesAny(combined, ['file transfer', 'truyen file'])) return 'BLUETOOTH_TRANSFER';
  if (includesAny(combined, ['den pin', 'flashlight', 'led'])) return 'FLASHLIGHT_LED';
  if (includesAny(combined, ['headset', 'tai nghe', 'jack'])) return 'HEADSET_AUDIO';
  if (includesAny(combined, ['the nho sd', 'sd card', 'nho sd'])) return 'SD_CARD_STORAGE';
  if (includesAny(combined, ['otg', 'sac pin', 'charger', 'charging'])) return 'CHARGING_OTG';
  if (includesAny(combined, ['rung', 'vibration'])) return 'VIBRATION_TEST';
  if (includesAny(combined, ['112', 'goi khan cap', 'emergency call'])) return 'EMERGENCY_CALL_112';
  if (includesAny(combined, ['google apps', 'google'])) return 'GOOGLE_APPS';
  if (includesAny(combined, ['thao pin', 'sim/sd', 'khe sim'])) return 'SIM_SD_REMOVAL';
  if (includesAny(combined, ['dong goi', 'tong the 117 may', 'packaging', 'carton', 'box'])) return 'FINAL_PACKAGING';
  if (includesAny(combined, ['man hinh do', ' red'])) return 'MMI_RED';
  if (includesAny(combined, ['man hinh xanh la', ' green'])) return 'MMI_GREEN';
  if (includesAny(combined, ['man hinh xanh duong', ' blue'])) return 'MMI_BLUE';
  if (includesAny(combined, ['man hinh trang', ' white'])) return 'MMI_WHITE';
  if (includesAny(combined, ['man hinh den', ' black'])) return 'MMI_BLACK';

  if (context.aiDetectType === 'IMEI_SERIAL') return 'IMEI_DIAL';
  if (context.aiDetectType === 'COLOR_SCREEN') return 'MMI_WHITE';
  if (context.aiDetectType === 'OCR_TEXT') return 'SETTINGS_ABOUT';

  return 'GENERAL_OTHER';
}
