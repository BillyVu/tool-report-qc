import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Trash2,
  Camera,
  Tag,
  Image as ImageIcon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Zap,
  Sliders,
  Plus
} from 'lucide-react';
import { InspectionStep, StepInputType, AiDetectType, PhotoSlotConfig, TextFieldConfig, PhotoType } from '../../types/qc';
import { DEFAULT_PHOTO_TYPE_OPTIONS, PhotoTypeOption } from '../../constants/photoTypes';
import { getWordMappingSummary, hasCompleteWordMapping } from '../../utils/docxMapping';
import { usePhotoTypes } from '../../hooks/usePhotoTypes';
import { suggestPhotoType } from '../../utils/photoTypeSuggestion';

interface SortableStepItemProps {
  step: InspectionStep;
  index: number;
  onUpdateStep: (index: number, field: keyof InspectionStep, value: any) => void;
  onRemoveStep: (index: number) => void;
  onConfigureMapping: (step: InspectionStep, index: number) => void;
  photoTypes: PhotoTypeOption[];
}

const PRESET_PHOTO_SLOTS: { 
  name: string; 
  count: number; 
  slots: { label: string; photoType: PhotoType }[] 
}[] = [
  {
    name: '📱 6 Slots Ngoại quan (Visual)',
    count: 6,
    slots: [
      { label: 'Slot 1: Mặt trước (Kính)', photoType: 'VISUAL_FRONT' },
      { label: 'Slot 2: Mặt sau (Lưng / Camera)', photoType: 'VISUAL_BACK' },
      { label: 'Slot 3: Cạnh trái', photoType: 'VISUAL_SIDES' },
      { label: 'Slot 4: Cạnh phải', photoType: 'VISUAL_SIDES' },
      { label: 'Slot 5: Đỉnh máy', photoType: 'VISUAL_SIDES' },
      { label: 'Slot 6: Đáy máy', photoType: 'VISUAL_SIDES' }
    ]
  },
  {
    name: '⚡ 2 Slots Bật/Tắt (Animation)',
    count: 2,
    slots: [
      { label: 'Slot 1: Màn hình Logo Khởi động (Bootup)', photoType: 'ANIMATION_BOOT' },
      { label: 'Slot 2: Màn hình Tắt máy (Power Down)', photoType: 'ANIMATION_SHUTDOWN' }
    ]
  },
  {
    name: '🔢 2 Slots IMEI / Build',
    count: 2,
    slots: [
      { label: 'Slot 1: Màn hình bấm *#06#', photoType: 'IMEI_DIAL' },
      { label: 'Slot 2: Màn hình Settings -> About Phone', photoType: 'SETTINGS_ABOUT' }
    ]
  },
  {
    name: '📷 4 Slots Camera & Mic',
    count: 4,
    slots: [
      { label: 'Slot 1: Chụp bảng màu Color Wheel', photoType: 'CAMERA_COLOR_WHEEL' },
      { label: 'Slot 2: Phông nền Trắng', photoType: 'CAMERA_WHITE_BG' },
      { label: 'Slot 3: Phông nền Đen', photoType: 'CAMERA_BLACK_BG' },
      { label: 'Slot 4: Preview Video & Mic', photoType: 'CAMERA_MIC_TEST' }
    ]
  },
  {
    name: '📶 3 Slots Bluetooth',
    count: 3,
    slots: [
      { label: 'Slot 1: Màn hình quét danh sách thiết bị', photoType: 'BLUETOOTH_SCAN' },
      { label: 'Slot 2: Màn hình đã ghép nối (Paired)', photoType: 'BLUETOOTH_PAIRED' },
      { label: 'Slot 3: Kết quả truyền tệp mẫu', photoType: 'BLUETOOTH_TRANSFER' }
    ]
  },
  {
    name: '🎨 5 Slots MMI LCD Color (##8##)',
    count: 5,
    slots: [
      { label: 'Slot 1: Màn hình Đỏ (Red)', photoType: 'MMI_RED' },
      { label: 'Slot 2: Màn hình Xanh lá (Green)', photoType: 'MMI_GREEN' },
      { label: 'Slot 3: Màn hình Xanh dương (Blue)', photoType: 'MMI_BLUE' },
      { label: 'Slot 4: Màn hình Trắng (White)', photoType: 'MMI_WHITE' },
      { label: 'Slot 5: Màn hình Đen nghiêng 45°', photoType: 'MMI_BLACK' }
    ]
  }
];

