import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import PizZip from 'pizzip';
import sharp from 'sharp';

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const X530_TEMPLATE_NAME = 'X530 Knobs_Inspection Report 100-70-260722-117pcs_ATT.docx';

const imageRange = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => `word/media/image${start + index}.png`);

export const X530_STEP_IMAGE_TARGETS: Record<string, string[]> = {
  STEP_1: imageRange(35, 40),
  STEP_2: imageRange(41, 49),
  STEP_3: imageRange(50, 56),
  STEP_4: ['word/media/image57.png', 'word/media/image60.png'],
  STEP_5: ['word/media/image58.png', 'word/media/image59.png'],
  STEP_6: imageRange(61, 74),
  STEP_7: imageRange(75, 88),
  STEP_8: imageRange(89, 98),
  STEP_9: imageRange(99, 103),
  STEP_10: [...imageRange(104, 106), ...imageRange(108, 144)],
};

const X530_ALL_EVIDENCE_TARGETS = [
  ...imageRange(7, 9),
  ...imageRange(16, 144).filter((path) => path !== 'word/media/image107.png'),
];

/**
 * Aspect ratio (width/height) of each evidence image slot in the X530 template,
 * measured from `<wp:extent>` in word/document.xml. Keyed by step, indexed by
 * slot_index - 1 in the same order as X530_STEP_IMAGE_TARGETS. Used to size the
 * capture crop frame on the worker portal and to crop photos exactly on export.
 */
export const X530_SLOT_ASPECT_RATIOS: Record<string, number[]> = {
  STEP_1: [0.5204, 0.5142, 0.5205, 0.9793, 2.2817, 2.5963],
  STEP_2: [0.5367, 0.5292, 0.51, 0.5254, 0.6436, 0.6444, 0.5601, 0.5449, 0.5584],
  STEP_3: [0.5402, 0.5295, 0.5409, 0.5258, 0.5327, 0.5197, 0.6029],
  STEP_4: [0.7367, 0.6245],
  STEP_5: [0.6666, 0.5916],
  STEP_6: [0.6209, 0.6278, 0.6487, 0.6419, 0.6505, 0.6366, 0.7106, 0.7243, 0.7555, 0.7492, 0.703, 0.7038, 0.7091, 0.706],
  STEP_7: [0.5547, 0.6178, 0.5376, 0.6552, 0.6089, 0.9242, 0.9252, 0.8928, 0.8777, 0.8999, 0.8999, 0.4396, 0.4469, 0.4312],
  STEP_8: [0.8305, 0.8243, 0.9225, 0.759, 0.7558, 0.4402, 0.4563, 0.4454, 0.9371, 0.9541],
  STEP_9: [0.7723, 0.617, 0.7148, 1.2987, 0.687],
  STEP_10: [0.6442, 0.6871, 0.6676, 0.6899, 0.7061, 1.9337, 1.6838, 2.1724, 2.0186, 2.1202, 1.883, 1.1971, 1.3991, 1.8129, 1.5417, 1.3902, 1.3168, 0.8517, 0.8109, 0.964, 0.9519, 1.4662, 1.5885, 1.1343, 2.0235, 1.2604, 2.1202, 1.6436, 0.9231, 1.022, 0.8433, 0.9093, 0.7239, 0.7263, 1.8837, 1.7741, 0.7314, 0.7566, 1.6578, 1.6747],
};

/**
 * Enriches a served template snapshot with the report slot aspect ratio per
 * photo slot, so the worker portal crop frame matches the exact report cell.
 * Never mutates the persisted snapshot.
 */
