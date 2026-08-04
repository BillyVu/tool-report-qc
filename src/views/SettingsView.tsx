import React, { useState } from 'react';
import { KeyRound, Building2, FileText, Check, Image as ImageIcon, Sliders, Sparkles, HardDrive, Plus, X, RotateCcw, Trash2, Edit2, Camera } from 'lucide-react';
import { getAdminApiKey, setAdminApiKey } from '../services/adminApi';
import { loadSystemSettings, saveSystemSettings } from '../services/systemSettings';
import { loadPhotoTypeOptions, savePhotoTypeOptions, resetPhotoTypeOptions, PhotoTypeOption } from '../constants/photoTypes';
import { SystemImageConfig } from '../types/qc';

interface SettingsViewProps {
  onAuthUpdated?: () => void;
}

const AVAILABLE_EXTENSIONS = [
  { id: 'png', label: 'PNG (.png)', desc: 'Ảnh trong suốt, chất lượng đồ họa cao' },
  { id: 'jpg', label: 'JPG (.jpg)', desc: 'Định dạng chụp ảnh phổ biến nhất' },
  { id: 'jpeg', label: 'JPEG (.jpeg)', desc: 'Định dạng chuẩn camera công nghiệp' },
  { id: 'webp', label: 'WEBP (.webp)', desc: 'Định dạng web hiện đại nén nhẹ' },
  { id: 'heic', label: 'HEIC (.heic)', desc: 'Ảnh định dạng cao từ iOS/iPhone' },
  { id: 'bmp', label: 'BMP (.bmp)', desc: 'Ảnh bitmap đồ họa chưa nén' },
  { id: 'svg', label: 'SVG (.svg)', desc: 'Đồ họa dạng vector' },
];

