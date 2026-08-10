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

function reportAspectDimensions(aspect: number, maxSide: number): { width: number; height: number } {
  return aspect >= 1
    ? { width: maxSide, height: Math.round(maxSide / aspect) }
    : { width: Math.round(maxSide * aspect), height: maxSide };
}

interface CustomerReportJob {
  external_id: string;
  batch_number: string;
  worker_name?: string | null;
  created_at: string | Date;
  template_snapshot?: { docxTemplateName?: string };
}

export interface CustomerReportPhoto {
  step_id: string;
  slot_index: number;
  storage_path: string;
  created_at: string | Date;
}

function replaceTextAcrossRuns(xml: string, replacements: Record<string, string>): string {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const paragraphs = document.getElementsByTagNameNS(WORD_NS, 'p');

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const textNodes = paragraphs.item(paragraphIndex)?.getElementsByTagNameNS(WORD_NS, 't');
    if (!textNodes?.length) continue;

    for (const [source, replacement] of Object.entries(replacements)) {
      const nodes = Array.from({ length: textNodes.length }, (_, index) => textNodes.item(index)).filter(Boolean);
      const values = nodes.map((node) => node?.textContent || '');
      const combined = values.join('');
      const matchStart = combined.indexOf(source);
      if (matchStart < 0) continue;

      const matchEnd = matchStart + source.length;
      let offset = 0;
      let startNodeIndex = -1;
      let endNodeIndex = -1;
      let startOffset = 0;
      let endOffset = 0;

      values.forEach((value, index) => {
        const nextOffset = offset + value.length;
        if (startNodeIndex < 0 && matchStart >= offset && matchStart < nextOffset) {
          startNodeIndex = index;
          startOffset = matchStart - offset;
        }
        if (endNodeIndex < 0 && matchEnd > offset && matchEnd <= nextOffset) {
          endNodeIndex = index;
          endOffset = matchEnd - offset;
        }
        offset = nextOffset;
      });

      if (startNodeIndex < 0 || endNodeIndex < 0) continue;
      const prefix = values[startNodeIndex].slice(0, startOffset);
      const suffix = values[endNodeIndex].slice(endOffset);
      if (nodes[startNodeIndex]) nodes[startNodeIndex]!.textContent = `${prefix}${replacement}${suffix}`;
      for (let index = startNodeIndex + 1; index <= endNodeIndex; index += 1) {
        if (nodes[index]) nodes[index]!.textContent = '';
      }
    }
  }

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
  const replacements = {
    '2026-07-22': dates.dashed,
    '2026/07/22': dates.slashed,
    '100-70-260722': options.job.external_id,
    SNM000031: options.job.batch_number,
    'Thùy': options.job.worker_name?.trim() || 'Chưa cập nhật',
  };

  for (const xmlPath of ['word/document.xml', 'word/header1.xml']) {
    const xmlFile = zip.file(xmlPath);
    if (xmlFile) zip.file(xmlPath, replaceTextAcrossRuns(xmlFile.asText(), replacements));
  }

  const blankEvidenceImage = await sharp({
    create: { width: 8, height: 8, channels: 4, background: '#ffffff00' },
  }).png({ compressionLevel: 9 }).toBuffer();
  X530_ALL_EVIDENCE_TARGETS.forEach((target) => {
    if (zip.file(target)) zip.file(target, blankEvidenceImage);
  });

  const photosByStep = new Map<string, CustomerReportPhoto[]>();
  options.photos.forEach((photo) => {
    const current = photosByStep.get(photo.step_id) || [];
    current.push(photo);
    photosByStep.set(photo.step_id, current);
  });

  for (const [stepId, targets] of Object.entries(X530_STEP_IMAGE_TARGETS)) {
    const photos = (photosByStep.get(stepId) || []).sort((left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
    const latestBySlot = new Map<number, CustomerReportPhoto>();
    photos.forEach((photo) => latestBySlot.set(Number(photo.slot_index), photo));
    const onePhotoPerSlot = [...latestBySlot.entries()].sort((left, right) => left[0] - right[0]).map(([, photo]) => photo);
    for (let index = 0; index < Math.min(onePhotoPerSlot.length, targets.length); index += 1) {
      const photo = onePhotoPerSlot[index];
      const source = await readFile(join(options.uploadsDirectory, basename(photo.storage_path)));
      const aspect = X530_SLOT_ASPECT_RATIOS[stepId]?.[index];
      let pipeline = sharp(source).rotate();
      if (aspect && Number.isFinite(aspect) && aspect > 0) {
        const { width, height } = reportAspectDimensions(aspect, 1400);
        pipeline = pipeline.resize({ width, height, fit: 'cover', position: 'centre' });
      }
      const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      zip.file(targets[index], png);
    }
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