export function applyX530SlotAspectRatios(template: unknown): unknown {
  if (!template || typeof template !== 'object') return template;
  const steps = (template as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return template;
  return {
    ...(template as Record<string, unknown>),
    steps: steps.map((step) => {
      const config = step as { stepId?: string; photoSlotConfigs?: unknown[]; photoSlots?: unknown[] };
      const ratios = X530_SLOT_ASPECT_RATIOS[config?.stepId || ''];
      if (!ratios?.length) return step;
      if (Array.isArray(config.photoSlotConfigs)) {
        return {
          ...config,
          photoSlotConfigs: config.photoSlotConfigs.map((slot) => {
            const slotConfig = slot as { slotIndex?: number };
            const ratio = ratios[Number(slotConfig?.slotIndex) - 1];
            return ratio ? { ...slotConfig, aspectRatio: ratio } : slot;
          }),
        };
      }
      if (Array.isArray(config.photoSlots)) {
        return {
          ...config,
          photoSlotConfigs: config.photoSlots.map((label, index) => ({
            slotIndex: index + 1,
            label,
            aspectRatio: ratios[index],
          })),
        };
      }
      return step;
    }),
  };
}

function reportAspectDimensions(aspect: number, maxSide: number = 1400): { width: number; height: number } {
  return aspect >= 1
    ? { width: maxSide, height: Math.round(maxSide / aspect) }
    : { width: Math.round(maxSide * aspect), height: maxSide };
}

interface CustomerReportJob {
  external_id: string;
  batch_number: string;
  worker_name?: string | null;
  created_at: string | Date;
  template_snapshot?: {
    docxTemplateName?: string;
    steps?: any[];
    cartonSpec?: string;
    deviceSpec?: string;
    productCode?: string;
    orderQty?: string | number;
  };
  defectsFindingData?: any[];
  packagingInfoData?: any;
  otherInfoData?: any;
  stepResults?: any[];
}

export interface CustomerReportPhoto {
  step_id: string;
  slot_index: number;
  storage_path: string;
  created_at: string | Date;
}

/**
 * Replaces placeholders inside any XML element or Document.
 * Supports placeholders split across multiple <w:t> runs.
 */
function replaceTextInElement(element: any, replacements: Record<string, string>): void {
  const paragraphs = element.getElementsByTagNameNS(WORD_NS, 'p');
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const p = paragraphs.item(pIdx);
    if (!p) continue;
    const textNodes = p.getElementsByTagNameNS(WORD_NS, 't');
    if (!textNodes || textNodes.length === 0) continue;

    const nodes = Array.from({ length: textNodes.length }, (_, index) => textNodes.item(index)).filter((n): n is Element => !!n);
    let values = nodes.map((node) => node.textContent || '');
    let combined = values.join('');

    for (const [source, replacement] of Object.entries(replacements)) {
      let matchIdx = combined.indexOf(source);
      while (matchIdx >= 0) {
        const matchEnd = matchIdx + source.length;
        let offset = 0;
        let startNodeIndex = -1;
        let endNodeIndex = -1;
        let startOffset = 0;
        let endOffset = 0;

        for (let idx = 0; idx < values.length; idx++) {
          const val = values[idx];
          const nextOffset = offset + val.length;
          if (startNodeIndex < 0 && matchIdx >= offset && matchIdx < nextOffset) {
            startNodeIndex = idx;
            startOffset = matchIdx - offset;
          }
          if (endNodeIndex < 0 && matchEnd > offset && matchEnd <= nextOffset) {
            endNodeIndex = idx;
            endOffset = matchEnd - offset;
          }
          offset = nextOffset;
        }

        if (startNodeIndex >= 0 && endNodeIndex >= 0) {
          const prefix = values[startNodeIndex].slice(0, startOffset);
          const suffix = values[endNodeIndex].slice(endOffset);
          nodes[startNodeIndex].textContent = `${prefix}${replacement}${suffix}`;
          for (let index = startNodeIndex + 1; index <= endNodeIndex; index += 1) {
            nodes[index].textContent = '';
          }
          values = nodes.map((node) => node.textContent || '');
          combined = values.join('');
        } else {
          break;
        }
        matchIdx = combined.indexOf(source);
      }
    }
  }
}

function replaceTextAcrossRuns(xml: string, replacements: Record<string, string>): string {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  replaceTextInElement(document, replacements);
  return new XMLSerializer().serializeToString(document);
}

function reportDate(value: string | Date) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return { dashed: `${year}-${month}-${day}`, slashed: `${year}/${month}/${day}` };
}

export function isCustomerDocxTemplate(templateName?: string | null) {
  return basename(templateName || '') === X530_TEMPLATE_NAME;
}

function getNextRelationshipId(relsDom: any): string {
  const relationships = relsDom.getElementsByTagName('Relationship');
  let maxId = 0;
  for (let i = 0; i < relationships.length; i++) {
    const id = relationships.item(i)?.getAttribute('Id') || '';
    const match = id.match(/^rId(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxId) maxId = num;
    }
  }
  return `rId${maxId + 1}`;
}

function getPhotosForStep(photos: CustomerReportPhoto[], stepId: string, stepIndex: number): CustomerReportPhoto[] {
  const normalizedStepId = (stepId || '').toLowerCase().replace(/[-_]/g, '');
  const stepKeyIndex = `step${stepIndex + 1}`;

  return photos.filter((p) => {
    const pid = (p.step_id || '').toLowerCase().replace(/[-_]/g, '');
    return pid === normalizedStepId || pid === stepKeyIndex;
  });
}

function getSlotAspectRatio(stepId: string, stepIndex: number, slotIndex: number): number {
  const keysToTry = [
    (stepId || '').toUpperCase(),
    `STEP_${stepIndex + 1}`,
    (stepId || '').toLowerCase(),
  ];
  for (const key of keysToTry) {
    const ratios = X530_SLOT_ASPECT_RATIOS[key];
    if (ratios && ratios[slotIndex]) {
      return ratios[slotIndex];
    }
  }
  return 0.75;
}

