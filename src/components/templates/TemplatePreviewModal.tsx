import React, { useState, useEffect } from 'react';
import {
  X,
  Eye,
  Camera,
  CheckCircle2,
  XCircle,
  FileText,
  Sparkles,
  Loader2,
  Upload,
  Info,
  Check,
  RotateCcw
} from 'lucide-react';
import { ChecklistTemplate, InspectionStep } from '../../types/qc';
import { detectDataFromPhoto } from '../../services/aiDetectionService';

interface TemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ChecklistTemplate | null;
}

interface StepPreviewState {
  status: 'PENDING' | 'PASS' | 'FAIL';
  photos: { slotName: string; url?: string }[];
  textValue: string;
  aiDetectedValue?: string;
  aiMatchStatus?: 'MATCH' | 'MISMATCH';
  note: string;
  isDetecting: boolean;
}

const SAMPLE_PHOTO_PRESETS = [
  'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1616440342855-520120536c0a?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=80'
];

export const TemplatePreviewModal: React.FC<TemplatePreviewModalProps> = ({
  isOpen,
  onClose,
  template
}) => {
  const [stepStates, setStepStates] = useState<Record<string, StepPreviewState>>({});

  useEffect(() => {
    if (template) {
      const initial: Record<string, StepPreviewState> = {};
      template.steps.forEach((step) => {
        const slots = step.photoSlots || Array.from({ length: step.requiredPhotoCount || 1 }, (_, i) => `Slot ${i + 1}`);
        initial[step.stepId] = {
          status: 'PENDING',
          photos: slots.map(slotName => ({ slotName, url: undefined })),
          textValue: '',
          note: '',
          isDetecting: false
        };
      });
      setStepStates(initial);
    }
  }, [template]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !template) return null;

  const handleSetStatus = (stepId: string, status: 'PASS' | 'FAIL') => {
    setStepStates(prev => ({
      ...prev,
      [stepId]: { ...prev[stepId], status }
    }));
  };

  const handleUploadPhoto = (stepId: string, slotIdx: number) => {
    const randomUrl = SAMPLE_PHOTO_PRESETS[slotIdx % SAMPLE_PHOTO_PRESETS.length];
    setStepStates(prev => {
      const step = prev[stepId];
      if (!step) return prev;
      const updatedPhotos = [...step.photos];
      updatedPhotos[slotIdx] = { ...updatedPhotos[slotIdx], url: randomUrl };
      return {
        ...prev,
        [stepId]: { ...step, photos: updatedPhotos }
      };
    });
  };

  const handleClearPhoto = (stepId: string, slotIdx: number) => {
    setStepStates(prev => {
      const step = prev[stepId];
      if (!step) return prev;
      const updatedPhotos = [...step.photos];
      updatedPhotos[slotIdx] = { ...updatedPhotos[slotIdx], url: undefined };
      return {
        ...prev,
        [stepId]: { ...step, photos: updatedPhotos }
      };
    });
  };

  const handleRunAiDetect = async (step: InspectionStep) => {
    const currentState = stepStates[step.stepId];
    if (!currentState) return;

    setStepStates(prev => ({
      ...prev,
      [step.stepId]: { ...prev[step.stepId], isDetecting: true }
    }));

    const samplePhoto = currentState.photos.find(p => p.url)?.url || step.referenceImageUrl || SAMPLE_PHOTO_PRESETS[0];

    const result = await detectDataFromPhoto(samplePhoto, {
      detectType: step.aiDetectType || 'IMEI_SERIAL',
      customPrompt: step.aiDetectPrompt
    });

    setStepStates(prev => ({
      ...prev,
      [step.stepId]: {
        ...prev[step.stepId],
        isDetecting: false,
        aiDetectedValue: result.detectedText,
        textValue: result.detectedText,
        aiMatchStatus: 'MATCH',
        note: currentState.note ? `${currentState.note} | ${result.summary}` : result.summary
      }
    }));
  };

  const completedCount = Object.values(stepStates).filter((s: StepPreviewState) => s.status !== 'PENDING').length;
  const totalCount = template.steps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-400">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold bg-blue-600 px-2 py-0.5 rounded text-white">
                  MÔ PHỎNG CÔNG NHÂN
                </span>
                <span className="text-xs text-slate-400 font-mono">v{template.version}</span>
              </div>
              <h2 className="text-base font-bold text-white mt-0.5">{template.title}</h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Instructions & Progress Banner */}
        <div className="bg-white border-b border-slate-200 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600 font-medium">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Sản phẩm: <strong>{template.productName}</strong> ({template.productCode})</span>
            </div>
            <div className="font-bold text-slate-800">
              Tiến độ kiểm thử: <span className="text-blue-600">{completedCount}/{totalCount} bước</span> ({progressPercent}%)
            </div>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Steps Scrollable Area */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {template.steps.map((step, index) => {
            const state = stepStates[step.stepId] || {
              status: 'PENDING',
              photos: [],
              textValue: '',
              note: '',
              isDetecting: false
            };

            const slots = step.photoSlots || Array.from({ length: step.requiredPhotoCount || 1 }, (_, i) => `Slot ${i + 1}`);

            return (
              <div
                key={step.stepId}
                className={`bg-white rounded-xl border p-4 sm:p-5 space-y-4 transition-all shadow-sm ${
                  state.status === 'PASS' ? 'border-emerald-300 ring-1 ring-emerald-200' :
                  state.status === 'FAIL' ? 'border-red-300 ring-1 ring-red-200' :
                  'border-slate-200'
                }`}
              >
                {/* Step Title Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-xs bg-slate-900 text-white px-2.5 py-1 rounded-md">
                      {step.stepId}
                    </span>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">
                      {step.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {step.sampleSize && (
                      <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded">
                        Sample: {step.sampleSize}
                      </span>
                    )}

                    <span className="text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5" />
                      <span>{slots.length} ảnh</span>
                    </span>
                  </div>
                </div>

                {/* Pass Criteria Box */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-700">
                  <span className="font-bold text-slate-900">Tiêu chuẩn ĐẠT:</span> {step.passCriteria}
                </div>

                {/* Photo Slots Specifications Grid */}
                {(step.inputType === 'PHOTO' || step.inputType === 'PHOTO_AND_TEXT' || !step.inputType) && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-blue-600" />
                      <span>Thu thập ảnh kiểm định ({slots.length} slots):</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                      {slots.map((slotName, sIdx) => {
                        const slotPhoto = state.photos[sIdx]?.url;

                        return (
                          <div key={sIdx} className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-600 truncate" title={slotName}>
                              {slotName}
                            </div>

                            {slotPhoto ? (
                              <div className="relative group rounded-lg overflow-hidden border border-slate-300 aspect-square bg-slate-100">
                                <img src={slotPhoto} alt={slotName} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => handleClearPhoto(step.stepId, sIdx)}
                                  className="absolute top-1 right-1 bg-slate-900/80 hover:bg-red-600 text-white p-1 rounded-full text-[10px] transition-colors"
                                  title="Xóa ảnh này"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleUploadPhoto(step.stepId, sIdx)}
                                className="w-full aspect-square rounded-lg border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/50 flex flex-col items-center justify-center p-2 text-slate-400 hover:text-blue-600 transition-all group"
                              >
                                <Upload className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
                                <span className="text-[9px] font-bold text-center">Chụp / Chọn ảnh</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Text Input Field if enabled */}
                {(step.inputType === 'TEXT' || step.inputType === 'PHOTO_AND_TEXT') && (
                  <div className="space-y-1.5 bg-blue-50/60 p-3 rounded-xl border border-blue-200">
                    <label className="block text-xs font-bold text-blue-900">
                      {step.textInputLabel || 'Dữ liệu văn bản / thông số trắc nghiệm'}:
                    </label>
                    <input
                      type="text"
                      value={state.textValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStepStates(prev => ({
                          ...prev,
                          [step.stepId]: { ...prev[step.stepId], textValue: val }
                        }));
                      }}
                      placeholder={step.textInputPlaceholder || 'Nhập kết quả kiểm tra...'}
                      className="w-full px-3 py-1.5 text-xs bg-white border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                )}

                {/* AI Detection Feature Trigger */}
                {step.enableAiDetection && (
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-purple-900">
                      <div className="font-bold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-purple-600" />
                        <span>AI Gemini Auto-Detect Dữ Liệu Từ Ảnh ({step.aiDetectType || 'IMEI'})</span>
                      </div>
                      <p className="text-[11px] text-purple-700 mt-0.5">
                        Tự động đọc mã IMEI, OCR chữ hoặc phân tích màn hình sắc xuất từ ảnh đã chụp.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRunAiDetect(step)}
                      disabled={state.isDetecting}
                      className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                    >
                      {state.isDetecting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang AI Quét...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Chạy AI Detect Ngay</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* AI Detected Result Display */}
                {state.aiDetectedValue && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs space-y-1">
                    <div className="font-bold text-emerald-900 flex items-center gap-1">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Kết quả AI đã trích xuất:</span>
                    </div>
                    <div className="font-mono font-bold text-emerald-950 bg-white p-2 rounded border border-emerald-200">
                      {state.aiDetectedValue}
                    </div>
                  </div>
                )}

                {/* Status & Worker Notes Action Controls */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {/* Notes input */}
                  <input
                    type="text"
                    value={state.note}
                    onChange={(e) => {
                      const val = e.target.value;
                      setStepStates(prev => ({
                        ...prev,
                        [step.stepId]: { ...prev[step.stepId], note: val }
                      }));
                    }}
                    placeholder="Ghi chú nhận xét của công nhân (nếu có)..."
                    className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />

                  {/* Pass / Fail Toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSetStatus(step.stepId, 'PASS')}
                      className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        state.status === 'PASS'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ĐẠT (PASS)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSetStatus(step.stepId, 'FAIL')}
                      className={`px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                        state.status === 'FAIL'
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                          : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      <span>LỖI (FAIL)</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="bg-white border-t border-slate-200 p-4 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 font-medium">
            Tất cả dữ liệu nhập trong Preview này chỉ nhằm mục đích thử nghiệm giao diện.
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-md transition-colors"
          >
            Đóng Xem Trước
          </button>
        </div>
      </div>
    </div>
  );
};
