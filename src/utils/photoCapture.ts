import { aspectFromQuad, drawQuadPerspective, Quad, rectForAspect, RectNorm, rotatedDims } from './photoTransform';

export const MIN_SHARPNESS_SCORE = 20;

export async function loadImage(source: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Rasterizes the source image once with rotation + flip applied, so the editor
 * overlay and the final crop both work against a stable oriented work image.
 */
export function buildWorkCanvas(
  image: HTMLImageElement,
  rotationDeg: number,
  flipH: boolean,
  flipV: boolean,
): HTMLCanvasElement {
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const { w, h } = rotatedDims(width, height, rotationDeg);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Thiết bị không hỗ trợ xử lý ảnh.');
  context.translate(w / 2, h / 2);
  context.rotate((rotationDeg * Math.PI) / 180);
  if (flipH) context.scale(-1, 1);
  if (flipV) context.scale(1, -1);
  context.drawImage(image, -width / 2, -height / 2);
  return canvas;
}

export interface AdvancedCropOptions {
  /** Work image (rotated/flipped canvas) to draw from. */
  image: CanvasImageSource;
  /** Work image pixel dimensions. */
  width: number;
  height: number;
  mode: 'FREE' | 'ASPECT';
  /** Normalized quad (FREE mode). */
  quad?: Quad;
  /** Normalized rectangle (ASPECT mode). */
  rect?: RectNorm;
  format: 'jpeg' | 'png';
  /** JPEG quality 0..1. */
  quality: number;
  /** Longest output side cap in pixels. */
  maxSide: number;
}

export interface AdvancedCropResult {
  file: File;
  outputAspect: number;
}

export async function renderAdvancedCrop(options: AdvancedCropOptions): Promise<AdvancedCropResult> {
  const { image, width, height, mode, quad, rect, format, quality, maxSide } = options;

  let srcW: number;
  let srcH: number;
  let quadPx: Quad | null = null;
  let rectPx: { x: number; y: number; w: number; h: number } | null = null;

  if (mode === 'FREE' && quad) {
    quadPx = {
      tl: { x: quad.tl.x * width, y: quad.tl.y * height },
      tr: { x: quad.tr.x * width, y: quad.tr.y * height },
      br: { x: quad.br.x * width, y: quad.br.y * height },
      bl: { x: quad.bl.x * width, y: quad.bl.y * height },
    };
    srcW = Math.max(
      Math.hypot(quadPx.tl.x - quadPx.tr.x, quadPx.tl.y - quadPx.tr.y),
      Math.hypot(quadPx.bl.x - quadPx.br.x, quadPx.bl.y - quadPx.br.y),
    );
    srcH = Math.max(
      Math.hypot(quadPx.tl.x - quadPx.bl.x, quadPx.tl.y - quadPx.bl.y),
      Math.hypot(quadPx.tr.x - quadPx.br.x, quadPx.tr.y - quadPx.br.y),
    );
  } else {
    const r = rect && rect.w > 0 && rect.h > 0 ? rect : rectForAspect(width / height, 4 / 3);
    rectPx = { x: r.x * width, y: r.y * height, w: r.w * width, h: r.h * height };
    srcW = rectPx.w;
    srcH = rectPx.h;
  }

  if (srcW <= 0 || srcH <= 0) throw new Error('Vùng cắt không hợp lệ.');

  let outW: number;
  let outH: number;
  if (mode === 'FREE' && quadPx) {
    const aspect = aspectFromQuad(quadPx);
    outW = aspect >= 1 ? maxSide : Math.round(maxSide * aspect);
    outH = aspect >= 1 ? Math.round(maxSide / aspect) : maxSide;
    const cap = Math.min(1, srcW / outW, srcH / outH);
    outW = Math.max(1, Math.round(outW * cap));
    outH = Math.max(1, Math.round(outH * cap));
  } else {
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    outW = Math.max(1, Math.round(srcW * scale));
    outH = Math.max(1, Math.round(srcH * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Thiết bị không hỗ trợ xử lý ảnh.');

  if (mode === 'FREE' && quadPx) {
    drawQuadPerspective(context, image, quadPx, outW, outH);
  } else if (rectPx) {
    context.drawImage(image, rectPx.x, rectPx.y, rectPx.w, rectPx.h, 0, 0, outW, outH);
  }

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const extension = format === 'png' ? 'png' : 'jpg';
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Không thể tạo ảnh đã cắt.'))),
      mimeType,
      format === 'png' ? undefined : quality,
    ),
  );
  return {
    file: new File([blob], `qc-${Date.now()}.${extension}`, { type: mimeType }),
    outputAspect: outW / outH,
  };
}

export async function calculateSharpness(source: Blob): Promise<number> {
  const image = await loadImage(source);
  const scale = Math.min(1, 480 / image.naturalWidth);
  const width = Math.max(3, Math.round(image.naturalWidth * scale));
  const height = Math.max(3, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Thiết bị không hỗ trợ kiểm tra độ nét.');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  let count = 0;
  let sum = 0;
  let sumSquares = 0;
  const luminance = (index: number) => 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const laplacian = 4 * luminance(index) - luminance(index - 4) - luminance(index + 4) - luminance(index - width * 4) - luminance(index + width * 4);
      sum += laplacian;
      sumSquares += laplacian * laplacian;
      count += 1;
    }
  }
  return count ? Math.max(0, sumSquares / count - (sum / count) ** 2) : 0;
}