async function processImageWithCoverFit(source: Buffer, targetAspect: number): Promise<Buffer> {
  try {
    const { width: outW, height: outH } = reportAspectDimensions(targetAspect, 1400);
    return await sharp(source)
      .rotate()
      .resize(outW, outH, { fit: 'cover', position: 'centre' })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch (err) {
    console.warn('Could not process cover fit image:', err);
    return sharp(source).rotate().png({ compressionLevel: 6 }).toBuffer();
  }
}

function replaceCellText(cell: any, text: string) {
  if (!cell) return;

  const tcPr = cell.getElementsByTagNameNS(WORD_NS, 'tcPr').item(0);
  if (tcPr) {
    const vMerge = tcPr.getElementsByTagNameNS(WORD_NS, 'vMerge').item(0);
    if (vMerge) {
      const val = vMerge.getAttribute('w:val') || vMerge.getAttributeNS(WORD_NS, 'val');
      if (!val || val !== 'restart') {
        return;
      }
    }
  }

  const textNodes = cell.getElementsByTagNameNS(WORD_NS, 't');
  if (textNodes && textNodes.length > 0) {
    textNodes.item(0)!.textContent = text;
    for (let i = 1; i < textNodes.length; i++) {
      textNodes.item(i)!.textContent = '';
    }
  } else {
    let p = cell.getElementsByTagNameNS(WORD_NS, 'p').item(0);
    if (!p) {
      p = cell.ownerDocument.createElementNS(WORD_NS, 'w:p');
      cell.appendChild(p);
    }
    let r = p.getElementsByTagNameNS(WORD_NS, 'r').item(0);
    if (!r) {
      r = cell.ownerDocument.createElementNS(WORD_NS, 'w:r');
      p.appendChild(r);
    }
    const t = cell.ownerDocument.createElementNS(WORD_NS, 'w:t');
    t.textContent = text;
    r.appendChild(t);
  }
}

function getUrlFromPhoto(photo: any): string {
  if (!photo) return '';
  if (typeof photo === 'string') return photo;
  if (typeof photo === 'object' && typeof photo.url === 'string') return photo.url;
  return '';
}

async function insertImageToCell(
  documentDom: any,
  relsDom: any,
  zip: PizZip,
  cell: any,
  photo: any,
  uploadsDirectory: string,
  templateDrawing: any,
  aspect: number = 0.75
): Promise<void> {
  const photoUrl = getUrlFromPhoto(photo);
  if (!photoUrl) return;

  const fileName = basename(photoUrl);
  const filePath = join(uploadsDirectory, fileName);

  try {
    const source = await readFile(filePath);
    const nextRId = getNextRelationshipId(relsDom);
    const mediaFileName = `dyn_inserted_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.png`;
    const mediaPath = `word/media/${mediaFileName}`;

    const png = await processImageWithCoverFit(source, aspect);
    zip.file(mediaPath, png, { compression: 'STORE' });

    const relationshipsEl = relsDom.getElementsByTagName('Relationships').item(0);
    if (relationshipsEl) {
      const newRel = relsDom.createElement('Relationship');
      newRel.setAttribute('Id', nextRId);
      newRel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
      newRel.setAttribute('Target', `media/${mediaFileName}`);
      relationshipsEl.appendChild(newRel);
    }

    const newDrawing = templateDrawing.cloneNode(true);
    const blips = newDrawing.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip');
    for (let b = 0; b < blips.length; b++) {
      const blip = blips.item(b);
      if (blip) {
        blip.setAttribute('r:embed', nextRId);
        blip.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'r:embed', nextRId);
      }
    }

    const newP = documentDom.createElement('w:p');
    const pPr = documentDom.createElement('w:pPr');
    const jc = documentDom.createElement('w:jc');
    jc.setAttribute('w:val', 'center');
    pPr.appendChild(jc);
    newP.appendChild(pPr);

    const newR = documentDom.createElement('w:r');
    newR.appendChild(newDrawing);
    newP.appendChild(newR);

    cell.appendChild(newP);
  } catch (err) {
    console.warn(`Could not insert image to cell for file ${fileName}:`, err);
    const errorP = documentDom.createElement('w:p');
    const errorR = documentDom.createElement('w:r');
    const errorT = documentDom.createElement('w:t');
    errorT.textContent = `[Lỗi chèn ảnh: ${fileName}]`;
    errorR.appendChild(errorT);
    errorP.appendChild(errorR);
    cell.appendChild(errorP);
  }
}

