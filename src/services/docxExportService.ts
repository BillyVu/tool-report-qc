import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  ImageRun,
  ShadingType
} from 'docx';
import saveAs from 'file-saver';
import { InspectionJob, ChecklistTemplate, StepResult, InspectionStep } from '../types/qc';
import { adminApi, getAdminApiKey } from './adminApi';

type ExportImageType = 'png' | 'jpg' | 'gif' | 'bmp';
type SourceImageType = ExportImageType | 'webp';

interface StepReportImage {
  url?: string;
  label: string;
}

interface StepImageBuffer {
  label: string;
  data: Uint8Array | null;
  type: ExportImageType | null;
}

const SUPPORTED_IMAGE_TYPES = new Set<ExportImageType>(['png', 'jpg', 'gif', 'bmp']);
const SUPPORTED_SOURCE_IMAGE_TYPES = new Set<SourceImageType>(['png', 'jpg', 'gif', 'bmp', 'webp']);
const X530_CUSTOMER_TEMPLATE_NAME = 'X530 Knobs_Inspection Report 100-70-260722-117pcs_ATT.docx';

function normalizeImageType(rawType?: string | null): SourceImageType | null {
  const normalized = (rawType || '').toLowerCase().replace(/^image\//, '').replace('jpeg', 'jpg');
  return SUPPORTED_SOURCE_IMAGE_TYPES.has(normalized as SourceImageType) ? normalized as SourceImageType : null;
}

function getImageTypeFromUrl(url: string): SourceImageType | null {
  const dataUrlMatch = url.match(/^data:image\/([a-zA-Z0-9.+-]+);/);
  const rawType = dataUrlMatch?.[1]
    || url.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase()
    || '';
  return normalizeImageType(rawType);
}

function resolveImageUrl(url: string): string {
  if (url.startsWith('data:image')) return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

export function resolveEvidenceImageUrl(jobId: string, url: string): string {
  if (url.startsWith('data:image')) return url;
  try {
    const parsedUrl = new URL(url, window.location.origin);
    if (parsedUrl.origin === window.location.origin && parsedUrl.pathname.startsWith('/uploads/')) {
      const filename = parsedUrl.pathname.split('/').filter(Boolean).pop();
      if (filename) {
        return `/api/admin/jobs/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(decodeURIComponent(filename))}`;
      }
    }
  } catch {
    return url;
  }
  return url;
}

function mmToDocxPx(value: number | undefined, fallback: number): number {
  const safeValue = Number.isFinite(value) && value ? value : fallback;
  return Math.round(safeValue * 3.78);
}

export function getStepReportImages(stepResult: StepResult): StepReportImage[] {
  const images: StepReportImage[] = [];
  const seen = new Set<string>();
  const addImage = (url: string | undefined, label: string | undefined) => {
    const trimmedUrl = url?.trim();
    if (!trimmedUrl || seen.has(trimmedUrl)) return;
    seen.add(trimmedUrl);
    images.push({ url: trimmedUrl, label: label?.trim() || stepResult.stepId });
  };

  stepResult.photoSlotsData?.forEach((slot) => {
    addImage(slot.photoUrl, slot.label || `Slot ${slot.slotIndex}`);
  });
  stepResult.photos?.forEach((photo) => {
    addImage(photo.url, photo.slotName);
  });
  addImage(stepResult.photoUrl, stepResult.stepId);

  return images;
}

export function getStepEvidenceSlots(stepResult: StepResult, stepDefinition?: InspectionStep): StepReportImage[] {
  const slots: StepReportImage[] = [];
  const seenLabels = new Set<string>();
  const seenUrls = new Set<string>();
  const addSlot = (label: string | undefined, url?: string) => {
    const trimmedLabel = label?.trim() || stepResult.stepId;
    const trimmedUrl = url?.trim();
    if (trimmedUrl && seenUrls.has(trimmedUrl)) return;
    const key = `${trimmedLabel}::${trimmedUrl || ''}`;
    if (seenLabels.has(key)) return;
    seenLabels.add(key);
    if (trimmedUrl) seenUrls.add(trimmedUrl);
    slots.push({ label: trimmedLabel, url: trimmedUrl || undefined });
  };

  stepResult.photoSlotsData?.forEach((slot) => {
    addSlot(slot.label || `Slot ${slot.slotIndex}`, slot.photoUrl);
  });

  if (slots.length === 0) {
    stepDefinition?.photoSlotConfigs?.forEach((slot) => {
      addSlot(slot.label || `Slot ${slot.slotIndex}`);
    });
    stepDefinition?.photoSlots?.forEach((slot, index) => {
      addSlot(slot || `Slot ${index + 1}`);
    });
  }

  stepResult.photos?.forEach((photo) => {
    addSlot(photo.slotName, photo.url);
  });

  if (stepResult.photoUrl && !seenUrls.has(stepResult.photoUrl.trim())) {
    addSlot(stepResult.stepId, stepResult.photoUrl);
  }

  return slots;
}

export function getStepApprovalDisplay(stepResult: StepResult) {
  if (stepResult.moderationStatus === 'APPROVED') {
    return { text: 'ADMIN ĐÃ DUYỆT', fill: 'DBEAFE', color: '1D4ED8' };
  }
  if (stepResult.moderationStatus === 'REJECTED') {
    return { text: 'ADMIN TỪ CHỐI', fill: 'FEE2E2', color: 'B91C1C' };
  }
  return { text: 'CHỜ ADMIN DUYỆT', fill: 'FEF3C7', color: 'B45309' };
}

export function getEvidenceCountText(count: number): string {
  return count > 0 ? `${count} ảnh bằng chứng đã đính kèm` : 'Chưa có ảnh bằng chứng';
}

function getWorkerStatusDisplay(stepResult: StepResult) {
  if (stepResult.status === 'PASS') return 'Worker: ĐẠT (PASS)';
  if (stepResult.status === 'FAIL') return 'Worker: LỖI (FAIL)';
  return 'Worker: CHƯA HOÀN THÀNH';
}

function buildStepDetailParagraphs(stepResult: StepResult): Paragraph[] {
  const details: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({ text: stepResult.note || 'Không có ghi chú', size: 20, color: "1E293B" })
      ]
    }),
  ];

  if (stepResult.textValue) {
    details.push(new Paragraph({
      children: [
        new TextRun({ text: 'Dữ liệu nhập: ', bold: true, size: 18, color: "334155" }),
        new TextRun({ text: stepResult.textValue, size: 18, color: "1E293B" }),
      ]
    }));
  }

  if (stepResult.aiDetectedValue) {
    details.push(new Paragraph({
      children: [
        new TextRun({ text: 'Vero: ', bold: true, size: 18, color: "6D28D9" }),
        new TextRun({ text: stepResult.aiDetectedValue, size: 18, color: "1E293B" }),
      ]
    }));
  }

  if (stepResult.aiResultJson && typeof stepResult.aiResultJson === 'object') {
    details.push(new Paragraph({
      children: [
        new TextRun({ text: 'Vero JSON: ', bold: true, size: 18, color: "6D28D9" }),
        new TextRun({ text: JSON.stringify(stepResult.aiResultJson), size: 16, color: "475569" }),
      ]
    }));
  }

  if (stepResult.adminReviewNote) {
    details.push(new Paragraph({
      children: [
        new TextRun({ text: 'Ghi chú duyệt Admin: ', bold: true, size: 18, color: "1D4ED8" }),
        new TextRun({ text: stepResult.adminReviewNote, size: 18, color: "1E293B" }),
      ]
    }));
  }

  if (stepResult.editedByAdmin) {
    details.push(new Paragraph({
      children: [
        new TextRun({ text: '[QC Admin đã hiệu chỉnh ghi chú]', size: 16, color: "2563EB", italics: true })
      ]
    }));
  }

  return details;
}

