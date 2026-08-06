import React, { useState, useEffect } from 'react';
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
  Save
} from 'lucide-react';
import { CaptureFrame, InspectionJob, ChecklistTemplate, StepResult, PhotoSlotData, PhotoType } from '../types/qc';
import { workerSessionApi } from '../services/workerSessionApi';
import { getPhotoTypeInfo } from '../constants/photoTypes';
import { generateDocxReport } from '../services/docxExportService';
import { getDeviceMacAddress, getDeviceInfo } from '../utils/deviceTracker';
import { usePhotoTypes } from '../hooks/usePhotoTypes';
import { PhotoCaptureModal } from '../components/worker/PhotoCaptureModal';
import { VeroBrand } from '../components/branding/VeroBrand';

type PhotoSource = 'CAMERA' | 'UPLOAD';

interface CaptureTarget {
  stepId: string;
  slotIndex: number;
  slotLabel: string;
  source: PhotoSource;
  captureFrame: CaptureFrame;
  selectedFile?: File;
  error?: string;
}

type SlotUploadStatus = 'UPLOADING' | 'SAVED' | 'ACTION_REQUIRED' | 'ERROR';

interface SlotUploadState {
  status: SlotUploadStatus;
  message: string;
}

interface WorkerSessionRealtimeEvent {
  type: 'READY' | 'PHOTO_RECEIVED' | 'PHOTO_SAVED' | 'ANALYSIS_QUEUED' | 'ANALYSIS_COMPLETED' | 'ANALYSIS_FAILED';
  photoId?: string;
  stepId?: string;
  slotIndex?: number;
  photoUrl?: string;
  manualOverride?: boolean;
  aiQualityStatus?: 'APPROVED' | 'UNAVAILABLE';
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
  aiQualityStatus?: 'APPROVED' | 'UNAVAILABLE',
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
  const [workerNotice, setWorkerNotice] = useState('');
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const botName = sessionData?.botName || 'Vero';

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

