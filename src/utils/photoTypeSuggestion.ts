import { PhotoType } from '../constants/photoTypes';

function normalize(value: string | undefined) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Suggests a type from the configured inspection context; it never changes a saved choice. */
export function suggestPhotoType(stepTitle: string | undefined, slotLabel: string | undefined, aiDetectType?: string): PhotoType {
  const text = `${normalize(stepTitle)} ${normalize(slotLabel)}`;
  if (text.includes('*#06#') || text.includes('imei')) return text.includes('tem') || text.includes('barcode') ? 'LABEL_BARCODE' : 'IMEI_DIAL';
  if (text.includes('about phone') || text.includes('build number') || text.includes('system version')) return 'SETTINGS_ABOUT';
  if (text.includes('khoi dong') || text.includes('bootup') || text.includes('logo')) return 'ANIMATION_BOOT';
  if (text.includes('tat may') || text.includes('shutdown')) return 'ANIMATION_SHUTDOWN';
  if (text.includes('mat truoc') || text.includes('kinh man hinh')) return 'VISUAL_FRONT';
  if (text.includes('mat sau') || text.includes('nap lung')) return 'VISUAL_BACK';
  if (text.includes('canh ') || text.includes('nut nguon') || text.includes('side button')) return 'VISUAL_SIDES';
  if (text.includes('wifi') || text.includes('wi-fi')) return 'WIFI_CONNECTED';
  if (text.includes('bluetooth') && text.includes('paired')) return 'BLUETOOTH_PAIRED';
  if (text.includes('bluetooth')) return 'BLUETOOTH_SCAN';
  if (text.includes('camera') || text.includes('color wheel')) return 'CAMERA_COLOR_WHEEL';
  if (text.includes('man hinh do')) return 'MMI_RED';
  if (text.includes('man hinh xanh la')) return 'MMI_GREEN';
  if (text.includes('man hinh xanh duong')) return 'MMI_BLUE';
  if (text.includes('man hinh trang')) return 'MMI_WHITE';
  if (text.includes('man hinh den')) return 'MMI_BLACK';
  if (aiDetectType === 'IMEI_SERIAL') return 'IMEI_DIAL';
  if (aiDetectType === 'COLOR_SCREEN') return 'MMI_WHITE';
  if (aiDetectType === 'OCR_TEXT') return 'SETTINGS_ABOUT';
  return 'GENERAL_OTHER';
}