function buildMissingEvidenceParagraph(label: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: `Thiếu ảnh: ${label}`,
        size: 18,
        color: "B45309",
        italics: true
      })
    ]
  });
}

/**
 * Helper to convert data URL or external image URL to Uint8Array for docx ImageRun
 */
async function fetchImageBuffer(url?: string, headers?: HeadersInit): Promise<{ data: Uint8Array; type: SourceImageType | null } | null> {
  const resolvedUrl = url ? resolveImageUrl(url) : '';
  if (!resolvedUrl) return null;
  try {
    if (resolvedUrl.startsWith('data:image')) {
      const parts = resolvedUrl.split(',');
      if (parts.length < 2) return null;
      const base64 = parts[1];
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { data: bytes, type: getImageTypeFromUrl(resolvedUrl) };
    }
    const res = await fetch(resolvedUrl, { cache: 'no-store', headers, credentials: 'same-origin' });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return {
      data: new Uint8Array(arrayBuf),
      type: normalizeImageType(res.headers.get('content-type')) || getImageTypeFromUrl(resolvedUrl),
    };
  } catch (err) {
    console.warn('Could not fetch image for docx export:', err);
    return null;
  }
}

async function convertImageBufferToPng(data: Uint8Array, mimeType: string): Promise<Uint8Array | null> {
  const blob = new Blob([data], { type: mimeType });
  const canvas = document.createElement('canvas');
  let objectUrl = '';
  try {
    if ('createImageBitmap' in window) {
      const bitmap = await createImageBitmap(blob);
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } else {
      objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
    }

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) return null;
    return new Uint8Array(await pngBlob.arrayBuffer());
  } catch (err) {
    console.warn('Could not convert image for docx export:', err);
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function fetchImageForDocx(jobId: string, url: string, type: SourceImageType | null): Promise<{ data: Uint8Array; type: ExportImageType } | null> {
  const exportUrl = resolveEvidenceImageUrl(jobId, url);
  const adminKey = getAdminApiKey();
  const adminHeaders = exportUrl.startsWith('/api/admin/') && adminKey ? { 'x-qc-admin-key': adminKey } : undefined;
  const image = await fetchImageBuffer(exportUrl, adminHeaders) || (exportUrl !== url ? await fetchImageBuffer(url) : null);
  if (!image) return null;
  const resolvedType = type || image.type;
  if (!resolvedType) return null;
  if (SUPPORTED_IMAGE_TYPES.has(resolvedType as ExportImageType)) {
    return { data: image.data, type: resolvedType as ExportImageType };
  }
  if (resolvedType === 'webp') {
    const converted = await convertImageBufferToPng(image.data, 'image/webp');
    return converted ? { data: converted, type: 'png' } : null;
  }
  return null;
}

/**
 * Creates a standard native OpenXML Microsoft Word (.docx) document.
 * Guarantees zero "corrupted file" or "file extension mismatch" errors when opened in Word / Office 365 / WPS.
 */
export async function generateDocxReport(job: InspectionJob, template?: ChecklistTemplate): Promise<void> {
  const exportJob = await adminApi.getJob(job.id).catch(() => job);
  const matchedTemplate = template || exportJob.templateSnapshot;

  if (matchedTemplate?.docxTemplateName?.trim() === X530_CUSTOMER_TEMPLATE_NAME) {
    const report = await adminApi.downloadCustomerReport(exportJob.id);
    saveAs(report, `[ATT_X530_Inspection_Report]_${exportJob.id}.docx`);
    await adminApi.recordExport(exportJob.id);
    return;
  }

  const dateStr = new Date(exportJob.createdAt).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const completedDateStr = exportJob.completedAt
    ? new Date(exportJob.completedAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Chưa hoàn thành';

  // Process all image buffers for step results, including multi-slot captures.
  const stepImagesMap: Record<string, StepImageBuffer[]> = {};
  for (const sr of exportJob.stepResults) {
    const stepDef = matchedTemplate?.steps.find((step) => step.stepId === sr.stepId);
    const reportImages = getStepEvidenceSlots(sr, stepDef);
    stepImagesMap[sr.stepId] = [];
    for (const image of reportImages) {
      const preparedImage = image.url ? await fetchImageForDocx(exportJob.id, image.url, getImageTypeFromUrl(image.url)) : null;
      stepImagesMap[sr.stepId].push({
        label: image.label,
        type: preparedImage?.type || null,
        data: preparedImage?.data || null,
      });
    }
  }

  const veroLogo = await fetchImageBuffer('/vero-qc-icon.png');

  // Common borders for tables - 0.5pt solid black border matching standard report tables
  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  };

  const clientName = matchedTemplate?.clientName || "ATT";
  const supplierName = matchedTemplate?.supplierName || "Eagleon";
  const manufacturerName = matchedTemplate?.supplierName || "EAGLEON (VN) COMPANY LIMITED(CÔNG TY TNHH EAGLEON (VN))";
  const manufacturerLocation = matchedTemplate?.supplierLocation || "Factory No. 2, Lot CN-A5 Chau Phong Industrial Cluster, Chau Cau Village, Phu Lang Commune, Bac Ninh Province, Vietnam";
  const manufacturerContact = matchedTemplate?.supplierContact || "Xu yu xin";
  const orderQty = matchedTemplate?.orderQty || "117";
  const cartonQty = matchedTemplate?.cartonQty || "24";
  const sysVer = matchedTemplate?.systemVersion || "15";
  const buildNum = matchedTemplate?.buildNumber || "X53.0-04-15.0-10.30.00";
  const hwVer = matchedTemplate?.hardwareVersion || "V1.0";
  const cartonSpec = matchedTemplate?.cartonSpec || "310x195x125mm";
  const deviceSpec = matchedTemplate?.deviceSpec || "164.22x66.59x21.91";

  // Table 1: Header Client & Manufacturer Info Table (Image 1)
  const headerInfoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, width: { size: 18, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Client:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, width: { size: 32, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: clientName, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Tel.:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "--", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Fax:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "--", size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Attn.:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Ava", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Supplier:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 3, children: [new Paragraph({ children: [new TextRun({ text: supplierName, size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Inspection Date:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: dateStr.split(' ')[0] || dateStr, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 4, children: [new Paragraph({ children: [new TextRun({ text: "1st / 2nd Re-inspection (Previous Report No.        )", size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Product Description:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 5, children: [new Paragraph({ children: [new TextRun({ text: `${exportJob.productName} (${exportJob.productCode})`, bold: true, size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: `System version: ${sysVer}`, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: `Build number: ${buildNum}`, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: `Hardware version: ${hwVer}`, size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Manufacturer Name:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 5, children: [new Paragraph({ children: [new TextRun({ text: manufacturerName, size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Manufacturer Location:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 5, children: [new Paragraph({ children: [new TextRun({ text: manufacturerLocation, size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Manufacturer Contact:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 5, children: [new Paragraph({ children: [new TextRun({ text: manufacturerContact, size: 18 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Service Required:", bold: true, size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "☑ FRI (Final Random Inspection)", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, columnSpan: 2, children: [new Paragraph({ children: [new TextRun({ text: "☐ DPI (During Production Inspection)", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "☐ Other", size: 18 })] })] }),
        ],
      }),
    ],
  });

  // Table 2: FQC Order Quantity Summary Table (Image 1)
  const fqcTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "P/O No.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Item No.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "SKU#", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Order Qty.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Carton Qty.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Sales destination", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Inspected Qty.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Inspection Date", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Sample Size", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Production (%)", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "QA Passed Qty", bold: true, size: 16 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: exportJob.batchNumber, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: exportJob.productCode, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "6169F", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: orderQty, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cartonQty, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: clientName, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: orderQty, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dateStr.split(' ')[0] || dateStr, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "120", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "100%", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: exportJob.status === 'COMPLETED' ? orderQty : '0', size: 16 })] })] }),
        ],
      }),
    ],
  });

  // Table 3: Inspection Result Box (Image 1)
  const resultBoxTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "INSPECTION RESULT:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: exportJob.status === 'COMPLETED' ? "☑ PASS + Section A-3 Remark#" : "☐ PASS", bold: exportJob.status === 'COMPLETED', size: 20, color: exportJob.status === 'COMPLETED' ? "15803D" : "000000" }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: exportJob.status === 'FAILED' ? "☑ FAIL + Section A-3 Remark#" : "☐ FAIL", bold: exportJob.status === 'FAILED', size: 20, color: exportJob.status === 'FAILED' ? "B91C1C" : "000000" }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: "☐ ON HOLD + Section A-3 Remark#", size: 20 }),
                ],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: "ON-SITE CC (Construction check) INFORMATION:", bold: true, size: 18 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [
              new Paragraph({ children: [new TextRun({ text: "☑ N/A", size: 18 })] }),
              new Paragraph({ children: [new TextRun({ text: "The On-site CC for this item was performed on YYYY-MM-DD as per our report no.        with the result - PASS / FAIL / ON HOLD", size: 16, color: "64748B" })] }),
            ],
          }),
        ],
      }),
    ],
  });

  // Table 4: Section A-1) AQL and Defects Finding Table (Image 2)
  const defectsList = exportJob.defectsFindingData || matchedTemplate?.defectsFindingData || [];
  const defectRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, width: { size: 40, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: "Defect Description", bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, width: { size: 30, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Photo", bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Critical", bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Major", bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, width: { size: 10, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Minor", bold: true, size: 18 })] })] }),
      ],
    }),
  ];

  if (defectsList.length === 0) {
    defectRows.push(
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "No defect", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "N/A", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
        ],
      })
    );
  } else {
    defectsList.forEach((def) => {
      const isCritical = def.defectType === 'Critical';
      const isMajor = def.defectType === 'Major';
      const isMinor = def.defectType === 'Minor' || (!isCritical && !isMajor);

      defectRows.push(
        new TableRow({
          children: [
            new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: def.description, size: 18 })] })] }),
            new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: def.photos?.length ? "[Photo Attached]" : "N/A", size: 16, color: def.photos?.length ? "0284C7" : "64748B" })] })] }),
            new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isCritical ? `${def.count || 1}` : "", size: 18 })] })] }),
            new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isMajor ? `${def.count || 1}` : "", size: 18 })] })] }),
            new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isMinor ? `${def.count || 1}` : "", size: 18 })] })] }),
          ],
        })
      );
    });
  }

  const totalMinor = defectsList.filter(d => d.defectType === 'Minor' || !d.defectType).reduce((sum, d) => sum + (d.count || 1), 0);
  const totalMajor = defectsList.filter(d => d.defectType === 'Major').reduce((sum, d) => sum + (d.count || 1), 0);
  const totalCritical = defectsList.filter(d => d.defectType === 'Critical').reduce((sum, d) => sum + (d.count || 1), 0);

  defectRows.push(
    new TableRow({
      children: [
        new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Total Found:", bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${totalCritical}`, bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${totalMajor}`, bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${totalMinor}`, bold: true, size: 18 })] })] }),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Max. Allowed:", bold: true, size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
        new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "--", size: 18 })] })] }),
      ],
    })
  );

  const aqlDefectsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: defectRows,
  });

  // Table 5: Section B-3 Packaging & B-4 Device Measurement Tables (Images 3 & 4)
  const pkgData = exportJob.packagingInfoData || matchedTemplate?.packagingInfoData || {};
  const cSize = pkgData.cartonMeasuredSize || '310x195x125mm';
  const cNw = pkgData.cartonNw || '2758.5';
  const cGw = pkgData.cartonGw || '3348.7';
  const dSize = pkgData.deviceMeasuredSize || '164.22×66.59×21.91';
  const dNw = pkgData.deviceNw || '201.7';
  const dGw = pkgData.deviceGw || '281.1';

  const packagingTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Item #", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Specification", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Size(mm) Measured", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Result", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Weight (g) N.W.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Weight (g) G.W.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Result", bold: true, size: 16 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Outer carton", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: cartonSpec, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cSize, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pkgData.cartonResult || "For refer", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cNw, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cGw, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pkgData.cartonResult || "For refer", size: 16 })] })] }),
        ],
      }),
    ],
  });

  const deviceMeasurementTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Item #", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Specification", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Size(mm) Measured", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Result", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Weight (g) N.W.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Weight (g) G.W.", bold: true, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, shading: { fill: "F2F2F2", type: ShadingType.CLEAR }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Result", bold: true, size: 16 })] })] }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: "Device", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ children: [new TextRun({ text: deviceSpec, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dSize, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pkgData.deviceResult || "For refer", size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dNw, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dGw, size: 16 })] })] }),
          new TableCell({ borders: cellBorder, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pkgData.deviceResult || "For refer", size: 16 })] })] }),
        ],
      }),
    ],
  });

  // Table 6: Section C: ON-SITE CHECKING Table (Image 5)
  const stepRows: TableRow[] = [
    new TableRow({
      children: [
        new TableCell({
          borders: cellBorder,
          shading: { fill: "262626", type: ShadingType.CLEAR },
          width: { size: 20, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Test performed", bold: true, color: "FFFFFF", size: 18 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "262626", type: ShadingType.CLEAR },
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Sample size", bold: true, color: "FFFFFF", size: 18 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "262626", type: ShadingType.CLEAR },
          width: { size: 44, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Test Photo", bold: true, color: "FFFFFF", size: 18 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "262626", type: ShadingType.CLEAR },
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Result", bold: true, color: "FFFFFF", size: 18 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "262626", type: ShadingType.CLEAR },
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Comments", bold: true, color: "FFFFFF", size: 18 })] })]
        }),
      ]
    })
  ];

  exportJob.stepResults.forEach((sr, idx) => {
    const stepDef = matchedTemplate?.steps.find(s => s.stepId === sr.stepId);
    const stepTitle = stepDef ? stepDef.title : `Bước ${sr.stepId}`;
    const imageBuffers = stepImagesMap[sr.stepId] || [];
    const imageWidth = mmToDocxPx(stepDef?.mapping?.imageWidthMm, 60);
    const imageHeight = mmToDocxPx(stepDef?.mapping?.imageHeightMm, 45);

    const imageChildren: (Paragraph)[] = [];
    const validImages = imageBuffers.filter((image): image is StepImageBuffer & { data: Uint8Array; type: ExportImageType } => !!image.data && !!image.type);
    if (imageBuffers.length > 0) {
      imageBuffers.forEach((image, imageIndex) => {
        if (!image.data || !image.type) {
          imageChildren.push(buildMissingEvidenceParagraph(image.label));
          return;
        }
        try {
          imageChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: image.label,
                  size: 14,
                  bold: true,
                  color: "334155"
                })
              ]
            })
          );
          imageChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: image.data,
                  transformation: {
                    width: imageWidth,
                    height: imageHeight,
                  },
                  type: image.type
                }),
              ],
            })
          );
        } catch {
          imageChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `[Không thể chèn ảnh: ${image.label}]`, size: 16, color: "94A3B8" })]
            })
          );
        }
      });
    } else {
      imageChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Chưa thu thập ảnh", size: 16, color: "94A3B8", italics: true })]
        })
      );
    }

    stepRows.push(
      new TableRow({
        children: [
          // Col 1: Test performed
          new TableCell({
            borders: cellBorder,
            children: [
              new Paragraph({ children: [new TextRun({ text: `${idx + 1}. `, bold: true, size: 18 }), new TextRun({ text: stepTitle, bold: true, size: 18 })] }),
              new Paragraph({ children: [new TextRun({ text: `Mã: ${sr.stepId}`, size: 14, color: "64748B" })] }),
            ]
          }),
          // Col 2: Sample size
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: stepDef?.sampleSize || "120pcs", size: 18 })] })]
          }),
          // Col 3: Test Photo
          new TableCell({
            borders: cellBorder,
            children: imageChildren
          }),
          // Col 4: Result
          new TableCell({
            borders: cellBorder,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: sr.status === 'PASS' ? "117 pcs\nPass" : sr.status === 'FAIL' ? "Defective" : "Pending",
                    bold: true,
                    color: sr.status === 'PASS' ? "15803D" : sr.status === 'FAIL' ? "B91C1C" : "B45309",
                    size: 18
                  })
                ]
              })
            ]
          }),
          // Col 5: Comments
          new TableCell({
            borders: cellBorder,
            children: buildStepDetailParagraphs(sr)
          }),
        ]
      })
    );
  });

  const stepsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: stepRows
  });

  // Create document with official report header & sections
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children: [
          ...(veroLogo?.type === 'png' ? [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: veroLogo.data,
                  type: 'png',
                  transformation: { width: 52, height: 52 },
                }),
              ],
            }),
          ] : []),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'VERO QC', bold: true, size: 24, color: '075B63' })],
          }),
          // Top Report Header Line
          new Paragraph({
            children: [
              new TextRun({ text: `Report No.: ${exportJob.id}`, bold: true, size: 18 }),
              new TextRun({ text: `                                                                        Report Date: ${dateStr.split(' ')[0] || dateStr}`, bold: true, size: 18 }),
            ]
          }),
          new Paragraph({ text: "_________________________________________________________________________________" }),
          new Paragraph({ text: "" }),

          // Document Main Title
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "Inspection Report",
                bold: true,
                size: 32,
                color: "000000"
              })
            ]
          }),
          new Paragraph({ text: "" }),

          // Header Info Table (Image 1)
          headerInfoTable,
          new Paragraph({ text: "" }),

          // FQC Summary Table (Image 1)
          new Paragraph({ children: [new TextRun({ text: "FQC", bold: true, size: 20 })] }),
          fqcTable,
          new Paragraph({ text: "" }),

          // Result Box (Image 1)
          resultBoxTable,
          new Paragraph({ text: "" }),

          // Section A-1: AQL and Defects Finding Table (Image 2)
          new Paragraph({ children: [new TextRun({ text: "FQC on device:", bold: true, size: 22 })] }),
          new Paragraph({ children: [new TextRun({ text: "A-1) AQL and Defects Finding", bold: true, size: 20 })] }),
          aqlDefectsTable,
          new Paragraph({ text: "" }),

          // Section B-3 & B-4: Measurement Tables (Images 3 & 4)
          new Paragraph({ children: [new TextRun({ text: "B-3) Packaging information - Transport carton measurement", bold: true, size: 20 })] }),
          packagingTable,
          new Paragraph({ text: "" }),

          new Paragraph({ children: [new TextRun({ text: "B-4) Device measurement", bold: true, size: 20 })] }),
          deviceMeasurementTable,
          new Paragraph({ text: "" }),

          // Section C: ON-SITE CHECKING (Image 5)
          new Paragraph({ children: [new TextRun({ text: "C.  ON-SITE CHECKING", bold: true, size: 22 })] }),
          stepsTable,
          new Paragraph({ text: "" }),

          // Signatures Section
          new Paragraph({
            children: [
              new TextRun({
                text: "4. XÁC NHẬN CÁC BÊN LIÊN QUAN",
                bold: true,
                size: 22,
                color: "0F172A"
              })
            ]
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: cellBorder,
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "CÔNG NHÂN KIỂM TRA", bold: true, size: 20 })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký và ghi rõ họ tên)", italics: true, size: 16, color: "64748B" })] }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: exportJob.workerName, bold: true, size: 20 })] }),
                    ]
                  }),
                  new TableCell({
                    borders: cellBorder,
                    width: { size: 33, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TỔ TRƯỜNG CHUYỀN SẢN XUẤT", bold: true, size: 20 })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Ký và ghi rõ họ tên)", italics: true, size: 16, color: "64748B" })] }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "...................................", bold: true, size: 20 })] }),
                    ]
                  }),
                  new TableCell({
                    borders: cellBorder,
                    width: { size: 34, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "TRƯỜNG PHÒNG QC", bold: true, size: 20 })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Đã xác nhận trên hệ thống)", italics: true, size: 16, color: "64748B" })] }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Vero QC Admin (Đã xác nhận)", bold: true, size: 20, color: "15803D" })] }),
                    ]
                  }),
                ]
              })
            ]
          }),

          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Báo cáo được xuất tự động từ Vero QC | Thời điểm: ${new Date().toLocaleString('vi-VN')}`,
                size: 16,
                color: "94A3B8"
              })
            ]
          })
        ]
      }
    ]
  });

  // Pack native OpenXML binary stream and download as .docx
  const blob = await Packer.toBlob(doc);
  const sanitizedJobId = exportJob.id.replace(/[^a-zA-Z0-9-]/g, '_');
  const fileName = `[Bao_Cao_QC]_${sanitizedJobId}_${new Date().toISOString().slice(0, 10)}.docx`;

  saveAs(blob, fileName);
  await adminApi.recordExport(exportJob.id);
}
