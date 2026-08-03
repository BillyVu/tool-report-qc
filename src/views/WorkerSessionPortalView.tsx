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
import { InspectionJob, ChecklistTemplate, StepResult, PhotoSlotData, PhotoType } from '../types/qc';
import { workerSessionApi } from '../services/workerSessionApi';
import { getPhotoTypeInfo } from '../constants/photoTypes';
import { generateDocxReport } from '../services/docxExportService';
import { getDeviceMacAddress, getDeviceInfo } from '../utils/deviceTracker';

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
  const [sessionData, setSessionData] = useState<{
    isValid: boolean;
    isExpired: boolean;
    job?: InspectionJob;
    template?: ChecklistTemplate;
    hoursRemaining?: number;
    minutesRemaining?: number;
    expiresAtFormatted?: string;
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
          photoUrl: undefined
        }));

        // If no photoSlotConfigs, fallback to string photoSlots
        if (slotsData.length === 0 && step.photoSlots) {
          step.photoSlots.forEach((slotLabel, idx) => {
            slotsData.push({
              slotIndex: idx + 1,
              label: slotLabel,
              photoType: 'GENERAL_OTHER'
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center text-white space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mx-auto" />
          <p className="text-sm font-semibold">Đang xác thực URL Session...</p>
        </div>
      </div>
    );
  }

  // Case 1: Invalid Session
  if (!sessionData.isValid) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
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
            className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2"
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
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
              Để bảo mật và đảm bảo tính chính xác theo quy trình nhà máy, liên kết phiên làm việc này đã tự động vô hiệu hóa sau <strong>24 giờ</strong>. Vui lòng báo cho Tổ Trưởng / QC Admin để xuất lại URL làm việc mới.
            </p>

            <button
              onClick={onExitSession}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Trở Về Trang Chủ QC System</span>
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
    file: File
  ) => {
    const step = template.steps.find(s => s.stepId === stepId);
    const uploadForm = new FormData();
    uploadForm.set('photo', file);
    uploadForm.set('stepId', stepId);
    uploadForm.set('slotIndex', String(slotIndex));
    const uploadResponse = await fetch(`/api/worker-sessions/${encodeURIComponent(jobId)}/photos?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      body: uploadForm
    });
    if (!uploadResponse.ok) throw new Error('Không thể lưu ảnh lên hệ thống QC.');
    const uploadedPhoto = await uploadResponse.json() as { id: string; photoUrl: string };

    setStepResults(prev => prev.map(sr => {
      if (sr.stepId !== stepId) return sr;

      const updatedSlots = (sr.photoSlotsData || []).map(s => {
        if (s.slotIndex === slotIndex) {
          return { ...s, photoUrl: uploadedPhoto.photoUrl };
        }
        return s;
      });

      const primaryPhoto = updatedSlots.find(s => s.photoUrl)?.photoUrl || sr.photoUrl;

      return {
        ...sr,
        photoUrl: primaryPhoto,
        photoSlotsData: updatedSlots
      };
    }));

    // Gemini runs only in the server-side queue so worker devices cannot exhaust quota.
    if (step?.enableAiDetection) {
      setAiAnalyzingStepId(stepId);
      try {
        const analysisResponse = await fetch(`/api/worker-sessions/${encodeURIComponent(jobId)}/photos/${encodeURIComponent(uploadedPhoto.id)}/analyze?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ detectType: step.aiDetectType || 'GENERAL' })
        });
        if (!analysisResponse.ok) throw new Error('Không thể đưa tác vụ Gemini vào hàng đợi.');
        const analysis = await analysisResponse.json() as { status: string; result_text?: string };

        setStepResults(prev => prev.map(sr => {
          if (sr.stepId !== stepId) return sr;

          const updatedSlots = (sr.photoSlotsData || []).map(s => {
            if (s.slotIndex === slotIndex) {
              return { ...s, aiDetectedText: analysis.result_text || 'Đang chờ Gemini xử lý' };
            }
            return s;
          });

          return {
            ...sr,
            photoSlotsData: updatedSlots,
            aiDetectedValue: analysis.result_text || 'Gemini đang xếp hàng xử lý; có thể tiếp tục bước kiểm tra khác.',
            aiDetectStatus: analysis.status === 'COMPLETED' ? 'SUCCESS' : 'WARNING',
            textValue: sr.textValue || analysis.result_text || ''
          };
        }));
      } catch (err) {
        console.error('AI detect error:', err);
      } finally {
        setAiAnalyzingStepId(null);
      }
    }
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-fadeIn">
          {/* Header */}
          <div className="p-6 bg-slate-900 text-white space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Xác Nhận Đăng Nhập Kiểm Định</h2>
                <p className="text-xs text-slate-400">Lệnh QC: {job?.batchNumber} ({job?.productCode})</p>
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
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-12 font-sans">
      {/* Top Session Banner */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
              QC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm text-white">WORKER PORTAL SESSION</h1>
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-[10px] font-bold">
                  24H LINK
                </span>
              </div>
              <p className="text-xs text-slate-400">{job.productName} ({job.batchNumber})</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Countdown Badge */}
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 animate-pulse text-amber-400" />
              <span>Hạn link: {hoursRemaining}h {minutesRemaining}m</span>
            </div>

            <button
              onClick={onExitSession}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Thoát
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        {/* Worker Info Card */}
        <div className="p-4 bg-slate-800/80 border border-slate-700 rounded-2xl flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>Công nhân thực hiện:</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="Nhập tên công nhân..."
                className="bg-slate-900 border border-slate-600 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-blue-500 w-64"
              />
              <button
                type="button"
                onClick={() => setIsCheckedIn(false)}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold underline"
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
              photoType: 'GENERAL_OTHER' as PhotoType
            }));

            return (
              <div 
                key={step.stepId}
                className={`bg-slate-800/90 border rounded-2xl p-5 transition-all space-y-4 shadow-lg ${
                  stepRes?.status === 'PASS' 
                    ? 'border-emerald-500/40' 
                    : stepRes?.status === 'FAIL' 
                    ? 'border-red-500/40' 
                    : 'border-slate-700'
                }`}
              >
                {/* Step Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-700/80 pb-3">
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-blue-600 text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-white">{step.title}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Tiêu chuẩn: <span className="text-slate-200">{step.passCriteria}</span></p>
                    </div>
                  </div>

                  {/* Pass/Fail Status Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStepStatusChange(step.stepId, 'PASS')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        stepRes?.status === 'PASS'
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ĐẠT (PASS)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStepStatusChange(step.stepId, 'FAIL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                        stepRes?.status === 'FAIL'
                          ? 'bg-red-600 text-white shadow-md shadow-red-500/20'
                          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
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
                    <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                      <span>Ảnh chụp minh chứng ({photoSlots.length} slot được yêu cầu):</span>
                      {step.enableAiDetection && (
                        <span className="text-[11px] text-purple-400 font-semibold flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          Phân tích AI theo phân loại ảnh
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {photoSlots.map((slot) => {
                        const slotData = stepRes?.photoSlotsData?.find(s => s.slotIndex === slot.slotIndex);
                        const photoTypeInfo = getPhotoTypeInfo(slot.photoType);

                        return (
                          <div 
                            key={slot.slotIndex} 
                            className="bg-slate-900 border border-slate-700/80 rounded-xl p-3 flex flex-col justify-between space-y-2"
                          >
                            {/* Slot Header Label & Type Badge */}
                            <div>
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className="text-[11px] font-bold text-slate-300 truncate">
                                  Slot {slot.slotIndex}: {slot.label}
                                </span>
                              </div>

                              {/* Photo Type Badge */}
                              <div className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-blue-300 font-medium inline-flex items-center gap-1">
                                <span>{photoTypeInfo.iconEmoji}</span>
                                <span className="truncate">{photoTypeInfo.label}</span>
                              </div>
                            </div>

                            {/* Photo Preview / Upload Button */}
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group">
                              {slotData?.photoUrl ? (
                                <>
                                  <img 
                                    src={slotData.photoUrl} 
                                    alt={slot.label} 
                                    className="w-full h-full object-cover"
                                  />
                                  <label className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold cursor-pointer gap-1">
                                    <Camera className="w-4 h-4" />
                                    <span>Thay ảnh</span>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handlePhotoUploadForSlot(step.stepId, slot.slotIndex, file);
                                      }}
                                    />
                                  </label>
                                </>
                              ) : (
                                <label className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer transition-colors text-center">
                                  <Camera className="w-5 h-5 mb-1 text-slate-500" />
                                  <span className="text-[11px] font-semibold">Chụp / Chọn Ảnh</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handlePhotoUploadForSlot(step.stepId, slot.slotIndex, file);
                                    }}
                                  />
                                </label>
                              )}
                            </div>

                            {/* AI Extraction Result inside Slot */}
                            {slotData?.aiDetectedText && (
                              <div className="p-2 rounded bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200 space-y-0.5">
                                <span className="font-bold block text-purple-300">Trích xuất AI:</span>
                                <p className="leading-tight text-slate-200 font-mono text-[10px] break-all">
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

                {/* AI Analyzing Indicator */}
                {isAnalyzing && (
                  <div className="p-3 bg-purple-900/30 border border-purple-500/40 rounded-xl text-xs text-purple-300 flex items-center gap-2 animate-pulse">
                    <Sparkles className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Gemini AI đang phân tích hình ảnh theo đúng loại ảnh quy định...</span>
                  </div>
                )}

                {/* Text Input / Note Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {step.inputType !== 'PHOTO' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-slate-300 block">
                        {step.textInputLabel || 'Dữ liệu văn bản / Thông số:'}
                      </label>
                      <input
                        type="text"
                        value={stepRes?.textValue || ''}
                        onChange={(e) => handleStepTextChange(step.stepId, e.target.value)}
                        placeholder={step.textInputPlaceholder || 'Nhập thông số kiểm tra...'}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}

                  <div className="space-y-1 sm:col-span-1">
                    <label className="text-xs font-semibold text-slate-300 block">Ghi chú công nhân:</label>
                    <input
                      type="text"
                      value={stepRes?.note || ''}
                      onChange={(e) => handleStepNoteChange(step.stepId, e.target.value)}
                      placeholder="Ghi chú kết quả kiểm định..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Submission Controls */}
        <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-400 min-h-[18px]">
            {draftSavedAt && (
              <span>Đã lưu nháp lúc <strong className="text-slate-200">{draftSavedAt}</strong>. Chưa nộp chính thức.</span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
          <button
            onClick={handleSaveDraftResults}
            disabled={isSavingDraft || isSubmitting}
            className="w-full sm:w-auto px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-bold rounded-2xl border border-slate-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
    </div>
  );
};
