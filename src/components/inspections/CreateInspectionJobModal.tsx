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
import { qcService } from '../../services/qcService';

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
  
  // Form fields
  const [batchNumber, setBatchNumber] = useState('');
  const [productCode, setProductCode] = useState('');
  const [productName, setProductName] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [line, setLine] = useState('Chuyền 01 - Lắp Ráp');
  const [shift, setShift] = useState('Ca Sáng (06:00 - 14:00)');
  const [notes, setNotes] = useState('');

  // Created Job success step
  const [createdJob, setCreatedJob] = useState<InspectionJob | null>(null);
  const [sessionUrl, setSessionUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const tmpls = qcService.getTemplates();
      setTemplates(tmpls);
      if (tmpls.length > 0) {
        setSelectedTemplateId(tmpls[0].id);
        setProductCode(tmpls[0].productCode);
        setProductName(tmpls[0].productName);
      }
      
      // Auto-generate a default Batch Number
      const randomId = Math.floor(1000 + Math.random() * 9000);
      setBatchNumber(`BATCH-VN-${randomId}`);
      setWorkerName('');
      setNotes('');
      setCreatedJob(null);
      setSessionUrl('');
      setCopied(false);
    }
  }, [isOpen]);

  const handleTemplateChange = (tmplId: string) => {
    setSelectedTemplateId(tmplId);
    const selected = templates.find(t => t.id === tmplId);
    if (selected) {
      setProductCode(selected.productCode);
      setProductName(selected.productName);
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

    const newJob = qcService.createJob({
      batchNumber: batchNumber.trim(),
      templateId: selectedTemplateId,
      productCode: productCode.trim(),
      productName: productName.trim(),
      workerName: workerName.trim() || 'Công nhân QC',
      line,
      shift,
      notes: notes.trim()
    });

    // Auto generate 24h session URL
    try {
      const res = qcService.generateJobSessionUrl(newJob.id);
      setSessionUrl(res.sessionUrl);
    } catch (err) {
      console.error('Session URL generation error:', err);
    }

    setCreatedJob(newJob);
    if (onJobCreated) {
      onJobCreated(newJob);
    }
  };

  const handleCopyLink = () => {
    if (sessionUrl) {
      navigator.clipboard.writeText(sessionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500/40 text-blue-400 flex items-center justify-center">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
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
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            
            {/* Template Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Chọn Mẫu Checklist Kiểm Định <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {templates.map(tmpl => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.title} ({tmpl.productCode} - v{tmpl.version})
                  </option>
                ))}
              </select>
            </div>

            {/* Batch / Job Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
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

            {/* Production Line & Shift */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Chuyền Sản Xuất</label>
                <select
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Chuyền 01 - Lắp Ráp">Chuyền 01 - Lắp Ráp</option>
                  <option value="Chuyền 02 - Đóng Gói">Chuyền 02 - Đóng Gói</option>
                  <option value="Chuyền 03 - Sơn & Xi">Chuyền 03 - Sơn & Xi</option>
                  <option value="Chuyền 04 - Kiểm Định Cuối">Chuyền 04 - Kiểm Định Cuối</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Ca Làm Việc</label>
                <select
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Ca Sáng (06:00 - 14:00)">Ca Sáng (06:00 - 14:00)</option>
                  <option value="Ca Chiều (14:00 - 22:00)">Ca Chiều (14:00 - 22:00)</option>
                  <option value="Ca Đêm (22:00 - 06:00)">Ca Đêm (22:00 - 06:00)</option>
                </select>
              </div>
            </div>

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
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Khởi Tạo Lệnh Kiểm Tra</span>
              </button>
            </div>
          </form>
        ) : (
          /* SUCCESS STEP: Display Job Details & Session Link */
          <div className="p-6 space-y-5 animate-fadeIn">
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

            {/* Generated Session URL Box */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 border border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <LinkIcon className="w-4 h-4" />
                  Link Phiên Làm Việc (Thời hạn 24 giờ):
                </span>
                <span className="text-[11px] text-slate-400 font-mono">24h Session URL</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={sessionUrl}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none select-all"
                />
                <button
                  onClick={handleCopyLink}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
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
