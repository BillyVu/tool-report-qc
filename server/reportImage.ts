import sharp from 'sharp';

export interface ReportImageBox {
  widthMm: number;
  heightMm: number;
  maxSidePx?: number;
}

export interface NormalizedReportImage {
  buffer: Buffer;
  widthPx: number;
  heightPx: number;
}

const DEFAULT_MAX_SIDE_PX = 1400;
const EMU_PER_MM = 36_000;

function normalizeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function millimetersToEmu(value: number): number {
  return Math.round(normalizeDimension(value, 1) * EMU_PER_MM);
}

export function reportImagePixelSize(box: ReportImageBox): { width: number; height: number } {
  const widthMm = normalizeDimension(box.widthMm, 42);
  const heightMm = normalizeDimension(box.heightMm, 32);
  const maxSide = Math.max(1, Math.round(normalizeDimension(box.maxSidePx || DEFAULT_MAX_SIDE_PX, DEFAULT_MAX_SIDE_PX)));
  const aspect = widthMm / heightMm;

  return aspect >= 1
    ? { width: maxSide, height: Math.max(1, Math.round(maxSide / aspect)) }
    : { width: Math.max(1, Math.round(maxSide * aspect)), height: maxSide };
}

export async function normalizeReportImage(
  source: Buffer,
  box: ReportImageBox,
): Promise<NormalizedReportImage> {
  const size = reportImagePixelSize(box);
  const buffer = await sharp(source)
    .rotate()
    .resize(size.width, size.height, {
      fit: 'contain',
      position: 'centre',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return {
    buffer,
    widthPx: size.width,
    heightPx: size.height,
  };
}
