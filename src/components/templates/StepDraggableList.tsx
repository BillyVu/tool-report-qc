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
  Sliders
} from 'lucide-react';
import { InspectionStep, StepInputType, AiDetectType, PhotoSlotConfig, PhotoType } from '../../types/qc';
import { PHOTO_TYPE_OPTIONS, getPhotoTypeInfo } from '../../constants/photoTypes';

interface SortableStepItemProps {
  step: InspectionStep;
  index: number;
  onUpdateStep: (index: number, field: keyof InspectionStep, value: any) => void;
  onRemoveStep: (index: number) => void;
  onConfigureMapping: (step: InspectionStep, index: number) => void;
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
  onConfigureMapping
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

  // Build current photoSlotConfigs
  const slotConfigs: PhotoSlotConfig[] = step.photoSlotConfigs || (
    (step.photoSlots || Array.from({ length: photoCount }, (_, i) => `Slot ${i + 1}: Mô tả ảnh ${i + 1}`)).map((lbl, i) => ({
      slotIndex: i + 1,
      label: lbl,
      photoType: 'GENERAL_OTHER'
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
          photoType: 'GENERAL_OTHER'
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

  const handleApplyPreset = (preset: typeof PRESET_PHOTO_SLOTS[0]) => {
    const updated: PhotoSlotConfig[] = preset.slots.map((s, idx) => ({
      slotIndex: idx + 1,
      label: s.label,
      photoType: s.photoType
    }));

    onUpdateStep(index, 'requiredPhotoCount', preset.count);
    onUpdateStep(index, 'photoSlotConfigs', updated);
    onUpdateStep(index, 'photoSlots', updated.map(s => s.label));
    onUpdateStep(index, 'isPhotoRequired', true);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-xl p-4 space-y-4 transition-all ${
        isDragging ? 'shadow-2xl border-blue-500 bg-blue-50/50 opacity-90' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Step Header Bar */}
      <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="p-1.5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-grab active:cursor-grabbing"
            title="Kéo thả để sắp xếp vị trí bước"
          >
            <GripVertical className="w-5 h-5" />
          </button>

          <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2.5 py-1 rounded-md shrink-0">
            {step.stepId}
          </span>

          <span className="font-bold text-sm text-slate-800 line-clamp-1">
            {step.title || `Bước ${index + 1}`}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {step.sampleSize && (
            <span className="hidden sm:inline-block text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
              Sample: {step.sampleSize}
            </span>
          )}

          <span className="text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1">
            <Camera className="w-3 h-3" />
            <span>{photoCount} ảnh</span>
          </span>

          {step.enableAiDetection && (
            <span className="text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>AI Detect</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => onConfigureMapping(step, index)}
            className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center gap-1 border border-blue-200"
            title="Cấu hình thẻ xuất Word"
          >
            <Tag className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Thẻ Word: <code>{step.mapping?.imageTag || '{{photo}}'}</code></span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => onRemoveStep(index)}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
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
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên Hạng Mục / Bước Kiểm Tra <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={step.title}
                onChange={(e) => onUpdateStep(index, 'title', e.target.value)}
                placeholder="Ví dụ: Visual Inspection hoặc MMI LCD Color"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Cỡ Mẫu (Sample Size)
              </label>
              <input
                type="text"
                value={step.sampleSize || ''}
                onChange={(e) => onUpdateStep(index, 'sampleSize', e.target.value)}
                placeholder="Ví dụ: 120 pcs hoặc 117 pcs"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tiêu chuẩn ĐẠT (Pass Criteria)
              </label>
              <input
                type="text"
                value={step.passCriteria}
                onChange={(e) => onUpdateStep(index, 'passCriteria', e.target.value)}
                placeholder="Mô tả tiêu chuẩn để công nhân kiểm tra và đối chiếu..."
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Mode Selector & Photo Count */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Collection Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Chế độ thu thập dữ liệu
                </label>
                <select
                  value={step.inputType || (step.isPhotoRequired ? 'PHOTO' : 'TEXT')}
                  onChange={(e) => onUpdateStep(index, 'inputType', e.target.value as StepInputType)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PHOTO">📷 Chỉ Chụp Ảnh (Photo Only)</option>
                  <option value="TEXT">📝 Chỉ Nhập Text / Dữ Liệu (Text Only)</option>
                  <option value="PHOTO_AND_TEXT">📷 + 📝 Kết Hợp Chụp Ảnh & Nhập Text</option>
                </select>
              </div>

              {/* Photo Count */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Số lượng ảnh yêu cầu (Required Photo Count)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={12}
                    value={photoCount}
                    onChange={(e) => handlePhotoCountChange(parseInt(e.target.value) || 0)}
                    className="w-24 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-bold text-blue-700 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-500 font-semibold">khung ảnh (slots)</span>
                </div>
              </div>

              {/* AI Detection Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tính năng AI Auto-Detect
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-purple-800 bg-purple-50 p-1.5 rounded-lg border border-purple-200 w-full cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step.enableAiDetection || false}
                    onChange={(e) => onUpdateStep(index, 'enableAiDetection', e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 border-purple-300"
                  />
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>✨ Detect dữ liệu từ ảnh bằng AI</span>
                </label>
              </div>
            </div>

            {/* Photo Slots Specifications Details */}
            {photoCount > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Mô Tả Chi Tiết Từng Ảnh (Photo Slots Specifications - {photoCount} ảnh):</span>
                  </label>

                  {/* Preset Quick Fill Menu */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-500" /> Nạp mẫu nhanh:
                    </span>
                    {PRESET_PHOTO_SLOTS.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyPreset(p)}
                        className="px-2 py-0.5 text-[10px] bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded font-medium transition-colors"
                        title={p.name}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slots Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {slotConfigs.slice(0, photoCount).map((slot, sIdx) => (
                    <div key={sIdx} className="bg-white p-2 rounded-lg border border-slate-200 space-y-1.5 shadow-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                          Slot #{sIdx + 1}
                        </span>
                        <input
                          type="text"
                          value={slot.label}
                          onChange={(e) => handleSlotLabelChange(sIdx, e.target.value)}
                          placeholder={`Mô tả cho Slot ${sIdx + 1}...`}
                          className="w-full text-xs font-semibold text-slate-800 focus:outline-none border-b border-transparent focus:border-blue-500 px-1 py-0.5"
                        />
                      </div>

                      {/* Photo Type Selector */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 font-medium shrink-0">Loại ảnh:</span>
                        <select
                          value={slot.photoType || 'GENERAL_OTHER'}
                          onChange={(e) => handleSlotPhotoTypeChange(sIdx, e.target.value as PhotoType)}
                          className="w-full text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {PHOTO_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.type} value={opt.type}>
                              {opt.iconEmoji} {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Text Input Configuration (if text mode or photo+text) */}
            {(step.inputType === 'TEXT' || step.inputType === 'PHOTO_AND_TEXT') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nhãn Trường Nhập Text (Input Field Label)
                  </label>
                  <input
                    type="text"
                    value={step.textInputLabel || ''}
                    onChange={(e) => onUpdateStep(index, 'textInputLabel', e.target.value)}
                    placeholder="Ví dụ: Nhập mã IMEI/Sê-ri hoặc Thông số trọng lượng"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Placeholder Gợi Ý Nhập
                  </label>
                  <input
                    type="text"
                    value={step.textInputPlaceholder || ''}
                    onChange={(e) => onUpdateStep(index, 'textInputPlaceholder', e.target.value)}
                    placeholder="Ví dụ: Bấm *#06# quét IMEI 15 chữ số..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* AI Detect Option detail panel */}
            {step.enableAiDetection && (
              <div className="p-3 bg-purple-50/80 rounded-xl border border-purple-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>Cấu Hình Quy Tắc AI Detection Tự Động:</span>
                  </span>
                  <select
                    value={step.aiDetectType || 'IMEI_SERIAL'}
                    onChange={(e) => onUpdateStep(index, 'aiDetectType', e.target.value as AiDetectType)}
                    className="text-xs font-bold bg-white border border-purple-300 rounded-lg px-2.5 py-1 text-purple-900 focus:ring-2 focus:ring-purple-500"
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
                  placeholder="Yêu cầu riêng cho AI (Ví dụ: Đọc số IMEI từ góc màn hình bấm *#06#)..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
            )}
          </div>

          {/* Reference photo URL */}
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={step.referenceImageUrl}
              onChange={(e) => onUpdateStep(index, 'referenceImageUrl', e.target.value)}
              placeholder="URL ảnh mẫu hướng dẫn quy cách cho công nhân (https://...)"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
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
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
