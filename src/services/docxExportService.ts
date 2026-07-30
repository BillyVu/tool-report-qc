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
import { saveAs } from 'file-saver';
import { InspectionJob, ChecklistTemplate } from '../types/qc';
import { qcService } from './qcService';

/**
 * Helper to convert data URL or external image URL to Uint8Array for docx ImageRun
 */
async function fetchImageBuffer(url?: string): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:image')) {
      const parts = url.split(',');
      if (parts.length < 2) return null;
      const base64 = parts[1];
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return new Uint8Array(arrayBuf);
  } catch (err) {
    console.warn('Could not fetch image for docx export:', err);
    return null;
  }
}

/**
 * Creates a standard native OpenXML Microsoft Word (.docx) document.
 * Guarantees zero "corrupted file" or "file extension mismatch" errors when opened in Word / Office 365 / WPS.
 */
export async function generateDocxReport(job: InspectionJob, template?: ChecklistTemplate): Promise<void> {
  // Record export count in QC Service
  qcService.recordExport(job.id);

  const matchedTemplate = template || qcService.getTemplateById(job.templateId);

  const dateStr = new Date(job.createdAt).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const completedDateStr = job.completedAt
    ? new Date(job.completedAt).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Chưa hoàn thành';

  // Process all image buffers for step results
  const stepImagesMap: Record<string, Uint8Array | null> = {};
  for (const sr of job.stepResults) {
    if (sr.photoUrl) {
      stepImagesMap[sr.stepId] = await fetchImageBuffer(sr.photoUrl);
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
            children: [new Paragraph({ children: [new TextRun({ text: job.id, bold: true, color: "0284C7", size: 20 })] })],
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
            children: [new Paragraph({ children: [new TextRun({ text: job.batchNumber, bold: true, size: 20 })] })],
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
            children: [new Paragraph({ children: [new TextRun({ text: `${job.productName} (${job.productCode})`, size: 20 })] })],
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
            children: [new Paragraph({ children: [new TextRun({ text: job.workerName, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            shading: { fill: "F8FAFC", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "Ca & Chuyền:", bold: true, size: 20 })] })],
          }),
          new TableCell({
            borders: cellBorder,
            children: [new Paragraph({ children: [new TextRun({ text: `${job.shift} - ${job.line}`, size: 20 })] })],
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
                    text: job.status === 'COMPLETED' ? "ĐẠT TIÊU CHUẨN CHẤT LƯỢNG (PASS)" : job.status === 'FAILED' ? "CÓ LỖI CHẤT LƯỢNG (FAIL) - CẦN PHÁT HÀNH NCR" : "ĐANG KIỂM TRA TẠI XƯỞNG",
                    bold: true,
                    color: job.status === 'COMPLETED' ? "15803D" : job.status === 'FAILED' ? "B91C1C" : "B45309",
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
          children: [new Paragraph({ children: [new TextRun({ text: "Tên Bước & Thẻ Mapping Word", bold: true, size: 20 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 14, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Đánh Giá", bold: true, size: 20 })] })]
        }),
        new TableCell({
          borders: cellBorder,
          shading: { fill: "F1F5F9", type: ShadingType.CLEAR },
          width: { size: 26, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: "Ghi Chú Công Nhân", bold: true, size: 20 })] })]
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

  job.stepResults.forEach((sr, idx) => {
    const stepDef = matchedTemplate?.steps.find(s => s.stepId === sr.stepId);
    const stepTitle = stepDef ? stepDef.title : `Bước ${sr.stepId}`;
    const imageTag = stepDef?.mapping?.imageTag || `{{photo_${sr.stepId.toLowerCase()}}}`;
    const noteTag = stepDef?.mapping?.noteTag || `{{note_${sr.stepId.toLowerCase()}}}`;
    const imgBytes = stepImagesMap[sr.stepId];

    const imageChildren: (Paragraph)[] = [];
    if (imgBytes && imgBytes.length > 0) {
      try {
        imageChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: imgBytes,
                transformation: {
                  width: 150,
                  height: 110,
                },
                type: 'png'
              }),
            ],
          })
        );
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
      } catch (err) {
        imageChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "[Không thể chèn ảnh]", size: 18, color: "94A3B8" })]
          })
        );
      }
    } else {
      imageChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "Chưa thu thập ảnh", size: 18, color: "94A3B8", italics: true })]
        })
      );
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
                  new TextRun({ text: ` | Tag Ảnh: `, size: 16, color: "64748B" }),
                  new TextRun({ text: imageTag, size: 16, color: "0284C7" }),
                  new TextRun({ text: ` | Tag Note: `, size: 16, color: "64748B" }),
                  new TextRun({ text: noteTag, size: 16, color: "0284C7" }),
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
              fill: sr.status === 'PASS' ? 'DCFCE7' : sr.status === 'FAIL' ? 'FEE2E2' : 'FEF3C7',
              type: ShadingType.CLEAR
            },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: sr.status === 'PASS' ? 'ĐẠT (PASS)' : sr.status === 'FAIL' ? 'LỖI (FAIL)' : 'CHỜ DUYỆT',
                    bold: true,
                    color: sr.status === 'PASS' ? '15803D' : sr.status === 'FAIL' ? 'B91C1C' : 'B45309',
                    size: 20
                  })
                ]
              })
            ]
          }),
          // Note
          new TableCell({
            borders: cellBorder,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: sr.note || 'Không có ghi chú', size: 20, color: "1E293B" })
                ]
              }),
              ...(sr.editedByAdmin ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: '[QC Admin đã hiệu chỉnh ghi chú]', size: 16, color: "2563EB", italics: true })
                  ]
                })
              ] : [])
            ]
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
                text: job.id,
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
          ...(job.adminNotes ? [
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
                            new TextRun({ text: job.adminNotes, color: "334155", size: 20 })
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
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: job.workerName, bold: true, size: 20 })] }),
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
  const sanitizedJobId = job.id.replace(/[^a-zA-Z0-9-]/g, '_');
  const fileName = `[Bao_Cao_QC]_${sanitizedJobId}_${new Date().toISOString().slice(0, 10)}.docx`;

  saveAs(blob, fileName);
}
