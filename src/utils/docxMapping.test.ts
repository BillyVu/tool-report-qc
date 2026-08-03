import assert from 'node:assert/strict';
import test from 'node:test';
import { getWordMappingSummary, validateDocxMapping, validateTemplateMappings } from './docxMapping';
import { InspectionStep } from '../types/qc';

const baseStep: InspectionStep = {
  stepId: 'STEP_1',
  title: 'Visual Inspection',
  referenceImageUrl: '',
  isPhotoRequired: true,
  passCriteria: 'OK',
  mapping: {
    imageTag: '{{photo_visual}}',
    noteTag: '{{note_visual}}',
    statusTag: '{{status_visual}}',
    imageWidthMm: 60,
    imageHeightMm: 45,
  },
};

test('word mapping summary hides raw placeholder values from overview UI', () => {
  assert.equal(getWordMappingSummary(baseStep), 'Mapping Word OK');
});

test('docx mapping validation rejects malformed placeholder tags', () => {
  const errors = validateDocxMapping({
    imageTag: 'photo_visual',
    noteTag: '{{note_visual}}',
    statusTag: '{{status_visual}}',
    imageWidthMm: 60,
    imageHeightMm: 45,
  });

  assert.match(errors.join('\n'), /Thẻ hình ảnh phải có dạng/);
});

test('template mapping validation detects duplicated placeholder tags', () => {
  const errors = validateTemplateMappings([
    baseStep,
    {
      ...baseStep,
      stepId: 'STEP_2',
      title: 'Animation',
      mapping: {
        ...baseStep.mapping,
        noteTag: '{{note_animation}}',
        statusTag: '{{status_animation}}',
      },
    },
  ]);

  assert.match(errors.join('\n'), /tag {{photo_visual}} bị trùng/);
});
