import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeTemplateRow, templateDbParams } from './templates.js';

test('serializes database template rows to frontend checklist templates', () => {
  const row = {
    external_id: 'TMPL-001',
    title: 'Checklist DB',
    product_code: 'PRD-001',
    product_name: 'Product',
    version: '1.0.0',
    definition: {
      docxTemplateName: 'report.docx',
      supplierLocation: 'Bac Ninh',
      supplierContact: 'Ms. Linh',
      serviceRequired: 'FQC',
      aqlStandard: 'ISO 2859-1',
      inspectionLevel: 'Full inspection',
      orderQty: '117 pcs',
      cartonQty: '24 cartons',
      systemVersion: '15',
      hardwareVersion: 'V1.0',
      buildNumber: 'X53.0-04-15.0-10.30.00',
      steps: [{ stepId: 'STEP_1', title: 'Ảnh tổng quan' }],
    },
    created_at: '2026-08-02T00:00:00.000Z',
    updated_at: '2026-08-02T01:00:00.000Z',
  };

  const template = serializeTemplateRow(row);

  assert.equal(template.id, 'TMPL-001');
  assert.equal(template.productCode, 'PRD-001');
  assert.equal(template.docxTemplateName, 'report.docx');
  assert.equal(template.supplierLocation, 'Bac Ninh');
  assert.equal(template.buildNumber, 'X53.0-04-15.0-10.30.00');
  assert.deepEqual(template.steps, [{ stepId: 'STEP_1', title: 'Ảnh tổng quan' }]);
  assert.equal(template.updatedAt, '2026-08-02T01:00:00.000Z');
});

test('templateDbParams keeps the Word mapping definition in jsonb payload', () => {
  const params = templateDbParams({
    id: 'TMPL-002',
    title: 'Checklist mới',
    productCode: 'PRD-002',
    productName: 'Product mới',
    docxTemplateName: 'report-v2.docx',
    supplierLocation: 'Factory 2',
    supplierContact: 'Ms. Linh / Xu Yuxin',
    serviceRequired: 'FRI',
    aqlStandard: 'ISO 2859-1',
    inspectionLevel: 'Full inspection',
    orderQty: '117 pcs',
    cartonQty: '24 cartons',
    systemVersion: '15',
    hardwareVersion: 'V1.0',
    buildNumber: 'X53.0-04-15.0-10.30.00',
    version: '1.0.1',
    updatedAt: '2026-08-02T00:00:00.000Z',
    steps: [{
      stepId: 'STEP_1',
      title: 'Ảnh tổng quan',
      referenceImageUrl: '',
      isPhotoRequired: true,
      passCriteria: 'OK',
      mapping: {
        imageTag: '{{photo_step1}}',
        noteTag: '{{note_step1}}',
        statusTag: '{{status_step1}}',
        imageWidthMm: 60,
        imageHeightMm: 45,
      },
    }],
  });

  assert.equal(params.externalId, 'TMPL-002');
  assert.equal(params.productCode, 'PRD-002');
  assert.match(params.definitionJson, /report-v2\.docx/);
  assert.match(params.definitionJson, /Factory 2/);
  assert.match(params.definitionJson, /X53\.0-04-15\.0-10\.30\.00/);
  assert.match(params.definitionJson, /photo_step1/);
});
