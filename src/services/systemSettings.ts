import { SystemSettings } from '../types/qc';

export const SYSTEM_SETTINGS_STORAGE_KEY = 'qc_system_settings_v2';

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  factoryName: 'NHÀ MÁY SẢN XUẤT ĐIỆN TỬ & THIẾT BỊ THÔNG MINH',
  department: 'BỘ PHẬN PHÁT TRIỂN & QUẢN LÝ CHẤT LƯỢNG (QA/QC)',
  defaultWidth: 60,
  defaultHeight: 45,
  autoRefreshInterval: 30,
  imageConfig: {
    allowedTypes: ['png', 'jpg', 'jpeg', 'webp', 'heic', 'bmp'],
    exportFormat: 'AUTO',
    maxSizeMb: 10,
    compressionQuality: 'MEDIUM',
    autoOptimizeForDocx: true,
  },
};

export function loadSystemSettings(): SystemSettings {
  try {
    const raw = localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SYSTEM_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SYSTEM_SETTINGS,
      ...parsed,
      imageConfig: {
        ...DEFAULT_SYSTEM_SETTINGS.imageConfig,
        ...(parsed.imageConfig || {}),
      },
    };
  } catch (err) {
    console.warn('Failed to parse system settings, using defaults:', err);
    return DEFAULT_SYSTEM_SETTINGS;
  }
}

export function saveSystemSettings(settings: SystemSettings): void {
  try {
    localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Failed to save system settings:', err);
  }
}
