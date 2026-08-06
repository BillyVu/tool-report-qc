import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSharpnessFromPixels, isFourByThree, isSquare } from './photoQuality';

test('accepts 4:3 images with a small encoding tolerance', () => {
  assert.equal(isFourByThree(1600, 1200), true);
  assert.equal(isFourByThree(1598, 1200), true);
  assert.equal(isFourByThree(1200, 1600), false);
  assert.equal(isFourByThree(1600, 1000), false);
  assert.equal(isSquare(1200, 1200), true);
  assert.equal(isSquare(1600, 1200), false);
});

test('sharpness score distinguishes a flat image from hard edges', () => {
  const flat = Buffer.alloc(5 * 5 * 3, 120);
  const edge = Buffer.alloc(5 * 5 * 3, 0);
  for (let y = 0; y < 5; y += 1) {
    for (let x = 3; x < 5; x += 1) {
      const index = (y * 5 + x) * 3;
      edge[index] = 255;
      edge[index + 1] = 255;
      edge[index + 2] = 255;
    }
  }
  assert.equal(calculateSharpnessFromPixels(flat, 5, 5, 3), 0);
  assert.ok(calculateSharpnessFromPixels(edge, 5, 5, 3) > 20);
});