const SortableStepItem: React.FC<SortableStepItemProps> = ({
  step,
  index,
  onUpdateStep,
  onRemoveStep,
  onConfigureMapping,
  photoTypes
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: step.stepId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1
  };

  const photoCount = step.requiredPhotoCount ?? (step.photoSlotConfigs ? step.photoSlotConfigs.length : (step.photoSlots ? step.photoSlots.length : 1));
  const textFieldConfigs: TextFieldConfig[] = step.textFieldConfigs?.length
    ? step.textFieldConfigs
    : step.textInputLabel || step.textInputPlaceholder
      ? [{
          fieldIndex: 1,
          label: step.textInputLabel || 'Dữ liệu văn bản / thông số',
          placeholder: step.textInputPlaceholder || 'Nhập kết quả kiểm tra...',
          required: step.isRequiredText ?? false
        }]
      : [];

  // Build current photoSlotConfigs
  const slotConfigs: PhotoSlotConfig[] = step.photoSlotConfigs || (
    (step.photoSlots || Array.from({ length: photoCount }, (_, i) => `Slot ${i + 1}: Mô tả ảnh ${i + 1}`)).map((lbl, i) => ({
      slotIndex: i + 1,
      label: lbl,
      photoType: 'GENERAL_OTHER',
      captureFrame: 'RECTANGLE'
    }))
  );

  const handlePhotoCountChange = (count: number) => {
    const newCount = Math.max(0, count);
    const updated = [...slotConfigs];
    if (newCount > updated.length) {
      for (let i = updated.length; i < newCount; i++) {
        updated.push({
          slotIndex: i + 1,
          label: `Slot ${i + 1}: Mô tả ảnh ${i + 1}`,
          photoType: 'GENERAL_OTHER',
          captureFrame: 'RECTANGLE'
        });
      }
    } else if (newCount < updated.length) {
      updated.splice(newCount);
    }
    onUpdateStep(index, 'requiredPhotoCount', newCount);
    onUpdateStep(index, 'photoSlotConfigs', updated);
    onUpdateStep(index, 'photoSlots', updated.map(s => s.label));
    if (newCount === 0 && step.inputType === 'PHOTO') {
      onUpdateStep(index, 'isPhotoRequired', false);
    } else if (newCount > 0) {
      onUpdateStep(index, 'isPhotoRequired', true);
    }
  };

  const handleSlotLabelChange = (slotIdx: number, newLabel: string) => {
    const updated = [...slotConfigs];
    updated[slotIdx] = { ...updated[slotIdx], label: newLabel };
    onUpdateStep(index, 'photoSlotConfigs', updated);
    onUpdateStep(index, 'photoSlots', updated.map(s => s.label));
  };

  const handleSlotPhotoTypeChange = (slotIdx: number, newType: PhotoType) => {
    const updated = [...slotConfigs];
    updated[slotIdx] = { ...updated[slotIdx], photoType: newType };
    onUpdateStep(index, 'photoSlotConfigs', updated);
  };

  const handleSlotCaptureFrameChange = (slotIdx: number, captureFrame: 'RECTANGLE' | 'SQUARE') => {
    const updated = [...slotConfigs];
    updated[slotIdx] = { ...updated[slotIdx], captureFrame };
    onUpdateStep(index, 'photoSlotConfigs', updated);
  };

  const handleApplyPreset = (preset: typeof PRESET_PHOTO_SLOTS[0]) => {
    const updated: PhotoSlotConfig[] = preset.slots.map((s, idx) => ({
      slotIndex: idx + 1,
      label: s.label,
      photoType: s.photoType,
      captureFrame: 'RECTANGLE'
    }));

    onUpdateStep(index, 'requiredPhotoCount', preset.count);
    onUpdateStep(index, 'photoSlotConfigs', updated);
    onUpdateStep(index, 'photoSlots', updated.map(s => s.label));
    onUpdateStep(index, 'isPhotoRequired', true);
  };

  const syncLegacyTextField = (updated: TextFieldConfig[]) => {
    const first = updated[0];
    onUpdateStep(index, 'textFieldConfigs', updated);
    onUpdateStep(index, 'textInputLabel', first?.label || '');
    onUpdateStep(index, 'textInputPlaceholder', first?.placeholder || '');
    onUpdateStep(index, 'isRequiredText', first?.required || false);
  };

  const handleAddTextField = () => {
    const nextIndex = textFieldConfigs.length + 1;
    syncLegacyTextField([
      ...textFieldConfigs,
      {
        fieldIndex: nextIndex,
        label: `Trường text ${nextIndex}`,
        placeholder: 'Nhập dữ liệu kiểm tra...',
        required: true
      }
    ]);
  };

  const handleUpdateTextField = (fieldIdx: number, patch: Partial<TextFieldConfig>) => {
    const updated = textFieldConfigs.map((field, idx) => (
      idx === fieldIdx ? { ...field, ...patch } : field
    ));
    syncLegacyTextField(updated);
  };

  const handleRemoveTextField = (fieldIdx: number) => {
    const updated = textFieldConfigs
      .filter((_, idx) => idx !== fieldIdx)
      .map((field, idx) => ({ ...field, fieldIndex: idx + 1 }));
    syncLegacyTextField(updated);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`qc-builder-card p-4 space-y-4 transition-all ${
        isDragging ? 'shadow-2xl border-sky-400 bg-sky-950/40 opacity-90' : 'hover:border-slate-500'
      }`}
    >
      {/* Step Header Bar */}
      <div className="flex items-center justify-between gap-3 bg-[#1e293b] p-3 rounded-lg border border-slate-700">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-500 hover:text-slate-200 cursor-grab active:cursor-grabbing"
            title="Kéo thả để sắp xếp vị trí bước"
          >
            <GripVertical className="w-5 h-5" />
          </button>

          <span className="font-mono font-bold text-xs bg-sky-400 text-slate-950 px-2.5 py-1 rounded-md shrink-0">
            {step.stepId}
          </span>

          <span className="font-bold text-sm text-slate-100 line-clamp-1">
            {step.title || `Bước ${index + 1}`}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {step.sampleSize && (
            <span className="qc-builder-chip qc-builder-chip-warning hidden sm:inline-block text-[11px] font-bold px-2 py-0.5">
              Sample: {step.sampleSize}
            </span>
          )}

          <span className="qc-builder-chip qc-builder-chip-primary text-[11px] font-bold px-2 py-0.5 flex items-center gap-1">
            <Camera className="w-3 h-3" />
            <span>{photoCount} ảnh</span>
          </span>

          {step.enableAiDetection && (
            <span className="qc-builder-chip text-[11px] font-bold px-2 py-0.5 flex items-center gap-1 text-purple-300 border-purple-500/30 bg-purple-500/10">
              <Sparkles className="w-3 h-3" />
              <span>Vero kiểm tra</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => onConfigureMapping(step, index)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1 border ${
              hasCompleteWordMapping(step)
                ? 'bg-sky-400/10 hover:bg-sky-400/20 text-sky-300 border-sky-400/30'
                : 'bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border-amber-400/30'
            }`}
            title="Cấu hình thẻ xuất Word"
          >
            <Tag className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{getWordMappingSummary(step)}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => onRemoveStep(index)}
            className="p-1.5 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-md transition-colors"
            title="Xóa bước này"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-4 pt-1">
          {/* Title & Sample Size & Pass Criteria */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Tên Hạng Mục / Bước Kiểm Tra <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={step.title}
                onChange={(e) => onUpdateStep(index, 'title', e.target.value)}
                placeholder="Ví dụ: Visual Inspection hoặc MMI LCD Color"
                className="w-full px-3 py-1.5 text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Cỡ Mẫu (Sample Size)
              </label>
              <input
                type="text"
                value={step.sampleSize || ''}
                onChange={(e) => onUpdateStep(index, 'sampleSize', e.target.value)}
                placeholder="Ví dụ: 120 pcs hoặc 117 pcs"
                className="w-full px-3 py-1.5 text-xs"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Tiêu chuẩn ĐẠT (Pass Criteria)
              </label>
              <input
                type="text"
                value={step.passCriteria}
                onChange={(e) => onUpdateStep(index, 'passCriteria', e.target.value)}
                placeholder="Mô tả tiêu chuẩn để công nhân kiểm tra và đối chiếu..."
                className="w-full px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Mode Selector & Photo Count */}
          <div className="bg-[#0f172a] p-4 rounded-xl border border-slate-700 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Collection Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Chế độ thu thập dữ liệu
                </label>
                <select
                  value={step.inputType || (step.isPhotoRequired ? 'PHOTO' : 'TEXT')}
                  onChange={(e) => onUpdateStep(index, 'inputType', e.target.value as StepInputType)}
                  className="w-full px-3 py-1.5 text-xs"
                >
                  <option value="PHOTO">📷 Chỉ Chụp Ảnh (Photo Only)</option>
                  <option value="TEXT">📝 Chỉ Nhập Text / Dữ Liệu (Text Only)</option>
                  <option value="PHOTO_AND_TEXT">📷 + 📝 Kết Hợp Chụp Ảnh & Nhập Text</option>
                </select>
              </div>

              {/* Photo Count */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Số lượng ảnh yêu cầu (Required Photo Count)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={photoCount}
                    onChange={(e) => handlePhotoCountChange(parseInt(e.target.value) || 0)}
                    className="w-24 px-3 py-1.5 text-xs font-bold text-sky-300"
                  />
                  <span className="text-xs text-slate-400 font-semibold">khung ảnh (slots)</span>
                </div>
              </div>

              {/* Vero detection toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Tính năng Vero tự kiểm tra
                </label>
                <label className="inline-flex items-center gap-3 text-xs font-bold text-slate-100 bg-[#1e293b] px-3 py-2 rounded-lg border border-slate-700 w-full cursor-pointer min-h-[34px]">
                  <input
                    type="checkbox"
                    checked={step.enableAiDetection || false}
                    onChange={(e) => onUpdateStep(index, 'enableAiDetection', e.target.checked)}
                    className="qc-builder-switch"
                  />
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>Nhận dữ liệu từ ảnh bằng Vero</span>
                </label>
              </div>
            </div>

            {/* Photo Slots Specifications Details */}
            {photoCount > 0 && (
              <div className="space-y-3 pt-3 border-t border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-sky-400" />
                    <span>Mô Tả Chi Tiết Từng Ảnh (Photo Slots Specifications - {photoCount} ảnh):</span>
                  </label>

                  {/* Preset Quick Fill Menu */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-sky-400" /> Nạp mẫu nhanh:
                    </span>
                    {PRESET_PHOTO_SLOTS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className="px-2 py-0.5 text-[10px] bg-slate-800 hover:bg-sky-400/10 text-slate-300 hover:text-sky-300 border border-slate-700 rounded font-medium transition-colors"
                        title={p.name}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slots Inputs Grid */}
                <div className="space-y-2.5">
                  {slotConfigs.slice(0, photoCount).map((slot, sIdx) => (
                    <div key={sIdx} className="qc-builder-slot-row p-3">
                      <GripVertical className="w-4 h-4 text-slate-500" />
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-[10px] text-sky-300 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5 rounded shrink-0">
                          Slot #{sIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) => handleSlotLabelChange(sIdx, e.target.value)}
                          placeholder={`Mô tả cho Slot ${sIdx + 1}...`}
                          className="w-full text-xs font-semibold px-2 py-1.5"
                        />
                      </div>

                      {/* Photo Type Selector */}
                      <div className="slot-type flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium shrink-0">Loại ảnh:</span>
                        <select
                          value={slot.photoType || 'GENERAL_OTHER'}
                          onChange={(e) => handleSlotPhotoTypeChange(sIdx, e.target.value as PhotoType)}
                          className="w-full text-[11px] font-bold px-1.5 py-1"
                        >
                          {(() => {
                            const options = photoTypes.filter((opt) => (opt.isActive ?? true) || opt.type === slot.photoType);
                            const hasCurrent = options.some((opt) => opt.type === slot.photoType);
                            const currentOnly: PhotoTypeOption[] = !hasCurrent && slot.photoType ? [{
                              type: slot.photoType,
                              label: `${slot.photoType} (không còn trong danh sách)`,
                              category: 'OTHER',
                              iconEmoji: '📷',
                              aiPromptInstruction: '',
                              isActive: false,
                            }] : [];
                            return [...options, ...currentOnly].map((opt) => (
                              <option key={opt.type} value={opt.type}>
                                {opt.iconEmoji} {opt.label}{opt.isActive === false ? ' (đã tắt)' : ''}
                              </option>
                            ));
                          })()}
                        </select>
                        {(() => {
                          const suggestedType = suggestPhotoType(step.title, slot.label, step.aiDetectType);
                          const suggested = photoTypes.find((item) => item.type === suggestedType);
                          if (!suggested || suggestedType === slot.photoType) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => handleSlotPhotoTypeChange(sIdx, suggestedType)}
                              className="shrink-0 rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-1 text-[10px] font-semibold text-sky-200 hover:bg-sky-400/20"
                              title={`Vero gợi ý ${suggested.label} từ tên bước và mô tả ảnh`}
                            >
                              ✨ {suggested.label}
                            </button>
                          );
                        })()}
                      </div>
                      <div className="slot-type flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium shrink-0">Khung:</span>
                        <select value={slot.captureFrame || 'RECTANGLE'} onChange={(e) => handleSlotCaptureFrameChange(sIdx, e.target.value as 'RECTANGLE' | 'SQUARE')} className="w-full text-[11px] font-bold px-1.5 py-1">
                          <option value="RECTANGLE">Chữ nhật 4:3</option>
                          <option value="SQUARE">Vuông 1:1</option>
                        </select>
                      </div>
                      <label className="slot-required text-[11px] text-slate-300 font-semibold flex items-center justify-center gap-1 cursor-pointer">
                        <input type="checkbox" checked readOnly className="w-3.5 h-3.5 accent-sky-400" />
                        Bắt buộc
                      </label>
                      <button
                        type="button"
                        className="p-2 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-md"
                        title="Xóa slot"
                        onClick={() => handlePhotoCountChange(Math.max(0, photoCount - 1))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => handlePhotoCountChange(photoCount + 1)}
                  className="qc-builder-btn-primary px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Thêm Vị Trí / Slot Ảnh
                </button>
              </div>
            )}

            {/* Text Input Configuration (if text mode or photo+text) */}
            {(step.inputType === 'TEXT' || step.inputType === 'PHOTO_AND_TEXT') && (
              <div className="space-y-3 pt-3 border-t border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span>Trường Text / Dữ liệu nhập tay ({textFieldConfigs.length} trường):</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddTextField}
                    className="qc-builder-btn-primary px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm Trường Text
                  </button>
                </div>

                {textFieldConfigs.length === 0 ? (
                  <div className="bg-[#1e293b] border border-dashed border-slate-600 rounded-lg p-4 text-xs text-slate-400 flex items-center justify-between gap-3">
                    <span>Chưa có trường text nào. Bấm “Thêm Trường Text” để tạo ô nhập cho Worker.</span>
                    <button
                      type="button"
                      onClick={handleAddTextField}
                      className="qc-builder-btn-secondary px-3 py-1.5 rounded-lg text-xs font-bold shrink-0"
                    >
                      Thêm
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {textFieldConfigs.map((field, fieldIdx) => (
                      <div key={field.fieldIndex} className="qc-builder-slot-row p-3">
                        <GripVertical className="w-4 h-4 text-slate-500" />
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-[10px] text-sky-300 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5 rounded shrink-0">
                            Text #{fieldIdx + 1}
                          </span>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => handleUpdateTextField(fieldIdx, { label: e.target.value })}
                            placeholder="Nhãn trường text"
                            className="w-full text-xs font-semibold px-2 py-1.5"
                          />
                        </div>
                        <div className="slot-type flex items-center gap-1">
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">Gợi ý:</span>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) => handleUpdateTextField(fieldIdx, { placeholder: e.target.value })}
                            placeholder="Placeholder gợi ý nhập"
                            className="w-full text-xs px-2 py-1.5"
                          />
                        </div>
                        <label className="slot-required text-[11px] text-slate-300 font-semibold flex items-center justify-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={field.required ?? false}
                            onChange={(e) => handleUpdateTextField(fieldIdx, { required: e.target.checked })}
                            className="w-3.5 h-3.5 accent-sky-400"
                          />
                          Bắt buộc
                        </label>
                        <button
                          type="button"
                          className="p-2 text-slate-400 hover:text-red-300 hover:bg-red-500/10 rounded-md"
                          title="Xóa trường text"
                          onClick={() => handleRemoveTextField(fieldIdx)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Vero detection option detail panel */}
            {step.enableAiDetection && (
              <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/25 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-300" />
                    <span>Cấu Hình Quy Tắc Vero Tự Động:</span>
                  </span>
                  <select
                    value={step.aiDetectType || 'IMEI_SERIAL'}
                    onChange={(e) => onUpdateStep(index, 'aiDetectType', e.target.value as AiDetectType)}
                    className="text-xs font-bold px-2.5 py-1"
                  >
                    <option value="IMEI_SERIAL">🏷️ Detect IMEI / Số Sê-ri / Mã vạch</option>
                    <option value="OCR_TEXT">📄 Trích xuất chữ / Văn bản OCR</option>
                    <option value="COLOR_SCREEN">🌈 Phân tích Màn hình / Dead Pixels</option>
                    <option value="GENERAL">🔍 Đánh giá Ngoại quan Tổng quan</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={step.aiDetectPrompt || ''}
                  onChange={(e) => onUpdateStep(index, 'aiDetectPrompt', e.target.value)}
                  placeholder="Yêu cầu riêng cho Vero (Ví dụ: Đọc số IMEI từ góc màn hình bấm *#06#)..."
                  className="w-full px-3 py-1.5 text-xs"
                />
              </div>
            )}
          </div>

          {/* Reference photo URL */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-sky-400 shrink-0" />
                Ảnh mẫu hướng dẫn Worker
              </label>
              <input
                type="text"
                value={step.referenceImageUrl}
                onChange={(e) => onUpdateStep(index, 'referenceImageUrl', e.target.value)}
                placeholder="URL ảnh mẫu hướng dẫn quy cách cho công nhân (https://...)"
                className="w-full px-3 py-1.5 text-xs"
              />
            </div>
            {step.referenceImageUrl && (
              <img
                src={step.referenceImageUrl}
                alt="Ảnh mẫu hướng dẫn"
                className="qc-builder-ref-thumb"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface StepDraggableListProps {
  steps: InspectionStep[];
  setSteps: React.Dispatch<React.SetStateAction<InspectionStep[]>>;
  onConfigureMapping: (step: InspectionStep, index: number) => void;
}

export const StepDraggableList: React.FC<StepDraggableListProps> = ({
  steps,
  setSteps,
  onConfigureMapping
}) => {
  const photoTypes = usePhotoTypes();
  const managedPhotoTypes = photoTypes.length ? photoTypes : DEFAULT_PHOTO_TYPE_OPTIONS;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = steps.findIndex(s => s.stepId === active.id);
      const newIndex = steps.findIndex(s => s.stepId === over.id);
      setSteps(arrayMove(steps, oldIndex, newIndex));
    }
  };

  const handleUpdateStep = (index: number, field: keyof InspectionStep, value: any) => {
    setSteps(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleRemoveStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={steps.map(s => s.stepId)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <SortableStepItem
              key={step.stepId}
              step={step}
              index={index}
              onUpdateStep={handleUpdateStep}
              onRemoveStep={handleRemoveStep}
              onConfigureMapping={onConfigureMapping}
              photoTypes={managedPhotoTypes}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
