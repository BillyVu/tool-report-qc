import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Upload, 
  Sparkles, 
  AlertTriangle, 
  FileCheck2, 
  Send, 
  ShieldAlert, 
  ChevronRight, 
  FileText, 
  ArrowLeft,
  Camera,
  Check,
  RefreshCw,
  Info,
  Download,
  Laptop,
  UserCheck,
  ShieldCheck,
  Save,
  Plus,
  Trash2
} from 'lucide-react';
import { CaptureFrame, InspectionJob, ChecklistTemplate, StepResult, PhotoSlotData, PhotoType, DefectItem, PackagingInfoData, OtherInfoData } from '../types/qc';
import { workerSessionApi } from '../services/workerSessionApi';
import { getPhotoTypeInfo } from '../constants/photoTypes';
import { generateDocxReport } from '../services/docxExportService';
import { getDeviceMacAddress, getDeviceInfo } from '../utils/deviceTracker';
import { usePhotoTypes } from '../hooks/usePhotoTypes';
import { PhotoCaptureModal } from '../components/worker/PhotoCaptureModal';
import { VeroBrand } from '../components/branding/VeroBrand';
import { overallSummary, stepPhotoProgress, stepRailStatus, stepRailStatusLabel } from '../utils/portalSummary';

type PhotoSource = 'CAMERA' | 'UPLOAD';

interface CaptureTarget {
  stepId: string;
  slotIndex: number;
  slotLabel: string;
  source: PhotoSource;
  captureFrame: CaptureFrame;
  aspectRatio?: number;
  selectedFile?: File;
  error?: string;
}

type SectionPhotoField = 'cartonPhotos' | 'devicePhotos' | 'barcodePhotos';

interface SectionCaptureTarget {
  source: PhotoSource;
  section: 'DEFECT' | 'PACKAGING' | 'OTHER';
  slotLabel: string;
  defectId?: string;
  field?: SectionPhotoField;
  selectedFile?: File;
}

function sectionUploadKey(target: Pick<SectionCaptureTarget, 'section' | 'defectId' | 'field' | 'slotLabel'>): string {
  return target.section === 'DEFECT' ? `DEFECT:${target.defectId}` : `${target.section}:${target.field || ''}`;
}

type SlotUploadStatus = 'UPLOADING' | 'SAVED' | 'ACTION_REQUIRED' | 'ERROR';

interface SlotUploadState {
  status: SlotUploadStatus;
  message: string;
}

interface WorkerSessionRealtimeEvent {
  type: 'READY' | 'PHOTO_RECEIVED' | 'PHOTO_SAVED' | 'ANALYSIS_QUEUED' | 'ANALYSIS_COMPLETED' | 'ANALYSIS_FAILED' | 'PHOTO_QUALITY_RESULT';
  photoId?: string;
  stepId?: string;
  slotIndex?: number;
  photoUrl?: string;
  manualOverride?: boolean;
  aiQualityStatus?: 'APPROVED' | 'REJECTED' | 'UNAVAILABLE' | 'PENDING';
  status?: 'APPROVED' | 'REJECTED' | 'UNAVAILABLE';
  manualOverrideAvailable?: boolean;
  summaryText?: string;
  resultJson?: Record<string, unknown>;
  message?: string;
}

function applyUploadedPhoto(
  results: StepResult[],
  stepId: string,
  slotIndex: number,
  photoUrl: string,
  manualOverride?: boolean,
  aiQualityStatus?: 'APPROVED' | 'REJECTED' | 'UNAVAILABLE' | 'PENDING' | 'NOT_CHECKED',
) {
  return results.map((stepResult) => {
    if (stepResult.stepId !== stepId) return stepResult;
    const updatedSlots = (stepResult.photoSlotsData || []).map((slot) => (
      slot.slotIndex === slotIndex
        ? { ...slot, photoUrl, manualOverride, aiQualityStatus }
        : slot
    ));
    return {
      ...stepResult,
      photoUrl: updatedSlots.find((slot) => slot.photoUrl)?.photoUrl || photoUrl,
      photoSlotsData: updatedSlots,
    };
  });
}

function applyAnalysisSummary(
  results: StepResult[],
  stepId: string,
  slotIndex: number,
  summaryText: string,
  resultJson?: Record<string, unknown>,
  aiDetectStatus: 'SUCCESS' | 'WARNING' | 'FAILED' = 'SUCCESS',
) {
  return results.map((stepResult) => {
    if (stepResult.stepId !== stepId) return stepResult;
    const updatedSlots = (stepResult.photoSlotsData || []).map((slot) => (
      slot.slotIndex === slotIndex
        ? { ...slot, aiDetectedText: summaryText, aiResultJson: resultJson }
        : slot
    ));
    return {
      ...stepResult,
      photoSlotsData: updatedSlots,
      aiDetectedValue: summaryText,
      aiResultJson: resultJson,
      aiDetectStatus,
    };
  });
}

function SectionPhotoPicker({ uploading, onCamera, onFile }: { uploading: boolean; slotLabel: string; onCamera: () => void; onFile: (file: File) => void }) {
  if (uploading) {
    return (
      <div className="w-16 h-16 rounded-lg border border-slate-700 flex items-center justify-center">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
      </div>
    );
  }
  return (
    <div className="flex gap-1.5 items-center">
      <button
        type="button"
        onClick={onCamera}
        className="w-16 h-16 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 text-slate-400 hover:text-white bg-slate-950 transition-colors"
        title="Chụp ảnh"
      >
        <Camera className="w-4 h-4" />
        <span className="text-[9px] mt-1 font-bold">Chụp</span>
      </button>
      <label
        className="w-16 h-16 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 text-slate-400 hover:text-white bg-slate-950 transition-colors"
        title="Tải ảnh"
      >
        <Upload className="w-4 h-4" />
        <span className="text-[9px] mt-1 font-bold">Tải ảnh</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.currentTarget.value = '';
          }}
        />
      </label>
    </div>
  );
}

interface WorkerSessionPortalViewProps {
  jobId: string;
  token: string;
  onExitSession: () => void;
}

