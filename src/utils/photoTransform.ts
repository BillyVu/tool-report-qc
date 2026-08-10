export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

/** Normalized rectangle (0..1 relative to the work image). */
export interface RectNorm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ContainFit {
  scale: number;
  offsetX: number;
  offsetY: number;
  dispW: number;
  dispH: number;
}

export const ASPECT_PRESETS = [
  { key: 'FREE' as const, label: 'Tự do', value: null as number | null },
  { key: '16:9' as const, label: '16:9', value: 16 / 9 },
  { key: '4:3' as const, label: '4:3', value: 4 / 3 },
  { key: '1:1' as const, label: '1:1', value: 1 },
  { key: '9:16' as const, label: '9:16', value: 9 / 16 },
];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Scale + offsets to fit a content of (contentW, contentH) inside a box, centered. */
export function containScale(boxW: number, boxH: number, contentW: number, contentH: number): ContainFit {
  const scale = Math.min(boxW / contentW, boxH / contentH);
  const dispW = contentW * scale;
  const dispH = contentH * scale;
  return { scale, offsetX: (boxW - dispW) / 2, offsetY: (boxH - dispH) / 2, dispW, dispH };
}

/** Map a normalized work-image point (0..1) to display-box coordinates. */
export function normToDisplay(point: Point, fit: ContainFit): Point {
  return { x: fit.offsetX + point.x * fit.dispW, y: fit.offsetY + point.y * fit.dispH };
}

/** Map display-box coordinates back to a normalized work-image point (0..1, clamped). */
export function displayToNorm(x: number, y: number, fit: ContainFit): Point {
  return { x: clamp01((x - fit.offsetX) / fit.dispW), y: clamp01((y - fit.offsetY) / fit.dispH) };
}

/** Split a quad (in order tl, tr, br, bl) into two triangles. */
export function quadTriangles(quad: Quad): [Point[], Point[]] {
  return [
    [quad.tl, quad.tr, quad.br],
    [quad.tl, quad.br, quad.bl],
  ];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Heuristic output aspect ratio (width/height) for a freeform quad. */
export function aspectFromQuad(quad: Quad): number {
  const top = distance(quad.tl, quad.tr);
  const bottom = distance(quad.bl, quad.br);
  const left = distance(quad.tl, quad.bl);
  const right = distance(quad.tr, quad.br);
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  if (height <= 0 || width <= 0) return 1;
  return Math.min(5, Math.max(0.2, width / height));
}

/** Largest normalized rectangle with the given aspect (w/h) that fits the image. */
export function rectForAspect(imageAspect: number, targetAspect: number): RectNorm {
  if (!Number.isFinite(targetAspect) || targetAspect <= 0) return { x: 0, y: 0, w: 1, h: 1 };
  if (targetAspect >= imageAspect) {
    // target is wider (or equal) — limited by width
    const h = imageAspect / targetAspect;
    return { x: 0, y: (1 - h) / 2, w: 1, h };
  }
  // target is taller — limited by height
  const w = targetAspect / imageAspect;
  return { x: (1 - w) / 2, y: 0, w, h: 1 };
}

/**
 * Draws an affine-per-triangle approximation of a perspective (quad -> rectangle)
 * mapping. Splits the source quad and the destination rectangle into two matching
 * triangles so slight perspective is "un-skewed" without a heavy homography.
 */
export function drawQuadPerspective(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  quad: Quad,
  outWidth: number,
  outHeight: number,
): void {
  const src = [
    { x: quad.tl.x, y: quad.tl.y },
    { x: quad.tr.x, y: quad.tr.y },
    { x: quad.br.x, y: quad.br.y },
    { x: quad.bl.x, y: quad.bl.y },
  ];
  const dst = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  drawTriangle(context, image, src[0], src[1], src[2], dst[0], dst[1], dst[2]);
  drawTriangle(context, image, src[0], src[2], src[3], dst[0], dst[2], dst[3]);
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  s0: Point,
  s1: Point,
  s2: Point,
  d0: Point,
  d1: Point,
  d2: Point,
): void {
  context.save();
  context.beginPath();
  context.moveTo(d0.x, d0.y);
  context.lineTo(d1.x, d1.y);
  context.lineTo(d2.x, d2.y);
  context.closePath();
  context.clip();

  const denom = (d1.y - d2.y) * (d0.x - d2.x) + (d2.x - d1.x) * (d0.y - d2.y);
  if (Math.abs(denom) < 1e-6) {
    context.restore();
    return;
  }
  const a = ((s1.x - s2.x) * (d0.x - d2.x) + (d2.x - d1.x) * (s0.x - s2.x)) / denom;
  const b = ((s1.x - s2.x) * (d0.y - d2.y) + (d2.y - d1.y) * (s0.x - s2.x)) / denom;
  const c = ((s1.y - s2.y) * (d0.x - d2.x) + (d2.x - d1.x) * (s0.y - s2.y)) / denom;
  const d = ((s1.y - s2.y) * (d0.y - d2.y) + (d2.y - d1.y) * (s0.y - s2.y)) / denom;
  const e = s0.x - a * d0.x - b * d0.y;
  const f = s0.y - c * d0.x - d * d0.y;
  context.transform(a, c, b, d, e, f);
  context.drawImage(image, 0, 0);
  context.restore();
}

/** Bounding box of the rotated image (degrees). */
export function rotatedDims(width: number, height: number, rotationDeg: number): { w: number; h: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  return {
    w: Math.max(1, Math.round(Math.abs(Math.cos(rad)) * width + Math.abs(Math.sin(rad)) * height)),
    h: Math.max(1, Math.round(Math.abs(Math.sin(rad)) * width + Math.abs(Math.cos(rad)) * height)),
  };
}
