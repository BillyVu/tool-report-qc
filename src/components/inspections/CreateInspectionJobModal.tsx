import React, { useState, useEffect } from 'react';
import { 
  X, 
  PlusCircle, 
  ClipboardCheck, 
  Sparkles, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  FileText, 
  User, 
  Layers, 
  Clock,
  ArrowRight
} from 'lucide-react';
import { ChecklistTemplate, InspectionJob } from '../../types/qc';
import { adminApi } from '../../services/adminApi';
import { copyTextToClipboard } from '../../utils/clipboard';

interface CreateInspectionJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJobCreated?: (job: InspectionJob) => void;
}

export const CreateInspectionJobModal: React.FC<CreateInspectionJobModalProps> = ({
  isOpen,
  onClose,
  onJobCreated
}) => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Form fields
  const [batchNumber, setBatchNumber] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [sampleSize, setSampleSize] = useState('120 pcs');
  const [workerName, setWorkerName] = useState('');
  const [line, setLine] = useState('Chuyền 01 - Lắp Ráp');
  const [shift, setShift] = useState('Ca Sáng (06:00 - 14:00)');
  const [notes, setNotes] = useState('');

  // Created Job success step
  const [createdJob, setCreatedJob] = useState<InspectionJob | null>(null);
  const [sessionUrl, setSessionUrl] = useState<string>('');
  const [sessionCreationError, setSessionCreationError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsLoadingTemplates(true);
      setErrorMessage('');
      adminApi.listTemplates()
        .then((tmpls) => {
          setTemplates(tmpls);
          if (tmpls.length > 0) {
            setSelectedTemplateId(tmpls[0].id);
            setProductCode(tmpls[0].productCode);
            setProductName(tmpls[0].productName);
            setSampleSize(tmpls[0].orderQty || tmpls[0].steps[0]?.sampleSize || '120 pcs');
          } else {
            setSelectedTemplateId('');
            setProductCode('');
            setProductName('');
            setSampleSize('120 pcs');
          }
        })
        .catch((error) => setErrorMessage(error instanceof Error ? error.message : 'Không tải được mẫu checklist từ database.'))
        .finally(() => setIsLoadingTemplates(false));
      
      // Auto-generate a default Batch Number
      const randomId = Math.floor(1000 + Math.random() * 9000);
      setBatchNumber(`BATCH-VN-${randomId}`);
      setWorkerName('');
      setNotes('');
      setCreatedJob(null);
      setSessionUrl('');
      setSessionCreationError('');
      setCopied(false);
    }
  }, [isOpen]);

  const handleTemplateChange = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const selected = templates.find(t => t.id === tmplId);
    if (selected) {
      setProductCode(selected.productCode);
      setProductName(selected.productName);
      setSampleSize(selected.orderQty || selected.steps[0]?.sampleSize || '120 pcs');
    }
  };

  const handleAutoGenerateBatch = () => {
    const randomId = Math.floor(1000 + Math.random() * 9000);
    setBatchNumber(`BATCH-VN-${randomId}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchNumber.trim() || !selectedTemplateId) {
      alert('Vui lòng điền đầy đủ Mã lệnh và chọn Mẫu Checklist.');
      return;
    }

    void (async () => {
      setIsSubmitting(true);
      setErrorMessage('');
      try {
        const selectedTemplate = templates.find((tmpl) => tmpl.id === selectedTemplateId);
        if (!selectedTemplate) throw new Error('Mẫu checklist không tồn tại trong database.');
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        const randomSuffix = Math.floor(100 + Math.random() * 900);
        const newJobId = `JOB-${dateStr}-${randomSuffix}`;

        const customSampleSize = sampleSize.trim() || selectedTemplate.orderQty || '120 pcs';
        const updatedTemplateSnapshot: ChecklistTemplate = {
          ...selectedTemplate,
          orderQty: customSampleSize,
          steps: selectedTemplate.steps.map((s) => ({
            ...s,
            sampleSize: customSampleSize || s.sampleSize || '120 pcs'
          }))
        };

        const newJob = await adminApi.createJob({
          externalId: newJobId,
          batchNumber: batchNumber.trim(),
          templateId: selectedTemplate.id,
          templateSnapshot: updatedTemplateSnapshot,
          productCode: productCode.trim() || selectedTemplate.productCode,
          productName: productName.trim() || selectedTemplate.productName,
          workerName: workerName.trim() || 'Công nhân QC',
          line,
          shift,
          adminNotes: notes.trim(),
          defectsFindingData: selectedTemplate.defectsFindingData || [],
          packagingInfoData: selectedTemplate.packagingInfoData || {},
          otherInfoData: selectedTemplate.otherInfoData || {},
        });
        setCreatedJob(newJob);
        if (onJobCreated) onJobCreated(newJob);
        try {
          const res = await adminApi.createWorkerSession(newJob.id);
          setSessionUrl(res.sessionUrl);
          setSessionCreationError('');
        } catch (sessionError) {
          console.error('Failed to create worker session after job creation:', sessionError);
          setSessionUrl('');
          setSessionCreationError(
            sessionError instanceof Error
              ? sessionError.message
              : 'Lệnh kiểm tra đã được tạo nhưng chưa tạo được link phiên làm việc.',
          );
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Không tạo được lệnh kiểm tra trong database.');
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const handleCopyLink = () => {
    if (sessionUrl) {
      void copyTextToClipboard(sessionUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }).catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Không thể copy link vào clipboard.');
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-2 bg-slate-900/60 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[96dvh] overflow-hidden border border-slate-200 flex flex-col">
        
        {/* Header */}
        <div className="px-4 py-4 bg-slate-900 text-white flex items-start justify-between gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-base text-white">Tạo Lệnh Kiểm Tra QC Mới</h3>
              <p className="text-xs text-slate-400">Khởi tạo đợt kiểm định lô hàng & xuất Link cho công nhân</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {!createdJob ? (
          <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto sm:p-6">
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl p-3">
                {errorMessage}. Kiểm tra Admin API Key trong mục Cài đặt.
              </div>
            )}
            
            {/* Template Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Chọn Mẫu Checklist Kiểm Định <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                required
                disabled={isLoadingTemplates}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {isLoadingTemplates && <option value="">Đang tải mẫu từ database...</option>}
                {!isLoadingTemplates && templates.length === 0 && <option value="">Chưa có mẫu checklist trong database</option>}
                {templates.map(tmpl => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.title} ({tmpl.productCode} - v{tmpl.version})
                  </option>
                ))}
              </select>
            </div>

            {/* Batch / Job Number */}
            <div>
              <div className="flex flex-col gap-1 mb-1 sm:flex-row sm:items-center sm:justify-between">
                <label className="text-xs font-bold text-slate-700">
                  Mã Lệnh / Lô Hàng (Batch Number) <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAutoGenerateBatch}
                  className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Tự động sinh mã</span>
                </button>
              </div>
              <input
                type="text"
                required
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                placeholder="VD: BATCH-VN-9088"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold font-mono text-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Product Code & Product Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mã Sản Phẩm</label>
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  placeholder="VD: IP15P-2026"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tên Sản Phẩm</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="VD: iPhone 15 Pro Max 256GB"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Cỡ Mẫu Kiểm Tra / Sample Size */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 block">
                  Cỡ Mẫu Kiểm Tra (Sample Size / Số lượng kiểm) <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] font-medium text-slate-500">Mẫu kiểm mặc định cho lô</span>
              </div>
              <input
                type="text"
                required
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
                placeholder="VD: 120 pcs, 117 pcs hoặc 100%"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Production Line & Shift (Temporarily hidden) */}

            {/* Assigned Worker */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Công Nhân / Người Phụ Trách (Không bắt buộc)</label>
              <input
                type="text"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                placeholder="VD: Nguyễn Văn An"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Additional Notes */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Ghi Chú Ban Đầu / Chỉ Đạo QC</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Yêu cầu kiểm tra kỹ bề mặt sơn, lớp mạ góc..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-2 grid grid-cols-1 gap-2 border-t border-slate-200 sm:flex sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isLoadingTemplates || templates.length === 0}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>{isSubmitting ? 'Đang lưu database...' : 'Khởi Tạo Lệnh Kiểm Tra'}</span>
              </button>
            </div>
          </form>
        ) : (
          /* SUCCESS STEP: Display Job Details & Session Link */
          <div className="p-4 space-y-5 animate-fadeIn overflow-y-auto sm:p-6">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 font-bold">
                ✓
              </div>
              <div>
                <h4 className="font-bold text-emerald-900 text-sm">Đã Tạo Thành Công Lệnh Kiểm Tra Mới!</h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Lệnh hàng <strong>{createdJob.batchNumber}</strong> ({createdJob.productName}) đã ở trạng thái <strong>ĐANG THỰC HIỆN</strong>.
                </p>
              </div>
            </div>

            {sessionUrl ? (
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 border border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <LinkIcon className="w-4 h-4" />
                    Link Phiên Làm Việc (Thời hạn 24 giờ):
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">24h Session URL</span>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    readOnly
                    value={sessionUrl}
                    className="min-w-0 flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none select-all"
                  />
                  <button
                    onClick={handleCopyLink}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Đã chép' : 'Sao chép'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 italic">
                  Gửi đường link này cho công nhân tại xưởng để họ mở giao diện nhập dữ liệu trực tiếp trên điện thoại/máy tính.
                </p>
              </div>
            ) : (
              <div className="bg-amber-50 text-amber-900 p-4 rounded-xl space-y-2 border border-amber-200">
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Chưa tạo được link phiên làm việc</span>
                </div>
                <p className="text-xs text-amber-800">
                  Lệnh kiểm tra đã được lưu thành công, nhưng hệ thống chưa tạo được link 24 giờ cho công nhân.
                  Mở danh sách lệnh và dùng nút <strong>Quản lý link</strong> để tạo link cho lệnh này.
                </p>
                {sessionCreationError && (
                  <p className="text-[11px] font-semibold text-amber-700">
                    Chi tiết: {sessionCreationError}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2"
              >
                <span>Xong & Xem Danh Sách Lệnh</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
