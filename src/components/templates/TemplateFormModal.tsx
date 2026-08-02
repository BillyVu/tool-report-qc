import React, { useState } from 'react';
import { Plus, Check, X, FileText, Upload, Sparkles, AlertCircle, Eye } from 'lucide-react';
import { ChecklistTemplate, InspectionStep, DocxMapping } from '../../types/qc';
import { StepDraggableList } from './StepDraggableList';
import { DocxMappingModal } from './DocxMappingModal';
import { TemplatePreviewModal } from './TemplatePreviewModal';

interface TemplateFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ChecklistTemplate | null;
  onSave: (template: ChecklistTemplate) => void;
}

export const TemplateFormModal: React.FC<TemplateFormModalProps> = ({
  isOpen,
  onClose,
  template,
  onSave
}) => {
  if (!isOpen) return null;

  const isEdit = !!template;

  const [title, setTitle] = useState(template?.title || '');
  const [productCode, setProductCode] = useState(template?.productCode || '');
  const [productName, setProductName] = useState(template?.productName || '');
  const [docxTemplateName, setDocxTemplateName] = useState(template?.docxTemplateName || 'Mau_Bao_Cao_QC_Chuan.docx');
  const [version, setVersion] = useState(template?.version || '1.0.0');

  // Extended Report Header Metadata (analyzed from DOCX report)
  const [clientName, setClientName] = useState(template?.clientName || 'ATT (Attn: Ava)');
  const [supplierName, setSupplierName] = useState(template?.supplierName || 'EAGLEON (VN) COMPANY LIMITED (CÔNG TY TNHH EAGLEON (VN))');
  const [supplierLocation, setSupplierLocation] = useState(template?.supplierLocation || 'Factory No. 2, Lot CN-A5 Chau Phong Industrial Cluster, Chau Cau Village, Phu Lang Commune, Bac Ninh Province, Vietnam');
  const [supplierContact, setSupplierContact] = useState(template?.supplierContact || 'Ms. Linh / Xu Yuxin');
  const [serviceRequired, setServiceRequired] = useState(template?.serviceRequired || 'FQC (Final Quality Control) / FRI (Final Random Inspection)');
  const [aqlStandard, setAqlStandard] = useState(template?.aqlStandard || 'ISO 2859-1 (Single sampling plans for normal inspection)');
  const [inspectionLevel, setInspectionLevel] = useState(template?.inspectionLevel || 'Full inspection (Kiểm tra 100% lô hàng)');
  const [orderQty, setOrderQty] = useState(template?.orderQty || '117 pcs');
  const [cartonQty, setCartonQty] = useState(template?.cartonQty || '24 cartons');
  const [cartonSpec, setCartonSpec] = useState(template?.cartonSpec || '310 x 195 x 125 mm | N.W: 2758.5g | G.W: 3348.7g');
  const [deviceSpec, setDeviceSpec] = useState(template?.deviceSpec || '164.22 × 66.59 × 21.91 mm | N.W: 201.7g | G.W: 281.1g');
  const [systemVersion, setSystemVersion] = useState(template?.systemVersion || '15');
  const [hardwareVersion, setHardwareVersion] = useState(template?.hardwareVersion || 'V1.0');
  const [buildNumber, setBuildNumber] = useState(template?.buildNumber || 'X53.0-04-15.0-10.30.00');

  const [steps, setSteps] = useState<InspectionStep[]>(
    template?.steps || [
      {
        stepId: 'STEP_1',
        title: 'Chụp góc trước sản phẩm & vỏ hộp',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400',
        isPhotoRequired: true,
        passCriteria: 'Sản phẩm mới nguyên vẹn không trầy xước',
        mapping: {
          imageTag: '{{photo_step1}}',
          noteTag: '{{note_step1}}',
          statusTag: '{{status_step1}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  );

  // Mapping Modal State
  const [activeMappingStepIndex, setActiveMappingStepIndex] = useState<number | null>(null);

  // Live Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const currentPreviewData: ChecklistTemplate = {
    id: template?.id || 'PREVIEW_TEMP',
    title: title || 'Mẫu QC Chưa Đặt Tên',
    productCode: productCode || 'PHONE_GENERIC',
    productName: productName || 'Điện thoại thông minh',
    docxTemplateName: docxTemplateName || 'Mau_Bao_Cao_QC_Chuan.docx',
    version: version || '1.0.0',
    steps: steps,
    createdAt: template?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const handleAddStep = () => {
    const nextStepNum = steps.length + 1;
    const nextStepId = `STEP_${nextStepNum}`;
    const newStep: InspectionStep = {
      stepId: nextStepId,
      title: `Bước kiểm tra ${nextStepNum}`,
      sampleSize: '120 pcs',
      requiredPhotoCount: 2,
      photoSlots: [`Slot 1: Ảnh vị trí 1`, `Slot 2: Ảnh vị trí 2`],
      inputType: 'PHOTO',
      referenceImageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=400',
      isPhotoRequired: true,
      passCriteria: 'Đạt tiêu chuẩn nhà máy',
      mapping: {
        imageTag: `{{photo_step${nextStepNum}}}`,
        noteTag: `{{note_step${nextStepNum}}}`,
        statusTag: `{{status_step${nextStepNum}}}`,
        imageWidthMm: 60,
        imageHeightMm: 45
      }
    };
    setSteps(prev => [...prev, newStep]);
  };

  const handleLoadStandard6Steps = () => {
    const standardSteps: InspectionStep[] = [
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
    ];
    setSteps(standardSteps);
  };

  const handleLoadX530ReportTemplate = () => {
    setTitle('Báo Cáo Kiểm Định Chất Lượng X530 Knobs (ATT Inspection Report)');
    setProductCode('X530');
    setProductName('X530 Knobs - 117pcs ATT');
    setDocxTemplateName('X530 Knobs_Inspection Report 100-70-260722-117pcs_ATT.docx');
    setVersion('1.0.0');
    setClientName('ATT (Attn: Ava)');
    setSupplierName('EAGLEON (VN) COMPANY LIMITED (CÔNG TY TNHH EAGLEON (VN))');
    setSupplierLocation('Factory No. 2, Lot CN-A5 Chau Phong Industrial Cluster, Chau Cau Village, Phu Lang Commune, Bac Ninh Province, Vietnam');
    setSupplierContact('Ms. Linh / Xu Yuxin');
    setServiceRequired('FQC (Final Quality Control) / FRI (Final Random Inspection)');
    setAqlStandard('ISO 2859-1 (Single sampling plans for normal inspection)');
    setInspectionLevel('Full inspection (Kiểm tra 100% lô hàng)');
    setOrderQty('117 pcs');
    setCartonQty('24 cartons');
    setCartonSpec('310 x 195 x 125 mm | N.W: 2758.5g | G.W: 3348.7g');
    setDeviceSpec('164.22 × 66.59 × 21.91 mm | N.W: 201.7g | G.W: 281.1g');
    setSystemVersion('15');
    setHardwareVersion('V1.0');
    setBuildNumber('X53.0-04-15.0-10.30.00');

    const x530Steps: InspectionStep[] = [
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
    ];
    setSteps(x530Steps);
  };

  const handleSaveMapping = (stepIndex: number, mapping: DocxMapping) => {
    setSteps(prev => {
      const updated = [...prev];
      updated[stepIndex] = { ...updated[stepIndex], mapping };
      return updated;
    });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !productCode.trim()) return;

    const savedTemplate: ChecklistTemplate = {
      id: template?.id || `TMPL-${Date.now().toString().slice(-6)}`,
      title,
      productCode,
      productName: productName || title,
      docxTemplateName,
      version,
      updatedAt: new Date().toISOString(),
      clientName,
      supplierName,
      supplierLocation,
      supplierContact,
      serviceRequired,
      aqlStandard,
      inspectionLevel,
      orderQty,
      cartonQty,
      cartonSpec,
      deviceSpec,
      systemVersion,
      hardwareVersion,
      buildNumber,
      steps
    };

    onSave(savedTemplate);
    onClose();
  };

  const activeStep = activeMappingStepIndex !== null ? steps[activeMappingStepIndex] : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in cursor-pointer"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-lg font-bold">
                {isEdit ? 'Chỉnh Sửa Mẫu Checklist QC' : 'Tạo Mẫu Checklist & Cấu Hình Word DOCX Mới'}
              </h2>
              <p className="text-xs text-slate-400">
                Thiết lập quy trình kiểm tra các bước và cấu hình thẻ ánh xạ vào file Word mẫu
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Template Basic Info */}
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <span>Thông Tin Cơ Bản Mẫu Checklist & File DOCX</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">ID: {template?.id || 'Tự động tạo'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên Mẫu Checklist <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ví dụ: Báo Cáo Kiểm Định Chất Lượng X530 Knobs"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mã Dòng Sản Phẩm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    placeholder="Ví dụ: X530"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên Dòng Sản Phẩm
                  </label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ví dụ: X530 Knobs - 117pcs ATT"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tên File Word Mẫu (.docx)
                  </label>
                  <input
                    type="text"
                    value={docxTemplateName}
                    onChange={(e) => setDocxTemplateName(e.target.value)}
                    placeholder="X530_Knobs_Inspection_Report.docx"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phiên bản Mẫu
                  </label>
                  <input
                    type="text"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Extended Metadata (Client, Supplier, Specs, AQL, Versions) */}
              <div className="pt-3 border-t border-slate-200/80 space-y-3">
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Thông Tin Khách Hàng, Nhà Máy & Quy Chuẩn Báo Cáo (Report Header Specs)</span>
                  <span className="text-[11px] text-blue-600 font-normal">Trích xuất từ mẫu kiểm định thực tế</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Khách Hàng (Client):</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="ATT (Attn: Ava)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nhà Sản Xuất (Supplier):</label>
                    <input
                      type="text"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="EAGLEON (VN) COMPANY LIMITED"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Dịch Vụ (Service Required):</label>
                    <input
                      type="text"
                      value={serviceRequired}
                      onChange={(e) => setServiceRequired(e.target.value)}
                      placeholder="FQC / FRI (Final Random Inspection)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Địa Chỉ Nhà Máy (Factory Address):</label>
                    <input
                      type="text"
                      value={supplierLocation}
                      onChange={(e) => setSupplierLocation(e.target.value)}
                      placeholder="Lô CN-A5 CCN Châu Phong, Phù Lãng, Bắc Ninh"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tiêu Chuẩn Lấy Mẫu AQL:</label>
                    <input
                      type="text"
                      value={aqlStandard}
                      onChange={(e) => setAqlStandard(e.target.value)}
                      placeholder="ISO 2859-1 (Single sampling plans)"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Số Lượng Đơn / Thùng:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={orderQty}
                        onChange={(e) => setOrderQty(e.target.value)}
                        placeholder="117 pcs"
                        className="w-1/2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                      <input
                        type="text"
                        value={cartonQty}
                        onChange={(e) => setCartonQty(e.target.value)}
                        placeholder="24 cartons"
                        className="w-1/2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kích Thước/N.W/G.W Thùng Carton:</label>
                    <input
                      type="text"
                      value={cartonSpec}
                      onChange={(e) => setCartonSpec(e.target.value)}
                      placeholder="310 x 195 x 125 mm | 2758.5g / 3348.7g"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kích Thước/N.W/G.W Thiết Bị:</label>
                    <input
                      type="text"
                      value={deviceSpec}
                      onChange={(e) => setDeviceSpec(e.target.value)}
                      placeholder="164.22 × 66.59 × 21.91 mm | 201.7g"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">System / Hardware Version:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={systemVersion}
                        onChange={(e) => setSystemVersion(e.target.value)}
                        placeholder="Sys: 15"
                        className="w-1/2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                      <input
                        type="text"
                        value={hardwareVersion}
                        onChange={(e) => setHardwareVersion(e.target.value)}
                        placeholder="HW: V1.0"
                        className="w-1/2 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Số Hiệu Build (Build Number):</label>
                    <input
                      type="text"
                      value={buildNumber}
                      onChange={(e) => setBuildNumber(e.target.value)}
                      placeholder="X53.0-04-15.0-10.30.00"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Steps Builder & Draggable List */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Danh Sách Các Bước Kiểm Tra QC ({steps.length} bước)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kéo thả biểu tượng hai hàng chấm để thay đổi thứ tự các bước
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadX530ReportTemplate}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                    title="Nạp đầy đủ toàn bộ quy trình kiểm định 10 bước & thông tin báo cáo X530 Knobs từ file DOCX"
                  >
                    <Sparkles className="w-4 h-4 text-blue-200" />
                    <span>✨ Nạp Mẫu X530 Knobs ATT (Từ File DOCX Đã Phân Tích)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLoadStandard6Steps}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1.5 border border-amber-300 transition-colors"
                    title="Nạp nhanh 6 bước kiểm định điện thoại chuẩn theo đúng ảnh yêu cầu"
                  >
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Nạp 6 Bước Chuẩn</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 border border-slate-300 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Bước</span>
                  </button>
                </div>
              </div>

              {/* Draggable Steps Container */}
              <StepDraggableList
                steps={steps}
                setSteps={setSteps}
                onConfigureMapping={(step, idx) => setActiveMappingStepIndex(idx)}
              />
            </div>
          </form>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="px-4 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
              title="Xem trước giao diện công nhân làm việc với mẫu hiện tại"
            >
              <Eye className="w-4 h-4 text-amber-600" />
              <span>Xem Trước Mẫu (Worker Preview)</span>
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleFormSubmit}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isEdit ? 'Cập Nhật Mẫu Checklist' : 'Tạo Mẫu Mới'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Nested Mapping Modal */}
      <DocxMappingModal
        isOpen={activeMappingStepIndex !== null}
        onClose={() => setActiveMappingStepIndex(null)}
        step={activeStep}
        stepIndex={activeMappingStepIndex ?? 0}
        docxTemplateName={docxTemplateName}
        onSaveMapping={handleSaveMapping}
      />

      {/* Live Preview Modal */}
      <TemplatePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={currentPreviewData}
      />
    </>
  );
};
