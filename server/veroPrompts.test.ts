import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnalysisPrompt, buildQualityPrompt, promptHash, updateVeroPromptInstruction, VeroPromptProfile } from './veroPrompts.js';

const profile: VeroPromptProfile = {
  profileKey: 'PHOTO_QUALITY_GATE',
  label: 'Quality',
  description: 'Test',
  instruction: 'Base instruction',
  revision: 3,
};

test('quality prompt preserves the system contract around type-specific instruction', () => {
  const prompt = buildQualityPrompt(profile, {
    photoType: 'IMEI_DIAL',
    photoLabel: 'Màn hình IMEI',
    photoInstruction: 'Đọc IMEI rõ nét.',
  });
  assert.match(prompt, /Base instruction/);
  assert.match(prompt, /IMEI_DIAL/);
  assert.match(prompt, /approved/);
  assert.match(prompt, /Tiêu chí duyệt ảnh/);
});

test('analysis prompt uses a structured output contract and has a stable hash', () => {
  const prompt = buildAnalysisPrompt({ ...profile, profileKey: 'PHOTO_ANALYSIS' }, {
    type: 'IMEI_SERIAL',
    label: 'IMEI',
    verificationMode: 'OCR_ID',
    schemaVersion: '1.0',
    outputSchema: { type: 'object', required: ['primaryText'], properties: {} },
    aiPromptInstruction: 'Đọc IMEI.',
  }, { photoInstruction: 'Đọc IMEI.' });
  assert.match(prompt, /IMEI chỉ hợp lệ khi đủ 15 chữ số/);
  assert.match(prompt, /Hướng dẫn nghiệp vụ loại ảnh/);
  assert.match(prompt, /PASS khi ảnh thể hiện rõ/);
  assert.match(prompt, /confidence/);
  assert.equal(promptHash(prompt), promptHash(prompt));
  assert.notEqual(promptHash(prompt), promptHash(`${prompt} changed`));
});

test('prompt profile instruction rejects empty and oversized values', () => {
  assert.equal(updateVeroPromptInstruction('  Kiểm tra ảnh rõ. '), 'Kiểm tra ảnh rõ.');
  assert.throws(() => updateVeroPromptInstruction(''), /bắt buộc/);
  assert.throws(() => updateVeroPromptInstruction('x'.repeat(4001)), /4.000/);
});
