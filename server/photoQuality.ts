import { readFile } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

export const PHOTO_ASPECT_RATIO = 4 / 3;
export const DEFAULT_MIN_SHARPNESS_SCORE = 20;
const botName = process.env.BOT_NAME || 'Vero';

export type AiPhotoQuality =
  | { status: 'APPROVED'; message: string; reasonCode: string; resultJson?: Record<string, unknown> }
  | { status: 'REJECTED'; message: string; reasonCode: string; resultJson?: Record<string, unknown> }
  | { status: 'UNAVAILABLE'; message: string; reasonCode: 'INVALID'; resultJson?: Record<string, unknown> };

export function isFourByThree(width: number, height: number): boolean {
  return width > 0 && height > 0 && Math.abs(width / height - PHOTO_ASPECT_RATIO) <= 0.025;
}

export function isSquare(width: number, height: number): boolean {
  return width > 0 && height > 0 && Math.abs(width / height - 1) <= 0.025;
}

export function calculateSharpnessFromPixels(pixels: Buffer, width: number, height: number, channels: number): number {
  if (width < 3 || height < 3) return 0;
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  const luminance = (index: number) => 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * channels;
      const laplacian = 4 * luminance(index)
        - luminance(index - channels)
        - luminance(index + channels)
        - luminance(index - width * channels)
        - luminance(index + width * channels);
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }

  return count ? Math.max(0, sumSquares / count - (sum / count) ** 2) : 0;
}

export async function inspectPhotoFile(filePath: string): Promise<{ width: number; height: number; sharpnessScore: number }> {
  const image = sharp(filePath, { failOn: 'error' }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('Không thể đọc kích thước ảnh.');
  const { data, info } = await image
    .resize({ width: 480, withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: metadata.width,
    height: metadata.height,
    sharpnessScore: calculateSharpnessFromPixels(data, info.width, info.height, info.channels),
  };
}

function parseQualityResponse(text: string | undefined): { approved: boolean; reasonCode: string; reason: string; raw: Record<string, unknown> } | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
    if (typeof parsed?.approved !== 'boolean') return null;
    return {
      approved: parsed.approved,
      reasonCode: typeof parsed.reasonCode === 'string' && parsed.reasonCode.trim() ? parsed.reasonCode.trim().slice(0, 32) : 'INVALID',
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim().slice(0, 300) : 'Không đủ thông tin để xác nhận ảnh.',
      raw: parsed,
    };
  } catch {
    return null;
  }
}

export async function validatePhotoWithAi(filePath: string, mimeType: string, prompt: string): Promise<AiPhotoQuality> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 'UNAVAILABLE', message: `${botName} chưa được cấu hình.`, reasonCode: 'INVALID' };
  try {
    const image = await readFile(filePath);
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      contents: [{ inlineData: { data: image.toString('base64'), mimeType } }, {
        text: prompt,
      }],
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
    const result = parseQualityResponse(response.text);
    if (!result) return { status: 'UNAVAILABLE', message: `${botName} trả về kết quả không hợp lệ.`, reasonCode: 'INVALID' };
    return result.approved
      ? { status: 'APPROVED', message: result.reason, reasonCode: result.reasonCode, resultJson: result.raw }
      : { status: 'REJECTED', message: result.reason, reasonCode: result.reasonCode, resultJson: result.raw };
  } catch (error) {
    const detail = error instanceof Error ? error.message : `Không thể kết nối ${botName}.`;
    return { status: 'UNAVAILABLE', message: detail.slice(0, 300), reasonCode: 'INVALID' };
  }
}
