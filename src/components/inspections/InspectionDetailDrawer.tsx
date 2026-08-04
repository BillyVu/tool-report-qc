import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Edit2,
  Check,
  ShieldCheck,
  Sparkles,
  Maximize2,
  AlertTriangle,
  History,
  Camera,
  FileText,
  Loader2,
  Laptop,
  ClipboardCheck,
  MessageSquareText,
  ChevronLeft,
  ChevronRight,
  Images,
  Save,
  CircleDot
} from 'lucide-react';
import { InspectionJob, StepModerationStatus, StepResult } from '../../types/qc';
import { adminApi } from '../../services/adminApi';
import { generateDocxReport } from '../../services/docxExportService';

interface InspectionDetailDrawerProps {
  job: InspectionJob | null;
  isOpen: boolean;
  onClose: () => void;
  onJobUpdated: () => void;
}

type ReviewSummary = {
  approved: number;
  rejected: number;
  pending: number;
};

const getPhotoCount = (step: StepResult) => step.photos?.length || (step.photoUrl ? 1 : 0);

const getModerationTone = (status: StepModerationStatus | undefined) => {
  if (status === 'APPROVED') {
    return 'border-blue-200 bg-blue-50 text-blue-800';
  }
  if (status === 'REJECTED') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

const getStepStatusTone = (status: StepResult['status']) => {
  if (status === 'PASS') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }
  if (status === 'FAIL') {
    return 'border-red-200 bg-red-50 text-red-800';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Chưa có';
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

export const InspectionDetailDrawer: React.FC<InspectionDetailDrawerProps> = ({
  job,
  isOpen,
  onClose,
  onJobUpdated
}) => {
  const [currentJob, setCurrentJob] = useState<InspectionJob | null>(job);
  const [activeStepId, setActiveStepId] = useState<string | null>(job?.stepResults[0]?.stepId || null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingNoteValue, setEditingNoteValue] = useState('');
  const [adminNotes, setAdminNotes] = useState(job?.adminNotes || '');
  const [reviewNoteByStep, setReviewNoteByStep] = useState<Record<string, string>>({});
  const [reviewingStepId, setReviewingStepId] = useState<string | null>(null);
  const [isSavingAdminNotes, setIsSavingAdminNotes] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (job) {
      setCurrentJob(job);
      setAdminNotes(job.adminNotes || '');
      setReviewNoteByStep(Object.fromEntries(job.stepResults.map((step) => [step.stepId, step.adminReviewNote || ''])));
      setActiveStepId((previous) => {
        if (previous && job.stepResults.some((step) => step.stepId === previous)) return previous;
        return job.stepResults[0]?.stepId || null;
      });
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

  const template = currentJob?.templateSnapshot;

  const reviewSummary = useMemo<ReviewSummary>(() => {
    return (currentJob?.stepResults || []).reduce(
      (summary, step) => {
        if (step.moderationStatus === 'APPROVED') summary.approved += 1;
        else if (step.moderationStatus === 'REJECTED') summary.rejected += 1;
        else summary.pending += 1;
        return summary;
      },
      { approved: 0, rejected: 0, pending: 0 },
    );
  }, [currentJob]);

  const activeStepIndex = currentJob?.stepResults.findIndex((step) => step.stepId === activeStepId) ?? -1;
  const activeStep = activeStepIndex >= 0 ? currentJob?.stepResults[activeStepIndex] : currentJob?.stepResults[0];
  const activeStepDef = activeStep ? template?.steps.find((step) => step.stepId === activeStep.stepId) : undefined;
  const activePhotoSlots = activeStepDef?.photoSlots || (activeStep?.photos ? activeStep.photos.map((photo) => photo.slotName) : []);
  const activeRequiredPhotoCount = activeStepDef?.requiredPhotoCount ?? (activePhotoSlots.length || 1);
  const activePhotoCount = activeStep ? getPhotoCount(activeStep) : 0;
  const activeModerationStatus = activeStep?.moderationStatus || 'PENDING_REVIEW';
  const activePhotos = activeStep?.photos?.length
    ? activeStep.photos
    : activeStep?.photoUrl
      ? [{ url: activeStep.photoUrl, slotName: activeStep.stepId }]
      : [];

  if (!isOpen || !currentJob || !activeStep) return null;

  const handleStartEditNote = (stepId: string, currentNote: string) => {
    setEditingStepId(stepId);
    setEditingNoteValue(currentNote);
  };

  const handleSaveEditNote = async (stepId: string) => {
    const updated = await adminApi.updateJobStepNote(currentJob.id, stepId, editingNoteValue);
    setEditingStepId(null);
    setCurrentJob(updated);
    onJobUpdated();
  };

  const handleStatusChange = async (newStatus: InspectionJob['status']) => {
    const updated = await adminApi.updateJobStatus(currentJob.id, newStatus, adminNotes);
    setCurrentJob(updated);
    onJobUpdated();
  };

  const handleModerateStep = async (stepId: string, moderationStatus: StepModerationStatus) => {
    setReviewingStepId(stepId);
    try {
      const updated = await adminApi.moderateJobStep(currentJob.id, stepId, moderationStatus, reviewNoteByStep[stepId] || '');
      setCurrentJob(updated);
      setReviewNoteByStep(Object.fromEntries(updated.stepResults.map((step) => [step.stepId, step.adminReviewNote || ''])));
      onJobUpdated();
    } finally {
      setReviewingStepId(null);
    }
  };

  const handleSaveAdminNotes = async () => {
    setIsSavingAdminNotes(true);
    try {
      const updated = await adminApi.updateJobStatus(currentJob.id, currentJob.status, adminNotes);
      setCurrentJob(updated);
      onJobUpdated();
    } finally {
      setTimeout(() => setIsSavingAdminNotes(false), 500);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    try {
      await generateDocxReport(currentJob, template);
      onJobUpdated();
    } catch (e) {
      console.error('Export DOCX error:', e);
    } finally {
      setTimeout(() => setIsExporting(false), 900);
    }
  };

  const goToStep = (direction: -1 | 1) => {
    const nextIndex = Math.min(Math.max(activeStepIndex + direction, 0), currentJob.stepResults.length - 1);
    setActiveStepId(currentJob.stepResults[nextIndex].stepId);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex justify-end animate-fade-in cursor-pointer"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="bg-slate-100 w-full max-w-7xl h-full shadow-2xl border-l border-slate-800 flex flex-col overflow-hidden animate-slide-left cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative bg-slate-950 text-white px-5 py-4 pr-14 shrink-0 border-b border-slate-800">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-sky-500 text-white px-2.5 py-1 rounded-md">
                    {currentJob.id}
                  </span>
                  <span className="text-xs text-slate-400">Lô <strong className="text-slate-200">{currentJob.batchNumber}</strong></span>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${currentJob.status === 'COMPLETED' ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : currentJob.status === 'FAILED' ? 'border-red-400/40 bg-red-500/15 text-red-200' : 'border-amber-400/40 bg-amber-500/15 text-amber-200'}`}>
                    {currentJob.status === 'COMPLETED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {currentJob.status === 'FAILED' && <XCircle className="w-3.5 h-3.5" />}
                    {currentJob.status === 'IN_PROGRESS' && <Clock className="w-3.5 h-3.5" />}
                    {currentJob.status}
                  </span>
                </div>
                <h2 className="mt-2 truncate text-xl font-bold text-slate-50">{currentJob.productName}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Mã SP: <strong className="text-slate-200">{currentJob.productCode}</strong></span>
                  <span>Công nhân: <strong className="text-slate-200">{currentJob.workerName}</strong></span>
                  <span>{currentJob.line} - {currentJob.shift}</span>
                  <span>Tạo: {formatDateTime(currentJob.createdAt)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <select
                  value={currentJob.status}
                  onChange={(e) => handleStatusChange(e.target.value as InspectionJob['status'])}
                  className="h-9 min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  title="Đổi trạng thái lô QC"
                >
                  <option value="COMPLETED">COMPLETED - ĐẠT</option>
                  <option value="FAILED">FAILED - LỖI</option>
                  <option value="IN_PROGRESS">IN_PROGRESS - ĐANG LÀM</option>
                </select>
                <button
                  onClick={handleExportDocx}
                  disabled={isExporting}
                  className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{isExporting ? 'Đang xuất...' : 'Tải Word'}</span>
                </button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="absolute right-3 top-3 h-9 w-9 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="max-h-[32dvh] min-h-0 border-b border-slate-200 bg-white flex flex-col lg:max-h-none lg:border-b-0 lg:border-r">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Tiến độ duyệt nhanh</div>
                    <div className="mt-1 text-sm font-bold text-slate-950">
                      {reviewSummary.approved}/{currentJob.stepResults.length} bước đã duyệt
                    </div>
                  </div>
                  <div className="h-11 w-11 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${reviewSummary.rejected > 0 ? 'bg-red-500' : 'bg-blue-600'}`}
                    style={{ width: `${currentJob.stepResults.length ? (reviewSummary.approved / currentJob.stepResults.length) * 100 : 0}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 px-2 py-2 text-blue-800">{reviewSummary.approved} duyệt</div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-2 text-amber-800">{reviewSummary.pending} chờ</div>
                  <div className="rounded-lg border border-red-100 bg-red-50 px-2 py-2 text-red-800">{reviewSummary.rejected} từ chối</div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
                {currentJob.stepResults.map((step, index) => {
                  const stepDef = template?.steps.find((item) => item.stepId === step.stepId);
                  const moderationStatus = step.moderationStatus || 'PENDING_REVIEW';
                  const isActive = step.stepId === activeStep.stepId;
                  const requiredPhotoCount = stepDef?.requiredPhotoCount ?? ((stepDef?.photoSlots?.length || step.photos?.length) || 1);
                  const photoCount = getPhotoCount(step);

                  return (
                    <button
                      key={step.stepId}
                      type="button"
                      onClick={() => setActiveStepId(step.stepId)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-black ${isActive ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-700'}`}>
                              {index + 1}
                            </span>
                            <span className="truncate text-xs font-bold">{stepDef?.title || `Bước ${step.stepId}`}</span>
                          </div>
                          <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-[10px] ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                            <span>{photoCount}/{requiredPhotoCount} ảnh</span>
                            <span>{step.status}</span>
                            {step.textValue && <span>Có text</span>}
                          </div>
                        </div>
                        {moderationStatus === 'APPROVED' && <CheckCircle2 className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-300' : 'text-blue-600'}`} />}
                        {moderationStatus === 'REJECTED' && <XCircle className={`w-4 h-4 shrink-0 ${isActive ? 'text-red-300' : 'text-red-600'}`} />}
                        {moderationStatus === 'PENDING_REVIEW' && <CircleDot className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-amber-600'}`} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {(currentJob.workerMac || currentJob.sessionTracker) && (
                <div className="border-t border-slate-200 bg-slate-50 p-3 text-xs">
                  <div className="flex items-center gap-2 font-bold text-slate-800">
                    <Laptop className="w-4 h-4 text-slate-500" />
                    <span>Thiết bị công nhân</span>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                    <div>MAC: <span className="font-mono font-bold text-slate-900">{currentJob.workerMac || currentJob.sessionTracker?.deviceMac || 'Chưa ghi nhận'}</span></div>
                    <div className="truncate">OS: {currentJob.sessionTracker?.deviceInfo || 'Chưa ghi nhận'}</div>
                  </div>
                </div>
              )}
            </aside>

            <main className="min-h-0 flex-1 overflow-y-auto bg-slate-100">
              <div className="mx-auto max-w-6xl space-y-4 p-4 lg:p-5">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_420px]">
                  <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">
                              {activeStep.stepId}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${getStepStatusTone(activeStep.status)}`}>
                              Worker: {activeStep.status}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${getModerationTone(activeModerationStatus)}`}>
                              {activeModerationStatus === 'APPROVED' ? 'Admin đã duyệt' : activeModerationStatus === 'REJECTED' ? 'Admin từ chối' : 'Chờ admin duyệt'}
                            </span>
                          </div>
                          <h3 className="mt-2 text-base font-bold text-slate-950">{activeStepDef?.title || `Bước ${activeStep.stepId}`}</h3>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {activeStepDef?.passCriteria || 'Đạt tiêu chuẩn nhà máy'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => goToStep(-1)}
                            disabled={activeStepIndex <= 0}
                            className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
                            title="Bước trước"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => goToStep(1)}
                            disabled={activeStepIndex >= currentJob.stepResults.length - 1}
                            className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center justify-center"
                            title="Bước sau"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 font-bold text-slate-700">
                          <Images className="w-4 h-4 text-slate-500" />
                          <span>Ảnh bằng chứng ({activePhotoCount}/{activeRequiredPhotoCount})</span>
                        </div>
                        {activePhotoCount < activeRequiredPhotoCount && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Thiếu ảnh
                          </span>
                        )}
                      </div>

                      {activePhotos.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {activePhotos.map((photo, index) => (
                            <button
                              key={`${photo.url}-${index}`}
                              type="button"
                              onClick={() => setLightboxImageUrl(photo.url)}
                              className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-left shadow-sm"
                            >
                              <div className="relative aspect-[4/3] overflow-hidden">
                                <img
                                  src={photo.url}
                                  alt={photo.slotName}
                                  className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
                                    <Maximize2 className="w-4 h-4" />
                                    Phóng to
                                  </span>
                                </div>
                              </div>
                              <div className="border-t border-white/10 bg-slate-900 px-3 py-2 text-[11px] font-semibold text-slate-200 truncate">
                                {photo.slotName}
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-semibold text-slate-400">
                          Chưa có ảnh từ công nhân
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-950">Bằng chứng & ghi chú</h3>
                          <p className="mt-0.5 text-[11px] font-medium text-slate-500">Tất cả dữ liệu cần duyệt của bước hiện tại</p>
                        </div>
                        {activeStepDef?.sampleSize && (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800">
                            Sample: {activeStepDef.sampleSize}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      {activePhotoSlots.length > 0 && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase text-slate-500">
                            <Camera className="w-3.5 h-3.5" />
                            Quy cách chụp
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {activePhotoSlots.map((slot, index) => (
                              <span key={`${slot}-${index}`} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700">
                                {slot}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeStep.textValue && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                          <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-blue-900">
                            <FileText className="w-3.5 h-3.5 text-blue-600" />
                            Dữ liệu nhập từ công nhân
                          </div>
                          <div className="rounded-md border border-blue-200 bg-white p-2 font-mono text-xs font-bold text-blue-950">
                            {activeStep.textValue}
                          </div>
                        </div>
                      )}

                      {activeStep.aiDetectedValue && (
                        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-[11px] font-bold text-violet-900">
                              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                              AI Gemini Detection
                            </span>
                            {activeStep.aiMatchStatus && (
                              <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${activeStep.aiMatchStatus === 'MATCH' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {activeStep.aiMatchStatus === 'MATCH' ? 'Khớp' : 'Cần kiểm tra'}
                              </span>
                            )}
                          </div>
                          <div className="rounded-md border border-violet-200 bg-white p-2 font-mono text-xs font-bold text-violet-950">
                            {activeStep.aiDetectedValue}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-slate-200 bg-white">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                          <span className="flex items-center gap-2 text-[11px] font-bold uppercase text-slate-500">
                            <MessageSquareText className="w-3.5 h-3.5" />
                            Ghi chú công nhân
                          </span>
                          {editingStepId !== activeStep.stepId && (
                            <button
                              type="button"
                              onClick={() => handleStartEditNote(activeStep.stepId, activeStep.note)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-900"
                            >
                              <Edit2 className="w-3 h-3" />
                              Sửa
                            </button>
                          )}
                        </div>

                        {editingStepId === activeStep.stepId ? (
                          <div className="space-y-2 p-3">
                            <textarea
                              value={editingNoteValue}
                              onChange={(e) => setEditingNoteValue(e.target.value)}
                              rows={4}
                              className="w-full rounded-lg border border-blue-300 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingStepId(null)}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Hủy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditNote(activeStep.stepId)}
                                className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Lưu
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 text-xs leading-5 text-slate-800">
                            {activeStep.note || <span className="italic text-slate-400">Chưa có ghi chú</span>}
                            {activeStep.editedByAdmin && (
                              <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-blue-700">
                                <History className="w-3 h-3" />
                                Đã hiệu chỉnh bởi QC Admin
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-bold text-slate-800">
                            <ShieldCheck className="w-4 h-4 text-blue-700" />
                            Ghi chú kiểm duyệt
                          </span>
                          {activeStep.moderatedAt && (
                            <span className="text-[10px] font-semibold text-slate-500">{formatDateTime(activeStep.moderatedAt)}</span>
                          )}
                        </div>
                        <textarea
                          value={reviewNoteByStep[activeStep.stepId] || ''}
                          onChange={(e) => setReviewNoteByStep(prev => ({ ...prev, [activeStep.stepId]: e.target.value }))}
                          placeholder="Lý do duyệt hoặc yêu cầu chụp lại..."
                          rows={4}
                          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </section>
                </div>

                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div>
                      <label className="mb-2 block text-xs font-bold text-slate-900">
                        Ghi chú chỉ đạo của trưởng phòng QC Admin
                      </label>
                      <textarea
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Nhập chỉ đạo xử lý, yêu cầu tổ trưởng chuyền hoặc ghi chú xuất kèm báo cáo Word..."
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveAdminNotes}
                      disabled={isSavingAdminNotes}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {isSavingAdminNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Lưu ghi chú lô
                    </button>
                  </div>
                </section>
              </div>
            </main>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>Bước <strong className="text-slate-900">{activeStepIndex + 1}</strong>/{currentJob.stepResults.length}</span>
                <span>Xuất Word: <strong className="text-slate-900">{currentJob.exportCount || 0}</strong> lần</span>
                <span>Cập nhật: {formatDateTime(currentJob.updatedAt)}</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => handleModerateStep(activeStep.stepId, 'REJECTED')}
                  disabled={reviewingStepId === activeStep.stepId}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-red-500 disabled:opacity-60"
                >
                  {reviewingStepId === activeStep.stepId ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                  Từ chối bước này
                </button>
                <button
                  type="button"
                  onClick={() => handleModerateStep(activeStep.stepId, 'APPROVED')}
                  disabled={reviewingStepId === activeStep.stepId}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-60"
                >
                  {reviewingStepId === activeStep.stepId ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Duyệt bước này
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {lightboxImageUrl && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImageUrl(null)}
        >
          <div className="relative max-w-6xl max-h-[92vh] overflow-hidden rounded-lg bg-black p-2 shadow-2xl">
            <button
              onClick={() => setLightboxImageUrl(null)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-white transition-colors hover:bg-slate-800"
              title="Đóng ảnh"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxImageUrl}
              alt="Ảnh QC phóng to"
              className="mx-auto max-h-[88vh] max-w-full rounded object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
};
