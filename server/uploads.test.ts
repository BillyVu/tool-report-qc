import assert from 'node:assert/strict';
import test from 'node:test';
import { imageUploadFilter } from './uploads.js';

test('image uploads reject non-image MIME types', () => {
  assert.equal(imageUploadFilter({ mimetype: 'application/pdf' }), false);
});

test('image uploads accept jpeg and png MIME types', () => {
  assert.equal(imageUploadFilter({ mimetype: 'image/jpeg' }), true);
  assert.equal(imageUploadFilter({ mimetype: 'image/png' }), true);
});
