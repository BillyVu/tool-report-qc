import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import PizZip from 'pizzip';
import sharp from 'sharp';
import { buildCustomerReportSteps, type ReportPhoto, type ReportStep } from './customerReportModel.js';
import { OoxmlImageWriter } from './ooxmlImage.js';
import { normalizeReportImage, type ReportImageBox } from './reportImage.js';

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

async function processImageWithContainFit(source: Buffer, targetAspect: number): Promise<Buffer> {
  try {
    const normalized = await normalizeReportImage(source, {
      widthMm: Math.max(targetAspect, 0.01) * 50,
      heightMm: 50,
    });
    return normalized.buffer;
  } catch (err) {
    console.warn('Could not normalize report image:', err);
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
  imageWriter: OoxmlImageWriter,
  cell: any,
  photo: any,
  uploadsDirectory: string,
  box: ReportImageBox,
  mediaName: string,
): Promise<void> {
  const photoUrl = getUrlFromPhoto(photo);
  if (!photoUrl) return;

  const fileName = basename(photoUrl);
  const filePath = join(uploadsDirectory, fileName);

  try {
    const source = await readFile(filePath);
    const { drawing } = await imageWriter.createDrawing({
      source,
      mediaName,
      altText: fileName,
      box,
    });

    const newP = documentDom.createElementNS(WORD_NS, 'w:p');
    const pPr = documentDom.createElementNS(WORD_NS, 'w:pPr');
    const jc = documentDom.createElementNS(WORD_NS, 'w:jc');
    jc.setAttributeNS(WORD_NS, 'w:val', 'center');
    pPr.appendChild(jc);
    newP.appendChild(pPr);

    const newR = documentDom.createElementNS(WORD_NS, 'w:r');
    newR.appendChild(drawing);
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
  imageWriter?: OoxmlImageWriter,
  defects: any[] = [],
  uploadsDirectory?: string,
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
          if (defectPhotos.length > 0 && imageWriter && uploadsDirectory) {
            replaceCellText(photoCell, '');
            for (let photoIndex = 0; photoIndex < defectPhotos.length; photoIndex += 1) {
              await insertImageToCell(
                documentDom,
                imageWriter,
                photoCell,
                defectPhotos[photoIndex],
                uploadsDirectory,
                { widthMm: 42, heightMm: 42 },
                `defect_${photoIndex + 1}`,
              );
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
  imageWriter: OoxmlImageWriter,
  job: any,
  uploadsDirectory: string,
) {
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
        for (let photoIndex = 0; photoIndex < cartonPhotos.length; photoIndex += 1) {
          await insertImageToCell(documentDom, imageWriter, cell, cartonPhotos[photoIndex], uploadsDirectory, { widthMm: 42, heightMm: 42 }, `carton_${photoIndex + 1}`);
        }
      } else {
        replaceCellText(cell, 'N/A');
      }
    } else if (text.includes('{{device_photos}}')) {
      if (devicePhotos.length > 0) {
        replaceCellText(cell, '');
        for (let photoIndex = 0; photoIndex < devicePhotos.length; photoIndex += 1) {
          await insertImageToCell(documentDom, imageWriter, cell, devicePhotos[photoIndex], uploadsDirectory, { widthMm: 42, heightMm: 42 }, `device_${photoIndex + 1}`);
        }
      } else {
        replaceCellText(cell, 'N/A');
      }
    } else if (text.includes('{{barcode_photos}}')) {
      if (barcodePhotos.length > 0) {
        replaceCellText(cell, '');
        for (let photoIndex = 0; photoIndex < barcodePhotos.length; photoIndex += 1) {
          await insertImageToCell(documentDom, imageWriter, cell, barcodePhotos[photoIndex], uploadsDirectory, { widthMm: 42, heightMm: 42 }, `barcode_${photoIndex + 1}`);
        }
      } else {
        replaceCellText(cell, 'N/A');
      }
    }
  }
}

function createTextParagraph(documentDom: any, text: string, alignment?: 'center'): any {
  const paragraph = documentDom.createElementNS(WORD_NS, 'w:p');
  if (alignment) {
    const properties = documentDom.createElementNS(WORD_NS, 'w:pPr');
    const justification = documentDom.createElementNS(WORD_NS, 'w:jc');
    justification.setAttributeNS(WORD_NS, 'w:val', alignment);
    properties.appendChild(justification);
    paragraph.appendChild(properties);
  }
  const run = documentDom.createElementNS(WORD_NS, 'w:r');
  const textNode = documentDom.createElementNS(WORD_NS, 'w:t');
  textNode.textContent = text;
  run.appendChild(textNode);
  paragraph.appendChild(run);
  return paragraph;
}

function createDrawingParagraph(documentDom: any, drawing: any): any {
  const paragraph = documentDom.createElementNS(WORD_NS, 'w:p');
  const properties = documentDom.createElementNS(WORD_NS, 'w:pPr');
  const justification = documentDom.createElementNS(WORD_NS, 'w:jc');
  justification.setAttributeNS(WORD_NS, 'w:val', 'center');
  properties.appendChild(justification);
  paragraph.appendChild(properties);
  const run = documentDom.createElementNS(WORD_NS, 'w:r');
  run.appendChild(drawing);
  paragraph.appendChild(run);
  return paragraph;
}

function clearCellBody(cell: any): void {
  const children = Array.from({ length: cell.childNodes.length }, (_, index) => cell.childNodes.item(index));
  for (const child of children) {
    if (child && child.localName !== 'tcPr') cell.removeChild(child);
  }
}

function prepareDynamicRow(documentDom: any, row: any): void {
  const heights = row.getElementsByTagNameNS(WORD_NS, 'trHeight');
  for (let index = heights.length - 1; index >= 0; index -= 1) {
    const height = heights.item(index);
    if (height?.parentNode) height.parentNode.removeChild(height);
  }

  let rowProperties = row.getElementsByTagNameNS(WORD_NS, 'trPr').item(0);
  if (!rowProperties) {
    rowProperties = documentDom.createElementNS(WORD_NS, 'w:trPr');
    row.insertBefore(rowProperties, row.firstChild);
  }
  if (!rowProperties.getElementsByTagNameNS(WORD_NS, 'cantSplit').length) {
    rowProperties.appendChild(documentDom.createElementNS(WORD_NS, 'w:cantSplit'));
  }
}

function findStepImageCell(row: any, imageTag?: string): any {
  const cells = row.getElementsByTagNameNS(WORD_NS, 'tc');
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells.item(index);
    if (!cell) continue;
    const text = cell.textContent || '';
    if (
      cell.getElementsByTagNameNS(WORD_NS, 'drawing').length > 0
      || text.includes('{{slot_label}}')
      || (imageTag && text.includes(imageTag))
    ) {
      return cell;
    }
  }
  return null;
}

