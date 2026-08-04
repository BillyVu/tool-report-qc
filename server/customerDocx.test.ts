import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { buildX530CustomerReport, isCustomerDocxTemplate } from './customerDocx';

const TEMPLATE_NAME = 'X530 Knobs_Inspection Report 100-70-260722-117pcs_ATT.docx';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

test('recognizes only the approved X530 customer template', () => {
  assert.equal(isCustomerDocxTemplate(TEMPLATE_NAME), true);
  assert.equal(isCustomerDocxTemplate('../Mau_Bao_Cao_QC_Chuan.docx'), false);
});

test('preserves the customer package while replacing metadata and evidence media', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qc-customer-docx-'));
  const templateDirectory = join(root, 'templates');
  const uploadsDirectory = join(root, 'uploads');
  await mkdir(templateDirectory);
  await mkdir(uploadsDirectory);

  try {
    const oldPhoto = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#0000ff' },
    }).png().toBuffer();
    const newPhoto = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#ff0000' },
    }).png().toBuffer();
    await writeFile(join(uploadsDirectory, 'evidence.png'), newPhoto);

    const zip = new PizZip();
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="${WORD_NS}"><w:body><w:p><w:r><w:t>2026-07-22</w:t></w:r></w:p><w:p><w:r><w:t>SNM000031</w:t></w:r></w:p><w:p><w:r><w:t>Thùy</w:t></w:r></w:p></w:body></w:document>`);
    zip.file('word/header1.xml', `<?xml version="1.0"?><w:hdr xmlns:w="${WORD_NS}"><w:p><w:r><w:t>Report Date: 2026-07-22</w:t></w:r><w:r><w:t>100-70-260722</w:t></w:r></w:p></w:hdr>`);
    zip.file('word/media/image7.png', oldPhoto);
    zip.file('word/media/image35.png', oldPhoto);
    zip.file('word/media/image36.png', oldPhoto);
    await writeFile(join(templateDirectory, TEMPLATE_NAME), zip.generate({ type: 'nodebuffer' }));

    const report = await buildX530CustomerReport({
      templateDirectory,
      uploadsDirectory,
      job: {
        external_id: 'JOB-001',
        batch_number: 'BATCH-001',
        worker_name: 'Nguyen Van A',
        created_at: '2026-08-04T00:00:00+07:00',
        template_snapshot: { docxTemplateName: TEMPLATE_NAME },
      },
      photos: [{
        step_id: 'STEP_1',
        slot_index: 1,
        storage_path: 'evidence.png',
        created_at: '2026-08-04T00:01:00+07:00',
      }],
    });

    const output = new PizZip(report);
    const documentXml = output.file('word/document.xml')?.asText() || '';
    const headerXml = output.file('word/header1.xml')?.asText() || '';
    assert.match(documentXml, /2026-08-04/);
    assert.match(documentXml, /BATCH-001/);
    assert.match(documentXml, /Nguyen Van A/);
    assert.match(headerXml, /JOB-001/);
    const renderedEvidence = await sharp(output.file('word/media/image35.png')?.asNodeBuffer()).raw().toBuffer();
    const expectedEvidence = await sharp(newPhoto).raw().toBuffer();
    assert.deepEqual(renderedEvidence, expectedEvidence);
    assert.notDeepEqual(output.file('word/media/image7.png')?.asNodeBuffer(), oldPhoto);
    assert.notDeepEqual(output.file('word/media/image36.png')?.asNodeBuffer(), oldPhoto);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
