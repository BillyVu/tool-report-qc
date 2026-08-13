import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { buildX530CustomerReport, applyX530SlotAspectRatios, isCustomerDocxTemplate, X530_SLOT_ASPECT_RATIOS, X530_STEP_IMAGE_TARGETS } from './customerDocx';

const TEMPLATE_NAME = 'X530 Knobs_Inspection Report 100-70-260722-117pcs_ATT.docx';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

test('recognizes only the approved X530 customer template', () => {
  assert.equal(isCustomerDocxTemplate(TEMPLATE_NAME), true);
  assert.equal(isCustomerDocxTemplate('../Mau_Bao_Cao_QC_Chuan.docx'), false);
});

test('keeps a slot aspect ratio for every X530 evidence target', () => {
  for (const [stepId, targets] of Object.entries(X530_STEP_IMAGE_TARGETS)) {
    const ratios = X530_SLOT_ASPECT_RATIOS[stepId];
    assert.ok(ratios, `missing aspect ratios for ${stepId}`);
    assert.equal(ratios.length, targets.length, `aspect count mismatch for ${stepId}`);
    ratios.forEach((ratio) => assert.ok(ratio > 0 && ratio < 5, `out-of-range ratio ${ratio} in ${stepId}`));
  }
});

test('attaches the report slot aspect ratio to worker portal slot configs', () => {
  const snapshot = {
    docxTemplateName: TEMPLATE_NAME,
    steps: [
      {
        stepId: 'STEP_1',
        title: 'Mặt trước',
        photoSlotConfigs: [
          { slotIndex: 1, label: 'Slot 1', photoType: 'PHONE_FRONT', captureFrame: 'RECTANGLE' },
          { slotIndex: 2, label: 'Slot 2', photoType: 'PHONE_BACK', captureFrame: 'RECTANGLE' },
        ],
      },
      { stepId: 'OTHER_STEP', title: 'Khác', photoSlots: ['A', 'B'] },
    ],
  };
  const enriched = applyX530SlotAspectRatios(snapshot) as {
    steps: Array<{ stepId: string; photoSlotConfigs: Array<{ slotIndex: number; aspectRatio?: number }> }>;
  };

  assert.equal(enriched.steps[0].photoSlotConfigs[0].aspectRatio, X530_SLOT_ASPECT_RATIOS.STEP_1[0]);
  assert.equal(enriched.steps[0].photoSlotConfigs[1].aspectRatio, X530_SLOT_ASPECT_RATIOS.STEP_1[1]);
  assert.equal(enriched.steps[0].stepId, 'STEP_1');
  assert.equal((snapshot.steps[0] as { photoSlotConfigs: Array<{ aspectRatio?: number }> }).photoSlotConfigs[0].aspectRatio, undefined, 'does not mutate the persisted snapshot');
});