  const handleConfirmCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerNameInput.trim()) {
      alert('Vui lòng nhập họ và tên công nhân mở link.');
      return;
    }

    const finalMac = deviceMac.trim() || getDeviceMacAddress();
    const finalDev = deviceInfo.trim() || getDeviceInfo();

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

  // Handles updating photo for a specific slot inside a step
  const handlePhotoUploadForSlot = async (
    stepId: string, 
    slotIndex: number, 
    file: File,
    source: PhotoSource,
    captureFrame: CaptureFrame,
    sharpnessScore: number,
    manualOverride = false,
  ) => {
    const slotKey = `${stepId}:${slotIndex}`;
    setUploadingSlotKey(slotKey);
    setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'UPLOADING', message: 'Đang gửi ảnh lên server...' } }));
    const step = template.steps.find(s => s.stepId === stepId);
    const uploadForm = new FormData();
    uploadForm.set('photo', file);
    uploadForm.set('stepId', stepId);
    uploadForm.set('slotIndex', String(slotIndex));
    uploadForm.set('source', source);
    uploadForm.set('captureFrame', captureFrame);
    uploadForm.set('sharpnessScore', String(sharpnessScore));
    uploadForm.set('manualOverride', String(manualOverride));
    try {
      const uploadResponse = await fetch(`/api/worker-sessions/${encodeURIComponent(jobId)}/photos?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        body: uploadForm
      });
      const responseBody = await uploadResponse.json().catch(() => ({})) as { id?: string; photoUrl?: string; error?: string; qualityStatus?: 'APPROVED' | 'UNAVAILABLE' | 'REJECTED'; manualOverride?: boolean; manualOverrideAvailable?: boolean; qualityMessage?: string };
      if (!uploadResponse.ok) {
        const target: CaptureTarget = { stepId, slotIndex, slotLabel: 'Ảnh minh chứng', source, captureFrame, selectedFile: file, error: responseBody.error || 'Không thể kiểm tra ảnh.' };
        if (responseBody.qualityStatus === 'UNAVAILABLE' && responseBody.manualOverrideAvailable && !manualOverride) {
          setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'ACTION_REQUIRED', message: 'Cần xác nhận tải ảnh thủ công.' } }));
          setManualOverride({ target, file, sharpnessScore, message: responseBody.error || `${botName} chưa thể kiểm tra ảnh.` });
          return;
        }
        if (responseBody.qualityStatus === 'REJECTED' || uploadResponse.status === 422) {
          setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'ERROR', message: responseBody.error || 'Ảnh chưa đạt yêu cầu.' } }));
          setCaptureTarget(target);
          return;
        }
        throw new Error(responseBody.error || 'Không thể lưu ảnh lên hệ thống QC.');
      }
      if (!responseBody.id || !responseBody.photoUrl) throw new Error('Hệ thống không trả về ảnh đã lưu.');
      const uploadedPhoto = responseBody as { id: string; photoUrl: string; manualOverride?: boolean; qualityStatus?: 'APPROVED' | 'UNAVAILABLE' };

      setStepResults((previous) => applyUploadedPhoto(previous, stepId, slotIndex, uploadedPhoto.photoUrl, uploadedPhoto.manualOverride, uploadedPhoto.qualityStatus));
      setSlotUploadStates((previous) => ({ ...previous, [slotKey]: { status: 'SAVED', message: 'Ảnh đã được lưu trên server.' } }));
      setWorkerNotice('Ảnh đã được lưu trên server.');

      // Vero runs only in the server-side queue so worker devices cannot exhaust quota.
      if (step?.enableAiDetection) {
      setAiAnalyzingStepId(stepId);
      try {
        const analysisResponse = await fetch(`/api/worker-sessions/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(uploadedPhoto.id)}/analyze?token=${encodeURIComponent(token)}`, {
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
    await handlePhotoUploadForSlot(target.stepId, target.slotIndex, file, target.source, target.captureFrame, sharpnessScore);
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
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>Xác Nhận Đăng Nhập & Bắt Đầu Kiểm Định</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Submit Worker Results
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
        workerInfoPayload()
      );
      setDraftSavedAt(new Date().toLocaleString('vi-VN'));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không thể lưu nháp kết quả kiểm tra.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmitResults = async () => {
    setIsSubmitting(true);
    try {
      const res = await workerSessionApi.submitResults(
        jobId,
        token,
        stepResults,
        workerInfoPayload()
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

        {/* Steps List */}
        <div className="space-y-6">
          {template.steps.map((step, idx) => {
            const stepRes = stepResults.find(r => r.stepId === step.stepId);
            const isAnalyzing = aiAnalyzingStepId === step.stepId;
            const photoSlots = step.photoSlotConfigs || (step.photoSlots || []).map((lbl, i) => ({
              slotIndex: i + 1,
              label: lbl,
              photoType: 'GENERAL_OTHER' as PhotoType,
              captureFrame: 'RECTANGLE' as CaptureFrame
            }));

            return (
              <div
                key={step.stepId}
                className={`bg-white border rounded-2xl p-5 transition-all space-y-4 shadow-sm ${
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
                                    <button type="button" onClick={() => setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'CAMERA', captureFrame: slot.captureFrame || 'RECTANGLE' })} className="flex min-w-0 flex-1 items-center justify-center gap-1 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-sky-100" title="Chụp ảnh mới"><Camera className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Chụp ảnh</span></button>
                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-900 hover:bg-sky-100" title="Tải ảnh mới"><Upload className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Tải ảnh</span><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'UPLOAD', captureFrame: slot.captureFrame || 'RECTANGLE', selectedFile: file }); e.currentTarget.value = ''; }} /></label>
                                  </div>
                                </>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center gap-2 p-2 text-center">
                                  {uploadingSlotKey === `${step.stepId}:${slot.slotIndex}` ? <RefreshCw className="h-5 w-5 animate-spin text-sky-600" /> : <>
                                    <button type="button" onClick={() => setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'CAMERA', captureFrame: slot.captureFrame || 'RECTANGLE' })} className="flex flex-col items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-sky-700" title="Chụp ảnh"><Camera className="w-5 h-5" /><span className="text-[11px] font-semibold">Chụp ảnh</span></button>
                                    <label className="flex cursor-pointer flex-col items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-sky-700" title="Tải ảnh"><Upload className="w-5 h-5" /><span className="text-[11px] font-semibold">Tải ảnh</span><input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setCaptureTarget({ stepId: step.stepId, slotIndex: slot.slotIndex, slotLabel: slot.label, source: 'UPLOAD', captureFrame: slot.captureFrame || 'RECTANGLE', selectedFile: file }); e.currentTarget.value = ''; }} /></label>
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
                    <input
                      type="text"
                      value={stepRes?.note || ''}
                      onChange={(e) => handleStepNoteChange(step.stepId, e.target.value)}
                      placeholder="Ghi chú kết quả kiểm định..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
            disabled={isSavingDraft || isSubmitting}
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
            disabled={isSubmitting || isSavingDraft}
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
              <button type="button" onClick={() => { const pending = manualOverride; setManualOverride(null); void handlePhotoUploadForSlot(pending.target.stepId, pending.target.slotIndex, pending.file, pending.target.source, pending.target.captureFrame, pending.sharpnessScore, true).catch((error) => alert(error instanceof Error ? error.message : 'Không thể tải ảnh thủ công.')); }} className="flex-1 bg-amber-500 px-3 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400">Xác nhận tải ảnh</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
