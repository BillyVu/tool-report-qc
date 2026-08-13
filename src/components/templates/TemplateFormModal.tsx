import React, { useCallback, useRef, useState } from 'react';
import { Plus, Check, X, FileText, Upload, Sparkles, AlertCircle, Eye, EyeOff, CircleHelp, Trash2 } from 'lucide-react';
import { ChecklistTemplate, InspectionStep, DocxMapping, DefectItem, PackagingInfoData, OtherInfoData } from '../../types/qc';
import { StepDraggableList } from './StepDraggableList';
import { DocxMappingModal } from './DocxMappingModal';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { validateTemplateMappings } from '../../utils/docxMapping';
import { TemplateQuickTour } from '../onboarding/TemplateQuickTour';

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
  const [newTemplateId] = useState(() => {
    const base = (template?.productCode || 'QC_TEMPLATE')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'QC_TEMPLATE';
    return template?.id || `${base}_${Date.now()}`;
  });
  const [activeTab, setActiveTab] = useState<'BASIC' | 'STEPS' | 'DEFECTS' | 'PACKAGING' | 'OTHER'>('BASIC');

  const [title, setTitle] = useState(template?.title || '');
  const [productCode, setProductCode] = useState(template?.productCode || '');
  const [productName, setProductName] = useState(template?.productName || '');
  const [docxTemplateName, setDocxTemplateName] = useState(template?.docxTemplateName || 'Mau_Bao_Cao_QC_Chuan.docx');
  const [version, setVersion] = useState(template?.version || '1.0.0');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Extended Report Header Metadata
  const [clientName, setClientName] = useState(template?.clientName || 'ATT (Attn: Ava)');
  const [supplierName, setSupplierName] = useState(template?.supplierName || 'EAGLEON (VN) COMPANY LIMITED (CÔNG TY TNHH EAGLEON (VN))');
  const [supplierLocation, setSupplierLocation] = useState(template?.supplierLocation || 'Factory No. 2, Lot CN-A5 Chau Phong Industrial Cluster, Chau Cau Village, Phu Lang Commune, Bac Ninh Province, Vietnam');
  const [supplierContact, setSupplierContact] = useState(template?.supplierContact || 'Ms. Linh / Xu Yuxin');
  const [serviceRequired, setServiceRequired] = useState(template?.serviceRequired || 'FQC (Final Quality Control) / FRI (Final Random Inspection)');
  const [aqlStandard, setAqlStandard] = useState(template?.aqlStandard || 'ISO 2859-1 (Single sampling plans for normal inspection)');
  const [inspectionLevel, setInspectionLevel] = useState(template?.inspectionLevel || 'Full inspection (Kiểm tra 100% lô hàng)');
  const [orderQty, setOrderQty] = useState(template?.orderQty || '117 pcs');
  const [cartonQty, setCartonQty] = useState(template?.cartonQty || '24 cartons');
  const [cartonSpec, setCartonSpec] = useState(template?.cartonSpec || '310 x 195 x 125 mm');
  const [deviceSpec, setDeviceSpec] = useState(template?.deviceSpec || '164.22 × 66.59 × 21.91 mm');
  const [systemVersion, setSystemVersion] = useState(template?.systemVersion || '15');
  const [hardwareVersion, setHardwareVersion] = useState(template?.hardwareVersion || 'V1.0');
  const [buildNumber, setBuildNumber] = useState(template?.buildNumber || 'X53.0-04-15.0-10.30.00');

  // New Sections State
  const [defectsFindingData, setDefectsFindingData] = useState<DefectItem[]>(
    template?.defectsFindingData || []
  );

  const [packagingInfoData, setPackagingInfoData] = useState<PackagingInfoData>(
    template?.packagingInfoData || {
      cartonSpec: template?.cartonSpec || '310 x 195 x 125 mm',
      cartonMeasuredSize: '310x195x125mm',
      cartonNw: '2758.5g',
      cartonGw: '3348.7g',
      cartonResult: 'For refer',
      deviceSpec: template?.deviceSpec || '164.22 × 66.59 × 21.91 mm',
      deviceMeasuredSize: '164.22×66.59×21.91mm',
      deviceNw: '201.7g',
      deviceGw: '281.1g',
      deviceResult: 'For refer',
      barcodeData: 'SNM000031 / 6169F',
      barcodeResult: 'PASS'
    }
  );

  const [otherNotes, setOtherNotes] = useState<string>(
    template?.otherInfoData?.notes || 'Ảnh đính kèm bổ sung công đoạn kiểm tra thực tế xưởng sản xuất'
  );

  const [steps, setSteps] = useState<InspectionStep[]>(
    template?.steps || [
      {
        stepId: 'STEP_1',
        title: 'Visual Inspection (Kiểm tra Ngoại quan 100% & Đổi máy lỗi tại chỗ)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 6,
        photoSlots: ['Mặt trước', 'Mặt sau', 'Cạnh trái', 'Cạnh phải', 'Màng bảo vệ', 'Tem IMEI'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Không trầy xước bề mặt, màng dán phẳng không nhăn, tem IMEI dán chuẩn',
        mapping: {
          imageTag: '{{photo_visual}}',
          noteTag: '{{note_visual}}',
          statusTag: '{{status_visual}}',
          imageWidthMm: 60,
          imageHeightMm: 45
        }
      }
    ]
  );

  // Modal State
  const [activeMappingStepIndex, setActiveMappingStepIndex] = useState<number | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(false);
  const startBuilderTourRef = useRef<(() => void) | null>(null);

  const handleBuilderTourReady = useCallback((startTour: () => void) => {
    startBuilderTourRef.current = startTour;
  }, []);

  const currentPreviewData: ChecklistTemplate = {
    id: template?.id || newTemplateId,
    title: title || 'Mẫu QC Chưa Đặt Tên',
    productCode: productCode || 'PHONE_GENERIC',
    productName: productName || title,
    docxTemplateName: docxTemplateName || 'Mau_Bao_Cao_QC_Chuan.docx',
    version: version || '1.0.0',
    steps: steps,
    createdAt: template?.createdAt || new Date().toISOString(),
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
    defectsFindingData,
    packagingInfoData,
    otherInfoData: { notes: otherNotes }
  };

  const handleAddDefect = () => {
    const newDefect: DefectItem = {
      id: `DEF_${Date.now()}`,
      description: 'Nhập mô tả lỗi mới...',
      defectType: 'Minor',
      count: 1
    };
    setDefectsFindingData(prev => [...prev, newDefect]);
  };

  const handleUpdateDefect = (id: string, field: keyof DefectItem, val: any) => {
    setDefectsFindingData(prev => prev.map(d => d.id === id ? { ...d, [field]: val } : d));
  };

  const handleRemoveDefect = (id: string) => {
    setDefectsFindingData(prev => prev.filter(d => d.id !== id));
  };

  const handleAddStep = () => {
    const usedNumbers = steps
      .map((step) => /^STEP_(\d+)$/i.exec(step.stepId)?.[1])
      .filter(Boolean)
      .map(Number);
    const newStepIndex = Math.max(0, ...usedNumbers) + 1;
    const newStep: InspectionStep = {
      stepId: `STEP_${newStepIndex}`,
      title: `Bước ${newStepIndex}: Kiểm tra quy trình`,
      sampleSize: '120 pcs',
      requiredPhotoCount: 2,
      photoSlots: ['Ảnh 1', 'Ảnh 2'],
      inputType: 'PHOTO_AND_TEXT',
      enableAiDetection: true,
      aiDetectType: 'GENERAL',
      referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
      isPhotoRequired: true,
      passCriteria: 'Đạt tiêu chuẩn nhà máy',
      mapping: {
        imageTag: `{{photo_step_${newStepIndex}}}`,
        noteTag: `{{note_step_${newStepIndex}}}`,
        statusTag: `{{status_step_${newStepIndex}}}`,
        imageWidthMm: 60,
        imageHeightMm: 45
      }
    };
    setSteps(prev => [...prev, newStep]);
  };

  const handleLoadStandard6Steps = () => {
    setSteps([
      {
        stepId: 'STEP_1',
        title: 'Kiểm tra Ngoại quan (Visual Inspection)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 4,
        photoSlots: ['Mặt trước', 'Mặt sau', 'Cạnh trái', 'Cạnh phải'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Không trầy xước, nứt vỡ, móp méo',
        mapping: { imageTag: '{{photo_visual}}', noteTag: '{{note_visual}}', statusTag: '{{status_visual}}', imageWidthMm: 60, imageHeightMm: 45 }
      },
      {
        stepId: 'STEP_2',
        title: 'Kiểm tra Mã vạch / Tem nhãn (Barcode & Labeling)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Tem IMEI/Serial', 'Barcode Thùng'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'IMEI_SERIAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Mã vạch và Serial khớp thông số nhà máy',
        mapping: { imageTag: '{{photo_label}}', noteTag: '{{note_label}}', statusTag: '{{status_label}}', imageWidthMm: 60, imageHeightMm: 45 }
      },
      {
        stepId: 'STEP_3',
        title: 'Kiểm tra Màn hình & Cảm ứng (Screen & Touch)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Màn hình trắng', 'Màn hình màu'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'COLOR_SCREEN',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Không điểm chết, ố vàng, hở sáng',
        mapping: { imageTag: '{{photo_screen}}', noteTag: '{{note_screen}}', statusTag: '{{status_screen}}', imageWidthMm: 60, imageHeightMm: 45 }
      },
      {
        stepId: 'STEP_4',
        title: 'Kiểm tra Phím bấm & Nút chức năng (Buttons)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Nút nguồn', 'Cụm phím âm lượng'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Phím bấm nẩy, phản hồi mượt mà',
        mapping: { imageTag: '{{photo_buttons}}', noteTag: '{{note_buttons}}', statusTag: '{{status_buttons}}', imageWidthMm: 60, imageHeightMm: 45 }
      },
      {
        stepId: 'STEP_5',
        title: 'Kiểm tra Cổng sạc & Phụ kiện (Charging & Accessories)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Chân sạc Type-C', 'Phụ kiện kèm theo'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Sạc vào điện ổn định, phụ kiện đầy đủ',
        mapping: { imageTag: '{{photo_charging}}', noteTag: '{{note_charging}}', statusTag: '{{status_charging}}', imageWidthMm: 60, imageHeightMm: 45 }
      },
      {
        stepId: 'STEP_6',
        title: 'Kiểm tra Đóng gói & Thùng Carton (Final Packaging)',
        sampleSize: '120 pcs',
        requiredPhotoCount: 2,
        photoSlots: ['Thùng carton tổng', 'Mặt niêm phong'],
        inputType: 'PHOTO_AND_TEXT',
        enableAiDetection: true,
        aiDetectType: 'GENERAL',
        referenceImageUrl: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=600&auto=format&fit=crop&q=80',
        isPhotoRequired: true,
        passCriteria: 'Thùng carton nguyên vẹn, niêm phong băng keo nhà máy',
        mapping: { imageTag: '{{photo_packaging}}', noteTag: '{{note_packaging}}', statusTag: '{{status_packaging}}', imageWidthMm: 60, imageHeightMm: 45 }
      }
    ]);
  };

  const handleLoadX530ReportTemplate = () => {
    setTitle('Mẫu Kiểm Định X530 Knobs ATT');
    setProductCode('X530_KNOBS');
    setDocxTemplateName('Mau_Bao_Cao_QC_Chuan.docx');
    setVersion('1.0.0');
    setClientName('ATT Corporation');
    setSupplierName('VERO Factory');
    setBuildNumber('X53.0-04-15.0-10.30.00');
    handleLoadStandard6Steps();
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
    const mappingErrors = validateTemplateMappings(steps);
    if (mappingErrors.length) {
      setSaveError(mappingErrors.join(' '));
      return;
    }
    setIsSaving(true);
    try {
      await onSave(currentPreviewData);
      onClose();
    } catch (err) {
      setSaveError('Không thể lưu mẫu.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        className="qc-builder-shell flex min-h-full flex-col bg-[#090d16] animate-fade-in"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          className="qc-builder-modal w-full flex-1 flex flex-col overflow-hidden cursor-default rounded-none border-x-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="qc-builder-header text-white p-4 flex items-start justify-between gap-3 shrink-0 sm:p-5">
            <div data-tour="template-form-title" className="min-w-0">
              <h2 className="text-base font-bold sm:text-lg">
                {isEdit ? 'Chỉnh sửa mẫu checklist QC' : 'Tạo Mẫu Checklist & Cấu Hình Word DOCX Mới'}
              </h2>
              <p className="text-xs text-slate-400">
                Thiết lập quy trình kiểm tra các bước và cấu hình thẻ ánh xạ vào file Word mẫu
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setShowLivePreview((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition-colors ${
                  showLivePreview
                    ? 'border-sky-700 bg-sky-950 text-sky-300 hover:bg-sky-900 hover:text-white'
                    : 'border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title={showLivePreview ? 'Ẩn WORKER LIVE PREVIEW' : 'Hiện WORKER LIVE PREVIEW'}
              >
                {showLivePreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{showLivePreview ? 'Ẩn Preview' : 'Preview'}</span>
              </button>
              <button
                type="button"
                onClick={() => startBuilderTourRef.current?.()}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1.5 text-[11px] font-bold text-sky-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <CircleHelp className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Hướng dẫn</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs Bar */}
          <div className="grid grid-cols-5 border-b border-slate-800 bg-[#0f172a] text-center w-full shrink-0">
            {[
              { key: 'BASIC', label: '1. Thông Tin & Header' },
              { key: 'STEPS', label: `2. Các Bước QC (${steps.length})` },
              { key: 'DEFECTS', label: `3. Danh sách lỗi (${defectsFindingData.length})` },
              { key: 'PACKAGING', label: '4. Đóng Gói (B)' },
              { key: 'OTHER', label: '5. Thông Tin Khác (E)' }
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-3 px-1 text-xs font-bold border-b-2 transition-all text-center truncate ${
                  activeTab === tab.key ? 'border-sky-500 text-sky-400 bg-sky-950/20' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
                title={tab.label}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Form Content */}
          <form onSubmit={handleFormSubmit} className={`relative flex-1 overflow-y-auto p-4 space-y-6 bg-[#090d16] sm:p-6 ${showLivePreview ? 'lg:pr-[420px]' : ''}`}>
            <aside className={`absolute right-6 top-6 w-[360px] rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl ${showLivePreview ? 'hidden lg:block' : 'hidden'}`}>
              <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
                <div><p className="text-[10px] font-bold tracking-wider text-sky-400">WORKER LIVE PREVIEW</p><p className="text-sm font-bold text-white">{title || 'Mẫu QC chưa đặt tên'}</p></div>
                <span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">Desktop</span>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-[10px]">
                <div><p className="text-slate-500">Sản phẩm</p><p className="truncate font-semibold text-white">{productName || 'Chưa nhập'}</p></div>
                <div><p className="text-slate-500">Mã sản phẩm</p><p className="truncate font-mono font-semibold text-sky-300">{productCode || '—'}</p></div>
              </div>
              <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                {steps.map((step, index) => {
                  const slots = step.photoSlotConfigs?.length
                    ? step.photoSlotConfigs.map((slot) => slot.label)
                    : step.photoSlots || Array.from({ length: step.requiredPhotoCount || 1 }, (_, slotIndex) => `Slot ${slotIndex + 1}`);
                  const hasTextField = step.inputType === 'TEXT' || step.inputType === 'PHOTO_AND_TEXT';
                  return (
                    <div key={step.stepId} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                      <div className="mb-2 flex items-center gap-2"><span className="rounded bg-sky-400 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-950">{step.stepId}</span><span className="truncate text-xs font-semibold text-white">{step.title || `Bước ${index + 1}`}</span></div>
                      <p className="line-clamp-2 text-[11px] text-slate-400">{step.passCriteria || 'Chưa có tiêu chuẩn đạt'}</p>
                      {slots.length > 0 && <div className="mt-2"><p className="mb-1 text-[10px] font-semibold text-sky-300">Ảnh công nhân cần chụp · {slots.length}/{slots.length}</p><div className="flex flex-wrap gap-1">{slots.map((slot, slotIndex) => <span key={`${slot}-${slotIndex}`} className="max-w-full truncate rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[10px] text-slate-300" title={slot}>Slot {slotIndex + 1}: {slot}</span>)}</div></div>}
                      {hasTextField && <div className="mt-2 rounded border border-sky-900/70 bg-sky-950/30 p-2"><p className="text-[10px] font-semibold text-sky-300">Giá trị công nhân nhập{step.isRequiredText ? ' · bắt buộc' : ''}</p><p className="mt-1 truncate rounded bg-slate-950 px-2 py-1.5 font-mono text-[10px] text-slate-400">{step.textInputPlaceholder || step.textInputLabel || 'Nhập kết quả kiểm tra...'}</p></div>}
                    </div>
                  );
                })}
              </div>
            </aside>

            {saveError && (
              <div className="bg-red-950/40 border border-red-500/30 text-red-200 text-xs font-semibold rounded-lg p-3">
                {saveError}
              </div>
            )}

            {/* Tab Body */}
            {activeTab === 'BASIC' && (
              <div data-tour="template-form-basics" className="qc-builder-card space-y-4 p-5">
                <div className="qc-builder-card-header flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-sky-400" />
                    <span>Thông Tin Cơ Bản Mẫu Checklist & File DOCX</span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">ID: {template?.id || 'Tự động tạo'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Tên Mẫu Checklist *</label>
                    <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nhập tên mẫu..." required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Mã Sản Phẩm *</label>
                    <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="VD: X530" required />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Tên Sản Phẩm Full</label>
                    <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={productName} onChange={(e) => setProductName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">File Word Mẫu Export (.docx)</label>
                    <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={docxTemplateName} onChange={(e) => setDocxTemplateName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Khách Hàng (Client Name)</label>
                    <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Nhà Cung Cấp (Supplier Name)</label>
                    <input className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-lg text-white" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'STEPS' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">
                      Danh Sách Các Bước Kiểm Tra QC ({steps.length} bước)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Kéo thả biểu tượng hai hàng chấm để thay đổi thứ tự các bước
                    </p>
                  </div>
                  <div data-tour="template-form-presets" className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                    <button
                      type="button"
                      onClick={handleLoadX530ReportTemplate}
                      className="qc-builder-btn-primary px-3 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                      title="Nạp đầy đủ toàn bộ quy trình kiểm định 10 bước & thông tin báo cáo X530 Knobs từ file DOCX"
                    >
                      <Sparkles className="w-4 h-4 text-blue-200" />
                      <span>✨ Nạp Mẫu X530 Knobs ATT (Từ File DOCX Đã Phân Tích)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleLoadStandard6Steps}
                      className="qc-builder-btn-secondary px-3 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      title="Nạp nhanh 6 bước kiểm định điện thoại chuẩn theo đúng ảnh yêu cầu"
                    >
                      <Sparkles className="w-4 h-4 text-sky-400" />
                      <span>Nạp 6 Bước Chuẩn</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddStep}
                      className="qc-builder-btn-secondary px-3 py-1.5 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Thêm Bước</span>
                    </button>
                  </div>
                </div>

                <div data-tour="template-form-steps">
                  <StepDraggableList
                    steps={steps}
                    setSteps={setSteps}
                    onConfigureMapping={(step, idx) => setActiveMappingStepIndex(idx)}
                  />
                </div>
              </div>
            )}

            {activeTab === 'DEFECTS' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Danh Sách Lỗi Tìm Được (Mục A-1 AQL and Defects Finding)</h3>
                  <button type="button" onClick={handleAddDefect} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Thêm Dòng Lỗi
                  </button>
                </div>
                <div className="space-y-2">
                  {defectsFindingData.map((d, index) => (
                    <div key={d.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col md:flex-row gap-3 items-center">
                      <span className="text-xs font-bold text-slate-500">{index + 1}.</span>
                      <input
                        className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        value={d.description}
                        onChange={(e) => handleUpdateDefect(d.id, 'description', e.target.value)}
                        placeholder="Mô tả lỗi..."
                      />
                      <select
                        className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                        value={d.defectType || 'Minor'}
                        onChange={(e) => handleUpdateDefect(d.id, 'defectType', e.target.value)}
                      >
                        <option value="Minor">Minor (Nhẹ)</option>
                        <option value="Major">Major (Nặng)</option>
                        <option value="Critical">Critical (Nghiêm trọng)</option>
                      </select>
                      <input
                        type="number"
                        min={1}
                        className="w-20 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white text-center"
                        value={d.count || 1}
                        onChange={(e) => handleUpdateDefect(d.id, 'count', parseInt(e.target.value) || 1)}
                      />
                      <button type="button" onClick={() => handleRemoveDefect(d.id)} className="p-1 text-slate-400 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'PACKAGING' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* B-3 Packaging */}
                  <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <h4 className="text-xs font-bold text-sky-400 border-b border-slate-800 pb-1.5">B-3) Packaging Information (Thùng Carton)</h4>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Quy Cách Chuẩn Thùng Carton (Carton Spec)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={cartonSpec} onChange={(e) => setCartonSpec(e.target.value)} placeholder="VD: 310 x 195 x 125 mm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Kích Thước Đo Thực Tế (Measured Size)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.cartonMeasuredSize || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, cartonMeasuredSize: e.target.value }))} placeholder="VD: 310 x 195 x 125 mm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Khối Lượng N.W (g)</label>
                        <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.cartonNw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, cartonNw: e.target.value }))} placeholder="2758.5g" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Khối Lượng G.W (g)</label>
                        <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.cartonGw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, cartonGw: e.target.value }))} placeholder="3348.7g" />
                      </div>
                    </div>
                  </div>

                  {/* B-4 Device Measurement */}
                  <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                    <h4 className="text-xs font-bold text-sky-400 border-b border-slate-800 pb-1.5">B-4) Device Measurement (Thiết Bị)</h4>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Quy Cách Chuẩn Thiết Bị (Device Spec)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={deviceSpec} onChange={(e) => setDeviceSpec(e.target.value)} placeholder="VD: 164.22 × 66.59 × 21.91 mm" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Kích Thước Đo Thực Tế (Measured Size)</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.deviceMeasuredSize || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, deviceMeasuredSize: e.target.value }))} placeholder="VD: 164.22 × 66.59 × 21.91 mm" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Trọng Lượng N.W (g)</label>
                        <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.deviceNw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, deviceNw: e.target.value }))} placeholder="201.7g" />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Trọng Lượng G.W (g)</label>
                        <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.deviceGw || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, deviceGw: e.target.value }))} placeholder="281.1g" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* B-5 Barcode Check */}
                <div className="space-y-3 p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <h4 className="text-xs font-bold text-sky-400 border-b border-slate-800 pb-1.5">B-5) Barcode Check (Mã Vạch Barcode)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Số Barcode Mẫu / Mã Vạch Quét</label>
                      <input className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.barcodeData || ''} onChange={(e) => setPackagingInfoData(p => ({ ...p, barcodeData: e.target.value }))} placeholder="VD: SNM000031 / 6169F" />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Kết Quả Kiểm Tra Barcode</label>
                      <select className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" value={packagingInfoData.barcodeResult || 'PASS'} onChange={(e) => setPackagingInfoData(p => ({ ...p, barcodeResult: e.target.value }))}>
                        <option value="PASS">PASS (Đạt mã vạch)</option>
                        <option value="FAIL">FAIL (Lỗi mã vạch)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'OTHER' && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-300">Ghi Chú Mục E. OTHER INFORMATION</label>
                <textarea
                  className="w-full h-32 p-3 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                  value={otherNotes}
                  onChange={(e) => setOtherNotes(e.target.value)}
                  placeholder="Nhập ghi chú hoặc mô tả bổ sung cho Mục E..."
                />
              </div>
            )}
          </form>

          {/* Footer Actions */}
          <div className="p-4 border-t border-slate-700 bg-[#0f172a] flex flex-col gap-3 shrink-0 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              data-tour="template-form-preview"
              className="qc-builder-btn-secondary px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              title="Xem trước giao diện công nhân làm việc với mẫu hiện tại"
            >
              <Eye className="w-4 h-4 text-sky-400" />
              <span>Xem Trước Mẫu (Worker Preview)</span>
            </button>

            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="qc-builder-btn-secondary px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleFormSubmit}
                disabled={isSaving}
                data-tour="template-form-save"
                className="qc-builder-btn-primary px-6 py-2 rounded-lg disabled:bg-slate-600 text-xs font-bold shadow-md shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Đang lưu database...' : isEdit ? 'Cập Nhật Mẫu Checklist' : 'Tạo Mẫu Mới'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <DocxMappingModal
        isOpen={activeMappingStepIndex !== null}
        onClose={() => setActiveMappingStepIndex(null)}
        step={activeMappingStepIndex !== null ? steps[activeMappingStepIndex] : null}
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
      <TemplateQuickTour kind="builder" onReady={handleBuilderTourReady} />
    </>
  );
};
