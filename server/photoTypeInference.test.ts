import assert from 'node:assert/strict';
import test from 'node:test';
import { inferPhotoTypeFromContext } from './photoTypeInference.js';

test('infers canonical photo type from legacy x530 slot labels', () => {
  assert.equal(inferPhotoTypeFromContext({ stepTitle: 'Wi-Fi & Bluetooth Verification', slotLabel: 'Danh sách Wi-Fi đã kết nối' }), 'WIFI_CONNECTED');
  assert.equal(inferPhotoTypeFromContext({ stepTitle: 'Build Number & IMEI Verification', slotLabel: 'Màn hình mã IMEI *#06#' }), 'IMEI_DIAL');
  assert.equal(inferPhotoTypeFromContext({ stepTitle: 'Side Buttons & Camera Recording', slotLabel: 'Preview Video đã quay' }), 'CAMERA_VIDEO_PREVIEW');
  assert.equal(inferPhotoTypeFromContext({ stepTitle: 'SD Card, Flashlight & Headset', slotLabel: 'Đèn pin LED sáng' }), 'FLASHLIGHT_LED');
});
