import React, { useState } from 'react';
import {
  FileCheck2,
  Plus,
  Copy,
  Edit3,
  Trash2,
  FileCode,
  Layers,
  Search,
  Check,
  Tag,
  ArrowUpDown,
  Eye
} from 'lucide-react';
import { ChecklistTemplate } from '../types/qc';
import { qcService } from '../services/qcService';
import { TemplateFormModal } from '../components/templates/TemplateFormModal';
import { TemplatePreviewModal } from '../components/templates/TemplatePreviewModal';

export const TemplatesView: React.FC = () => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>(qcService.getTemplates());
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);

  // Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<ChecklistTemplate | null>(null);

  const reloadTemplates = () => {
    setTemplates(qcService.getTemplates());
  };

  const handlePreview = (tmpl: ChecklistTemplate) => {
    setPreviewTemplate(tmpl);
    setIsPreviewOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedTemplate(null);
    setIsModalOpen(true);
  };

  const handleEdit = (tmpl: ChecklistTemplate) => {
    setSelectedTemplate(tmpl);
    setIsModalOpen(true);
  };

  const handleDuplicate = (tmpl: ChecklistTemplate) => {
    qcService.duplicateTemplate(tmpl.id);
    reloadTemplates();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa Mẫu Checklist này?')) {
      qcService.deleteTemplate(id);
      reloadTemplates();
    }
  };

  const handleSaveTemplate = (saved: ChecklistTemplate) => {
    qcService.saveTemplate(saved);
    reloadTemplates();
  };

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.productCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.docxTemplateName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Quản Lý Mẫu Checklist QC & Ánh Xạ Thẻ Word (.docx)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Cấu hình quy trình các bước kiểm tra và gán thẻ placeholder (Tag Mapping) để xuất báo cáo Word tự động
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tạo Mẫu QC Mới</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên mẫu, mã dòng sản phẩm, file Word..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Hiển thị <strong>{filteredTemplates.length}</strong> mẫu
        </div>
      </div>

      {/* Templates Grid List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredTemplates.map((tmpl) => (
          <div
            key={tmpl.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              {/* Header Badges */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-mono text-[11px] font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-md">
                  {tmpl.id}
                </span>
                <div className="flex items-center gap-1.5">
                  {tmpl.clientName && (
                    <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Client: {tmpl.clientName}
                    </span>
                  )}
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                    Mã SP: {tmpl.productCode}
                  </span>
                </div>
              </div>

              {/* Title & Product Name */}
              <div>
                <h3 className="font-bold text-base text-slate-900 line-clamp-1">{tmpl.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{tmpl.productName}</p>
                {tmpl.supplierName && (
                  <p className="text-[11px] text-slate-600 mt-1 flex items-center gap-1 truncate" title={tmpl.supplierName}>
                    🏢 <span className="font-semibold">{tmpl.supplierName}</span>
                  </p>
                )}
              </div>

              {/* Word Template File Info */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                    <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate max-w-[200px]" title={tmpl.docxTemplateName}>
                      {tmpl.docxTemplateName}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">v{tmpl.version}</span>
                </div>
                {tmpl.buildNumber && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-200/60 pt-1.5 font-mono">
                    <span>Build: {tmpl.buildNumber}</span>
                    <span>Đơn hàng: {tmpl.orderQty || '117 pcs'}</span>
                  </div>
                )}
              </div>

              {/* Steps & Mapped Placeholders Overview */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Các bước quy trình ({tmpl.steps.length} bước):</span>
                  <span className="text-[11px] text-slate-400 font-normal">Cập nhật: {new Date(tmpl.updatedAt).toLocaleDateString('vi-VN')}</span>
                </div>

                <div className="space-y-1">
                  {tmpl.steps.map((step) => (
                    <div
                      key={step.stepId}
                      className="text-xs bg-slate-50 hover:bg-slate-100 p-2 rounded-md border border-slate-200/60 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-slate-800 text-[11px] shrink-0">{step.stepId}:</span>
                        <span className="truncate text-slate-700">{step.title}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0 border border-blue-200">
                        <Tag className="w-3 h-3" />
                        <span>{step.mapping?.imageTag || '{{photo}}'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions Card Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handlePreview(tmpl)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors flex items-center gap-1.5 border border-slate-200"
                  title="Xem trước giao diện công nhân nhập checklist"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Xem Trước</span>
                </button>

                <button
                  onClick={() => handleDuplicate(tmpl)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-colors flex items-center gap-1"
                  title="Nhân bản mẫu checklist"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Nhân bản</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDelete(tmpl.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Xóa mẫu"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleEdit(tmpl)}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Sửa & Cấu hình</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Form Builder */}
      <TemplateFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        template={selectedTemplate}
        onSave={handleSaveTemplate}
      />

      {/* Template Worker Interactive Preview Modal */}
      <TemplatePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        template={previewTemplate}
      />
    </div>
  );
};