const CATEGORY_LABELS: Record<PhotoTypeOption['category'], { label: string; color: string }> = {
  VISUAL: { label: 'Ngoại quan', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  ANIMATION: { label: 'Khởi động', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  IMEI: { label: 'IMEI & Tem', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  CAMERA: { label: 'Camera & Mic', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  BLUETOOTH: { label: 'Bluetooth', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  MMI: { label: 'Màn hình MMI', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  OTHER: { label: 'Khác', color: 'bg-slate-100 text-slate-800 border-slate-200' },
};

export const SettingsView: React.FC<SettingsViewProps> = ({ onAuthUpdated }) => {
  const initialSettings = loadSystemSettings();

  const [factoryName, setFactoryName] = useState(initialSettings.factoryName);
  const [department, setDepartment] = useState(initialSettings.department);
  const [defaultWidth, setDefaultWidth] = useState(initialSettings.defaultWidth);
  const [defaultHeight, setDefaultHeight] = useState(initialSettings.defaultHeight);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(initialSettings.autoRefreshInterval);
  const [adminApiKeyValue, setAdminApiKeyValue] = useState(() => getAdminApiKey());

  // Image Types & Formats Config State
  const [allowedTypes, setAllowedTypes] = useState<string[]>(initialSettings.imageConfig.allowedTypes);
  const [customTypeInput, setCustomTypeInput] = useState('');
  const [exportFormat, setExportFormat] = useState<SystemImageConfig['exportFormat']>(initialSettings.imageConfig.exportFormat);
  const [maxSizeMb, setMaxSizeMb] = useState(initialSettings.imageConfig.maxSizeMb);
  const [compressionQuality, setCompressionQuality] = useState<SystemImageConfig['compressionQuality']>(initialSettings.imageConfig.compressionQuality);
  const [autoOptimizeForDocx, setAutoOptimizeForDocx] = useState(initialSettings.imageConfig.autoOptimizeForDocx);

  // SLOT PHOTO TYPES CUSTOMIZATION STATE
  const [photoTypeOptions, setPhotoTypeOptions] = useState<PhotoTypeOption[]>(() => loadPhotoTypeOptions());
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [isAddingPhotoType, setIsAddingPhotoType] = useState(false);
  const [editingTypeKey, setEditingTypeKey] = useState<string | null>(null);

  // Form State for Adding / Editing Photo Types
  const [formEmoji, setFormEmoji] = useState('📷');
  const [formLabel, setFormLabel] = useState('');
  const [formCategory, setFormCategory] = useState<PhotoTypeOption['category']>('VISUAL');
  const [formAiPrompt, setFormAiPrompt] = useState('');

  const [isSaved, setIsSaved] = useState(false);

  const handleToggleType = (extId: string) => {
    setAllowedTypes(prev =>
      prev.includes(extId) ? prev.filter(t => t !== extId) : [...prev, extId]
    );
  };

  const handleAddCustomType = () => {
    const clean = customTypeInput.trim().toLowerCase().replace(/^\./, '');
    if (clean && !allowedTypes.includes(clean)) {
      setAllowedTypes(prev => [...prev, clean]);
      setCustomTypeInput('');
    }
  };

  const handleRemoveType = (typeToRemove: string) => {
    setAllowedTypes(prev => prev.filter(t => t !== typeToRemove));
  };

  // SLOT PHOTO TYPE HANDLERS
  const handleOpenAddForm = () => {
    setEditingTypeKey(null);
    setFormEmoji('📷');
    setFormLabel('');
    setFormCategory('VISUAL');
    setFormAiPrompt('Phân tích chi tiết hình ảnh kiểm định QC sản phẩm.');
    setIsAddingPhotoType(true);
  };

  const handleOpenEditForm = (option: PhotoTypeOption) => {
    setEditingTypeKey(option.type);
    setFormEmoji(option.iconEmoji || '📷');
    setFormLabel(option.label);
    setFormCategory(option.category);
    setFormAiPrompt(option.aiPromptInstruction);
    setIsAddingPhotoType(true);
  };

  const handleSavePhotoType = () => {
    if (!formLabel.trim()) return;

    if (editingTypeKey) {
      // Update existing photo type
      const updated = photoTypeOptions.map((opt) =>
        opt.type === editingTypeKey
          ? {
              ...opt,
              label: formLabel.trim(),
              iconEmoji: formEmoji.trim() || '📷',
              category: formCategory,
              aiPromptInstruction: formAiPrompt.trim(),
            }
          : opt
      );
      setPhotoTypeOptions(updated);
      savePhotoTypeOptions(updated);
    } else {
      // Create new custom photo type
      const newKey = `CUSTOM_${Date.now()}`;
      const newOption: PhotoTypeOption = {
        type: newKey,
        label: formLabel.trim(),
        iconEmoji: formEmoji.trim() || '📷',
        category: formCategory,
        aiPromptInstruction: formAiPrompt.trim() || 'Phân tích hình ảnh kiểm định sản phẩm.',
      };
      const updated = [...photoTypeOptions, newOption];
      setPhotoTypeOptions(updated);
      savePhotoTypeOptions(updated);
    }

    setIsAddingPhotoType(false);
    setEditingTypeKey(null);
  };

  const handleDeletePhotoType = (typeKey: string) => {
    if (photoTypeOptions.length <= 1) return;
    const updated = photoTypeOptions.filter((opt) => opt.type !== typeKey);
    setPhotoTypeOptions(updated);
    savePhotoTypeOptions(updated);
  };

  const handleResetPhotoTypes = () => {
    if (window.confirm('Bạn có chắc muốn khôi phục danh sách Loại Ảnh về mặc định ban đầu?')) {
      const resetList = resetPhotoTypeOptions();
      setPhotoTypeOptions(resetList);
      setIsAddingPhotoType(false);
      setEditingTypeKey(null);
    }
  };

  const filteredPhotoTypes = photoTypeOptions.filter((opt) =>
    filterCategory === 'ALL' ? true : opt.category === filterCategory
  );

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminApiKey(adminApiKeyValue, { persist: true });

    saveSystemSettings({
      factoryName,
      department,
      defaultWidth,
      defaultHeight,
      autoRefreshInterval,
      imageConfig: {
        allowedTypes,
        exportFormat,
        maxSizeMb,
        compressionQuality,
        autoOptimizeForDocx,
      },
    });

    savePhotoTypeOptions(photoTypeOptions);

    onAuthUpdated?.();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Cấu Hình Hệ Thống & Loại Ảnh Kiểm Định (.docx)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Thiết lập thông tin nhà máy, tùy biến danh sách Loại Ảnh cho Slot, định dạng ảnh xuất báo cáo Word và kết nối API
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Factory Header Config */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>Thông Tin Header Tiêu Đề Trên Báo Cáo Word (.docx)</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên Nhà Máy / Doanh Nghiệp
              </label>
              <input
                type="text"
                value={factoryName}
                onChange={(e) => setFactoryName(e.target.value)}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên Bộ Phận Kiểm Định
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION: CUSTOMIZABLE SLOT PHOTO TYPES (LOẠI ẢNH KHI TẠO SLOT) */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-sky-600" />
                <span>Cấu Hình Danh Sách Loại Ảnh Khi Tạo Slot Kiểm Định</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Tùy biến danh sách hiển thị ở Menu Dropdown khi chọn Loại Ảnh cho từng Slot chụp ảnh trong Tạo Mẫu Kiểm Tra
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetPhotoTypes}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5"
                title="Khôi phục về 21 loại ảnh mặc định"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi Phục Mặc Định</span>
              </button>
              <button
                type="button"
                onClick={handleOpenAddForm}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ Thêm Loại Ảnh Mới</span>
              </button>
            </div>
          </div>

          {/* Form Add / Edit Photo Type Modal/Card */}
          {isAddingPhotoType && (
            <div className="bg-sky-50/70 border border-sky-200 p-4 rounded-xl space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-sky-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-600" />
                  <span>{editingTypeKey ? 'Chỉnh Sửa Loại Ảnh' : 'Thêm Loại Ảnh Mới Cho Slot'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddingPhotoType(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Emoji / Biểu tượng
                  </label>
                  <input
                    type="text"
                    value={formEmoji}
                    onChange={(e) => setFormEmoji(e.target.value)}
                    placeholder="📱, 🔍, 🔋..."
                    className="w-full p-2 text-xs text-center font-bold bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Tên Loại Ảnh (Hiển thị ở Dropdown Slot)
                  </label>
                  <input
                    type="text"
                    value={formLabel}
                    onChange={(e) => setFormLabel(e.target.value)}
                    placeholder="VD: Mặt sau (Mặt lưng / Camera bump), Tem IMEI..."
                    className="w-full p-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Phân Loại / Danh Mục
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as PhotoTypeOption['category'])}
                    className="w-full p-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="VISUAL">Ngoại quan (VISUAL)</option>
                    <option value="ANIMATION">Khởi động (ANIMATION)</option>
                    <option value="IMEI">IMEI & Tem (IMEI)</option>
                    <option value="CAMERA">Camera & Mic (CAMERA)</option>
                    <option value="BLUETOOTH">Bluetooth (BLUETOOTH)</option>
                    <option value="MMI">Màn hình MMI (MMI)</option>
                    <option value="OTHER">Khác (OTHER)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Chỉ Dẫn AI Vision Prompt (AI Tự Động Nhận Diện)
                </label>
                <textarea
                  rows={2}
                  value={formAiPrompt}
                  onChange={(e) => setFormAiPrompt(e.target.value)}
                  placeholder="Nhập mô tả cho AI phát hiện lỗi, sê-ri hoặc đốm khi công nhân chụp ảnh..."
                  className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingPhotoType(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSavePhotoType}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-sm"
                >
                  Lưu Loại Ảnh
                </button>
              </div>
            </div>
          )}

          {/* Filter Categories Bar */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setFilterCategory('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                filterCategory === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất Cả ({photoTypeOptions.length})
            </button>
            {Object.entries(CATEGORY_LABELS).map(([cat, config]) => {
              const count = photoTypeOptions.filter((opt) => opt.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                    filterCategory === cat
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {config.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Photo Types Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredPhotoTypes.map((opt) => {
              const catInfo = CATEGORY_LABELS[opt.category] || CATEGORY_LABELS.OTHER;
              return (
                <div
                  key={opt.type}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between hover:border-slate-300 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{opt.iconEmoji || '📷'}</span>
                      <span className="font-bold text-xs text-slate-900 truncate" title={opt.label}>
                        {opt.label}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${catInfo.color}`}>
                      {catInfo.label}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-500 line-clamp-2 italic bg-white p-2 rounded-lg border border-slate-100">
                    "{opt.aiPromptInstruction}"
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <span className="font-mono text-slate-400 truncate max-w-[150px]" title={opt.type}>
                      ID: {opt.type}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditForm(opt)}
                        className="p-1 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                        title="Sửa loại ảnh này"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePhotoType(opt.type)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Xóa loại ảnh"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* IMAGE FILE EXTENSIONS & FORMAT CUSTOMIZATION */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-purple-600" />
              <span>Cấu Hình Tùy Biến Định Dạng File Ảnh & Tệp Đầu Ra</span>
            </h2>
            <span className="text-[11px] font-mono text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full font-bold">
              File Extensions
            </span>
          </div>

          {/* Section 1: Allowed Image File Types */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>1. Các Loại File Ảnh Chấp Nhận Tải Lên (Allowed Image Extensions)</span>
              <span className="text-[11px] text-slate-400 font-normal">Đã chọn: {allowedTypes.length} loại</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
              {AVAILABLE_EXTENSIONS.map((ext) => {
                const isSelected = allowedTypes.includes(ext.id);
                return (
                  <button
                    key={ext.id}
                    type="button"
                    onClick={() => handleToggleType(ext.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-purple-50/80 border-purple-300 text-purple-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold">{ext.label}</span>
                      <span
                        className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] ${
                          isSelected ? 'bg-purple-600 text-white' : 'border border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 line-clamp-1">{ext.desc}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Extension Add Input */}
            <div className="pt-2 flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  value={customTypeInput}
                  onChange={(e) => setCustomTypeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomType();
                    }
                  }}
                  placeholder="Thêm đuôi mở rộng khác (VD: tiff, raw, avif)..."
                  className="w-full pl-3 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomType}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Loại</span>
              </button>
            </div>

            {/* Selected Active Extensions Tag Cloud */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 font-medium mr-1">Danh sách kích hoạt:</span>
              {allowedTypes.map((t) => (
                <span
                  key={t}
                  className="text-[11px] font-mono font-bold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md flex items-center gap-1 border border-purple-200"
                >
                  .{t.toUpperCase()}
                  <button
                    type="button"
                    onClick={() => handleRemoveType(t)}
                    className="hover:text-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Section 2: Export Image Format Selection */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              2. Định Dạng Ảnh Đầu Ra Khi Xuất Báo Cáo Word (.docx)
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat('AUTO')}
                className={`p-3.5 rounded-xl border text-left transition-all space-y-1 ${
                  exportFormat === 'AUTO'
                    ? 'bg-blue-50 border-blue-400 text-blue-900 ring-2 ring-blue-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>⚡ Tự Động (AUTO)</span>
                  {exportFormat === 'AUTO' && <Check className="w-4 h-4 text-blue-600" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Giữ nguyên định dạng ảnh gốc nếu tương thích với MS Word (Khuyên dùng).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('PNG')}
                className={`p-3.5 rounded-xl border text-left transition-all space-y-1 ${
                  exportFormat === 'PNG'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>🖼️ Chuyển Sang PNG</span>
                  {exportFormat === 'PNG' && <Check className="w-4 h-4 text-emerald-600" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Chuyển toàn bộ ảnh sang PNG. Tối ưu độ sắc nét, tương thích 100% mọi phiên bản Office.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('JPG')}
                className={`p-3.5 rounded-xl border text-left transition-all space-y-1 ${
                  exportFormat === 'JPG'
                    ? 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs">
                  <span>📷 Chuyển Sang JPG</span>
                  {exportFormat === 'JPG' && <Check className="w-4 h-4 text-amber-600" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Chuyển sang JPG chuẩn. Tối ưu dung lượng file Word nhẹ, tải & mở nhanh.
                </p>
              </button>
            </div>
          </div>

          {/* Section 3: Size Limits & Quality */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Giới Hạn Dung Lượng File Ảnh Tải Lên
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxSizeMb}
                  onChange={(e) => setMaxSizeMb(Number(e.target.value))}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs font-bold text-slate-500">MB</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chất Lượng Tối Ưu Nén Ảnh
              </label>
              <select
                value={compressionQuality}
                onChange={(e) => setCompressionQuality(e.target.value as SystemImageConfig['compressionQuality'])}
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="MEDIUM">MEDIUM - Cân bằng 75% (Khuyên dùng)</option>
                <option value="HIGH">HIGH - Chất lượng cao 90%</option>
                <option value="LOW">LOW - Nén sâu 50% (Cho mạng yếu)</option>
                <option value="ORIGINAL">ORIGINAL - Giữ nguyên 100% gốc</option>
              </select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoOptimizeForDocx}
                  onChange={(e) => setAutoOptimizeForDocx(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                />
                <span>Tự động co giãn & tối ưu tỷ lệ khung ảnh chèn ô bảng Word</span>
              </label>
            </div>
          </div>
        </div>

        {/* API Server Connection */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>Kết Nối API Server Local/VPS</span>
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Admin API Key cho tester nội bộ
            </label>
            <input
              type="password"
              value={adminApiKeyValue}
              onChange={(e) => setAdminApiKeyValue(e.target.value)}
              placeholder="Nhập QC_ADMIN_API_KEY để tải lệnh và xuất URL session"
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Key sẽ được lưu trên trình duyệt của thiết bị này để lần sau không cần đăng nhập lại. Nếu đổi mật khẩu trên VPS, cập nhật lại key ở đây.
            </p>
          </div>
        </div>

        {/* Image Dimensions Default Config */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>Kích Thước Mặc Định Khung Ảnh Chèn Ô Bảng Word (mm)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chiều Rộng Tối Đa (Max Width)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={defaultWidth}
                  onChange={(e) => setDefaultWidth(Number(e.target.value))}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs font-bold text-slate-500">mm</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chiều Cao Tối Đa (Max Height)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={defaultHeight}
                  onChange={(e) => setDefaultHeight(Number(e.target.value))}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs font-bold text-slate-500">mm</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tần Số Làm Mới Dữ Liệu Xưởng (giây)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg"
                />
                <span className="text-xs font-bold text-slate-500">giây</span>
              </div>
            </div>
          </div>
        </div>

        {/* Save & Reset Actions */}
        <div className="flex items-center justify-end pt-4">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{isSaved ? 'Đã Lưu Cấu Hình!' : 'Lưu Cấu Hình Hệ Thống'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

