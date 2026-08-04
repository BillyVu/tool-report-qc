import React, { useEffect, useState } from 'react';
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
import { adminApi } from '../services/adminApi';
import { TemplateFormModal } from '../components/templates/TemplateFormModal';
import { TemplatePreviewModal } from '../components/templates/TemplatePreviewModal';
import { getWordMappingSummary, hasCompleteWordMapping } from '../utils/docxMapping';

export const TemplatesView: React.FC = () => {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplate | null>(null);

  // Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<ChecklistTemplate | null>(null);

  const reloadTemplates = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      setTemplates(await adminApi.listTemplates());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không tải được mẫu checklist từ database.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reloadTemplates();
  }, []);

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

  const handleDuplicate = async (tmpl: ChecklistTemplate) => {
    const duplicated: ChecklistTemplate = {
      ...tmpl,
      id: `TMPL-${Date.now().toString().slice(-6)}`,
      title: `${tmpl.title} (Bản sao)`,
      createdAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    try {
      await adminApi.saveTemplate(duplicated);
      await reloadTemplates();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không nhân bản được mẫu checklist.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa Mẫu Checklist này?')) {
      try {
        await adminApi.deleteTemplate(id);
        await reloadTemplates();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Không xóa được mẫu checklist.');
      }
    }
  };

  const handleSaveTemplate = async (saved: ChecklistTemplate) => {
    if (selectedTemplate) {
      await adminApi.updateTemplate(saved);
    } else {
      await adminApi.saveTemplate(saved);
    }
    await reloadTemplates();
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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center">
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
        <div className="shrink-0 text-xs text-slate-500 font-medium">
          Hiển thị <strong>{filteredTemplates.length}</strong> mẫu
        </div>
      </div>

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl p-4">
          Không thể đồng bộ database: {errorMessage}. Kiểm tra Admin API Key trong mục Cài đặt.
        </div>
      )}

      {isLoading && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
          Đang tải mẫu checklist từ database...
        </div>
      )}

      {/* Templates Grid List */}
      {!isLoading && filteredTemplates.length === 0 && !errorMessage && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <FileCheck2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Chưa có mẫu checklist trong database</p>
          <p className="text-xs text-slate-500 mt-1">Bấm “Tạo Mẫu QC Mới” để tạo mẫu đầu tiên.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredTemplates.map((tmpl) => (
          <div
            key={tmpl.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-3">
              {/* Header Badges */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-bold bg-slate-900 text-white px-2.5 py-0.5 rounded-md">
                  {tmpl.id}
                </span>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
                  Mã SP: {tmpl.productCode}
                </span>
              </div>

              {/* Title & Product Name */}
              <div>
                <h3 className="font-bold text-base text-slate-900 line-clamp-1">{tmpl.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{tmpl.productName}</p>
              </div>

              {/* Word Template File Info */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-xs text-slate-700 font-medium">
                  <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="truncate" title={tmpl.docxTemplateName}>
                    {tmpl.docxTemplateName}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">v{tmpl.version}</span>
              </div>

              {/* Steps & Mapped Placeholders Overview */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>Các bước quy trình ({tmpl.steps.length} bước):</span>
                  <span className="text-[11px] text-slate-400 font-normal">Cập nhật: {new Date(tmpl.updatedAt).toLocaleDateString('vi-VN')}</span>
                </div>

                <div className="space-y-1">
                  {tmpl.steps.map((step) => (
                    <div
                      key={step.stepId}
                      className="text-xs bg-slate-50 hover:bg-slate-100 p-2 rounded-md border border-slate-200/60 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-bold text-slate-800 text-[11px] shrink-0">{step.stepId}:</span>
                        <span className="truncate text-slate-700">{step.title}</span>
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 border ${
                        hasCompleteWordMapping(step)
                          ? 'text-blue-700 bg-blue-50 border-blue-200'
                          : 'text-amber-700 bg-amber-50 border-amber-200'
                      }`}>
                        <Tag className="w-3 h-3" />
                        <span>{getWordMappingSummary(step)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions Card Footer */}
            <div className="pt-3 border-t border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
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

              <div className="flex flex-wrap items-center justify-end gap-2">
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