async function populateDefectsTable(
  documentDom: any,
  relsDom?: any,
  zip?: PizZip,
  defects: any[] = [],
  uploadsDirectory?: string,
  templateDrawing?: any
) {
  const rows = documentDom.getElementsByTagNameNS(WORD_NS, 'tr');

  const sampleDefectRows: any[] = [];
  const noDefectRows: any[] = [];
  const totalFoundRows: any[] = [];
  let firstSampleRow: any = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows.item(i);
    if (!row) continue;
    const text = row.textContent || '';

    if (
      text.includes('Surface scratch') ||
      text.includes('016724000204989') ||
      text.includes('Scratch Protected Film') ||
      text.includes('016724000199288') ||
      text.includes('Wrinkled IMEI') ||
      text.includes('016724000176104') ||
      text.includes('{{defect_desc}}')
    ) {
      const isStepRow = text.includes('Appearance check') || text.includes('pcs') || text.length > 200;
      if (!isStepRow) {
        if (!firstSampleRow) firstSampleRow = row;
        sampleDefectRows.push(row);
      }
    }

    if (text.includes('No defect') && !text.includes('Total') && !text.includes('Max')) {
      noDefectRows.push(row);
    }

    if (text.includes('Total') && text.includes('Found')) {
      totalFoundRows.push(row);
    }
  }

  const totalCritical = defects.filter((d) => d.defectType === 'Critical').reduce((sum, d) => sum + (Number(d.count) || 1), 0);
  const totalMajor = defects.filter((d) => d.defectType === 'Major').reduce((sum, d) => sum + (Number(d.count) || 1), 0);
  const totalMinor = defects.filter((d) => {
    const t = d.defectType;
    return t === 'Minor' || !t || (t !== 'Critical' && t !== 'Major');
  }).reduce((sum, d) => sum + (Number(d.count) || 1), 0);

  for (const tfRow of totalFoundRows) {
    const cells = tfRow.getElementsByTagNameNS(WORD_NS, 'tc');
    if (cells.length >= 5) {
      replaceCellText(cells.item(2), String(totalCritical));
      replaceCellText(cells.item(3), String(totalMajor));
      replaceCellText(cells.item(4), String(totalMinor));
    } else if (cells.length >= 4) {
      replaceCellText(cells.item(1), String(totalCritical));
      replaceCellText(cells.item(2), String(totalMajor));
      replaceCellText(cells.item(3), String(totalMinor));
    }
  }

  const sampleRowParent = firstSampleRow?.parentNode || null;

  for (const row of sampleDefectRows) {
    if (row.parentNode) row.parentNode.removeChild(row);
  }

  for (const row of noDefectRows) {
    if (row.parentNode) row.parentNode.removeChild(row);
  }

  const insertionParent = totalFoundRows[0]?.parentNode || sampleRowParent;
  const insertBefore = totalFoundRows[0] || null;

  if (!insertionParent) return;

  if (defects.length === 0) {
    const templateRow = firstSampleRow || totalFoundRows[0];
    if (!templateRow) return;

    const emptyRow = templateRow.cloneNode(true);
    const cells = emptyRow.getElementsByTagNameNS(WORD_NS, 'tc');
    if (cells.length >= 5) {
      replaceCellText(cells.item(0), 'No defect');
      replaceCellText(cells.item(1), 'N/A');
      replaceCellText(cells.item(2), '--');
      replaceCellText(cells.item(3), '--');
      replaceCellText(cells.item(4), '--');
    }
    if (insertBefore && insertBefore.parentNode === insertionParent) {
      insertionParent.insertBefore(emptyRow, insertBefore);
    } else {
      insertionParent.appendChild(emptyRow);
    }
  } else {
    const templateRow = firstSampleRow || totalFoundRows[0];
    if (!templateRow) return;

    for (const defect of defects) {
      const isCritical = defect.defectType === 'Critical';
      const isMajor = defect.defectType === 'Major';
      const isMinor = defect.defectType === 'Minor' || (!isCritical && !isMajor);

      const newRow = templateRow.cloneNode(true);
      const cells = newRow.getElementsByTagNameNS(WORD_NS, 'tc');
      if (cells.length >= 5) {
        replaceCellText(cells.item(0), defect.description || '');

        const photoCell = cells.item(1);
        if (photoCell) {
          const defectPhotos = defect.photos || [];
          if (defectPhotos.length > 0 && relsDom && zip && uploadsDirectory && templateDrawing) {
            replaceCellText(photoCell, '');
            for (const photo of defectPhotos) {
              await insertImageToCell(documentDom, relsDom, zip, photoCell, photo, uploadsDirectory, templateDrawing, 0.75);
            }
          } else {
            replaceCellText(photoCell, defectPhotos.length > 0 ? '[Photo Attached]' : 'N/A');
          }
        }

        replaceCellText(cells.item(2), isCritical ? String(defect.count || 1) : '');
        replaceCellText(cells.item(3), isMajor ? String(defect.count || 1) : '');
        replaceCellText(cells.item(4), isMinor ? String(defect.count || 1) : '');
      }

      if (insertBefore && insertBefore.parentNode === insertionParent) {
        insertionParent.insertBefore(newRow, insertBefore);
      } else {
        insertionParent.appendChild(newRow);
      }
    }
  }
}

