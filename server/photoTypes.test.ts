import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoTypeParams, serializePhotoTypeRow, updatePhotoTypeParams } from './photoTypes.js';

test('creates photo type params with normalized custom code', () => {
  const params = createPhotoTypeParams({
    type: 'screen wifi',
    label: 'Màn hình Wi-Fi',
    category: 'OTHER',
    iconEmoji: '📶',
    aiPromptInstruction: 'Kiểm tra trạng thái kết nối Wi-Fi.',
    isActive: true,
    sortOrder: 222,
  });

  assert.equal(params.type, 'SCREEN_WIFI');
  assert.equal(params.label, 'Màn hình Wi-Fi');
  assert.equal(params.sortOrder, 222);
});

test('rejects updates that try to change a photo type code', () => {
  assert.throws(
    () => updatePhotoTypeParams({ type: 'NEW_CODE', label: 'Tên mới' }),
    /Không thể đổi mã loại ảnh/,
  );
});

test('serializes database photo type rows to frontend shape', () => {
  const item = serializePhotoTypeRow({
    type: 'VISUAL_FRONT',
    label: 'Mặt trước',
    category: 'VISUAL',
    icon_emoji: '📱',
    ai_prompt_instruction: 'Kiểm tra mặt trước.',
    is_system: true,
    is_active: false,
    sort_order: 10,
    created_at: '2026-08-05T00:00:00.000Z',
    updated_at: new Date('2026-08-05T01:00:00.000Z'),
  });

  assert.equal(item.iconEmoji, '📱');
  assert.equal(item.aiPromptInstruction, 'Kiểm tra mặt trước.');
  assert.equal(item.isSystem, true);
  assert.equal(item.isActive, false);
  assert.equal(item.updatedAt, '2026-08-05T01:00:00.000Z');
});
