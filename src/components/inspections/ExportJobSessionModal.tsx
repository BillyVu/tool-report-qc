import React, { useEffect, useMemo, useState } from 'react';
import {
  X, 
  Link, 
  Copy, 
  Check, 
  Clock, 
  ExternalLink, 
  AlertCircle,
  Share2,
  RefreshCw,
  QrCode
} from 'lucide-react';
import { InspectionJob } from '../../types/qc';
import { adminApi } from '../../services/adminApi';
import { copyTextToClipboard } from '../../utils/clipboard';

interface ExportJobSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: InspectionJob | null;
  onSessionCreated?: () => void | Promise<void>;
}

export const ExportJobSessionModal: React.FC<ExportJobSessionModalProps> = ({
  isOpen,
  onClose,
  job,
  onSessionCreated
}) => {
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [extensionHours, setExtensionHours] = useState<1 | 2 | 4>(1);
  const [error, setError] = useState('');
  const [extendSuccess, setExtendSuccess] = useState('');
  const [sessionInfo, setSessionInfo] = useState<{
    sessionUrl: string;
    createdAt: string;
    expiresAt: string;
    token: string;
  } | null>(null);
  const [extendedSessionInfo, setExtendedSessionInfo] = useState<{
    createdAt: string;
    expiresAt: string;
    token?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSessionInfo(null);
      setExtendedSessionInfo(null);
      setCopied(false);
      setExtensionHours(1);
      setError('');
      setExtendSuccess('');
    }
  }, [isOpen, job?.id]);

  const existingSessionUrl = job?.sessionToken
    ? `${window.location.origin}${window.location.pathname}?jobSession=${encodeURIComponent(job.id)}&token=${encodeURIComponent(job.sessionToken)}`
    : null;
  const extendedSessionUrl = extendedSessionInfo?.token && job
    ? `${window.location.origin}${window.location.pathname}?jobSession=${encodeURIComponent(job.id)}&token=${encodeURIComponent(extendedSessionInfo.token)}`
    : null;
  const currentSessionUrl = sessionInfo?.sessionUrl || extendedSessionUrl || existingSessionUrl;
  const createdDate = sessionInfo?.createdAt || extendedSessionInfo?.createdAt || job?.sessionCreatedAt;
  const expiresDate = sessionInfo?.expiresAt || extendedSessionInfo?.expiresAt || job?.sessionExpiresAt;
  const hasExistingSession = !!job?.sessionCreatedAt;
  const hasExtendedLegacySession = hasExistingSession && !!extendedSessionInfo && !extendedSessionInfo.token && !currentSessionUrl;
  const isExpired = expiresDate ? new Date(expiresDate).getTime() < Date.now() : false;
  const remainingLabel = useMemo(() => {
    if (!expiresDate) return '';
    const diffMs = new Date(expiresDate).getTime() - Date.now();
    if (diffMs <= 0) return 'Đã hết hạn';
    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `Còn hiệu lực ${hours} giờ ${minutes} phút`;
  }, [expiresDate]);

  if (!isOpen || !job) return null;

  const handleGenerateUrl = async () => {
    if (hasExistingSession) {
      setError('Lệnh này đã có session link. Không được gen lại link; hãy gia hạn nếu link đã hết hạn.');
      return null;
    }
    setIsGenerating(true);
    setError('');
    try {
      const res = await adminApi.createWorkerSession(job.id);
      setSessionInfo(res);
      setCopied(false);
      await onSessionCreated?.();
      return res.sessionUrl;
    } catch (e) {
      console.error('Failed to generate session URL:', e);
      setError(e instanceof Error ? e.message : 'Không thể tạo Session URL từ server.');
      return null;
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtendSession = async () => {
    setIsExtending(true);
    setError('');
    setExtendSuccess('');
    try {
      const res = await adminApi.extendWorkerSession(job.id, extensionHours);
      setExtendedSessionInfo({ createdAt: res.createdAt, expiresAt: res.expiresAt, token: res.token });
      setSessionInfo(prev => prev ? { ...prev, createdAt: res.createdAt, expiresAt: res.expiresAt } : null);
      setExtendSuccess(`Đã gia hạn link đến ${new Date(res.expiresAt).toLocaleString('vi-VN')}.`);
      try {
        await onSessionCreated?.();
      } catch (reloadError) {
        console.error('Failed to reload jobs after extending session URL:', reloadError);
      }
    } catch (e) {
      console.error('Failed to extend session URL:', e);
      setError(e instanceof Error ? e.message : 'Không thể gia hạn session link từ server.');
    } finally {
      setIsExtending(false);
    }
  };

  const handleCopyLink = async () => {
    let urlToCopy = currentSessionUrl;
    if (!urlToCopy) {
      urlToCopy = await handleGenerateUrl();
    }
    if (urlToCopy) {
      try {
        await copyTextToClipboard(urlToCopy);
        setCopied(true);
        setError('');
        setTimeout(() => setCopied(false), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Browser đang chặn copy tự động. Hãy bôi đen URL và copy thủ công.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 backdrop-blur-sm p-2 animate-fadeIn sm:items-center sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[96dvh] overflow-hidden border border-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-start justify-between gap-3 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-white">Quản lý URL Lệnh Kiểm Tra</h3>
              <p className="text-xs text-slate-400">Gen link lần đầu, copy link hiện có hoặc gia hạn khi hết hạn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-5 overflow-y-auto sm:p-6">
          {/* Job Summary Banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-3 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="font-semibold text-slate-500 block">Lệnh / Lô hàng:</span>
              <span className="font-bold text-slate-800 text-sm">{job.batchNumber}</span>
              <span className="text-slate-500 block mt-0.5">{job.productName} ({job.productCode})</span>
            </div>
            <div className="sm:text-right">
              <span className="font-medium text-slate-500 block">Tổ / Chuyền:</span>
              <span className="font-bold text-blue-700">{job.line}</span>
              <span className="text-slate-500 block mt-0.5">{job.shift}</span>
            </div>
          </div>

          {/* Expiration Notice & Explanation */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Quy tắc Giới hạn 1 Ngày (24 giờ):</p>
              <p className="text-amber-800 mt-0.5">
                URL này chỉ được tạo một lần cho mỗi lệnh kiểm tra. Sau <strong>24 giờ</strong>, QC Admin chỉ được gia hạn thời gian cho link hiện có, không gen lại link mới.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          {extendSuccess && (
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800">
              {extendSuccess}
            </div>
          )}

          {/* URL Box or Action */}
          {currentSessionUrl ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Link className="w-4 h-4 text-blue-600" />
                  URL Session Lệnh Kiểm Tra:
                </span>
                {expiresDate && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isExpired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isExpired ? 'Hết hạn sử dụng' : remainingLabel}
                  </span>
                )}
              </div>

              {createdDate && expiresDate && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <span className="block text-[11px] font-semibold text-emerald-700">Hiệu lực từ</span>
                    <span className="font-bold text-emerald-950">{new Date(createdDate).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <span className="block text-[11px] font-semibold text-amber-700">Hết hạn lúc</span>
                    <span className="font-bold text-amber-950">{new Date(expiresDate).toLocaleString('vi-VN')}</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  readOnly
                  value={currentSessionUrl}
                  className="min-w-0 flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none select-all"
                />
                <button
                  onClick={handleCopyLink}
                  disabled={isExpired}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 ${
                    isExpired
                      ? 'bg-red-100 text-red-700 border border-red-200 cursor-not-allowed'
                      : copied
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
                  }`}
                >
                  {isExpired ? <Clock className="w-4 h-4" /> : copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{isExpired ? 'Hết hạn sử dụng' : copied ? 'Đã copy' : 'Copy link'}</span>
                </button>
              </div>

              {/* Action Buttons */}
              {hasExistingSession && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <span className="block text-[11px] font-bold text-amber-900 mb-2">Gia hạn thêm thời gian</span>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 4] as const).map((hours) => (
                      <button
                        key={hours}
                        type="button"
                        onClick={() => setExtensionHours(hours)}
                        className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                          extensionHours === hours
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        {hours} giờ
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 pt-2 sm:flex sm:items-center sm:justify-between">
                <a
                  href={currentSessionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Mở Trực Tiếp Session Portal</span>
                </a>
                {hasExistingSession && (
                  <button
                    onClick={handleExtendSession}
                    disabled={isExtending}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isExtending ? 'animate-spin' : ''}`} />
                    <span>{isExtending ? 'Đang gia hạn...' : `Gia hạn ${extensionHours} giờ`}</span>
                  </button>
                )}
              </div>
            </div>
          ) : hasExistingSession ? (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-2.5 text-xs text-slate-700">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900">Link cũ không copy được.</p>
                  <p className="mt-1">
                    Link này được tạo trước khi hệ thống lưu token nên không thể copy lại URL cũ từ database. Không được gen lại link mới cho lệnh này.
                  </p>
                </div>
              </div>

              {createdDate && expiresDate && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                    <span className="block text-[11px] font-semibold text-emerald-700">Đã tạo lúc</span>
                    <span className="font-bold text-emerald-950">{new Date(createdDate).toLocaleString('vi-VN')}</span>
                  </div>
                  <div className={`rounded-lg border px-3 py-2 ${isExpired ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-white'}`}>
                    <span className={`block text-[11px] font-semibold ${isExpired ? 'text-red-700' : 'text-amber-700'}`}>Hết hạn lúc</span>
                    <span className={`font-bold ${isExpired ? 'text-red-950' : 'text-amber-950'}`}>{new Date(expiresDate).toLocaleString('vi-VN')}</span>
                  </div>
                </div>
              )}

              {hasExtendedLegacySession && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p className="font-bold">Đã gia hạn hiệu lực link cũ.</p>
                  <p className="mt-1">
                    Link vẫn không thể copy lại vì database không còn token gốc. Không gen link mới cho lệnh này.
                  </p>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <span className="block text-[11px] font-bold text-amber-900">Gia hạn thêm thời gian</span>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 4] as const).map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => setExtensionHours(hours)}
                      className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                        extensionHours === hours
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {hours} giờ
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExtendSession}
                  disabled={isExtending}
                  className="w-full px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md transition-all inline-flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${isExtending ? 'animate-spin' : ''}`} />
                  <span>{isExtending ? 'Đang gia hạn...' : `Gia hạn thêm ${extensionHours} giờ`}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center space-y-3 bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                <Link className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Chưa xuất Session URL cho lệnh này</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                  Bấm nút bên dưới để tạo URL lần đầu. Sau khi tạo, link sẽ không được gen lại; nếu hết hạn chỉ được gia hạn thời gian.
                </p>
              </div>
              <button
                onClick={handleGenerateUrl}
                disabled={isGenerating}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all inline-flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>{isGenerating ? 'Đang gen link...' : 'Gen link (24h)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-colors"
          >
            Đóng Window
          </button>
        </div>
      </div>
    </div>
  );
};
