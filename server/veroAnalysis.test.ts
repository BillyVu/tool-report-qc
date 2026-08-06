import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAndValidateVeroAnalysisResult, summarizeVeroAnalysis } from './veroAnalysis.js';

test('validates OCR_ID contract and summary', () => {
  const result = parseAndValidateVeroAnalysisResult(JSON.stringify({
    schemaVersion: '1.0',
    type: 'DEVICE_IMEI_LABEL',
    verificationMode: 'OCR_ID',
    status: 'PASS',
    confidence: 0.98,
    data: {
      primaryText: 'IMEI 123456789012345',
      imei: '123456789012345',
    },
    findings: [],
    warnings: [],
    evidence: {
      visible: ['IMEI label'],
      notVisible: [],
    },
  }), {
    type: 'DEVICE_IMEI_LABEL',
    verificationMode: 'OCR_ID',
    schemaVersion: '1.0',
    outputSchema: { type: 'object', required: ['primaryText'], properties: {} },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.data.imei, '123456789012345');
  assert.match(summarizeVeroAnalysis(result.value), /primaryText/);
});

test('rejects OCR_ID response with invalid imei length', () => {
  const result = parseAndValidateVeroAnalysisResult(JSON.stringify({
    schemaVersion: '1.0',
    type: 'DEVICE_IMEI_LABEL',
    verificationMode: 'OCR_ID',
    status: 'PASS',
    confidence: 0.98,
    data: {
      primaryText: '123',
      imei: '123',
    },
    findings: [],
    warnings: [],
    evidence: {
      visible: ['IMEI label'],
      notVisible: [],
    },
  }), {
    type: 'DEVICE_IMEI_LABEL',
    verificationMode: 'OCR_ID',
    schemaVersion: '1.0',
    outputSchema: { type: 'object', required: ['primaryText'], properties: {} },
  });

  assert.equal(result.ok, false);
});