function photoBoxForStep(step: ReportStep): ReportImageBox {
  const maxWidthMm = step.photosPerRow === 2 ? 42 : 88;
  const scale = Math.min(1, maxWidthMm / step.imageWidthMm);
  return {
    widthMm: step.imageWidthMm * scale,
    heightMm: step.imageHeightMm * scale,
  };
}

function createPhotoCell(documentDom: any, columnCount: number): any {
  const cell = documentDom.createElementNS(WORD_NS, 'w:tc');
  const properties = documentDom.createElementNS(WORD_NS, 'w:tcPr');
  const width = documentDom.createElementNS(WORD_NS, 'w:tcW');
  width.setAttributeNS(WORD_NS, 'w:w', String(Math.floor(5000 / columnCount)));
  width.setAttributeNS(WORD_NS, 'w:type', 'pct');
  properties.appendChild(width);
  const verticalAlignment = documentDom.createElementNS(WORD_NS, 'w:vAlign');
  verticalAlignment.setAttributeNS(WORD_NS, 'w:val', 'top');
  properties.appendChild(verticalAlignment);
  cell.appendChild(properties);
  return cell;
}

async function populatePhotoGridCell(options: {
  documentDom: any;
  imageWriter: OoxmlImageWriter;
  imageCell: any;
  step: ReportStep;
  uploadsDirectory: string;
}): Promise<void> {
  const { documentDom, imageWriter, imageCell, step, uploadsDirectory } = options;
  clearCellBody(imageCell);

  if (step.photoRows.length === 0) {
    imageCell.appendChild(createTextParagraph(documentDom, 'Chưa thu thập ảnh', 'center'));
    return;
  }

  const columnCount = step.photosPerRow;
  const table = documentDom.createElementNS(WORD_NS, 'w:tbl');
  const tableProperties = documentDom.createElementNS(WORD_NS, 'w:tblPr');
  const tableWidth = documentDom.createElementNS(WORD_NS, 'w:tblW');
  tableWidth.setAttributeNS(WORD_NS, 'w:w', '5000');
  tableWidth.setAttributeNS(WORD_NS, 'w:type', 'pct');
  tableProperties.appendChild(tableWidth);
  const tableLayout = documentDom.createElementNS(WORD_NS, 'w:tblLayout');
  tableLayout.setAttributeNS(WORD_NS, 'w:type', 'fixed');
  tableProperties.appendChild(tableLayout);
  const tableCaption = documentDom.createElementNS(WORD_NS, 'w:tblCaption');
  tableCaption.setAttributeNS(WORD_NS, 'w:val', 'QC_PHOTO_GRID');
  tableProperties.appendChild(tableCaption);
  table.appendChild(tableProperties);

  const tableGrid = documentDom.createElementNS(WORD_NS, 'w:tblGrid');
  for (let column = 0; column < columnCount; column += 1) {
    const gridColumn = documentDom.createElementNS(WORD_NS, 'w:gridCol');
    gridColumn.setAttributeNS(WORD_NS, 'w:w', String(Math.floor(9000 / columnCount)));
    tableGrid.appendChild(gridColumn);
  }
  table.appendChild(tableGrid);

  const box = photoBoxForStep(step);
  for (let rowIndex = 0; rowIndex < step.photoRows.length; rowIndex += 1) {
    const photoRow = step.photoRows[rowIndex];
    const row = documentDom.createElementNS(WORD_NS, 'w:tr');
    const rowProperties = documentDom.createElementNS(WORD_NS, 'w:trPr');
    rowProperties.appendChild(documentDom.createElementNS(WORD_NS, 'w:cantSplit'));
    row.appendChild(rowProperties);
    const rowPhotos: Array<ReportPhoto | undefined> = columnCount === 2
      ? [photoRow.left, photoRow.right]
      : [photoRow.left];

    for (let columnIndex = 0; columnIndex < rowPhotos.length; columnIndex += 1) {
      const photo = rowPhotos[columnIndex];
      const cell = createPhotoCell(documentDom, columnCount);
      if (!photo) {
        cell.appendChild(createTextParagraph(documentDom, ''));
        row.appendChild(cell);
        continue;
      }

      const slotLabel = `Slot ${photo.slotIndex}`;
      cell.appendChild(createTextParagraph(documentDom, slotLabel, 'center'));
      try {
        const source = await readFile(join(uploadsDirectory, basename(photo.storagePath)));
        const { drawing } = await imageWriter.createDrawing({
          source,
          mediaName: `uploaded_step_${step.id}_slot_${photo.slotIndex}`,
          altText: `${step.title} - ${slotLabel}`,
          box,
        });
        cell.appendChild(createDrawingParagraph(documentDom, drawing));
      } catch (err) {
        console.warn(`Could not process photo for step ${step.id} slot ${photo.slotIndex}:`, err);
        cell.appendChild(createTextParagraph(documentDom, `[Lỗi chèn ảnh: ${slotLabel}]`, 'center'));
      }
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  imageCell.appendChild(table);
  imageCell.appendChild(createTextParagraph(documentDom, ''));
}

async function populateStepsTable(
  documentDom: any,
  imageWriter: OoxmlImageWriter,
  job: CustomerReportJob,
  photos: CustomerReportPhoto[],
  uploadsDirectory: string,
) {
  const rows = documentDom.getElementsByTagNameNS(WORD_NS, 'tr');
  let templateRow: any = null;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows.item(index);
    if ((row?.textContent || '').includes('{{step_title}}')) {
      templateRow = row;
      break;
    }
  }

  if (!templateRow?.parentNode) return;
  const parentTable = templateRow.parentNode;
  const reportSteps = buildCustomerReportSteps(job, photos);

  for (const step of reportSteps) {
    const newRow = templateRow.cloneNode(true) as Element;
    const imageCell = findStepImageCell(newRow, step.imageTag);
    prepareDynamicRow(documentDom, newRow);

    const rowReplacements: Record<string, string> = {
      '{{step_idx}}': String(step.ordinal),
      '{{step_title}}': step.title,
      '{{step_sample}}': step.sampleSize,
      '{{step_result}}': step.resultText,
      '{{step_comment}}': step.commentText,
    };
    if (step.noteTag) rowReplacements[step.noteTag] = step.commentText;
    if (step.statusTag) rowReplacements[step.statusTag] = step.resultText;
    if (step.imageTag) rowReplacements[step.imageTag] = '';
    replaceTextInElement(newRow, rowReplacements);

    if (imageCell) {
      await populatePhotoGridCell({
        documentDom,
        imageWriter,
        imageCell,
        step,
        uploadsDirectory,
      });
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
    const imageWriter = new OoxmlImageWriter(documentDom, relsDom, zip);

    await populateDefectsTable(documentDom, imageWriter, defects, options.uploadsDirectory);
    populatePackagingTables(documentDom, options.job);
    await populatePackagingPhotos(documentDom, imageWriter, options.job, options.uploadsDirectory);

    const otherPhotos = other.photos || [];
    const cells = documentDom.getElementsByTagNameNS(WORD_NS, 'tc');
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.item(i);
      if (!cell) continue;
      const text = cell.textContent || '';
      if (text.includes('{{other_photos}}')) {
        if (otherPhotos.length > 0) {
          replaceCellText(cell, '');
          for (let photoIndex = 0; photoIndex < otherPhotos.length; photoIndex += 1) {
            await insertImageToCell(documentDom, imageWriter, cell, otherPhotos[photoIndex], options.uploadsDirectory, { widthMm: 42, heightMm: 42 }, `other_${photoIndex + 1}`);
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

    await populateStepsTable(documentDom, imageWriter, options.job, options.photos, options.uploadsDirectory);

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
      await populateDefectsTable(staticDom, undefined, defects, undefined);
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

      for (const photo of onePhotoPerSlot) {
        const targetIndex = Number(photo.slot_index) - 1;
        if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= targets.length) continue;
        try {
          const source = await readFile(join(options.uploadsDirectory, basename(photo.storage_path)));
          const aspect = getSlotAspectRatio(stepIdToMatch, stepIndex, targetIndex);
          const png = await processImageWithContainFit(source, aspect);
          zip.file(targets[targetIndex], png, { compression: 'STORE' });
        } catch (err) {
          console.warn(`Could not process static photo for step ${stepIdToMatch} slot index ${targetIndex}:`, err);
          zip.file(targets[targetIndex], blankEvidenceImage, { compression: 'STORE' });
        }
      }
    }
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