function populatePackagingTables(documentDom: any, job: CustomerReportJob) {
  const pkg = job.packagingInfoData || (job as any).packaging_info_data || {};
  const templateSnap = job.template_snapshot || {};
  const productCode = templateSnap.productCode || 'X530';

  const cartonSpec = pkg.cartonSpec || templateSnap.cartonSpec || '310x195x125mm';
  const cartonSize = pkg.cartonMeasuredSize || cartonSpec;
  const cartonResult = pkg.cartonResult || 'For refer';
  const cartonNw = pkg.cartonNw || '2758.5';
  const cartonGw = pkg.cartonGw || '3348.7';

  const deviceSpec = pkg.deviceSpec || templateSnap.deviceSpec || '164.22×66.59×21.91';
  const deviceSize = pkg.deviceMeasuredSize || deviceSpec;
  const deviceResult = pkg.deviceResult || 'For refer';
  const deviceNw = pkg.deviceNw || '201.7';
  const deviceGw = pkg.deviceGw || '281.1';

  const barcodeData = pkg.barcodeData || job.batch_number || 'SNM000031';
  const barcodeResult = pkg.barcodeResult || 'Pass';

  const tables = documentDom.getElementsByTagNameNS(WORD_NS, 'tbl');
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables.item(i);
    if (!tbl) continue;
    const text = tbl.textContent || '';

    // 1. Table B-3: Transport carton measurement / Outer carton
    if (text.includes('Outer carton') || text.includes('Transport carton')) {
      const rows = tbl.getElementsByTagNameNS(WORD_NS, 'tr');
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows.item(rIdx);
        if (!row) continue;
        const rText = row.textContent || '';
        const isHeader = rText.includes('Item #') || rText.includes('Specification');
        if (!isHeader && rIdx >= 2) {
          const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
          if (cells.length >= 7) {
            if (cells.item(0)?.textContent?.includes('Outer carton')) {
              replaceCellText(cells.item(0), 'Outer carton');
            }
            replaceCellText(cells.item(1), cartonSpec);
            replaceCellText(cells.item(2), cartonSize);
            replaceCellText(cells.item(3), cartonResult);
            replaceCellText(cells.item(4), cartonNw);
            replaceCellText(cells.item(5), cartonGw);
            replaceCellText(cells.item(6), cartonResult);
          }
        }
      }
    }

    // 2. Table B-4: Device measurement
    if (text.includes('Device measurement') || (text.includes('Device') && text.includes('164.22'))) {
      const rows = tbl.getElementsByTagNameNS(WORD_NS, 'tr');
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows.item(rIdx);
        if (!row) continue;
        const rText = row.textContent || '';
        const isHeader = rText.includes('Item #') || rText.includes('Specification');
        if (!isHeader && rIdx >= 2) {
          const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
          if (cells.length >= 7) {
            if (cells.item(0)?.textContent?.includes('Device')) {
              replaceCellText(cells.item(0), 'Device');
            }
            replaceCellText(cells.item(1), deviceSpec);
            replaceCellText(cells.item(2), deviceSize);
            replaceCellText(cells.item(3), deviceResult);
            replaceCellText(cells.item(4), deviceNw);
            replaceCellText(cells.item(5), deviceGw);
            replaceCellText(cells.item(6), deviceResult);
          }
        }
      }
    }

    // 3. Table B-5: Barcode check
    if (text.includes('Barcode check') || text.includes('Barcode on location')) {
      const rows = tbl.getElementsByTagNameNS(WORD_NS, 'tr');
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows.item(rIdx);
        if (!row) continue;
        const rText = row.textContent || '';
        const isHeader = rText.includes('Item No.') || rText.includes('Barcode on location');
        if (!isHeader && rIdx >= 1) {
          const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
          if (cells.length >= 5) {
            replaceCellText(cells.item(0), productCode);
            const location = cells.item(1)?.textContent?.trim() || (rIdx === 1 ? 'Device' : rIdx === 2 ? 'Device box' : 'Carton box');
            replaceCellText(cells.item(1), location);
            replaceCellText(cells.item(2), barcodeData);
            replaceCellText(cells.item(3), barcodeData);
            replaceCellText(cells.item(4), barcodeResult);
          }
        }
      }
    }
  }
}

async function populatePackagingPhotos(
  documentDom: any,
  relsDom: any,
  zip: PizZip,
  job: any,
  uploadsDirectory: string,
  templateDrawing: any
) {
  if (!templateDrawing) return;

  const pkg = job.packagingInfoData || (job as any).packaging_info_data || {};
  const cartonPhotos = pkg.cartonPhotos || [];
  const devicePhotos = pkg.devicePhotos || [];
  const barcodePhotos = pkg.barcodePhotos || [];

  const cells = documentDom.getElementsByTagNameNS(WORD_NS, 'tc');
  for (let i = 0; i < cells.length; i++) {
    const cell = cells.item(i);
    if (!cell) continue;
    const text = cell.textContent || '';

    if (text.includes('{{carton_photos}}')) {
      if (cartonPhotos.length > 0) {
        replaceCellText(cell, '');
        for (const photo of cartonPhotos) {
          await insertImageToCell(documentDom, relsDom, zip, cell, photo, uploadsDirectory, templateDrawing, 0.75);
        }
      } else {
        replaceCellText(cell, 'N/A');
      }
    } else if (text.includes('{{device_photos}}')) {
      if (devicePhotos.length > 0) {
        replaceCellText(cell, '');
        for (const photo of devicePhotos) {
          await insertImageToCell(documentDom, relsDom, zip, cell, photo, uploadsDirectory, templateDrawing, 0.75);
        }
      } else {
        replaceCellText(cell, 'N/A');
      }
    } else if (text.includes('{{barcode_photos}}')) {
      if (barcodePhotos.length > 0) {
        replaceCellText(cell, '');
        for (const photo of barcodePhotos) {
          await insertImageToCell(documentDom, relsDom, zip, cell, photo, uploadsDirectory, templateDrawing, 0.75);
        }
      } else {
        replaceCellText(cell, 'N/A');
      }
    }
  }
}

