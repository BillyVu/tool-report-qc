import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Edit2, 
  Check, 
  UserCheck, 
  Calendar, 
  ShieldCheck, 
  Sparkles, 
  FileSpreadsheet, 
  Maximize2,
  AlertTriangle,
  History,
  Camera,
  Layers,
  FileText,
  Loader2
} from 'lucide-react';
import { InspectionJob, ChecklistTemplate } from '../../types/qc';
import { qcService } from '../../services/qcService';
import { generateDocxReport } from '../../services/docxExportService';
import { detectDataFromPhoto } from '../../services/aiDetectionService';

interface InspectionDetailDrawerProps {
  job: InspectionJob | null;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdated: () => void;
}

export const InspectionDetailDrawer: React.FC<InspectionDetailDrawerProps> = ({
  job,
  isOpen,
  onClose,
  onJobUpdated
}) => {
  if (!isOpen || !job) return null;

  const [currentJob, setCurrentJob] = useState<InspectionJob>(job);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState<string>('');
  const [adminNotes, setAdminNotes] = useState<string>(job.adminNotes || '');
  const [isExporting, setIsExporting] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (job) {
      setCurrentJob(job);
      setAdminNotes(job.adminNotes || '');
    }
  }, [job]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImageUrl) {
          setLightboxImageUrl(null);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, lightboxImageUrl, onClose]);

  const template = qcService.getTemplateById(currentJob.templateId);

  const handleStartEditNote = (stepId: string, currentNote: string) => {
    setEditingStepId(stepId);
    setEditingNoteValue(currentNote);
  };

  const handleSaveEditNote = (stepId: string) => {
    qcService.updateJobStepNote(currentJob.id, stepId, editingNoteValue);
    setEditingStepId(null);
    const updated = qcService.getJobById(currentJob.id);
    if (updated) setCurrentJob({ ...updated });
    onJobUpdated();
  };

  const handleStatusChange = (newStatus: InspectionJob['status']) => {
    qcService.updateJobStatus(currentJob.id, newStatus, adminNotes);
    const updated = qcService.getJobById(currentJob.id);
    if (updated) setCurrentJob({ ...updated });
    onJobUpdated();
  };

  const handleSaveAdminNotes = () => {
    qcService.updateJobStatus(currentJob.id, currentJob.status, adminNotes);
    const updated = qcService.getJobById(currentJob.id);
    if (updated) setCurrentJob({ ...updated });
    onJobUpdated();
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      await generateDocxReport(currentJob, template);
      const updated = qcService.getJobById(currentJob.id);
      if (updated) setCurrentJob({ ...updated });
      onJobUpdated();
    } catch (e) {
      console.error('Export DOCX error:', e);
    } finally {
      setTimeout(() => setIsExporting(false), 1200);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-end animate-fade-in cursor-pointer"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div 
          className="bg-white w-full max-w-3xl h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden animate-slide-left cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Drawer Top Header */}
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-md">
                  {currentJob.id}
                </span>
                <span className="text-xs text-slate-400">Lô: <strong>{currentJob.batchNumber}</strong></span>
              </div>
              <h2 className="text-lg font-bold mt-1 text-slate-100">{currentJob.productName}</h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Export Word Button */}
              <button
                onClick={handleExportDocx}
                disabled={isExporting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                <span>{isExporting ? 'Đang Tổng Hợp Word...' : 'Xuất Báo Cáo Word (.docx)'}</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Drawer Body Scroll Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Status & Overview Banner */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase text-slate-500">Trạng Thái Kiểm Duyệt Lô QC</div>
                <div className="flex items-center gap-2">
                  {currentJob.status === 'COMPLETED' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ĐẠT TIÊU CHUẨN (PASS)</span>
                    </span>
                  )}
                  {currentJob.status === 'FAILED' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800 border border-red-300">
                      <XCircle className="w-4 h-4" />
                      <span>CÓ LỖI (FAIL)</span>
                    </span>
                  )}
                  {currentJob.status === 'IN_PROGRESS' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>ĐANG LÀM TẠI XƯỞNG</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Status Override Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Đổi Trạng Thái:</span>
                <select
                  value={currentJob.status}
                  onChange={(e) => handleStatusChange(e.target.value as any)}
                  className="text-xs font-bold bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="COMPLETED">✅ COMPLETED (ĐẠT)</option>
                  <option value="FAILED">❌ FAILED (LỖI)</option>
                  <option value="IN_PROGRESS">⏳ IN_PROGRESS (ĐANG LÀM)</option>
                </select>
              </div>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Mã dòng SP:</span>
                <span className="font-bold text-slate-800">{currentJob.productCode}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Công nhân:</span>
                <span className="font-bold text-slate-800">{currentJob.workerName}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Chuyền sản xuất:</span>
                <span className="font-bold text-slate-800">{currentJob.line}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Thời gian bắt đầu:</span>
                <span className="font-bold text-slate-800">
                  {new Date(currentJob.createdAt).toLocaleTimeString('vi-VN')}
                </span>
              </div>
            </div>

            {/* Step Results Detailed Cards */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">
                  Kết Quả Thu Thập Ảnh & Ghi Chú Từng Bước ({currentJob.stepResults.length} bước)
                </h3>
                <span className="text-xs text-slate-500">Bấm icon cây bút để sửa chính tả ghi chú</span>
              </div>

              <div className="space-y-4">
                {currentJob.stepResults.map((sr) => {
                  const stepDef = template?.steps.find(s => s.stepId === sr.stepId);
                  const isEditingThisNote = editingStepId === sr.stepId;
                  const photoSlots = stepDef?.photoSlots || (sr.photos ? sr.photos.map(p => p.slotName) : []);
                  const requiredCount = stepDef?.requiredPhotoCount ?? (photoSlots.length || 1);

                  return (
                    <div
                      key={sr.stepId}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs bg-slate-900 text-white px-2.5 py-1 rounded-md">
                            {sr.stepId}
                          </span>
                          <span className="font-bold text-sm text-slate-900">
                            {stepDef?.title || `Bước ${sr.stepId}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {stepDef?.sampleSize && (
                            <span className="text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                              Sample: {stepDef.sampleSize}
                            </span>
                          )}

                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            sr.status === 'PASS' ? 'bg-emerald-100 text-emerald-800' :
                            sr.status === 'FAIL' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {sr.status}
                          </span>
                        </div>
                      </div>

                      {/* Criteria & Slot Specifications */}
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-1.5 text-xs text-slate-700">
                        <div><strong>Tiêu chuẩn:</strong> {stepDef?.passCriteria || 'Đạt tiêu chuẩn nhà máy'}</div>
                        {photoSlots.length > 0 && (
                          <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200">
                            <span className="font-bold text-blue-700 flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5" /> Quy cách chụp ({requiredCount} ảnh):
                            </span>
                            {photoSlots.map((slot, sIdx) => (
                              <span key={sIdx} className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700 text-[10px] font-medium">
                                {slot}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Content: Photos & Notes/Text Inputs */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-1">
                        {/* Captured Photos Grid */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center justify-between">
                            <span>Ảnh thu thập thực tế ({sr.photos?.length || (sr.photoUrl ? 1 : 0)}/{requiredCount}):</span>
                          </span>

                          {/* Render Multi-slot photos if available */}
                          {sr.photos && sr.photos.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2">
                              {sr.photos.map((photo, pIdx) => (
                                <div key={pIdx} className="space-y-1">
                                  <div
                                    onClick={() => setLightboxImageUrl(photo.url)}
                                    className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center"
                                  >
                                    <img
                                      src={photo.url}
                                      alt={photo.slotName}
                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1">
                                      <Maximize2 className="w-3 h-3" />
                                      <span>Phóng to</span>
                                    </div>
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-600 truncate" title={photo.slotName}>
                                    {photo.slotName}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : sr.photoUrl ? (
                            <div 
                              onClick={() => setLightboxImageUrl(sr.photoUrl || null)}
                              className="relative group cursor-pointer rounded-lg overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center"
                            >
                              <img
                                src={sr.photoUrl}
                                alt={sr.stepId}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                <Maximize2 className="w-4 h-4" />
                                <span>Phóng to</span>
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-video bg-slate-100 rounded-lg border border-slate-200 flex items-center justify-center text-xs text-slate-400 italic">
                              Chưa chụp ảnh
                            </div>
                          )}

                          <div className="text-[10px] text-slate-400 font-mono">
                            Mapped Tag: {stepDef?.mapping?.imageTag || '{{photo}}'}
                          </div>
                        </div>

                        {/* Text Inputs & Notes & AI Detection Results */}
                        <div className="lg:col-span-2 space-y-2 flex flex-col justify-between">
                          <div className="space-y-2">
                            {/* Text Input Value if applicable */}
                            {sr.textValue && (
                              <div className="p-2.5 bg-blue-50/80 border border-blue-200 rounded-lg space-y-1">
                                <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Dữ liệu nhập từ công nhân ({stepDef?.textInputLabel || 'Dữ liệu'}):</span>
                                </span>
                                <div className="text-xs font-mono font-bold text-blue-950 bg-white p-1.5 rounded border border-blue-200">
                                  {sr.textValue}
                                </div>
                              </div>
                            )}

                            {/* AI Detected Value Banner */}
                            {sr.aiDetectedValue && (
                              <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-purple-900 flex items-center gap-1">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                    <span>AI Gemini Detection Result:</span>
                                  </span>
                                  {sr.aiMatchStatus && (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                      sr.aiMatchStatus === 'MATCH' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {sr.aiMatchStatus === 'MATCH' ? '✓ Khớp 100%' : '⚠️ Cần kiểm tra lại'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs font-mono font-bold text-purple-950 bg-white p-1.5 rounded border border-purple-200">
                                  {sr.aiDetectedValue}
                                </div>
                              </div>
                            )}

                            {/* Worker Notes & Editor */}
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-500 uppercase">Ghi chú công nhân:</span>
                                {!isEditingThisNote && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditNote(sr.stepId, sr.note)}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Chỉnh sửa ghi chú</span>
                                  </button>
                                )}
                              </div>

                              {isEditingThisNote ? (
                                <div className="space-y-2 mt-1">
                                  <textarea
                                    value={editingNoteValue}
                                    onChange={(e) => setEditingNoteValue(e.target.value)}
                                    rows={3}
                                    className="w-full p-2 text-xs border border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                  />
                                  <div className="flex items-center gap-2 justify-end">
                                    <button
                                      type="button"
                                      onClick={() => setEditingStepId(null)}
                                      className="px-2.5 py-1 text-xs border rounded-md text-slate-600"
                                    >
                                      Hủy
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveEditNote(sr.stepId)}
                                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md font-bold flex items-center gap-1"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>Lưu thay đổi</span>
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 mt-1">
                                  {sr.note || <span className="text-slate-400 italic">Chưa có ghi chú</span>}
                                  {sr.editedByAdmin && (
                                    <div className="mt-1.5 text-[10px] text-blue-600 font-semibold flex items-center gap-1">
                                      <History className="w-3 h-3" />
                                      <span>[Đã hiệu chỉnh bởi QC Admin - Đã lưu Audit Log]</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-[10px] text-slate-400 font-mono pt-1">
                            Mapped Tag: {stepDef?.mapping?.noteTag || '{{note}}'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Admin Directive Notes Box */}
            <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 space-y-2">
              <label className="block text-xs font-bold text-blue-900">
                Ghi Chú Chỉ Đạo Khắc Phục Của Trưởng Phòng QC Admin (Xuất kèm Báo cáo Word)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                onBlur={handleSaveAdminNotes}
                placeholder="Nhập ghi chú hoặc yêu cầu tổ trưởng chuyền xử lý..."
                rows={2}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <span className="text-xs text-slate-500">
              Đã xuất file: <strong>{currentJob.exportCount || 0} lần</strong>
            </span>
            <button
              onClick={handleExportDocx}
              disabled={isExporting}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Tải Báo Cáo Word (.docx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Photo Lightbox Zoom Modal */}
      {lightboxImageUrl && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-black rounded-2xl overflow-hidden shadow-2xl p-2">
            <button
              onClick={() => setLightboxImageUrl(null)}
              className="absolute top-4 right-4 p-2 bg-slate-900/80 text-white rounded-full hover:bg-slate-800 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImageUrl}
              alt="Zoomed QC Photo"
              className="max-w-full max-h-[85vh] object-contain rounded-xl mx-auto"
            />
          </div>
        </div>
      )}
    </>
  );
};