export const WorkerSessionPortalView: React.FC<WorkerSessionPortalViewProps> = ({
  jobId,
  token,
  onExitSession
}) => {
  const photoTypes = usePhotoTypes();
  const [sessionData, setSessionData] = useState<{
    isValid: boolean;
    isExpired: boolean;
    job?: InspectionJob;
    template?: ChecklistTemplate;
    hoursRemaining?: number;
    minutesRemaining?: number;
    expiresAtFormatted?: string;
    botName?: string;
  } | null>(null);
  const [sessionError, setSessionError] = useState('');

  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [workerName, setWorkerName] = useState('');
  
  // Check-In Form & MAC Tracking State
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [workerNameInput, setWorkerNameInput] = useState('');
  const [workerIdInput, setWorkerIdInput] = useState('');
  const [lineInput, setLineInput] = useState('');
  const [shiftInput, setShiftInput] = useState('');
  const [deviceMac, setDeviceMac] = useState('');
  const [deviceInfo, setDeviceInfo] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedJob, setSubmittedJob] = useState<InspectionJob | null>(null);
  const [aiAnalyzingStepId, setAiAnalyzingStepId] = useState<string | null>(null);
  const [captureTarget, setCaptureTarget] = useState<CaptureTarget | null>(null);
  const [manualOverride, setManualOverride] = useState<{ target: CaptureTarget; file: File; sharpnessScore: number; message: string } | null>(null);
  const [uploadingSlotKey, setUploadingSlotKey] = useState<string | null>(null);
  const [slotUploadStates, setSlotUploadStates] = useState<Record<string, SlotUploadState>>({});
  const [sectionCaptureTarget, setSectionCaptureTarget] = useState<SectionCaptureTarget | null>(null);
  const [sectionUploadingKey, setSectionUploadingKey] = useState<string | null>(null);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [workerNotice, setWorkerNotice] = useState('');
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const botName = sessionData?.botName || 'Vero';

  const pendingOverrideFiles = useRef<Record<string, { target: CaptureTarget; file: File; sharpnessScore: number; photoId?: string }>>({});

  // New Sections State
  const [activeWorkerTab, setActiveWorkerTab] = useState<'STEPS' | 'DEFECTS' | 'PACKAGING' | 'OTHER'>('STEPS');
  const [defectsFinding, setDefectsFinding] = useState<DefectItem[]>([]);
  const [packagingInfo, setPackagingInfo] = useState<PackagingInfoData>({});
  const [otherInfo, setOtherInfo] = useState<OtherInfoData>({});

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        const data = await workerSessionApi.getSession(jobId, token);
        if (!isMounted) return;
        setSessionData(data);

        if (data.isValid && !data.isExpired && data.job && data.template) {
      const autoMac = data.job.workerMac || getDeviceMacAddress();
      const autoDev = data.job.sessionTracker?.deviceInfo || getDeviceInfo();

      setDeviceMac(autoMac);
      setDeviceInfo(autoDev);
      setWorkerNameInput(data.job.workerName || '');
      setWorkerIdInput(data.job.workerId || '');
      setLineInput(data.job.line || 'Chuyền 01');
      setShiftInput(data.job.shift || 'Ca Sáng (06:00 - 14:00)');

      if (data.checkedInAt || data.job.sessionTracker?.workerName) {
        setIsCheckedIn(true);
        setWorkerName(data.job.sessionTracker?.workerName || data.job.workerName || '');
      } else {
        setWorkerName(data.job.workerName || '');
      }

      // Initialize step results based on template steps or existing job results
      const initialResults: StepResult[] = data.template.steps.map(step => {
        const existing = data.job?.stepResults.find(r => r.stepId === step.stepId);
        
        // Initialize photo slots data
        const slotsData: PhotoSlotData[] = (step.photoSlotConfigs || []).map(cfg => ({
          slotIndex: cfg.slotIndex,
          label: cfg.label,
          photoType: cfg.photoType,
          captureFrame: cfg.captureFrame || 'RECTANGLE',
          aspectRatio: cfg.aspectRatio,
          photoUrl: undefined
        }));

        // If no photoSlotConfigs, fallback to string photoSlots
        if (slotsData.length === 0 && step.photoSlots) {
          step.photoSlots.forEach((slotLabel, idx) => {
            slotsData.push({
              slotIndex: idx + 1,
              label: slotLabel,
              photoType: 'GENERAL_OTHER',
              captureFrame: 'RECTANGLE'
            });
          });
        }

        return {
          stepId: step.stepId,
          status: existing?.status || 'PENDING',
          note: existing?.note || '',
          photoUrl: existing?.photoUrl || undefined,
          photoSlotsData: existing?.photoSlotsData || slotsData,
          textValue: existing?.textValue || '',
          aiDetectedValue: existing?.aiDetectedValue || undefined,
          aiDetectStatus: existing?.aiDetectStatus || undefined,
          timestamp: existing?.timestamp || undefined
        };
      });

      setStepResults(initialResults);

      const initialDefects = (data.job?.defectsFindingData && data.job.defectsFindingData.length > 0)
        ? data.job.defectsFindingData
        : (data.job?.templateSnapshot?.defectsFindingData && data.job.templateSnapshot.defectsFindingData.length > 0)
        ? data.job.templateSnapshot.defectsFindingData
        : (data.template?.defectsFindingData || []);
      setDefectsFinding(initialDefects);

      const initialPackaging = (data.job?.packagingInfoData && Object.keys(data.job.packagingInfoData).length > 0)
        ? data.job.packagingInfoData
        : (data.job?.templateSnapshot?.packagingInfoData && Object.keys(data.job.templateSnapshot.packagingInfoData).length > 0)
        ? data.job.templateSnapshot.packagingInfoData
        : (data.template?.packagingInfoData || {});
      setPackagingInfo(initialPackaging);

      const initialOther = (data.job?.otherInfoData && Object.keys(data.job.otherInfoData).length > 0)
        ? data.job.otherInfoData
        : (data.job?.templateSnapshot?.otherInfoData && Object.keys(data.job.templateSnapshot.otherInfoData).length > 0)
        ? data.job.templateSnapshot.otherInfoData
        : (data.template?.otherInfoData || {});
      setOtherInfo(initialOther);
    }
  } catch (error) {
        console.error('Failed to load worker session:', error);
        if (isMounted) {
          setSessionError(error instanceof Error ? error.message : 'Không thể tải phiên kiểm định.');
          setSessionData({ isValid: false, isExpired: false });
        }
      }
    };

    loadSession();
    return () => {
      isMounted = false;
    };
  }, [jobId, token]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/worker-sessions/${encodeURIComponent(jobId)}/events?token=${encodeURIComponent(token)}`);

    socket.onopen = () => setIsRealtimeConnected(true);
    socket.onclose = () => setIsRealtimeConnected(false);
    socket.onerror = () => setIsRealtimeConnected(false);
    socket.onmessage = (message) => {
      let event: WorkerSessionRealtimeEvent;
      try {
        event = JSON.parse(String(message.data)) as WorkerSessionRealtimeEvent;
      } catch {
        return;
      }
      if (event.type === 'PHOTO_RECEIVED' && event.stepId && event.slotIndex) {
        const slotKey = `${event.stepId}:${event.slotIndex}`;
        setSlotUploadStates((previous) => ({
          ...previous,
          [slotKey]: { status: 'UPLOADING', message: event.message || `Ảnh đã đến server. ${botName} đang kiểm tra chất lượng...` },
        }));
        return;
      }
      if (event.type === 'ANALYSIS_QUEUED' && event.stepId && event.slotIndex) {
        setWorkerNotice(event.message || `${botName} đã nhận tác vụ phân tích ảnh.`);
        return;
      }
      if (event.type === 'ANALYSIS_COMPLETED' && event.stepId && event.slotIndex && event.summaryText) {
        setStepResults((previous) => applyAnalysisSummary(previous, event.stepId!, event.slotIndex!, event.summaryText!, event.resultJson, 'SUCCESS'));
        setAiAnalyzingStepId(null);
        setWorkerNotice(event.message || `${botName} đã phân tích xong ảnh.`);
        return;
      }
      if (event.type === 'ANALYSIS_FAILED' && event.stepId && event.slotIndex) {
        setStepResults((previous) => applyAnalysisSummary(previous, event.stepId!, event.slotIndex!, event.message || `${botName} chưa thể phân tích ảnh này.`, undefined, 'FAILED'));
        setAiAnalyzingStepId(null);
        setWorkerNotice(event.message || `${botName} chưa thể phân tích ảnh này.`);
        return;
      }
      if (event.type === 'PHOTO_QUALITY_RESULT' && event.stepId && event.slotIndex && event.photoUrl && event.status) {
        const slotKey = `${event.stepId}:${event.slotIndex}`;
        const pending = pendingOverrideFiles.current[slotKey];
        if (pending?.photoId && event.photoId && pending.photoId !== event.photoId) return;
        if (event.status === 'UNAVAILABLE' && event.manualOverrideAvailable && pending) {
          setSlotUploadStates((previous) => ({
            ...previous,
            [slotKey]: { status: 'ACTION_REQUIRED', message: 'Cần xác nhận tải ảnh thủ công.' },
          }));
          setManualOverride({
            target: pending.target,
            file: pending.file,
            sharpnessScore: pending.sharpnessScore,
            message: event.message || `${botName} chưa thể kiểm tra ảnh.`,
          });
          return;
        }
        if (event.status === 'REJECTED') {
          setStepResults((previous) => applyUploadedPhoto(previous, event.stepId!, event.slotIndex!, event.photoUrl!, false, 'REJECTED'));
          setSlotUploadStates((previous) => ({
            ...previous,
            [slotKey]: { status: 'ERROR', message: event.message || 'Ảnh chưa đạt yêu cầu. Hãy căn và chụp lại.' },
          }));
          setWorkerNotice(event.message || 'Ảnh chưa đạt yêu cầu. Hãy chụp lại.');
          return;
        }
        setStepResults((previous) => applyUploadedPhoto(previous, event.stepId!, event.slotIndex!, event.photoUrl!, false, event.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'APPROVED'));
        setSlotUploadStates((previous) => ({
          ...previous,
          [slotKey]: { status: 'SAVED', message: event.message || 'Ảnh đạt yêu cầu.' },
        }));
        return;
      }
      if (event.type !== 'PHOTO_SAVED' || !event.stepId || !event.slotIndex || !event.photoUrl) return;

      const slotKey = `${event.stepId}:${event.slotIndex}`;
      setStepResults((previous) => applyUploadedPhoto(previous, event.stepId!, event.slotIndex!, event.photoUrl!, event.manualOverride, event.aiQualityStatus));
      setSlotUploadStates((previous) => ({
        ...previous,
        [slotKey]: { status: 'SAVED', message: event.message || 'Ảnh đã được lưu trên server.' },
      }));
      setWorkerNotice(event.message || 'Ảnh đã được lưu trên server.');
    };

    return () => socket.close();
  }, [jobId, token]);

  // Scroll-spy: highlight the step card currently in view inside the STEPS rail.
  useEffect(() => {
    if (activeWorkerTab !== 'STEPS') return;
    const stepElements = Array.from(document.querySelectorAll<HTMLElement>('[data-step-card]'));
    if (!stepElements.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveStepId(visible[0].target.getAttribute('data-step-id'));
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );
    stepElements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [activeWorkerTab]);

  const handleConfirmCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerNameInput.trim()) {
      alert('Vui lòng nhập họ và tên công nhân mở link.');
      return;
    }

    const finalMac = deviceMac.trim() || getDeviceMacAddress();
    const finalDev = deviceInfo.trim() || getDeviceInfo();

    setIsCheckingIn(true);
    try {
      await workerSessionApi.checkIn(jobId, token, {
        workerName: workerNameInput.trim(),
        workerId: workerIdInput.trim() || undefined,
        line: lineInput.trim() || undefined,
        shift: shiftInput.trim() || undefined,
        deviceInfo: `${finalDev} | Device ID: ${finalMac}`
      });

      setDeviceMac(finalMac);
      setDeviceInfo(finalDev);
      setWorkerName(workerNameInput.trim());
      setIsCheckedIn(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể check-in phiên kiểm định.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Loading state
  if (!sessionData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center text-slate-700 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="text-sm font-semibold">Đang xác thực URL Session...</p>
        </div>
      </div>
    );
  }

  // Case 1: Invalid Session
  if (!sessionData.isValid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center space-y-5 animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">URL Không Hợp Lệ</h2>
            <p className="text-xs text-slate-500 mt-2">
              {sessionError || 'Liên kết phiên kiểm tra không tồn tại hoặc đã bị hủy bởi QC Admin.'}
            </p>
          </div>
          <button
            onClick={onExitSession}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay Lại Dashboard QC Admin</span>
          </button>
        </div>
      </div>
    );
  }

  // Case 2: Expired Session (> 24 hours)
  if (sessionData.isExpired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-red-200 animate-fadeIn">
          {/* Header */}
          <div className="p-6 bg-red-600 text-white text-center space-y-2">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 text-white animate-pulse" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">URL Phiên Làm Việc Đã Hết Hạn</h2>
            <p className="text-xs text-red-100 font-medium">Giới hạn thời gian session: 24 giờ</p>
          </div>

          {/* Details */}
          <div className="p-6 space-y-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-900">
              <div className="flex items-center gap-2 font-bold text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Chi Tiết Hạn Phiên Session:</span>
              </div>
              <p>Lệnh kiểm tra: <strong>{sessionData.job?.batchNumber}</strong> ({sessionData.job?.productName})</p>
              <p>Thời điểm hết hạn: <strong>{sessionData.expiresAtFormatted}</strong></p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed text-center">
              Để bảo mật và đảm bảo tính chính xác theo quy trình nhà máy, liên kết phiên làm việc này đã tự động vô hiệu hóa sau <strong>24 giờ</strong>. Vui lòng báo cho Tổ Trưởng / QC Admin để gia hạn link hiện có.
            </p>

            <button
              onClick={onExitSession}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Trở về trang chủ Vero QC</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { job, template, hoursRemaining, minutesRemaining } = sessionData;
  if (!job || !template) return null;

  // Canvas image compression helper (compresses 15MB phone camera photos down to ~150KB to prevent 413 Payload Too Large)
  const compressImageFile = (file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.75): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Không load được ảnh'));
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            if (width / height > maxWidth / maxHeight) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // Compresses a photo client-side to a compact JPEG (~150KB instead of 15MB) so
  // weak-signal links transfer far less data. Returns the compressed DataURL.
  const uploadPhotoReliably = async (file: File, _section?: string): Promise<string> => {
    const compressedDataUrl = await compressImageFile(file, 1200, 1200, 0.75).catch(() => null);
    if (compressedDataUrl) return compressedDataUrl;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  };

  const compressToFile = async (file: File): Promise<File> => {
    const compressedDataUrl = await compressImageFile(file, 1200, 1200, 0.75).catch(() => null);
    if (!compressedDataUrl) return file;
    const blob = await (await fetch(compressedDataUrl)).blob();
    return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
  };

  // Handles updating photo for a specific slot inside a step
  const handlePhotoUploadForSlot = async (
    stepId: string, 
    slotIndex: number, 
    file: File,
    source: PhotoSource,
    captureFrame: CaptureFrame,
    sharpnessScore: number,
    manualOverride = false,
    aspectRatio?: number,
  ) => {
    const slotKey = `${stepId}:${slotIndex}`;
    setUploadingSlotKey(slotKey);
    setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'UPLOADING', message: 'Đang gửi ảnh lên server...' } }));
    const step = template.steps.find(s => s.stepId === stepId);
    const slotLabel = Array.isArray(step?.photoSlotConfigs)
      ? (step.photoSlotConfigs.find((cfg) => Number(cfg.slotIndex) === slotIndex)?.label || step.title || 'Ảnh minh chứng')
      : step?.title || 'Ảnh minh chứng';
    const target: CaptureTarget = { stepId, slotIndex, slotLabel, source, captureFrame, aspectRatio };

    const fileToUpload = await compressToFile(file);
    const previewDataUrl = await uploadPhotoReliably(fileToUpload).catch(() => null);
    if (previewDataUrl) {
      setStepResults(prev => prev.map(sr => {
        if (sr.stepId !== stepId) return sr;
        const updatedSlots = (sr.photoSlotsData || []).map(s => (s.slotIndex === slotIndex ? { ...s, photoUrl: previewDataUrl } : s));
        return { ...sr, photoSlotsData: updatedSlots };
      }));
    }

    try {
      const uploadForm = new FormData();
      uploadForm.set('photo', fileToUpload);
      uploadForm.set('stepId', stepId);
      uploadForm.set('slotIndex', String(slotIndex));
      uploadForm.set('source', source);
      uploadForm.set('captureFrame', captureFrame);
      uploadForm.set('sharpnessScore', String(sharpnessScore));
      uploadForm.set('manualOverride', String(manualOverride));
      if (aspectRatio !== undefined && Number.isFinite(aspectRatio) && aspectRatio > 0) {
        uploadForm.set('aspectRatio', String(aspectRatio));
      }

      const uploadResponse = await fetch(`/api/worker-sessions/${encodeURIComponent(jobId)}/photos?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body: uploadForm
      });
      const responseBody = await uploadResponse.json().catch(() => ({})) as { id?: string; photoUrl?: string; error?: string; qualityStatus?: 'APPROVED' | 'UNAVAILABLE' | 'REJECTED' | 'PENDING'; manualOverride?: boolean };

      if (!uploadResponse.ok) {
        setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'ERROR', message: responseBody.error || 'Ảnh chưa đạt yêu cầu. Hãy căn và chụp lại.' } }));
        setCaptureTarget({ ...target, selectedFile: fileToUpload, error: responseBody.error || 'Ảnh chưa đạt yêu cầu.' });
        return;
      }
      if (!responseBody.id || !responseBody.photoUrl) throw new Error('Hệ thống không trả về ảnh đã lưu.');

      pendingOverrideFiles.current[slotKey] = { target, file: fileToUpload, sharpnessScore, photoId: responseBody.id };

      setStepResults((previous) => applyUploadedPhoto(previous, stepId, slotIndex, responseBody.photoUrl, responseBody.manualOverride, responseBody.qualityStatus));
      const isPendingQuality = responseBody.qualityStatus === 'PENDING';
      setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'SAVED', message: isPendingQuality ? 'Ảnh đã lưu. Đang kiểm tra chất lượng...' : 'Ảnh đã được lưu trên server.' } }));
      setWorkerNotice(isPendingQuality ? 'Ảnh đã lưu. Vero đang kiểm tra chất lượng...' : 'Ảnh đã được lưu trên server.');

      // Vero runs only in the server-side queue so worker devices cannot exhaust quota.
      if (step?.enableAiDetection) {
        setAiAnalyzingStepId(stepId);
        try {
          const analysisResponse = await fetch(`/api/worker-sessions/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(responseBody.id)}/analyze?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });
          if (!analysisResponse.ok) throw new Error(`Không thể đưa tác vụ ${botName} vào hàng đợi.`);
          const analysis = await analysisResponse.json() as { status: string; summaryText?: string; result_json?: Record<string, unknown> };

          setStepResults(prev => prev.map(sr => {
            if (sr.stepId !== stepId) return sr;

            const updatedSlots = (sr.photoSlotsData || []).map(s => {
              if (s.slotIndex === slotIndex) {
                return { ...s, aiDetectedText: analysis.summaryText || `Đang chờ ${botName} xử lý`, aiResultJson: analysis.result_json };
              }
              return s;
            });

            return {
              ...sr,
              photoSlotsData: updatedSlots,
              aiDetectedValue: analysis.summaryText || `${botName} đang xếp hàng xử lý; có thể tiếp tục bước kiểm tra khác.`,
              aiResultJson: analysis.result_json,
              aiDetectStatus: analysis.status === 'COMPLETED' ? 'SUCCESS' : 'WARNING',
              textValue: sr.textValue || ''
            };
          }));
        } catch (err) {
          console.error('Vero detection error:', err);
        } finally {
          setAiAnalyzingStepId(null);
        }
      }
    } catch (error) {
      setSlotUploadStates((previous) => ({
        ...previous,
        [slotKey]: { status: 'ERROR', message: error instanceof Error ? error.message : 'Không thể gửi ảnh. Hãy thử lại.' },
      }));
      throw error;
    } finally {
      setUploadingSlotKey(null);
    }
  };

  const handleCapturedPhoto = async (file: File, sharpnessScore: number) => {
    const target = captureTarget;
    if (!target) return;
    setCaptureTarget(null);
    await handlePhotoUploadForSlot(target.stepId, target.slotIndex, file, target.source, target.captureFrame, sharpnessScore, false, target.aspectRatio);
  };

  // Handles Step Status change (PASS / FAIL)
  const handleStepStatusChange = (stepId: string, status: 'PASS' | 'FAIL') => {
    setStepResults(prev => prev.map(sr => sr.stepId === stepId ? { ...sr, status } : sr));
  };

  // Handles Note or Text change
  const handleStepNoteChange = (stepId: string, note: string) => {
    setStepResults(prev => prev.map(sr => sr.stepId === stepId ? { ...sr, note } : sr));
  };

  const handleStepTextChange = (stepId: string, textValue: string) => {
    setStepResults(prev => prev.map(sr => sr.stepId === stepId ? { ...sr, textValue } : sr));
  };

  // Defects Finding (A-1) Handlers
  const handleAddWorkerDefect = () => {
    const newDefect: DefectItem = {
      id: `DEF_${Date.now()}`,
      description: '',
      defectType: 'Minor',
      count: 1,
      photos: []
    };
    setDefectsFinding(prev => [...prev, newDefect]);
  };

  const handleUpdateWorkerDefect = (id: string, field: keyof DefectItem, val: any) => {
    setDefectsFinding(prev => prev.map(d => d.id === id ? { ...d, [field]: val } : d));
  };

  const handleRemoveWorkerDefect = (id: string) => {
    setDefectsFinding(prev => prev.filter(d => d.id !== id));
  };

  const openSectionPhotoCapture = (target: Omit<SectionCaptureTarget, 'source'>) => {
    setSectionCaptureTarget({ ...target, source: 'CAMERA' });
  };

  const handleSectionPhotoCaptured = async (file: File, _sharpnessScore: number, target: SectionCaptureTarget) => {
    const uploadKey = sectionUploadKey(target);
    setSectionUploadingKey(uploadKey);
    setSectionCaptureTarget(null);
    try {
      const fileToUpload = await compressToFile(file);
      const photoUrl = await workerSessionApi.uploadSectionPhoto(jobId, token, fileToUpload);
      if (target.section === 'DEFECT' && target.defectId) {
        setDefectsFinding(prev => prev.map(d => {
          if (d.id === target.defectId) {
            return { ...d, photos: [...(d.photos || []), photoUrl] };
          }
          return d;
        }));
      } else if (target.section === 'PACKAGING' && target.field) {
        setPackagingInfo(prev => ({
          ...prev,
          [target.field!]: [...(prev[target.field!] || []), photoUrl]
        }));
      } else if (target.section === 'OTHER') {
        setOtherInfo(prev => ({
          ...prev,
          photos: [...(prev.photos || []), photoUrl]
        }));
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể tải ảnh lên hệ thống.');
    } finally {
      setSectionUploadingKey(null);
    }
  };

  // Case 3: Worker Check-In Form (Prompt for Worker Name & Auto-detect MAC Address)
  if (!isCheckedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-fadeIn">
          {/* Header */}
          <div className="p-6 bg-white border-b border-slate-200 text-slate-900 space-y-2">
            <div className="flex items-center gap-3">
              <VeroBrand compact />
              <div>
                <h2 className="text-lg font-bold text-slate-900">Vero QC - Xác nhận kiểm định</h2>
                <p className="text-xs text-slate-500">Lệnh QC: {job?.batchNumber} ({job?.productCode})</p>
              </div>
            </div>
          </div>

          {/* Form Body */}
          <form onSubmit={handleConfirmCheckIn} className="p-6 space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Nhập thông tin công nhân thực hiện:</p>
                <p className="text-blue-800 mt-0.5">
                  Vui lòng nhập họ và tên của bạn để bắt đầu làm báo cáo kiểm định QC cho lệnh hàng này.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Họ & Tên Công Nhân <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={workerNameInput}
                  onChange={(e) => setWorkerNameInput(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn An"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isCheckingIn}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              {isCheckingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
              <span>{isCheckingIn ? 'Đang xác nhận đăng nhập...' : 'Xác Nhận Đăng Nhập & Bắt Đầu Kiểm Định'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  const workerInfoPayload = () => ({
    workerName: workerName || workerNameInput || 'Công nhân Chuyền',
    workerId: workerIdInput || undefined,
    line: lineInput || undefined,
    shift: shiftInput || undefined,
    deviceInfo: `${deviceInfo || getDeviceInfo()} | Device ID: ${deviceMac || getDeviceMacAddress()}`
  });

  const handleSaveDraftResults = async () => {
    setIsSavingDraft(true);
    try {
      await workerSessionApi.saveDraftResults(
        jobId,
        token,
        stepResults,
        workerInfoPayload(),
        {
          defectsFindingData: defectsFinding,
          packagingInfoData: packagingInfo,
          otherInfoData: otherInfo
        }
      );
      setDraftSavedAt(new Date().toLocaleString('vi-VN'));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể lưu nháp kết quả kiểm tra.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmitResults = async () => {
    if (uploadingSlotKey !== null || sectionUploadingKey !== null) {
      alert('Có ảnh đang được tải lên. Vui lòng chờ tải xong trước khi nộp báo cáo.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await workerSessionApi.submitResults(
        jobId,
        token,
        stepResults,
        workerInfoPayload(),
        {
          defectsFindingData: defectsFinding,
          packagingInfoData: packagingInfo,
          otherInfoData: otherInfo
        }
      );

      if (res.success && res.job) {
        setIsSubmitted(true);
        setSubmittedJob(res.job);
      } else {
        alert(res.message);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể nộp kết quả kiểm tra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Download Report Word
  const handleDownloadReport = () => {
    if (submittedJob) {
      generateDocxReport(submittedJob, template);
    }
  };

  // Render Post-Submission Completion Screen
  if (isSubmitted && submittedJob) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-fadeIn border border-slate-200">
          <div className="p-8 bg-emerald-600 text-white text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-black">Đã Nộp Báo Cáo QC Thành Công!</h2>
            <p className="text-xs text-emerald-100">
              Dữ liệu kiểm định đã được đồng bộ trực tiếp lên hệ thống QC Dashboard Admin.
            </p>
          </div>

          <div className="p-6 space-y-5">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Lệnh / Lô Hàng:</span>
                <span className="font-bold text-slate-800">{submittedJob.batchNumber}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Sản Phẩm:</span>
                <span className="font-bold text-slate-800">{submittedJob.productName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500 font-medium">Trạng Thái Kết Quả:</span>
                <span className={`font-bold px-2 py-0.5 rounded ${
                  submittedJob.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}>
                  {submittedJob.status === 'COMPLETED' ? 'ĐẠT tiêu chuẩn (PASS)' : 'KHÔNG ĐẠT (FAILED)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Người Thực Hiện:</span>
                <span className="font-bold text-blue-700">{submittedJob.workerName}</span>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1">
              <p className="text-xs font-bold text-emerald-800">
                ✓ Đã hoàn tất và lưu trữ an toàn
              </p>
              <p className="text-[11px] text-emerald-700">
                Báo cáo QC đã được chuyển tới Quản lý / Tổ trưởng QC. Bạn có thể an tâm đóng cửa sổ hoặc trình duyệt này.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 font-sans">
      {/* Top Session Banner */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <VeroBrand compact />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-bold text-sm text-slate-900">Vero QC - Phiên công nhân</h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isRealtimeConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                  {isRealtimeConnected ? 'Đồng bộ trực tiếp' : 'Đang kết nối đồng bộ'}
                </span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold">
                  24H LINK
                </span>
              </div>
              <p className="truncate text-xs text-slate-500">{job.productName} ({job.batchNumber})</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
            {/* Countdown Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 animate-pulse text-amber-600" />
              <span>Hạn link: {hoursRemaining}h {minutesRemaining}m</span>
            </div>

            <button
              onClick={onExitSession}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Thoát
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {workerNotice && (
          <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900" role="status">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{workerNotice}</span>
          </div>
        )}
        {/* Worker Info Card */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Công nhân thực hiện:</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="Nhập tên công nhân..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500 sm:w-64"
              />
              <button
                type="button"
                onClick={() => setIsCheckedIn(false)}
                className="self-start text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline sm:self-auto"
              >
                Đổi Tên
              </button>
            </div>
          </div>
        </div>

        {/* Live Overall Summary */}
        {(() => {
          const summary = overallSummary(template.steps, stepResults);
          return (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs font-bold text-slate-700">Tổng kết kiểm định</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Đạt: {summary.passed}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
                    Lỗi: {summary.failed}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Đang kiểm: {summary.pending}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    Tổng: {summary.total}
                  </span>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-[11px] text-slate-500">
                <span>Ảnh minh chứng:</span>
                <span className="font-bold text-slate-700">{summary.photosActual}/{summary.photosRequired}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-16">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: summary.photosRequired ? `${Math.min(100, (summary.photosActual / summary.photosRequired) * 100)}%` : '0%' }}
                  />
                </div>
              </div>
            </div>
          );
        })()}

        {/* Worker Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-slate-700 bg-slate-900 text-center rounded-xl overflow-hidden">
          {[
            { key: 'STEPS', label: `2. Các Bước QC (${template.steps.length})` },
            { key: 'DEFECTS', label: `3. Danh Sách Lỗi (${defectsFinding.length})` },
            { key: 'PACKAGING', label: '4. Đóng Gói (B)' },
            { key: 'OTHER', label: '5. Thông Tin Khác (E)' }
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveWorkerTab(tab.key as any)}
              className={`py-3 px-1 text-xs font-bold border-b-2 transition-all text-center truncate ${
                activeWorkerTab === tab.key
                  ? 'border-blue-500 text-blue-400 bg-blue-950/40'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
              title={tab.label}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab 2: STEPS */}
        {activeWorkerTab === 'STEPS' && (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* Step status rail */}
            <aside className="lg:w-60 lg:shrink-0 lg:sticky lg:top-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
                <div className="text-[11px] font-bold text-slate-700 mb-2 px-1">Các bước QC</div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
                  {template.steps.map((step, idx) => {
                    const stepRes = stepResults.find(r => r.stepId === step.stepId);
                    const status = stepRailStatus(step, stepRes);
                    const isActive = activeStepId === step.stepId;
                    const progress = stepPhotoProgress(step, stepRes);
                    const statusStyles: Record<string, string> = {
                      PASS: 'bg-emerald-500 text-white',
                      FAIL: 'bg-red-500 text-white',
                      IN_PROGRESS: 'bg-amber-400 text-slate-900',
                      NOT_STARTED: 'bg-slate-200 text-slate-500',
                    };
                    return (
                      <button
                        key={step.stepId}
                        type="button"
                        onClick={() => {
                          setActiveStepId(step.stepId);
                          document.getElementById(`step-${step.stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className={`flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors lg:w-full lg:shrink ${
                          isActive ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-slate-50'
                        }`}
                        title={`${step.title} — ${stepRailStatusLabel(status)}`}
                      >
                        <span className={`w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 ${statusStyles[status]}`}>
                          {idx + 1}
                        </span>
                        <span className="hidden min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700 sm:block">{step.title}</span>
                        <span className="text-[10px] font-bold text-slate-500 shrink-0">
                          {status === 'IN_PROGRESS' ? `${progress.actual}/${progress.required}` : stepRailStatusLabel(status)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            {/* Step cards */}
            <div className="flex-1 min-w-0 space-y-6">
          {template.steps.map((step, idx) => {
            const stepRes = stepResults.find(r => r.stepId === step.stepId);
            const isAnalyzing = aiAnalyzingStepId === step.stepId;
            const photoSlots = step.photoSlotConfigs || (step.photoSlots || []).map((lbl, i) => ({
              slotIndex: i + 1,
              label: lbl,
              photoType: 'GENERAL_OTHER' as PhotoType,
              captureFrame: 'RECTANGLE' as CaptureFrame,
              aspectRatio: undefined
            }));

            return (
              <div
                key={step.stepId}
                id={`step-${step.stepId}`}
                data-step-card
                data-step-id={step.stepId}
                className={`bg-white border rounded-2xl p-5 transition-all space-y-4 shadow-sm scroll-mt-4 ${
                  stepRes?.status === 'PASS'
                    ? 'border-emerald-300'
                    : stepRes?.status === 'FAIL'
                    ? 'border-red-300'
                    : 'border-slate-200'
                }`}
              >
                {/* Step Header */}
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{step.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Tiêu chuẩn: <span className="text-slate-700">{step.passCriteria}</span></p>
                      {(() => {
                        const progress = stepPhotoProgress(step, stepRes);
                        if (progress.required <= 0) return null;
                        const complete = progress.actual >= progress.required;
                        return (
                          <p className="mt-1.5 text-[11px] font-bold inline-flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-full border ${complete ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              Ảnh: {progress.actual}/{progress.required}
                            </span>
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Pass/Fail Status Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStepStatusChange(step.stepId, 'PASS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                        stepRes?.status === 'PASS'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ĐẠT (PASS)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStepStatusChange(step.stepId, 'FAIL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                        stepRes?.status === 'FAIL'
                          ? 'bg-red-600 text-white shadow-md shadow-red-500/20'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      <XCircle className="w-4 h-4" />
                      <span>LỖI (FAIL)</span>
                    </button>
                  </div>
                </div>

                {/* Photo Slots Section with Typed Badges */}
                {photoSlots.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span>Ảnh chụp minh chứng ({photoSlots.length} slot được yêu cầu):</span>
                      {step.enableAiDetection && (
                        <span className="text-[11px] text-violet-700 font-semibold flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Phân tích bởi {botName} theo phân loại ảnh
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {photoSlots.map((slot) => {
                        const slotData = stepRes?.photoSlotsData?.find(s => s.slotIndex === slot.slotIndex);
                        const photoTypeInfo = getPhotoTypeInfo(slot.photoType, photoTypes);
                        const slotUploadState = slotUploadStates[`${step.stepId}:${slot.slotIndex}`];

                        return (
                          <div 
                            key={slot.slotIndex} 
                            className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2"
                          >
                            {/* Slot Header Label & Type Badge */}
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-[11px] font-bold text-slate-700 truncate">
                                  Slot {slot.slotIndex}: {slot.label}
                                </span>
                              </div>

                              {/* Photo Type Badge */}
                              <div className="px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[10px] text-blue-700 font-medium inline-flex items-center gap-1">
                                <span>{photoTypeInfo.iconEmoji}</span>
                                <span className="truncate">{photoTypeInfo.label}</span>
                              </div>
                            </div>

                            {/* Photo Preview / Upload Button */}
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center">
                              {slotData?.photoUrl ? (
                                <>
                                  <img 
                                    src={slotData.photoUrl} 
                                    alt={slot.label} 
                                    className="w-full h-full object-cover" 
                                  />
                                  <div className="absolute inset-x-0 bottom-0 flex gap-1.5 bg-slate-950/80 p-1.5">
                                    <button type="button" onClick={() => setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'CAMERA', captureFrame: slot.captureFrame || 'RECTANGLE', aspectRatio: slot.aspectRatio })} className="flex min-w-0 flex-1 items-center justify-center gap-1 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-sky-100" title="Chụp ảnh mới"><Camera className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Chụp ảnh</span></button>
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-sky-100" title="Tải ảnh mới"><Upload className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Tải ảnh</span><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'UPLOAD', captureFrame: slot.captureFrame || 'RECTANGLE', aspectRatio: slot.aspectRatio, selectedFile: file }); e.currentTarget.value = ''; }} /></label>
                                  </div>
                                </>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center gap-2 p-2 text-center">
                                  {uploadingSlotKey === `${step.stepId}:${slot.slotIndex}` ? <RefreshCw className="h-5 w-5 animate-spin text-sky-600" /> : <>
                                    <button type="button" onClick={() => setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'CAMERA', captureFrame: slot.captureFrame || 'RECTANGLE', aspectRatio: slot.aspectRatio })} className="flex flex-col items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-sky-700" title="Chụp ảnh"><Camera className="w-5 h-5" /><span className="text-[11px] font-semibold">Chụp ảnh</span></button>
                                    <label className="flex cursor-pointer flex-col items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-sky-700" title="Tải ảnh"><Upload className="w-5 h-5" /><span className="text-[11px] font-semibold">Tải ảnh</span><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'UPLOAD', captureFrame: slot.captureFrame || 'RECTANGLE', aspectRatio: slot.aspectRatio, selectedFile: file }); e.currentTarget.value = ''; }} /></label>
                                  </>}
                                </div>
                              )}
                            </div>

                            {slotUploadState && (
                              <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                                slotUploadState.status === 'SAVED' ? 'text-emerald-700' :
                                slotUploadState.status === 'ERROR' ? 'text-red-700' :
                                slotUploadState.status === 'ACTION_REQUIRED' ? 'text-amber-700' : 'text-sky-700'
                              }`} role="status">
                                {slotUploadState.status === 'UPLOADING' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> :
                                  slotUploadState.status === 'SAVED' ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                                  <AlertTriangle className="h-3.5 w-3.5" />}
                                <span>{slotUploadState.message}</span>
                              </div>
                            )}

                            {/* Vero extraction result inside slot */}
                            {slotData?.aiDetectedText && (
                              <div className="p-2 rounded bg-violet-50 border border-violet-200 text-[11px] text-violet-800 space-y-0.5">
                                <span className="font-bold block text-violet-700">{botName} trích xuất:</span>
                                <p className="leading-tight text-slate-700 font-mono text-[10px] break-all">
                                  {slotData.aiDetectedText}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Vero analysis indicator */}
                {isAnalyzing && (
                  <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-800 flex items-center gap-2 animate-pulse">
                    <Sparkles className="w-4 h-4 animate-spin text-violet-600" />
                    <span>{botName} đang phân tích hình ảnh theo đúng loại ảnh quy định...</span>
                  </div>
                )}

                {/* Text Input / Note Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {step.inputType !== 'PHOTO' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        {step.textInputLabel || 'Dữ liệu văn bản / Thông số:'}
                      </label>
                      <input
                        type="text"
                        value={stepRes?.textValue || ''}
                        onChange={(e) => handleStepTextChange(step.stepId, e.target.value)}
                        placeholder={step.textInputPlaceholder || 'Nhập thông số kiểm tra...'}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  <div className="space-y-1 sm:col-span-1">
                    <label className="text-xs font-semibold text-slate-700 block">Ghi chú công nhân:</label>
                    <textarea
                      rows={3}
                      value={stepRes?.note || ''}
                      onChange={(e) => handleStepNoteChange(step.stepId, e.target.value)}
                      placeholder="Ghi chú kết quả kiểm định..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-y"
                    />
                  </div>
                </div>
              </div>
            );
          })}
            </div>
          </div>
        )}

        {/* Tab 3: DEFECTS */}
        {activeWorkerTab === 'DEFECTS' && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-3">
              <div>
                <h3 className="font-bold text-sm text-white">Mục A-1) Danh Sách Lỗi Tìm Được (AQL and Defects Finding)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Công nhân chủ động thêm các lỗi quan sát được khi kiểm định lô hàng</p>
              </div>
              <button
                type="button"
                onClick={handleAddWorkerDefect}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" /> Thêm Lỗi Tìm Được
              </button>
            </div>

            {defectsFinding.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-700 rounded-xl space-y-3">
                <p>Chưa có lỗi nào trong danh sách.</p>
                <button
                  type="button"
                  onClick={handleAddWorkerDefect}
                  className="px-4 py-2 bg-blue-600/30 border border-blue-500/50 hover:bg-blue-600/50 text-blue-300 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Bấm vào đây để thêm dòng lỗi mới
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {defectsFinding.map((def, idx) => (
                  <div key={def.id || idx} className="p-4 bg-slate-900/90 border border-slate-700 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400">Lỗi #{idx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveWorkerDefect(def.id)}
                        className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Xóa
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">Mô Tả Lỗi Phát Hiện</label>
                        <input
                          type="text"
                          value={def.description || ''}
                          onChange={(e) => handleUpdateWorkerDefect(def.id, 'description', e.target.value)}
                          placeholder="Ví dụ: Surface scratch, Trầy xước bề mặt..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">Mức Độ Lỗi</label>
                        <select
                          value={def.defectType || 'Minor'}
                          onChange={(e) => handleUpdateWorkerDefect(def.id, 'defectType', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="Minor">Minor (Lỗi Nhẹ)</option>
                          <option value="Major">Major (Lỗi Nặng)</option>
                          <option value="Critical">Critical (Nghiêm Trọng)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">Số Lượng Lỗi (Count)</label>
                        <input
                          type="number"
                          min={1}
                          value={def.count || 1}
                          onChange={(e) => handleUpdateWorkerDefect(def.id, 'count', parseInt(e.target.value) || 1)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white text-center focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Defect Evidence Photos */}
                    <div className="space-y-2 pt-1 border-t border-slate-800">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-blue-400" />
                        Ảnh Minh Chứng Lỗi
                      </label>
                      <div className="flex flex-wrap gap-3 items-center">
                        {(def.photos || []).map((item, pIdx) => {
                          const src = typeof item === 'string' ? item : item.url;
                          return <img key={pIdx} src={src} alt="Lỗi" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />;
                        })}
                        <SectionPhotoPicker
                          uploading={sectionUploadingKey === sectionUploadKey({ section: 'DEFECT', slotLabel: '', defectId: def.id })}
                          slotLabel={`Ảnh lỗi #${idx + 1}`}
                          onCamera={() => openSectionPhotoCapture({ section: 'DEFECT', slotLabel: `Ảnh lỗi #${idx + 1}`, defectId: def.id })}
                          onFile={(file) => setSectionCaptureTarget({ section: 'DEFECT', slotLabel: `Ảnh lỗi #${idx + 1}`, defectId: def.id, source: 'UPLOAD', selectedFile: file })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: PACKAGING */}
        {activeWorkerTab === 'PACKAGING' && (
          <div className="space-y-6">
            {/* B-3 Packaging Info */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg">
              <h3 className="font-bold text-sm text-blue-400 border-b border-slate-700 pb-2">B-3) Packaging Information (Thùng Carton)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kích Thước Thùng Đo Được</label>
                  <input
                    type="text"
                    value={packagingInfo.cartonMeasuredSize || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, cartonMeasuredSize: e.target.value }))}
                    placeholder="VD: 310x195x125mm"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Khối Lượng Thùng N.W (g)</label>
                  <input
                    type="text"
                    value={packagingInfo.cartonNw || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, cartonNw: e.target.value }))}
                    placeholder="VD: 2758.5g"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Khối Lượng Thùng G.W (g)</label>
                  <input
                    type="text"
                    value={packagingInfo.cartonGw || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, cartonGw: e.target.value }))}
                    placeholder="VD: 3348.7g"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-400" /> Ảnh Đo Kích Thước & Trọng Lượng Thùng
                </label>
                <div className="flex flex-wrap gap-3 items-center">
                  {(packagingInfo.cartonPhotos || []).map((item, pIdx) => {
                    const src = typeof item === 'string' ? item : item.url;
                    return <img key={pIdx} src={src} alt="Carton" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />;
                  })}
                  <SectionPhotoPicker
                    uploading={sectionUploadingKey === sectionUploadKey({ section: 'PACKAGING', slotLabel: '', field: 'cartonPhotos' })}
                    slotLabel="Ảnh thùng carton"
                    onCamera={() => openSectionPhotoCapture({ section: 'PACKAGING', slotLabel: 'Ảnh thùng carton', field: 'cartonPhotos' })}
                    onFile={(file) => setSectionCaptureTarget({ section: 'PACKAGING', slotLabel: 'Ảnh thùng carton', field: 'cartonPhotos', source: 'UPLOAD', selectedFile: file })}
                  />
                </div>
              </div>
            </div>

            {/* B-4 Device Measurement */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg">
              <h3 className="font-bold text-sm text-blue-400 border-b border-slate-700 pb-2">B-4) Device Measurement (Kích Thước Thiết Bị)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kích Thước Máy Đo Được (Thước Kẹp)</label>
                  <input
                    type="text"
                    value={packagingInfo.deviceMeasuredSize || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, deviceMeasuredSize: e.target.value }))}
                    placeholder="VD: 164.22×66.59×21.91mm"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Trọng Lượng Máy N.W (g)</label>
                  <input
                    type="text"
                    value={packagingInfo.deviceNw || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, deviceNw: e.target.value }))}
                    placeholder="VD: 201.7g"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Trọng Lượng Máy G.W (g)</label>
                  <input
                    type="text"
                    value={packagingInfo.deviceGw || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, deviceGw: e.target.value }))}
                    placeholder="VD: 281.1g"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-400" /> Ảnh Thước Kẹp / Cân Điện Tử Đo Máy
                </label>
                <div className="flex flex-wrap gap-3 items-center">
                  {(packagingInfo.devicePhotos || []).map((item, pIdx) => {
                    const src = typeof item === 'string' ? item : item.url;
                    return <img key={pIdx} src={src} alt="Device" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />;
                  })}
                  <SectionPhotoPicker
                    uploading={sectionUploadingKey === sectionUploadKey({ section: 'PACKAGING', slotLabel: '', field: 'devicePhotos' })}
                    slotLabel="Ảnh đo máy"
                    onCamera={() => openSectionPhotoCapture({ section: 'PACKAGING', slotLabel: 'Ảnh đo máy', field: 'devicePhotos' })}
                    onFile={(file) => setSectionCaptureTarget({ section: 'PACKAGING', slotLabel: 'Ảnh đo máy', field: 'devicePhotos', source: 'UPLOAD', selectedFile: file })}
                  />
                </div>
              </div>
            </div>

            {/* B-5 Barcode Check */}
            <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg">
              <h3 className="font-bold text-sm text-blue-400 border-b border-slate-700 pb-2">B-5) Barcode Check (Mã Vạch)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Số Barcode / Mã Vạch Quét Được</label>
                  <input
                    type="text"
                    value={packagingInfo.barcodeData || ''}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, barcodeData: e.target.value }))}
                    placeholder="VD: SNM000031 / 6169F"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Kết Quả Kiểm Tra Barcode</label>
                  <select
                    value={packagingInfo.barcodeResult || 'PASS'}
                    onChange={(e) => setPackagingInfo(p => ({ ...p, barcodeResult: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="PASS">PASS (Khớp mã vạch)</option>
                    <option value="FAIL">FAIL (Sai/Lỗi mã vạch)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-400" /> Ảnh Quét Mã Vạch Barcode
                </label>
                <div className="flex flex-wrap gap-3 items-center">
                  {(packagingInfo.barcodePhotos || []).map((item, pIdx) => {
                    const src = typeof item === 'string' ? item : item.url;
                    return <img key={pIdx} src={src} alt="Barcode" className="w-16 h-16 object-cover rounded-lg border border-slate-700" />;
                  })}
                  <SectionPhotoPicker
                    uploading={sectionUploadingKey === sectionUploadKey({ section: 'PACKAGING', slotLabel: '', field: 'barcodePhotos' })}
                    slotLabel="Ảnh quét mã vạch"
                    onCamera={() => openSectionPhotoCapture({ section: 'PACKAGING', slotLabel: 'Ảnh quét mã vạch', field: 'barcodePhotos' })}
                    onFile={(file) => setSectionCaptureTarget({ section: 'PACKAGING', slotLabel: 'Ảnh quét mã vạch', field: 'barcodePhotos', source: 'UPLOAD', selectedFile: file })}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: OTHER */}
        {activeWorkerTab === 'OTHER' && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg">
            <h3 className="font-bold text-sm text-blue-400 border-b border-slate-700 pb-2">Mục E) OTHER INFORMATION (Thông Tin Khác)</h3>
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Ghi Chú Bổ Sung</label>
              <textarea
                value={otherInfo.notes || ''}
                onChange={(e) => setOtherInfo(o => ({ ...o, notes: e.target.value }))}
                rows={3}
                placeholder="Nhập ghi chú hoặc thông tin bổ sung cho Mục E..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-400" /> Ảnh Bổ Sung Thực Tế Xưởng Sản Xuất
              </label>
              <div className="flex flex-wrap gap-3 items-center">
                {(otherInfo.photos || []).map((item, pIdx) => {
                  const src = typeof item === 'string' ? item : item.url;
                  return <img key={pIdx} src={src} alt="Other" className="w-20 h-20 object-cover rounded-lg border border-slate-700" />;
                })}
                <SectionPhotoPicker
                  uploading={sectionUploadingKey === sectionUploadKey({ section: 'OTHER', slotLabel: '' })}
                  slotLabel="Ảnh bổ sung"
                  onCamera={() => openSectionPhotoCapture({ section: 'OTHER', slotLabel: 'Ảnh bổ sung' })}
                  onFile={(file) => setSectionCaptureTarget({ section: 'OTHER', slotLabel: 'Ảnh bổ sung', source: 'UPLOAD', selectedFile: file })}
                />
              </div>
            </div>
          </div>
        )}

        {/* Footer Submission Controls */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 min-h-[18px]">
            {draftSavedAt && (
              <span>Đã lưu nháp lúc <strong className="text-slate-800">{draftSavedAt}</strong>. Chưa nộp chính thức.</span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <button
            onClick={handleSaveDraftResults}
            disabled={isSavingDraft || isSubmitting || uploadingSlotKey !== null || sectionUploadingKey !== null}
            className="w-full sm:w-auto px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold rounded-2xl border border-slate-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSavingDraft ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Đang lưu nháp...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Lưu nháp chưa nộp</span>
              </>
            )}
          </button>

          <button
            onClick={handleSubmitResults}
            disabled={isSubmitting || isSavingDraft || uploadingSlotKey !== null || sectionUploadingKey !== null}
            className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-2xl shadow-xl shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Đang Lưu & Nộp Báo Cáo...</span>
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                <span>Hoàn Tất & Nộp Báo Cáo QC</span>
              </>
            )}
          </button>
          </div>
        </div>
      </main>

      {captureTarget && (
        <PhotoCaptureModal
          key={`${captureTarget.stepId}:${captureTarget.slotIndex}:${captureTarget.source}:${captureTarget.selectedFile?.name || ''}:${captureTarget.error || ''}`}
          mode={captureTarget.source}
          frame={captureTarget.captureFrame}
          aspectRatio={captureTarget.aspectRatio}
          selectedFile={captureTarget.selectedFile}
          slotLabel={captureTarget.slotLabel}
          initialError={captureTarget.error}
          onClose={() => setCaptureTarget(null)}
          onComplete={(file, sharpnessScore) => {
            void handleCapturedPhoto(file, sharpnessScore).catch((error) => {
              alert(error instanceof Error ? error.message : 'Không thể tải ảnh lên hệ thống QC.');
            });
          }}
        />
      )}

      {sectionCaptureTarget && (
        <PhotoCaptureModal
          key={`section:${sectionCaptureTarget.section}:${sectionUploadKey(sectionCaptureTarget)}:${sectionCaptureTarget.source}:${sectionCaptureTarget.selectedFile?.name || ''}`}
          mode={sectionCaptureTarget.source}
          frame="RECTANGLE"
          selectedFile={sectionCaptureTarget.selectedFile}
          slotLabel={sectionCaptureTarget.slotLabel}
          onClose={() => setSectionCaptureTarget(null)}
          onComplete={(file, sharpnessScore) => {
            const target = sectionCaptureTarget;
            setSectionCaptureTarget(null);
            void handleSectionPhotoCaptured(file, sharpnessScore, target).catch((error) => {
              alert(error instanceof Error ? error.message : 'Không thể tải ảnh lên hệ thống QC.');
            });
          }}
        />
      )}

      {manualOverride && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-label="Xác nhận tải ảnh thủ công">
          <div className="w-full max-w-md border border-amber-300 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">{botName} chưa thể kiểm tra ảnh</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{manualOverride.message}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-700">Hãy kiểm tra sản phẩm chính ở giữa khung, rõ nét và đủ sáng trước khi xác nhận tải ảnh thủ công.</p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => { setCaptureTarget({ ...manualOverride.target, selectedFile: manualOverride.file, error: '' }); setManualOverride(null); }} className="flex-1 border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Căn lại ảnh</button>
              <button type="button" onClick={() => { const pending = manualOverride; setManualOverride(null); void handlePhotoUploadForSlot(pending.target.stepId, pending.target.slotIndex, pending.file, pending.target.source, pending.target.captureFrame, pending.sharpnessScore, true, pending.target.aspectRatio).catch((error) => alert(error instanceof Error ? error.message : 'Không thể tải ảnh thủ công.')); }} className="flex-1 bg-amber-500 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400">Xác nhận tải ảnh</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