async function populateStepsTable(
  documentDom: any,
  relsDom: any,
  zip: PizZip,
  job: any,
  photos: CustomerReportPhoto[],
  uploadsDirectory: string
) {
  const rows = documentDom.getElementsByTagNameNS(WORD_NS, 'tr');
  let templateRow: any = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows.item(i);
    if (!row) continue;
    const textContent = row.textContent || '';
    if (textContent.includes('{{step_title}}')) {
      templateRow = row;
      break;
    }
  }

  if (!templateRow || !templateRow.parentNode) return;

  const parentTable = templateRow.parentNode;

  const stepResults = job.stepResults || [];
  const templateSteps = job.template_snapshot?.steps || [];

  for (let idx = 0; idx < stepResults.length; idx++) {
    const sr = stepResults[idx];
    const stepDef = templateSteps.find((s: any) => s.stepId === sr.stepId);
    const stepTitle = stepDef ? stepDef.title : `Bước ${sr.stepId}`;
    const sampleSize = sr.sampleSize || stepDef?.sampleSize || job.template_snapshot?.orderQty || '120 pcs';
    
    let resultText = 'Pending';
    if (sr.status === 'PASS') {
      resultText = `${sr.sampleSize || stepDef?.sampleSize || job.template_snapshot?.orderQty || '117 pcs'} Pass`;
    } else if (sr.status === 'FAIL') {
      resultText = 'Defective';
    }

    let commentText = sr.note || 'Không có ghi chú';
    if (sr.textValue) {
      commentText += `\nDữ liệu nhập: ${sr.textValue}`;
    }
    if (sr.aiDetectedValue) {
      commentText += `\nVero: ${sr.aiDetectedValue}`;
    }
    if (sr.adminReviewNote) {
      commentText += `\nGhi chú Admin: ${sr.adminReviewNote}`;
    }

    const newRow = templateRow.cloneNode(true) as Element;

    const rowReplacements: Record<string, string> = {
      '{{step_idx}}': String(idx + 1),
      '{{step_title}}': stepTitle,
      '{{step_sample}}': sampleSize,
      '{{step_result}}': resultText,
      '{{step_comment}}': commentText,
    };

    if (stepDef?.mapping) {
      if (stepDef.mapping.noteTag) rowReplacements[stepDef.mapping.noteTag] = commentText;
      if (stepDef.mapping.statusTag) rowReplacements[stepDef.mapping.statusTag] = resultText;
      if (stepDef.mapping.imageTag) rowReplacements[stepDef.mapping.imageTag] = '[Photo Attached]';
    }

    replaceTextInElement(newRow, rowReplacements);

    const stepPhotos = getPhotosForStep(photos, sr.stepId, idx)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    const latestBySlot = new Map<number, CustomerReportPhoto>();
    stepPhotos.forEach((photo) => latestBySlot.set(Number(photo.slot_index), photo));
    const onePhotoPerSlot = [...latestBySlot.entries()].sort((a, b) => a[0] - b[0]).map(([, photo]) => photo);

    const drawings = newRow.getElementsByTagNameNS(WORD_NS, 'drawing');
    let imageCell: any = null;
    let templateP: any = null;

    if (drawings.length > 0) {
      const drawing = drawings.item(0);
      let parent: any = drawing?.parentNode;
      while (parent && parent.nodeName !== 'w:p') {
        parent = parent.parentNode;
      }
      if (parent) {
        templateP = parent;
        imageCell = templateP.parentNode;
      }
    }

    if (imageCell && templateP) {
      if (onePhotoPerSlot.length === 0) {
        const noPhotoP = documentDom.createElement('w:p');
        const noPhotoR = documentDom.createElement('w:r');
        const noPhotoT = documentDom.createElement('w:t');
        noPhotoT.textContent = 'Chưa thu thập ảnh';
        noPhotoR.appendChild(noPhotoT);
        noPhotoP.appendChild(noPhotoR);
        imageCell.insertBefore(noPhotoP, templateP);
      } else {
        for (let pIdx = 0; pIdx < onePhotoPerSlot.length; pIdx++) {
          const photo = onePhotoPerSlot[pIdx];
          const photoP = templateP.cloneNode(true);

          const slotLabel = photo.slot_index ? `Slot ${photo.slot_index}` : `Ảnh ${pIdx + 1}`;
          replaceTextInElement(photoP, { '{{slot_label}}': slotLabel });

          const nextRId = getNextRelationshipId(relsDom);
          const mediaFileName = `uploaded_step_${sr.stepId}_${pIdx}_${Date.now()}.png`;
          const mediaPath = `word/media/${mediaFileName}`;

          try {
            const source = await readFile(join(uploadsDirectory, basename(photo.storage_path)));
            const aspect = getSlotAspectRatio(sr.stepId, idx, pIdx);
            const png = await processImageWithCoverFit(source, aspect);
            zip.file(mediaPath, png, { compression: 'STORE' });

            const relationshipsEl = relsDom.getElementsByTagName('Relationships').item(0);
            if (relationshipsEl) {
              const newRel = relsDom.createElement('Relationship');
              newRel.setAttribute('Id', nextRId);
              newRel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
              newRel.setAttribute('Target', `media/${mediaFileName}`);
              relationshipsEl.appendChild(newRel);
            }

            const blips = photoP.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip');
            for (let b = 0; b < blips.length; b++) {
              const blip = blips.item(b);
              if (blip) {
                blip.setAttribute('r:embed', nextRId);
                blip.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'r:embed', nextRId);
              }
            }

            imageCell.insertBefore(photoP, templateP);
          } catch (err) {
            console.warn(`Could not process photo for step ${sr.stepId} slot ${photo.slot_index}:`, err);
            const errorP = documentDom.createElement('w:p');
            const errorR = documentDom.createElement('w:r');
            const errorT = documentDom.createElement('w:t');
            errorT.textContent = `[Lỗi chèn ảnh: ${slotLabel}]`;
            errorR.appendChild(errorT);
            errorP.appendChild(errorR);
            imageCell.insertBefore(errorP, templateP);
          }
        }
      }
      imageCell.removeChild(templateP);
    }

    parentTable.insertBefore(newRow, templateRow);
  }

  parentTable.removeChild(templateRow);
}

