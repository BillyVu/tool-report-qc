import React, { useState } from 'react';
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
  const [error, setError] = useState('');
  const [sessionInfo, setSessionInfo] = useState<{
    sessionUrl: string;
    expiresAt: string;
    token: string;
  } | null>(null);

  if (!isOpen || !job) return null;

  // Generate or retrieve current session URL
  const currentSessionUrl = sessionInfo?.sessionUrl || (
    job.sessionToken && job.sessionExpiresAt
      ? `${window.location.origin}${window.location.pathname}?jobSession=${job.id}&token=${job.sessionToken}`
      : null
  );

  const expiresDate = sessionInfo?.expiresAt || job.sessionExpiresAt;
  const isExpired = expiresDate ? new Date(expiresDate).getTime() < Date.now() : false;

  const handleGenerateUrl = async () => {
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

  const handleCopyLink = async () => {
    let urlToCopy = currentSessionUrl;
    if (!urlToCopy) {
      urlToCopy = await handleGenerateUrl();
    }
    if (urlToCopy) {
      navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Xuất URL Lệnh Kiểm Tra</h3>
              <p className="text-xs text-slate-400">Tạo Session Link độc lập cho công nhân (Giới hạn 24 giờ)</p>
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
        <div className="p-6 space-y-5">
          {/* Job Summary Banner */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="font-semibold text-slate-500 block">Lệnh / Lô hàng:</span>
              <span className="font-bold text-slate-800 text-sm">{job.batchNumber}</span>
              <span className="text-slate-500 block mt-0.5">{job.productName} ({job.productCode})</span>
            </div>
            <div className="text-right">
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
                URL này cho phép công nhân mở trực tiếp giao diện nhập kết quả kiểm định. Sau <strong>24 giờ</strong> kể từ thời điểm xuất link, URL sẽ tự động hết hạn và cần QC Admin xuất lại link mới.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          {/* URL Box or Action */}
          {currentSessionUrl ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Link className="w-4 h-4 text-blue-600" />
                  URL Session Lệnh Kiểm Tra:
                </span>
                {expiresDate && (
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isExpired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {isExpired ? 'Đã hết hạn 24h' : `Hết hạn: ${new Date(expiresDate).toLocaleString('vi-VN')}`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={currentSessionUrl}
                  className="flex-1 bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    copied 
                      ? 'bg-emerald-600 text-white shadow-sm' 
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Đã Copy!' : 'Copy Link'}</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={handleGenerateUrl}
                  disabled={isGenerating}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>{isGenerating ? 'Đang tạo link...' : 'Tạo lại / Gia hạn 24h mới'}</span>
                </button>

                <a
                  href={currentSessionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 border border-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Mở Trực Tiếp Session Portal</span>
                </a>
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
                  Bấm nút bên dưới để khởi tạo URL công nhân hoạt động độc lập có thời hạn 24 giờ.
                </p>
              </div>
              <button
                onClick={handleGenerateUrl}
                disabled={isGenerating}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all inline-flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                <span>{isGenerating ? 'Đang tạo Session URL...' : 'Xuất URL Phiên Làm Việc (24h)'}</span>
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
