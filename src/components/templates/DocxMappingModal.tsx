import React, { useState } from 'react';
import { FileCode, FileText, Check, X, Sliders, Upload, Image as ImageIcon, Sparkles } from 'lucide-react';
import { InspectionStep, DocxMapping } from '../../types/qc';

interface DocxMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: InspectionStep | null;
  stepIndex: number;
  docxTemplateName: string;
  onSaveMapping: (stepIndex: number, mapping: DocxMapping) => void;
}

export const DocxMappingModal: React.FC<DocxMappingModalProps> = ({
  isOpen,
  onClose,
  step,
  stepIndex,
  docxTemplateName,
  onSaveMapping
}) => {
  if (!isOpen || !step) return null;

  const [imageTag, setImageTag] = useState(step.mapping?.imageTag || `{{photo_${step.stepId.toLowerCase()}}}`);
  const [noteTag, setNoteTag] = useState(step.mapping?.noteTag || `{{note_${step.stepId.toLowerCase()}}}`);
  const [statusTag, setStatusTag] = useState(step.mapping?.statusTag || `{{status_${step.stepId.toLowerCase()}}}`);
  const [imageWidthMm, setImageWidthMm] = useState(step.mapping?.imageWidthMm || 60);
  const [imageHeightMm, setImageHeightMm] = useState(step.mapping?.imageHeightMm || 45);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveMapping(stepIndex, {
      imageTag,
      noteTag,
      statusTag,
      imageWidthMm,
      imageHeightMm
    });
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Cấu hình Ánh Xạ Thẻ Placeholder Word (.docx)</h2>
              <p className="text-xs text-slate-400">
                Gán bước <strong>{step.stepId}: {step.title}</strong> vào thẻ trong file <strong>{docxTemplateName || 'Mau_Bao_Cao.docx'}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="p-6 space-y-5">
          {/* Tag Binding Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Image Placeholder Tag */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-600" />
                <span>Thẻ Hình Ảnh (Image Tag Placeholder)</span>
              </label>
              <input
                type="text"
                value={imageTag}
                onChange={(e) => setImageTag(e.target.value)}
                placeholder="{{photo_step1}}"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <p className="text-[11px] text-slate-500">
                Thẻ này trong file Word sẽ được thay bằng ảnh công nhân chụp tại xưởng.
              </p>
            </div>

            {/* Note Placeholder Tag */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
              <label className="block text-xs font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Thẻ Ghi Chú (Note Tag Placeholder)</span>
              </label>
              <input
                type="text"
                value={noteTag}
                onChange={(e) => setNoteTag(e.target.value)}
                placeholder="{{note_step1}}"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                required
              />
              <p className="text-[11px] text-slate-500">
                Nội dung mô tả hoặc nguyên nhân lỗi do công nhân nhập.
              </p>
            </div>
          </div>

          {/* Status Tag */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <label className="block text-xs font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Thẻ Trạng Thái Đánh Giá (Status Tag Placeholder - Tùy chọn)</span>
            </label>
            <input
              type="text"
              value={statusTag}
              onChange={(e) => setStatusTag(e.target.value)}
              placeholder="{{status_step1}}"
              className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Image Dimensions mm Configuration */}
          <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200/80 space-y-3">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>Cấu hình Kích thước Khung Ảnh Chèn vào Word (mm)</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Chiều rộng tối đa (Max Width)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="200"
                    value={imageWidthMm}
                    onChange={(e) => setImageWidthMm(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-500">mm</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Chiều cao tối đa (Max Height)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="200"
                    value={imageHeightMm}
                    onChange={(e) => setImageHeightMm(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs font-bold text-slate-500">mm</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-blue-700">
              * Tự động co giãn ảnh chụp để giữ nguyên tỉ lệ khung hình trong ô bảng Word mà không bị lệch bố cục trang.
            </p>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Lưu Cấu Hình Thẻ Tag</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
