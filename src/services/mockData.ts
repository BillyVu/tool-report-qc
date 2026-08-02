import { ChecklistTemplate, InspectionJob, AuditLogEntry } from '../types/qc';

export const INITIAL_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'TMPL-X530-ATT-01',
    title: 'Báo Cáo Kiểm Định Chất Lượng X530 Knobs (ATT Inspection Report)',
    productCode: 'X530',
    productName: 'X530 Knobs - 117pcs ATT',
    docxTemplateName: 'X530 Knobs_Inspection Report 100-70-260722-117pcs_ATT.docx',
    version: '1.0.0',
    updatedAt: '2026-07-22T10:00:00',
    clientName: 'ATT (Attn: Ava)',
    supplierName: 'EAGLEON (VN) COMPANY LIMITED (CÔNG TY TNHH EAGLEON (VN))',
    supplierLocation: 'Factory No. 2, Lot CN-A5 Chau Phong Industrial Cluster, Chau Cau Village, Phu Lang Commune, Bac Ninh Province, Vietnam',
    supplierContact: 'Ms. Linh / Xu Yuxin',
    serviceRequired: 'FQC (Final Quality Control) / FRI (Final Random Inspection)',
    aqlStandard: 'ISO 2859-1 (Single sampling plans for normal inspection)',
    inspectionLevel: 'Full inspection (Kiểm tra 100% lô hàng)',
    orderQty: '117 pcs',
    cartonQty: '24 cartons',
    cartonSpec: '310 x 195 x 125 mm | N.W: 2758.5g | G.W: 3348.7g',
    deviceSpec: '164.22 × 66.59 × 21.91 mm | N.W: 201.7g | G.W: 281.1g',
    systemVersion: '15',
    hardwareVersion: 'V1.0',
    buildNumber: 'X53.0-04-15.0-10.30.00',
    steps: [
      {
        stepId: 'STEP_1',
        title: 'Visual Inspection (Kiểm tra Ngoại quan 100% & Đổi 3 máy lỗi tại chỗ)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 6,
        photoSlots: ['Mặt trước', 'Mặt sau', 'Cạnh trái', 'Cạnh phải', 'Màng bảo vệ', 'Tem IMEI'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Không trầy xước bề mặt, màng dán phẳng không nhăn, tem IMEI dán chuẩn (Đã thay thế 3 máy lỗi trầy xước/tem nhăn)',
        mapping: {
          imageTag: '{{photo_visual}}',
          noteTag: '{{note_visual}}',
          statusTag: '{{status_visual}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_2',
        title: 'On/Off Animation (Kiểm tra Logo Bootup Khởi động & Tắt máy)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Bootup Logo Animation', 'Power Down Screen'],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Logo khởi động hiển thị chính xác, màn hình tắt không nhấp nháy',
        mapping: {
          imageTag: '{{photo_animation}}',
          noteTag: '{{note_animation}}',
          statusTag: '{{status_animation}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_3',
        title: 'Build Number & IMEI Verification (Xác minh IMEI *#06#, Build X53.0-04-15.0-10.30.00)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Màn hình mã IMEI *#06#', 'Màn hình Settings About Phone'],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Nhập Build Number & Số IMEI',
        textInputPlaceholder: 'X53.0-04-15.0-10.30.00 / 74930361951...',
        isRequiredText: true,
        enableAiDetection: true,
        aiDetectType: 'IMEI_SERIAL',
        aiDetectPrompt: 'Trích xuất IMEI và Build Number',
        referenceImageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Build number: X53.0-04-15.0-10.30.00, System: 15, Hardware: V1.0 khớp 100%',
        mapping: {
          imageTag: '{{photo_imei}}',
          noteTag: '{{note_imei}}',
          statusTag: '{{status_imei}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_4',
        title: 'Keypad & Keypad Light Verification (Kiểm tra Bàn phím & Đèn nền)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Bàn phím bật sáng', 'Góc phím bấm chi tiết'],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Đèn bàn phím sáng đều, phím bấm nảy phản hồi tốt',
        mapping: {
          imageTag: '{{photo_keypad}}',
          noteTag: '{{note_keypad}}',
          statusTag: '{{status_keypad}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_5',
        title: 'Speakerphone & Voice Command (Kiểm tra Loa ngoài & Micro thu âm)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Chế độ phát loa ngoài', 'Màn hình kiểm tra lệnh thoại'],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Đánh giá chất lượng âm thanh loa & mic',
        textInputPlaceholder: 'Âm thanh trong trẻo, micro thu âm rõ ràng không nhiễu',
        referenceImageUrl: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Loa không rè ở âm lượng tối đa, mic thu âm chính xác',
        mapping: {
          imageTag: '{{photo_speaker}}',
          noteTag: '{{note_speaker}}',
          statusTag: '{{status_speaker}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_6',
        title: 'Side Buttons & Camera Recording (Kiểm tra Nút sườn & Quay phim/Chụp ảnh)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 4,
        photoSlots: ['Nút tăng giảm âm lượng', 'Nút nguồn sườn', 'Ảnh chụp màu thực tế', 'Preview Video đã quay'],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Ghi chú nút sườn & camera',
        textInputPlaceholder: 'Nút sườn nảy tốt, camera lấy nét chuẩn',
        referenceImageUrl: 'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Nút sườn bấm nhạy, camera lấy nét nhanh, ảnh nét rõ',
        mapping: {
          imageTag: '{{photo_camera}}',
          noteTag: '{{note_camera}}',
          statusTag: '{{status_camera}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_7',
        title: 'Wi-Fi & Bluetooth Verification (Kiểm tra Kết nối Wi-Fi, Ghép nối BT & Truyền file)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 3,
        photoSlots: ['Danh sách Wi-Fi đã kết nối', 'Danh sách Bluetooth Paired', 'Màn hình File Transfer Sample (1pcs)'],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Bắt sóng Wi-Fi mạnh, Bluetooth ghép nối nhanh và truyền tệp tin mẫu thành công',
        mapping: {
          imageTag: '{{photo_connectivity}}',
          noteTag: '{{note_connectivity}}',
          statusTag: '{{status_connectivity}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_8',
        title: 'SD Card, Flashlight & Headset (Kiểm tra Thẻ nhớ SD, Đèn pin & Tai nghe Sound)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 3,
        photoSlots: ['Nhận thẻ nhớ SD', 'Đèn pin LED sáng', 'Cắm jack tai nghe Headset'],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Nhận thẻ nhớ dung lượng đủ, đèn pin LED sáng mạnh, tai nghe xuất âm thanh cả 2 bên',
        mapping: {
          imageTag: '{{photo_hardware}}',
          noteTag: '{{note_hardware}}',
          statusTag: '{{status_hardware}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_9',
        title: 'OTG, Charger, Vibration & Call 112 (Kiểm tra Sạc OTG, Mô-tơ Rung & Gọi khẩn cấp)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 3,
        photoSlots: ['Màn hình đang sạc pin & OTG', 'Kiểm tra mô-tơ rung', 'Thử nghiệm Cuộc gọi khẩn 112'],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Sạc dòng ổn định, mô-tơ rung mạnh không tiếng rè, cuộc gọi 112 kết nối bình thường',
        mapping: {
          imageTag: '{{photo_power}}',
          noteTag: '{{note_power}}',
          statusTag: '{{status_power}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_10',
        title: 'Google Apps, SIM/SD Removal & Appearance Final (Kiểm tra Ứng dụng Google, Tháo pin/SIM & Ngoại quan cuối)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 3,
        photoSlots: ['Google Apps (5pcs sample)', 'Tháo pin & khe SIM/SD khi tắt nguồn', 'Tổng thể 117 máy đóng gói hoàn chỉnh'],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Ghi chú tổng hợp nghiệm thu lô hàng',
        textInputPlaceholder: '117/117 máy đạt tiêu chuẩn QA sau khi đổi 3 máy bị xước nhẹ bề mặt / tem nhăn',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Ứng dụng Google khởi động nhanh, tháo pin an toàn, 100% lô 117 máy đủ điều kiện xuất hàng',
        mapping: {
          imageTag: '{{photo_final}}',
          noteTag: '{{note_final}}',
          statusTag: '{{status_final}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  },
  {
    id: 'TMPL-MOBILE-STD-01',
    title: 'Quy trình Kiểm định Smartphone Tiêu chuẩn',
    productCode: 'SMARTPHONE-PRO-2026',
    productName: 'Điện thoại thông minh Pro 2026',
    docxTemplateName: 'Mau_Bao_Cao_QC_Smartphone.docx',
    version: '3.1.0',
    updatedAt: '2026-07-30T01:00:00',
    steps: [
      {
        stepId: 'STEP_1',
        title: 'Visual Inspection (Kiểm tra Ngoại quan)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 6,
        photoSlots: [
          'Slot 1: Mặt trước',
          'Slot 2: Mặt sau',
          'Slot 3: Cạnh trái',
          'Slot 4: Cạnh phải',
          'Slot 5: Đỉnh máy',
          'Slot 6: Đáy máy'
        ],
        inputType: 'PHOTO',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Không trầy xước, 6 cạnh nguyên vẹn, mặt kính phẳng',
        mapping: {
          imageTag: '{{photo_visual}}',
          noteTag: '{{note_visual}}',
          statusTag: '{{status_visual}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_2',
        title: 'On/Off Animation (Kiểm tra Khởi động/Tắt máy)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 2,
        photoSlots: [
          'Slot 1: Màn hình Logo Khởi động (Bootup)',
          'Slot 2: Màn hình Tắt máy (Power Down)'
        ],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Logo xuất hiện đúng mẫu, không giật lag, màn hình tắt mượt',
        mapping: {
          imageTag: '{{photo_animation}}',
          noteTag: '{{note_animation}}',
          statusTag: '{{status_animation}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_3',
        title: 'Build / IMEI Verification (Xác minh IMEI & Phiên bản)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 2,
        photoSlots: [
          'Slot 1: Màn hình bấm *#06#',
          'Slot 2: Màn hình Settings -> About Phone'
        ],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Nhập mã IMEI hoặc Sê-ri trích xuất',
        textInputPlaceholder: 'Bấm *#06# quét IMEI 15 chữ số...',
        isRequiredText: true,
        enableAiDetection: true,
        aiDetectType: 'IMEI_SERIAL',
        aiDetectPrompt: 'Trích xuất mã IMEI 15 số từ màn hình bấm *#06#',
        referenceImageUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'IMEI trên màn hình khớp 100% với tem vỏ và hệ thống',
        mapping: {
          imageTag: '{{photo_imei}}',
          noteTag: '{{note_imei}}',
          statusTag: '{{status_imei}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_4',
        title: 'Camera Verification (Kiểm tra Camera & Mic)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 4,
        photoSlots: [
          'Slot 1: Chụp bảng màu Color Wheel',
          'Slot 2: Phông nền Trắng',
          'Slot 3: Phông nền Đen',
          'Slot 4: Preview Video đã quay kèm kiểm tra mic'
        ],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Ghi chú kiểm tra Micro & Lấy nét',
        textInputPlaceholder: 'Nhập tình trạng ghi âm thu micro...',
        referenceImageUrl: 'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Lấy nét sắc nét, màu sắc chuẩn, micro thu tiếng rõ ràng không nhiễu',
        mapping: {
          imageTag: '{{photo_camera}}',
          noteTag: '{{note_camera}}',
          statusTag: '{{status_camera}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_5',
        title: 'Bluetooth Verification (Kiểm tra Kết nối Bluetooth)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 3,
        photoSlots: [
          'Slot 1: Màn hình quét danh sách thiết bị',
          'Slot 2: Màn hình đã ghép nối (Paired)',
          'Slot 3: Kết quả truyền tệp mẫu (File transfer)'
        ],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Quét thấy thiết bị < 3s, ghép nối nhanh, truyền tệp thành công',
        mapping: {
          imageTag: '{{photo_bt}}',
          noteTag: '{{note_bt}}',
          statusTag: '{{status_bt}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_6',
        title: 'MMI LCD Color (##8##) (Kiểm tra Màn hình MMI)',
        sampleSize: '117 pcs',
        requiredPhotoCount: 5,
        photoSlots: [
          'Slot 1: Màn hình Đỏ (Red)',
          'Slot 2: Màn hình Xanh lá (Green)',
          'Slot 3: Màn hình Xanh dương (Blue)',
          'Slot 4: Màn hình Trắng (White)',
          'Slot 5: Màn hình Đen (Black) nghiêng 45°'
        ],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'COLOR_SCREEN',
        textInputLabel: 'Nhập số điểm chết / đốm sáng nếu có',
        textInputPlaceholder: '0 điểm chết',
        referenceImageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Màu hiển thị đồng nhất, không điểm chết, không sọc màn hình',
        mapping: {
          imageTag: '{{photo_mmi}}',
          noteTag: '{{note_mmi}}',
          statusTag: '{{status_mmi}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  },
  {
    id: 'TMPL-IP15P-PK-01',
    title: 'Kiểm tra Đóng gói & Phụ kiện iPhone 15 Pro',
    productCode: 'IP15P-2026',
    productName: 'iPhone 15 Pro Max 256GB',
    docxTemplateName: 'Mau_Bao_Cao_QC_Dien_Tu_v1.docx',
    version: '1.2.0',
    updatedAt: '2026-07-28T14:20:00',
    steps: [
      {
        stepId: 'STEP_1',
        title: 'Chụp ngoại quan vỏ hộp trước & tem IMEI',
        sampleSize: '120 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Slot 1: Ngoại quan vỏ hộp', 'Slot 2: Tem nhãn IMEI'],
        inputType: 'PHOTO_AND_TEXT',
        textInputLabel: 'Mã IMEI vỏ hộp',
        enableAiDetection: true,
        aiDetectType: 'IMEI_SERIAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Hộp hoàn hảo không trầy xước, tem niêm phong còn nguyên vẹn, số IMEI khớp với hệ thống',
        mapping: {
          imageTag: '{{photo_step1}}',
          noteTag: '{{note_step1}}',
          statusTag: '{{status_step1}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_2',
        title: 'Kiểm tra cáp sạc USB-C & sách hướng dẫn',
        sampleSize: '120 pcs',
        requiredPhotoCount: 1,
        photoSlots: ['Slot 1: Phụ kiện cáp USB-C'],
        inputType: 'PHOTO',
        referenceImageUrl: 'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Cáp sạc cuộn tròn đều không gập gẫy, có khe chọc SIM, tài liệu HDSD đính kèm đúng ngôn ngữ',
        mapping: {
          imageTag: '{{photo_step2}}',
          noteTag: '{{note_step2}}',
          statusTag: '{{status_step2}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  },
  {
    id: 'TMPL-MACBOOK-M3-02',
    title: 'Quy trình Kiểm định MacBook Pro 16 M3 Max',
    productCode: 'MBP-M3-2026',
    productName: 'MacBook Pro 16 inch M3 Max',
    docxTemplateName: 'Mau_Bao_Cao_QC_Laptop.docx',
    version: '2.0.0',
    updatedAt: '2026-07-29T10:00:00',
    steps: [
      {
        stepId: 'STEP_1',
        title: 'Kiểm tra bề mặt sơn Space Black & Màn hình Liquid Retina XDR',
        sampleSize: '50 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Slot 1: Mặt lưng nhôm Space Black', 'Slot 2: Màn hình mở góc 90°'],
        inputType: 'PHOTO_AND_TEXT',
        referenceImageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Lớp nhôm anodized đồng nhất, không tróc sơn, màn hình sáng đều',
        mapping: {
          imageTag: '{{photo_mbp_body}}',
          noteTag: '{{note_mbp_body}}',
          statusTag: '{{status_mbp_body}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      },
      {
        stepId: 'STEP_2',
        title: 'Kiểm tra Bàn phím Magic Keyboard & Touch ID',
        sampleSize: '50 pcs',
        requiredPhotoCount: 1,
        photoSlots: ['Slot 1: Màn hình phím & Touch ID'],
        inputType: 'PHOTO_AND_TEXT',
        referenceImageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Gõ phím nảy mượt, đèn nền phím sáng đều, Touch ID phản hồi ngay',
        mapping: {
          imageTag: '{{photo_mbp_kb}}',
          noteTag: '{{note_mbp_kb}}',
          statusTag: '{{status_mbp_kb}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  }
];

export const INITIAL_JOBS: InspectionJob[] = [
  {
    id: 'JOB-20260729-001',
    batchNumber: 'BATCH-VN-9081',
    productCode: 'IP15P-2026',
    productName: 'iPhone 15 Pro Max 256GB',
    templateId: 'TMPL-IP15P-PK-01',
    status: 'FAILED',
    workerId: 'W092',
    workerName: 'Nguyễn Văn An (W092)',
    shift: 'Ca Sáng (06:00 - 14:00)',
    line: 'Chuyền Đóng Gói 03',
    createdAt: '2026-07-29T08:15:00',
    updatedAt: '2026-07-29T08:35:00',
    completedAt: '2026-07-29T08:35:00',
    stepResults: [
      {
        stepId: 'STEP_1',
        status: 'PASS',
        note: 'Vỏ hộp còn seal nguyên vẹn, số IMEI: 358901234567890 khớp lệnh sản xuất',
        photoUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T08:18:00'
      },
      {
        stepId: 'STEP_2',
        status: 'FAIL',
        note: 'Phát hiện sợi cáp USB-C bị trầy xước nhẹ ở đầu cắm kim loại, đã tách ra chờ thay thế',
        photoUrl: 'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T08:24:00'
      },
      {
        stepId: 'STEP_3',
        status: 'PASS',
        note: 'Khung viền Titan sạch bóng, màn hình dán màng bảo vệ phẳng đẹp không bọt khí',
        photoUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T08:30:00'
      },
      {
        stepId: 'STEP_4',
        status: 'PASS',
        note: 'Trọng lượng đo thực tế: 384g đạt chuẩn cho phép',
        photoUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T08:34:00'
      }
    ],
    adminNotes: 'Đã yêu cầu tổ trưởng chuyền 03 đổi cáp sạc mới và cập nhật biên bản xử lý lỗi.'
  },
  {
    id: 'JOB-20260729-002',
    batchNumber: 'BATCH-VN-9082',
    productCode: 'IP15P-2026',
    productName: 'iPhone 15 Pro Max 256GB',
    templateId: 'TMPL-IP15P-PK-01',
    status: 'COMPLETED',
    workerId: 'W105',
    workerName: 'Trần Thị Bích (W105)',
    shift: 'Ca Sáng (06:00 - 14:00)',
    line: 'Chuyền Đóng Gói 01',
    createdAt: '2026-07-29T09:00:00',
    updatedAt: '2026-07-29T09:25:00',
    completedAt: '2026-07-29T09:25:00',
    stepResults: [
      {
        stepId: 'STEP_1',
        status: 'PASS',
        note: 'Tem nhãn IMEI chuẩn, góc hộp vuông vắn không móp méo',
        photoUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T09:05:00'
      },
      {
        stepId: 'STEP_2',
        status: 'PASS',
        note: 'Đầy đủ phụ kiện chính hãng, cáp quấn đẹp đúng quy cách',
        photoUrl: 'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T09:12:00'
      },
      {
        stepId: 'STEP_3',
        status: 'PASS',
        note: 'Thân máy Titan hoàn thiện hoàn hảo',
        photoUrl: 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T09:18:00'
      },
      {
        stepId: 'STEP_4',
        status: 'PASS',
        note: 'Trọng lượng: 386g',
        photoUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T09:24:00'
      }
    ],
    exportCount: 1,
    lastExportedAt: '2026-07-29T09:40:00'
  },
  {
    id: 'JOB-20260729-003',
    batchNumber: 'BATCH-VN-9083',
    productCode: 'IP15P-2026',
    productName: 'iPhone 15 Pro Max 256GB',
    templateId: 'TMPL-IP15P-PK-01',
    status: 'IN_PROGRESS',
    workerId: 'W044',
    workerName: 'Lê Hoàng Minh (W044)',
    shift: 'Ca Sáng (06:00 - 14:00)',
    line: 'Chuyền Đóng Gói 02',
    createdAt: '2026-07-29T10:10:00',
    updatedAt: '2026-07-29T10:20:00',
    stepResults: [
      {
        stepId: 'STEP_1',
        status: 'PASS',
        note: 'Hộp chuẩn, IMEI: 358909988776655 đã quét vào phần mềm',
        photoUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T10:15:00'
      },
      {
        stepId: 'STEP_2',
        status: 'PASS',
        note: 'Cáp USB-C chuẩn, cây lấy SIM đầy đủ',
        photoUrl: 'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T10:19:00'
      },
      {
        stepId: 'STEP_3',
        status: 'PENDING',
        note: 'Đang thao tác chụp viền titan...'
      },
      {
        stepId: 'STEP_4',
        status: 'PENDING',
        note: 'Chưa thực hiện'
      }
    ]
  },
  {
    id: 'JOB-20260729-004',
    batchNumber: 'BATCH-VN-9079',
    productCode: 'MBP-M3-2026',
    productName: 'MacBook Pro 16 inch M3 Max',
    templateId: 'TMPL-MACBOOK-M3-02',
    status: 'COMPLETED',
    workerId: 'W088',
    workerName: 'Phạm Văn Đức (W088)',
    shift: 'Ca Đêm (22:00 - 06:00)',
    line: 'Chuyền Laptop 01',
    createdAt: '2026-07-29T04:30:00',
    updatedAt: '2026-07-29T05:10:00',
    completedAt: '2026-07-29T05:10:00',
    stepResults: [
      {
        stepId: 'STEP_1',
        status: 'PASS',
        note: 'Bề mặt sơn xám Space Black không bám vân tay, lớp phủ nhôm chuẩn tuyệt đối',
        photoUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T04:45:00'
      },
      {
        stepId: 'STEP_2',
        status: 'PASS',
        note: 'Bàn phím Magic Keyboard gõ êm, cảm biến Touch ID nhận diện tức thì',
        photoUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=800&auto=format&fit=crop&q=80',
        timestamp: '2026-07-29T05:05:00'
      }
    ]
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'LOG-001',
    jobId: 'JOB-20260729-001',
    adminName: 'QC Manager (Vũ Nam)',
    action: 'Cập nhật Ghi chú QC',
    fieldChanged: 'Note (STEP_2)',
    oldValue: 'Phát hiện sợi cáp bị trầy xước nhẹ',
    newValue: 'Phát hiện sợi cáp USB-C bị trầy xước nhẹ ở đầu cắm kim loại, đã tách ra chờ thay thế',
    timestamp: '2026-07-29T09:10:12'
  },
  {
    id: 'LOG-002',
    jobId: 'JOB-20260729-001',
    adminName: 'QC Manager (Vũ Nam)',
    action: 'Thêm chỉ dẫn khắc phục',
    fieldChanged: 'Admin Notes',
    oldValue: '',
    newValue: 'Đã yêu cầu tổ trưởng chuyền 03 đổi cáp sạc mới và cập nhật biên bản xử lý lỗi.',
    timestamp: '2026-07-29T09:12:45'
  }
];
