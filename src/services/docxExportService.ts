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
import { adminApi } from './adminApi';

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
        new TextRun({ text: 'AI Gemini: ', bold: true, size: 18, color: "6D28D9" }),
        new TextRun({ text: stepResult.aiDetectedValue, size: 18, color: "1E293B" }),
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
async function fetchImageBuffer(url?: string): Promise<{ data: Uint8Array; type: SourceImageType | null } | null> {
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
    const res = await fetch(resolvedUrl, { cache: 'no-store' });
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

async function fetchImageForDocx(url: string, type: SourceImageType | null): Promise<{ data: Uint8Array; type: ExportImageType } | null> {
  const image = await fetchImageBuffer(url);
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
      const preparedImage = image.url ? await fetchImageForDocx(image.url, getImageTypeFromUrl(image.url)) : null;
      stepImagesMap[sr.stepId].push({
        label: image.label,
        type: preparedImage?.type || null,
        data: preparedImage?.data || null,
      });
    }
  }

  // Common borders for tables
  const cellBorder = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" },
  };

  // Build Metadata Table Rows
  const metadataTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "Mã Lệnh QC:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: exportJob.id, bold: true, color: "0284C7", size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: "Mã Lô Sản Xuất:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: exportJob.batchNumber, bold: true, size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Sản Phẩm:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: `${exportJob.productName} (${exportJob.productCode})`, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Quy Trình Checklist:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: matchedTemplate?.title || "Chuẩn", size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Công Nhân Kiểm:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: exportJob.workerName, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Ca & Chuyền:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: `${exportJob.shift} - ${exportJob.line}`, size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Thời Gian Bắt Đầu:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: dateStr, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Thời Gian Xong:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: completedDateStr, size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Kết Luận Chung:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            columnSpan: 3,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: exportJob.status === 'COMPLETED' ? "ĐẠT TIÊU CHUẨN CHẤT LƯỢNG (PASS)" : exportJob.status === 'FAILED' ? "CÓ LỖI CHẤT LƯỢNG (FAIL) - CẦN PHÁT HÀNH NCR" : "ĐANG KIỂM TRA TẠI XƯỞNG",
                    bold: true,
                    color: exportJob.status === 'COMPLETED' ? "15803D" : exportJob.status === 'FAILED' ? "B91C1C" : "B45309",
                    size: 22
                  })
                ]
              })
            ],
          }),
        ],
      }),
    ],
  });

  // Build Step-By-Step Audit Table
  const stepRows: TableRow[] = [
    // Table Header
    new TableRow({
      children: [
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 6, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "STT", bold: true, size: 20 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 28, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: "Tên Bước & Tiêu Chuẩn", bold: true, size: 20 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 14, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Duyệt Admin", bold: true, size: 20 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 26, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: "Ghi Chú & Dữ Liệu", bold: true, size: 20 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 26, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Ảnh Thực Tế Real-time", bold: true, size: 20 })] })]
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
    const approvalDisplay = getStepApprovalDisplay(sr);

    const imageChildren: (Paragraph)[] = [];
    const validImages = imageBuffers.filter((image): image is StepImageBuffer & { data: Uint8Array; type: ExportImageType } => !!image.data && !!image.type);
    if (imageBuffers.length > 0) {
      imageBuffers.forEach((image, imageIndex) => {
        if (!image.data || !image.type) {
          imageChildren.push(buildMissingEvidenceParagraph(image.label));
          if (imageIndex < imageBuffers.length - 1) {
            imageChildren.push(new Paragraph({ text: "" }));
          }
          return;
        }
        try {
          imageChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: image.label,
                  size: 16,
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
          if (imageIndex < imageBuffers.length - 1) {
            imageChildren.push(new Paragraph({ text: "" }));
          }
        } catch (err) {
          imageChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `[Không thể chèn ảnh: ${image.label}]`, size: 18, color: "94A3B8" })]
            })
          );
        }
      });
      imageChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: `Kích thước mapped: ${stepDef?.mapping?.imageWidthMm || 60}mm x ${stepDef?.mapping?.imageHeightMm || 45}mm`,
              size: 16,
              color: "64748B",
              italics: true
            })
          ]
        })
      );
    } else {
      try {
        imageChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Chưa thu thập ảnh", size: 18, color: "94A3B8", italics: true })]
          })
        );
      } catch (err) {
        imageChildren.push(new Paragraph({ text: "Chưa thu thập ảnh" }));
      }
    }

    stepRows.push(
      new TableRow({
        children: [
          // STT
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${idx + 1}`, bold: true, size: 20 })] })]
          }),
          // Title & Tags
          new TableCell({
            borders: cellBorder,
            children: [
              new Paragraph({ children: [new TextRun({ text: stepTitle, bold: true, size: 20, color: "0F172A" })] }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Mã: `, size: 16, color: "64748B" }),
                  new TextRun({ text: sr.stepId, bold: true, size: 16, color: "0F172A" }),
                  new TextRun({ text: ` | `, size: 16, color: "64748B" }),
                  new TextRun({ text: getEvidenceCountText(validImages.length), size: 16, color: validImages.length ? "15803D" : "B45309" }),
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: `Tiêu chuẩn: ${stepDef?.passCriteria || 'Đạt tiêu chuẩn nhà máy'}`, size: 18, color: "475569" })
                ]
              })
            ]
          }),
          // Evaluation Status
          new TableCell({
            borders: cellBorder,
            shading: {
              fill: approvalDisplay.fill,
              type: ShadingType.CLEAR
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: approvalDisplay.text,
                    bold: true,
                    color: approvalDisplay.color,
                    size: 20
                  })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: getWorkerStatusDisplay(sr),
                    color: "475569",
                    size: 16
                  })
                ]
              })
            ]
          }),
          // Note
          new TableCell({
            borders: cellBorder,
            children: buildStepDetailParagraphs(sr)
          }),
          // Image Cell
          new TableCell({
            borders: cellBorder,
            children: imageChildren
          })
        ]
      })
    );
  });

  const stepsTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: stepRows
  });

  // Create document
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
          // Header Company Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "NHÀ MÁY SẢN XUẤT ĐIỆN TỬ & THIẾT BỊ THÔNG MINH",
                bold: true,
                size: 20,
                color: "475569"
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: "BỘ PHẬN PHÁT TRIỂN & QUẢN LÝ CHẤT LƯỢNG (QA/QC)",
                bold: true,
                size: 20,
                color: "0284C7"
              })
            ]
          }),
          new Paragraph({ text: "" }), // Spacing

          // Document Main Title
          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "BIÊN BẢN KIỂM TRA CHẤT LƯỢNG SẢN PHẨM (QC REPORT)",
                bold: true,
                size: 28,
                color: "0F172A"
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `Mã biên bản: `,
                size: 20,
                color: "64748B"
              }),
              new TextRun({
                text: exportJob.id,
                bold: true,
                size: 20,
                color: "0F172A"
              }),
              new TextRun({
                text: ` | Mẫu Word Ánh Xạ: `,
                size: 20,
                color: "64748B"
              }),
              new TextRun({
                text: matchedTemplate?.docxTemplateName || "Mau_Bao_Cao_QC_Chuan.docx",
                bold: true,
                size: 20,
                color: "0284C7"
              }),
            ]
          }),
          new Paragraph({ text: "" }),

          // Section 1
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "1. THÔNG TIN THAM CHIẾU LÔ HÀNG & NHÂN SỰ",
                bold: true,
                size: 22,
                color: "0F172A"
              })
            ]
          }),
          metadataTable,
          new Paragraph({ text: "" }),

          // Section 2
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: "2. CHI TIẾT KẾT QUẢ KIỂM TRA THEO TỪNG BƯỚC (STEP-BY-STEP AUDIT)",
                bold: true,
                size: 22,
                color: "0F172A"
              })
            ]
          }),
          stepsTable,
          new Paragraph({ text: "" }),

          // Section 3: Admin Notes
          ...(exportJob.adminNotes ? [
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              children: [
                new TextRun({
                  text: "3. CHỈ ĐẠO CỦA CỦA QUẢN LÝ QC / ADMIN",
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
                      shading: { fill: "F0F9FF", type: ShadingType.CLEAR },
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: "Ghi chú chỉ đạo: ", bold: true, color: "0369A1", size: 20 }),
                            new TextRun({ text: exportJob.adminNotes, color: "334155", size: 20 })
                          ]
                        })
                      ]
                    })
                  ]
                })
              ]
            }),
            new Paragraph({ text: "" })
          ] : []),

          // Section 4: Signatures
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
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
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "QC Admin (System Verified)", bold: true, size: 20, color: "15803D" })] }),
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
                text: `Báo cáo được xuất tự động từ Hệ thống QC Admin Core Engine | Thời điểm: ${new Date().toLocaleString('vi-VN')}`,
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
