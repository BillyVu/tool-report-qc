import { PhotoType, getPhotoTypeInfo } from '../constants/photoTypes';

interface AiDetectOptions {
  detectType: 'IMEI_SERIAL' | 'OCR_TEXT' | 'COLOR_SCREEN' | 'GENERAL';
  photoType?: PhotoType;
  customPrompt?: string;
}

interface AiDetectResult {
  detectedText: string;
  confidence: number;
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  summary: string;
}

export async function detectDataFromPhoto(
  _imageUrl: string,
  options: AiDetectOptions
): Promise<AiDetectResult> {
  const photoInfo = getPhotoTypeInfo(options.photoType);
  return {
    detectedText: '',
    confidence: 0,
    status: 'WARNING',
    summary: `Tác vụ Gemini [${photoInfo.label}] phải chạy qua server worker; UI không gọi Gemini trực tiếp.`
  };
}