export async function buildX530CustomerReport(options: {
  templateDirectory: string;
  uploadsDirectory: string;
  job: CustomerReportJob;
  photos: CustomerReportPhoto[];
}) {
  const templateName = basename(options.job.template_snapshot?.docxTemplateName || '');
  if (!isCustomerDocxTemplate(templateName)) throw new Error('Unsupported customer DOCX template.');

  const templateBuffer = await readFile(join(options.templateDirectory, templateName));
  const zip = new PizZip(templateBuffer);
  const dates = reportDate(options.job.created_at);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('Invalid DOCX: word/document.xml not found.');

  const docXmlText = docXmlFile.asText();
  const isDynamicTemplate = docXmlText.includes('{{step_title}}') || docXmlText.includes('{{defect_desc}}');

  const defects = Array.isArray(options.job.defectsFindingData) ? options.job.defectsFindingData
    : Array.isArray((options.job as any).defects_finding_data) ? (options.job as any).defects_finding_data
    : [];
  const pkg = options.job.packagingInfoData || (options.job as any).packaging_info_data || {};
  const other = options.job.otherInfoData || (options.job as any).other_info_data || {};

  const documentDomForExtract = new DOMParser().parseFromString(docXmlText, 'application/xml');
  const docDrawings = documentDomForExtract.getElementsByTagNameNS(WORD_NS, 'drawing');
  let templateDrawing: any = null;
  if (docDrawings.length > 0) {
    templateDrawing = docDrawings.item(0).cloneNode(true);
  }

  if (isDynamicTemplate) {
    const documentDom = new DOMParser().parseFromString(docXmlText, 'application/xml');

    const baseReplacements: Record<string, string> = {
      '{{job_id}}': options.job.external_id,
      '{{batch_number}}': options.job.batch_number,
      '{{worker_name}}': options.job.worker_name?.trim() || 'Chưa cập nhật',
      '{{inspection_date}}': dates.dashed,
      '{{inspection_date_slash}}': dates.slashed,
      '2026-07-22': dates.dashed,
      '2026/07/22': dates.slashed,
      '100-70-260722': options.job.external_id,
      SNM000031: options.job.batch_number,
      'Thùy': options.job.worker_name?.trim() || 'Chưa cập nhật',
    };
    replaceTextInElement(documentDom, baseReplacements);

    const headerFile = zip.file('word/header1.xml');
    if (headerFile) {
      const headerDom = new DOMParser().parseFromString(headerFile.asText(), 'application/xml');
      replaceTextInElement(headerDom, baseReplacements);
      zip.file('word/header1.xml', new XMLSerializer().serializeToString(headerDom));
    }

    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (!relsFile) throw new Error('Invalid DOCX: word/_rels/document.xml.rels not found.');
    const relsDom = new DOMParser().parseFromString(relsFile.asText(), 'application/xml');

    await populateDefectsTable(documentDom, relsDom, zip, defects, options.uploadsDirectory, templateDrawing);
    populatePackagingTables(documentDom, options.job);
    await populatePackagingPhotos(documentDom, relsDom, zip, options.job, options.uploadsDirectory, templateDrawing);

    const otherPhotos = other.photos || [];
    const cells = documentDom.getElementsByTagNameNS(WORD_NS, 'tc');
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.item(i);
      if (!cell) continue;
      const text = cell.textContent || '';
      if (text.includes('{{other_photos}}')) {
        if (otherPhotos.length > 0 && templateDrawing) {
          replaceCellText(cell, '');
          for (const photo of otherPhotos) {
            await insertImageToCell(documentDom, relsDom, zip, cell, photo, options.uploadsDirectory, templateDrawing, 0.75);
          }
        } else {
          replaceCellText(cell, 'N/A');
        }
      }
    }

    const pkgReplacements: Record<string, string> = {
      '{{carton_spec}}': options.job.template_snapshot?.cartonSpec || pkg.cartonSpec || '310x195x125mm',
      '{{carton_size}}': pkg.cartonMeasuredSize || '',
      '{{carton_nw}}': pkg.cartonNw || '',
      '{{carton_gw}}': pkg.cartonGw || '',
      '{{carton_result}}': pkg.cartonResult || '',
      '{{device_spec}}': options.job.template_snapshot?.deviceSpec || pkg.deviceSpec || '164.22×66.59×21.91',
      '{{device_size}}': pkg.deviceMeasuredSize || '',
      '{{device_nw}}': pkg.deviceNw || '',
      '{{device_gw}}': pkg.deviceGw || '',
      '{{device_result}}': pkg.deviceResult || '',
      '{{barcode_data}}': pkg.barcodeData || '',
      '{{barcode_result}}': pkg.barcodeResult || '',
      '{{other_notes}}': other.notes || 'N/A',
    };
    replaceTextInElement(documentDom, pkgReplacements);

    await populateStepsTable(documentDom, relsDom, zip, options.job, options.photos, options.uploadsDirectory);

    zip.file('word/_rels/document.xml.rels', new XMLSerializer().serializeToString(relsDom));
    zip.file('word/document.xml', new XMLSerializer().serializeToString(documentDom));
  } else {
    const replacements: Record<string, string> = {
      '2026-07-22': dates.dashed,
      '2026/07/22': dates.slashed,
      '100-70-260722': options.job.external_id,
      SNM000031: options.job.batch_number,
      'Thùy': options.job.worker_name?.trim() || 'Chưa cập nhật',
      '{{job_id}}': options.job.external_id,
      '{{batch_number}}': options.job.batch_number,
      '{{worker_name}}': options.job.worker_name?.trim() || 'Chưa cập nhật',
      '{{carton_spec}}': options.job.template_snapshot?.cartonSpec || pkg.cartonSpec || '310x195x125mm',
      '{{carton_size}}': pkg.cartonMeasuredSize || '',
      '{{carton_nw}}': pkg.cartonNw || '',
      '{{carton_gw}}': pkg.cartonGw || '',
      '{{device_spec}}': options.job.template_snapshot?.deviceSpec || pkg.deviceSpec || '164.22×66.59×21.91',
      '{{device_size}}': pkg.deviceMeasuredSize || '',
      '{{device_nw}}': pkg.deviceNw || '',
      '{{device_gw}}': pkg.deviceGw || '',
      '{{barcode_data}}': pkg.barcodeData || '',
    };

    for (const xmlPath of ['word/document.xml', 'word/header1.xml']) {
      const xmlFile = zip.file(xmlPath);
      if (xmlFile) zip.file(xmlPath, replaceTextAcrossRuns(xmlFile.asText(), replacements));
    }

    const staticDocXml = zip.file('word/document.xml');
    if (staticDocXml) {
      const staticDom = new DOMParser().parseFromString(staticDocXml.asText(), 'application/xml');
      await populateDefectsTable(staticDom, undefined, undefined, defects, undefined, undefined);
      populatePackagingTables(staticDom, options.job);
      zip.file('word/document.xml', new XMLSerializer().serializeToString(staticDom));
    }

    const blankEvidenceImage = await sharp({
      create: { width: 8, height: 8, channels: 4, background: '#ffffff00' },
    }).png({ compressionLevel: 6 }).toBuffer();
    X530_ALL_EVIDENCE_TARGETS.forEach((target) => {
      if (zip.file(target)) zip.file(target, blankEvidenceImage, { compression: 'STORE' });
    });

    for (const [stepKey, targets] of Object.entries(X530_STEP_IMAGE_TARGETS)) {
      const stepIndex = parseInt(stepKey.replace('STEP_', ''), 10) - 1;
      const sr = options.job.stepResults?.[stepIndex];
      const stepIdToMatch = sr?.stepId || stepKey;

      const stepPhotos = getPhotosForStep(options.photos, stepIdToMatch, stepIndex)
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());

      const latestBySlot = new Map<number, CustomerReportPhoto>();
      stepPhotos.forEach((photo) => latestBySlot.set(Number(photo.slot_index), photo));
      const onePhotoPerSlot = [...latestBySlot.entries()].sort((left, right) => left[0] - right[0]).map(([, photo]) => photo);

      for (let index = 0; index < Math.min(onePhotoPerSlot.length, targets.length); index += 1) {
        const photo = onePhotoPerSlot[index];
        try {
          const source = await readFile(join(options.uploadsDirectory, basename(photo.storage_path)));
          const aspect = getSlotAspectRatio(stepIdToMatch, stepIndex, index);
          const png = await processImageWithCoverFit(source, aspect);
          zip.file(targets[index], png, { compression: 'STORE' });
        } catch (err) {
          console.warn(`Could not process static photo for step ${stepIdToMatch} slot index ${index}:`, err);
          zip.file(targets[index], blankEvidenceImage, { compression: 'STORE' });
        }
      }
    }
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
