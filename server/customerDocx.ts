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
      left.slot_index - right.slot_index || new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );
    for (let index = 0; index < Math.min(photos.length, targets.length); index += 1) {
      const source = await readFile(join(options.uploadsDirectory, basename(photos[index].storage_path)));
      const png = await sharp(source).rotate().png({ compressionLevel: 9 }).toBuffer();
      zip.file(targets[index], png);
    }
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