test('builds photoSlotConfigs with aspect ratios when a step only has photoSlots', () => {
  const snapshot = {
    docxTemplateName: TEMPLATE_NAME,
    steps: [{ stepId: 'STEP_2', title: 'Mặt sau', photoSlots: ['Slot 1', 'Slot 2'] }],
  };
  const enriched = applyX530SlotAspectRatios(snapshot) as {
    steps: Array<{ photoSlotConfigs: Array<{ slotIndex: number; aspectRatio?: number }> }>;
  };
  assert.equal(enriched.steps[0].photoSlotConfigs.length, 2);
  assert.equal(enriched.steps[0].photoSlotConfigs[1].aspectRatio, X530_SLOT_ASPECT_RATIOS.STEP_2[1]);
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
    const renderedEvidence = output.file('word/media/image35.png')?.asNodeBuffer() || Buffer.alloc(0);
    const evidenceMeta = await sharp(renderedEvidence).metadata();
    assert.equal(evidenceMeta.width, 729, 'evidence is cropped to the STEP_1 slot aspect (0.5204)');
    assert.equal(evidenceMeta.height, 1400);
    const evidenceStats = await sharp(renderedEvidence).stats();
    assert.ok(evidenceStats.channels[0].mean > 200, 'evidence media is replaced with the uploaded red photo');
    assert.notDeepEqual(output.file('word/media/image7.png')?.asNodeBuffer(), oldPhoto);
    assert.notDeepEqual(output.file('word/media/image36.png')?.asNodeBuffer(), oldPhoto);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('dynamically populates defects, packaging, and step rows with unique images', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qc-dynamic-customer-docx-'));
  const templateDirectory = join(root, 'templates');
  const uploadsDirectory = join(root, 'uploads');
  await mkdir(templateDirectory);
  await mkdir(uploadsDirectory);

  try {
    const photoData = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#ff0000' },
    }).png().toBuffer();
    await writeFile(join(uploadsDirectory, 'evidence_dynamic.png'), photoData);

    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="${WORD_NS}"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <!-- Header/Job Info -->
    <w:p><w:r><w:t>{{job_id}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Worker: {{worker_name}}</w:t></w:r></w:p>

    <!-- Defects Table -->
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{{defect_desc}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{defect_photo}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{defect_crit}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{defect_maj}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{defect_min}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Packaging Info -->
    <w:p><w:r><w:t>Carton Spec: {{carton_spec}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Carton Measured: {{carton_size}}</w:t></w:r></w:p>
    <w:p><w:r><w:t>Barcode Data: {{barcode_data}}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Carton Photos: {{carton_photos}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Device Photos: {{device_photos}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Barcode Photos: {{barcode_photos}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Other Info -->
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Other Notes: {{other_notes}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Other Photos: {{other_photos}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Steps Table -->
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{{step_idx}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{step_title}}</w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p>
            <w:r><w:t>{{slot_label}}</w:t></w:r>
            <w:drawing>
              <w:inline>
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill>
                    <a:blip r:embed="rIdDefault"/>
                  </pic:blipFill>
                </pic:pic>
              </w:inline>
            </w:drawing>
          </w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>{{step_result}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{step_comment}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDefault" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_default.png"/>
</Relationships>`;

    const zip = new PizZip();
    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    zip.file('word/media/image_default.png', photoData);

    await writeFile(join(templateDirectory, TEMPLATE_NAME), zip.generate({ type: 'nodebuffer' }));

    const report = await buildX530CustomerReport({
      templateDirectory,
      uploadsDirectory,
      job: {
        external_id: 'JOB-DYNAMIC-001',
        batch_number: 'BATCH-DYN',
        worker_name: 'Worker Dynamic',
        created_at: '2026-08-04T00:00:00+07:00',
        template_snapshot: {
          docxTemplateName: TEMPLATE_NAME,
          cartonSpec: '400x300x200mm',
          steps: [
            { stepId: 'STEP_1', title: 'Kiểm tra bề mặt' }
          ]
        },
        defectsFindingData: [
          { description: 'Trầy xước bề mặt', defectType: 'Major', count: 3, photos: ['/uploads/evidence_dynamic.png'] }
        ],
        packagingInfoData: {
          cartonMeasuredSize: '398x299x199mm',
          barcodeData: 'BARCODE-XYZ-123',
          cartonPhotos: ['/uploads/evidence_dynamic.png'],
          devicePhotos: ['/uploads/evidence_dynamic.png'],
          barcodePhotos: ['/uploads/evidence_dynamic.png']
        },
        otherInfoData: {
          notes: 'Ghi chú bổ sung của worker',
          photos: ['/uploads/evidence_dynamic.png', '/uploads/evidence_dynamic.png']
        },
        stepResults: [
          { stepId: 'STEP_1', status: 'PASS', note: 'Đạt yêu cầu', sampleSize: '120 pcs' }
        ]
      },
      photos: [{
        step_id: 'STEP_1',
        slot_index: 1,
        storage_path: 'evidence_dynamic.png',
        created_at: '2026-08-04T00:01:00+07:00'
      }]
    });

    const output = new PizZip(report);
    const documentXml = output.file('word/document.xml')?.asText() || '';
    const relsXmlOutput = output.file('word/_rels/document.xml.rels')?.asText() || '';

    // Check basic info replacements
    assert.match(documentXml, /JOB-DYNAMIC-001/);
    assert.match(documentXml, /Worker Dynamic/);

    // Check defects table rendering
    assert.match(documentXml, /Trầy xước bề mặt/);
    assert.match(documentXml, /<w:t>3<\/w:t>/); // Major count

    // Check packaging info replacements
    assert.match(documentXml, /Carton Spec: 400x300x200mm/);
    assert.match(documentXml, /Carton Measured: 398x299x199mm/);
    assert.match(documentXml, /Barcode Data: BARCODE-XYZ-123/);

    // Check other info replacements
    assert.match(documentXml, /Other Notes: Ghi chú bổ sung của worker/);

    // Check steps table rendering
    assert.match(documentXml, /Kiểm tra bề mặt/);
    assert.match(documentXml, /120 pcs Pass/);
    assert.match(documentXml, /Đạt yêu cầu/);

    // Check relationship files contain the newly registered image relationship
    assert.match(relsXmlOutput, /Target="media\/defect_1_/);
    assert.match(relsXmlOutput, /Target="media\/carton_1_/);
    
    // Find the newly registered rId and check if it is embedded in the blip tag of the document
    const relIdMatch = relsXmlOutput.match(/Id="(rId\d+)"[^>]+Target="media\/uploaded_step_STEP_1_slot_1_/);
    assert.ok(relIdMatch, 'Relationship ID for new step photo is registered');
    const newRelId = relIdMatch[1];
    assert.match(documentXml, new RegExp(`r:embed="${newRelId}"`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('maps step mapping tags (note/status/image) into the dynamic step rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'qc-mapping-customer-docx-'));
  const templateDirectory = join(root, 'templates');
  const uploadsDirectory = join(root, 'uploads');
  await mkdir(templateDirectory);
  await mkdir(uploadsDirectory);

  try {
    const photoData = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#00ff00' },
    }).png().toBuffer();
    await writeFile(join(uploadsDirectory, 'evidence_mapping.png'), photoData);

    const docXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="${WORD_NS}"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Job: {{job_id}}</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>{{step_idx}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{step_title}}</w:t></w:r></w:p></w:tc>
        <w:tc>
          <w:p>
            <w:r><w:t>{{photo_visual}}</w:t></w:r>
            <w:drawing>
              <w:inline>
                <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:blipFill><a:blip r:embed="rIdDefault"/></pic:blipFill>
                </pic:pic>
              </w:inline>
            </w:drawing>
          </w:p>
        </w:tc>
        <w:tc><w:p><w:r><w:t>{{status_visual}}</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>{{note_visual}}</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDefault" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_default.png"/>
</Relationships>`;

    const zip = new PizZip();
    zip.file('word/document.xml', docXml);
    zip.file('word/_rels/document.xml.rels', relsXml);
    zip.file('word/media/image_default.png', photoData);
    await writeFile(join(templateDirectory, TEMPLATE_NAME), zip.generate({ type: 'nodebuffer' }));

    const report = await buildX530CustomerReport({
      templateDirectory,
      uploadsDirectory,
      job: {
        external_id: 'JOB-MAP-001',
        batch_number: 'BATCH-MAP',
        worker_name: 'Worker Map',
        created_at: '2026-08-04T00:00:00+07:00',
        template_snapshot: {
          docxTemplateName: TEMPLATE_NAME,
          steps: [
            {
              stepId: 'STEP_1',
              title: 'Kiểm tra bề mặt',
              mapping: {
                imageTag: '{{photo_visual}}',
                noteTag: '{{note_visual}}',
                statusTag: '{{status_visual}}',
                imageWidthMm: 60,
                imageHeightMm: 45,
              },
            },
          ],
        },
        stepResults: [
          { stepId: 'STEP_1', status: 'PASS', note: 'Bề mặt đạt', sampleSize: '120 pcs' },
        ],
      },
      photos: [{
        step_id: 'STEP_1',
        slot_index: 1,
        storage_path: 'evidence_mapping.png',
        created_at: '2026-08-04T00:01:00+07:00',
      }],
    });

    const output = new PizZip(report);
    const documentXml = output.file('word/document.xml')?.asText() || '';

    assert.match(documentXml, /Kiểm tra bề mặt/, 'step title from the template definition is written');
    assert.match(documentXml, /Bề mặt đạt/, 'note mapping tag is replaced with the worker note');
    assert.match(documentXml, /120 pcs Pass/, 'status mapping tag is replaced with the step result');
    assert.match(documentXml, /<w:drawing>/, 'image drawing is rendered');
    assert.doesNotMatch(documentXml, /\{\{(note|status|photo)_visual\}\}/, 'raw mapping placeholders are removed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
