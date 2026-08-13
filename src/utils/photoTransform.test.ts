import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aspectFromQuad,
  clamp01,
  containScale,
  displayToNorm,
  normToDisplay,
  quadTriangles,
  rectForAspect,
  resizeAspectRect,
  rotatedDims,
} from './photoTransform';

test('containScale fits content inside a box, centered', () => {
  assert.deepEqual(containScale(400, 400, 800, 400), { scale: 0.5, offsetX: 0, offsetY: 100, dispW: 400, dispH: 200 });
  assert.deepEqual(containScale(400, 400, 400, 800), { scale: 0.5, offsetX: 100, offsetY: 0, dispW: 200, dispH: 400 });
});

test('normToDisplay and displayToNorm round-trip within the display box', () => {
  const fit = containScale(400, 400, 800, 400);
  const p = normToDisplay({ x: 0.25, y: 0.75 }, fit);
  assert.deepEqual(p, { x: 100, y: 250 });
  const back = displayToNorm(p.x, p.y, fit);
  assert.ok(Math.abs(back.x - 0.25) < 1e-9);
  assert.ok(Math.abs(back.y - 0.75) < 1e-9);
});

test('displayToNorm clamps to the work-image bounds', () => {
  const fit = containScale(400, 400, 800, 400);
  assert.deepEqual(displayToNorm(-50, -50, fit), { x: 0, y: 0 });
  assert.deepEqual(displayToNorm(9999, 9999, fit), { x: 1, y: 1 });
});

test('clamp01 keeps values within 0..1', () => {
  assert.equal(clamp01(-3), 0);
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(7), 1);
});

test('aspectFromQuad derives the width/height heuristic', () => {
  const square = { tl: { x: 0, y: 0 }, tr: { x: 100, y: 0 }, br: { x: 100, y: 100 }, bl: { x: 0, y: 100 } };
  assert.ok(Math.abs(aspectFromQuad(square) - 1) < 1e-6);
  const wide = { tl: { x: 0, y: 0 }, tr: { x: 200, y: 0 }, br: { x: 200, y: 100 }, bl: { x: 0, y: 100 } };
  assert.ok(Math.abs(aspectFromQuad(wide) - 2) < 1e-6);
  assert.ok(Number.isFinite(aspectFromQuad({ tl: { x: 0, y: 0 }, tr: { x: 0, y: 0 }, br: { x: 0, y: 0 }, bl: { x: 0, y: 0 } })));
});

test('rectForAspect returns the largest fitting rectangle at the target aspect', () => {
  // image 4:3 (aspect 4/3 = 1.3333), target 1:1 -> height-limited
  const square = rectForAspect(4 / 3, 1);
  assert.ok(square.h === 1 && square.w === 3 / 4, 'height-limited square');
  assert.ok(Math.abs((square.w * (4 / 3)) / square.h - 1) < 1e-9, 'pixel aspect is 1:1');
  // target 16:9 (wider than 4:3) -> width-limited
  const wide = rectForAspect(4 / 3, 16 / 9);
  assert.ok(wide.w === 1 && wide.h === (4 / 3) / (16 / 9), 'width-limited');
  assert.ok(Math.abs((wide.w * (4 / 3)) / wide.h - 16 / 9) < 1e-9, 'pixel aspect is 16:9');
});

test('quadTriangles splits a quad into two matching triangles', () => {
  const quad = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } };
  const [t1, t2] = quadTriangles(quad);
  assert.equal(t1.length, 3);
  assert.equal(t2.length, 3);
  assert.deepEqual(t1[0], quad.tl);
  assert.deepEqual(t1[2], quad.br);
  assert.deepEqual(t2[1], quad.br);
  assert.deepEqual(t2[2], quad.bl);
});

test('resizeAspectRect keeps the rect inside the image and preserves aspect', () => {
  const start = rectForAspect(4 / 3, 4 / 3); // { x:0, y:0, w:1, h:1 }
  const handles = ['tl', 'tr', 'br', 'bl', 'top', 'right', 'bottom', 'left'] as const;
  for (const handle of handles) {
    const next = resizeAspectRect(start, handle, { x: 0.25, y: 0.25 });
    assert.ok(next.x >= 0 && next.y >= 0, `${handle} x/y >= 0`);
    assert.ok(next.x + next.w <= 1 + 1e-9 && next.y + next.h <= 1 + 1e-9, `${handle} stays in bounds`);
    assert.ok(Math.abs(next.w / next.h - start.w / start.h) < 1e-9, `${handle} preserves aspect`);
  }
});

test('resizeAspectRect clamps oversized growth back into the image', () => {
  // 4:3 crop frame on a 16:9 image starts height-limited: w=1, h=0.75.
  const start = rectForAspect(16 / 9, 4 / 3);
  // Dragging the bottom-right corner far past the corner must not overflow.
  const next = resizeAspectRect(start, 'br', { x: 5, y: 5 });
  assert.ok(next.x >= 0 && next.y >= 0, 'x/y not negative');
  assert.ok(next.x + next.w <= 1 + 1e-9, 'right edge within image');
  assert.ok(next.y + next.h <= 1 + 1e-9, 'bottom edge within image');
  assert.ok(Math.abs(next.w / next.h - start.w / start.h) < 1e-9, 'aspect preserved');
  assert.equal(next.x, start.x);
  assert.equal(next.y, start.y);
});

test('resizeAspectRect anchors the opposite corner while dragging a corner', () => {
  const start = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  const next = resizeAspectRect(start, 'br', { x: 0.9, y: 0.7 });
  assert.ok(Math.abs(next.x - start.x) < 1e-9, 'tl stays fixed for br drag');
  assert.ok(Math.abs(next.y - start.y) < 1e-9, 'tl stays fixed for br drag');
  assert.ok(Math.abs(next.w / next.h - 1) < 1e-9, 'square aspect preserved');
});

test('resizeAspectRect edge drag keeps the opposite edge fixed and in bounds', () => {
  const start = rectForAspect(16 / 9, 4 / 3); // x:0, y:0.125, w:1, h:0.75
  const next = resizeAspectRect(start, 'bottom', { x: 1, y: 1 });
  assert.ok(next.y >= 0 && next.y + next.h <= 1 + 1e-9, 'bottom edge inside image');
  assert.ok(Math.abs(next.x - start.x) < 1e-9, 'top-left x fixed for bottom drag');
  assert.ok(Math.abs(next.w / next.h - start.w / start.h) < 1e-9, 'aspect preserved');
});

test('rotatedDims grows to the rotated bounding box', () => {
  assert.deepEqual(rotatedDims(100, 200, 0), { w: 100, h: 200 });
  assert.deepEqual(rotatedDims(100, 200, 90), { w: 200, h: 100 });
  const diag = rotatedDims(100, 100, 45);
  assert.equal(diag.w, Math.round(100 * Math.SQRT2));
  assert.equal(diag.h, Math.round(100 * Math.SQRT2));
});
