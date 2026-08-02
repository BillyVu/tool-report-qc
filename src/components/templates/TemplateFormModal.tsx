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
  onSave: (template: ChecklistTemplate) => Promise<void> | void;
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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

  const handleSaveMapping = (stepIndex: number, mapping: DocxMapping) => {
    setSteps(prev => {
      const updated = [...prev];
      updated[stepIndex] = { ...updated[stepIndex], mapping };
      return updated;
    });
  };

  const handleFormSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!title.trim() || !productCode.trim()) return;
    setIsSaving(true);
    setSaveError('');

    const savedTemplate: ChecklistTemplate = {
      id: template?.id || `TMPL-${Date.now().toString().slice(-6)}`,
      title,
      productCode,
      productName: productName || title,
      docxTemplateName,
      version,
      updatedAt: new Date().toISOString(),
      steps
    };

    try {
      await onSave(savedTemplate);
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không lưu được mẫu checklist vào database.');
    } finally {
      setIsSaving(false);
    }
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
            {saveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-lg p-3">
                {saveError}
              </div>
            )}

            {/* Template Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên Mẫu Checklist <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ví dụ: Kiểm tra Đóng gói & Phụ kiện iPhone 15 Pro"
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
                  placeholder="Ví dụ: IP15P-2026"
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
                  placeholder="Ví dụ: iPhone 15 Pro Max 256GB"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tên File Word Mẫu (.docx)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={docxTemplateName}
                    onChange={(e) => setDocxTemplateName(e.target.value)}
                    placeholder="Mau_Bao_Cao_QC.docx"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phiên bản
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

            {/* Steps Builder & Draggable List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Danh Sách Các Bước Kiểm Tra QC ({steps.length} bước)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kéo thả biểu tượng hai hàng chấm để thay đổi thứ tự các bước
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadStandard6Steps}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs flex items-center gap-1.5 border border-amber-300 transition-colors"
                    title="Nạp nhanh 6 bước kiểm định điện thoại chuẩn theo đúng ảnh yêu cầu"
                  >
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Nạp Nhanh 6 Bước Chuẩn Mẫu</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1.5 border border-blue-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Bước Mới</span>
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
                disabled={isSaving}
                className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu database...' : isEdit ? 'Cập Nhật Mẫu Checklist' : 'Tạo Mẫu Mới'}</span>
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
