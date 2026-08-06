import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, Building2, FileText, Check, Camera, Search, Plus, Save, Edit3, Eye, EyeOff, Trash2, Bot, ShieldCheck } from 'lucide-react';
import { PhotoTypeOption } from '../constants/photoTypes';
import { SavePhotoTypePayload, VeroPromptProfile, adminApi, getAdminApiKey, setAdminApiKey } from '../services/adminApi';

interface SettingsViewProps {
  onAuthUpdated?: () => void;
}

const CATEGORY_LABELS: Record<PhotoTypeOption['category'], string> = {
  VISUAL: 'Ngoại quan',
  ANIMATION: 'Khởi động',
  IMEI: 'IMEI / thông số',
  CAMERA: 'Camera / mic',
  BLUETOOTH: 'Bluetooth',
  MMI: 'Màn hình MMI',
  OTHER: 'Khác',
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as Array<[PhotoTypeOption['category'], string]>;
const VERIFICATION_MODE_LABELS: Record<NonNullable<PhotoTypeOption['verificationMode']>, string> = {
  OCR_ID: 'OCR mã / IMEI',
  OCR_TEXT: 'OCR văn bản',
  SCREEN_STATE: 'Trạng thái màn hình',
  VISUAL: 'Quan sát ngoại quan',
  MEASUREMENT: 'Đo lường',
  EVIDENCE_ONLY: 'Chỉ lưu bằng chứng',
};
const VERIFICATION_MODE_OPTIONS = Object.entries(VERIFICATION_MODE_LABELS) as Array<[NonNullable<PhotoTypeOption['verificationMode']>, string]>;

const EMPTY_PHOTO_TYPE_FORM: SavePhotoTypePayload = {
  type: '',
  label: '',
  category: 'OTHER',
  iconEmoji: '📷',
  verificationMode: 'EVIDENCE_ONLY',
  schemaVersion: '1.0',
  outputSchema: { type: 'object', required: [], properties: {} },
  aiPromptInstruction: '',
  isActive: true,
  sortOrder: 999,
};

export const SettingsView: React.FC<SettingsViewProps> = ({ onAuthUpdated }) => {
  const [factoryName, setFactoryName] = useState('NHÀ MÁY SẢN XUẤT ĐIỆN TỬ & THIẾT BỊ THÔNG MINH');
  const [department, setDepartment] = useState('BỘ PHẬN PHÁT TRIỂN & QUẢN LÝ CHẤT LƯỢNG (QA/QC)');
  const [defaultWidth, setDefaultWidth] = useState(60);
  const [defaultHeight, setDefaultHeight] = useState(45);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);
  const [adminApiKeyValue, setAdminApiKeyValue] = useState(() => getAdminApiKey());
  const [isSaved, setIsSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [configError, setConfigError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [photoTypes, setPhotoTypes] = useState<PhotoTypeOption[]>([]);
  const [isLoadingPhotoTypes, setIsLoadingPhotoTypes] = useState(true);
  const [photoTypeError, setPhotoTypeError] = useState('');
  const [photoTypeSearch, setPhotoTypeSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | PhotoTypeOption['category']>('ALL');
  const [isPhotoTypeEditorOpen, setIsPhotoTypeEditorOpen] = useState(false);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [draft, setDraft] = useState<SavePhotoTypePayload>(EMPTY_PHOTO_TYPE_FORM);
  const [isSavingPhotoType, setIsSavingPhotoType] = useState(false);
  const [veroProfiles, setVeroProfiles] = useState<VeroPromptProfile[]>([]);
  const [veroDrafts, setVeroDrafts] = useState<Record<string, string>>({});
  const [isLoadingVeroProfiles, setIsLoadingVeroProfiles] = useState(true);
  const [veroError, setVeroError] = useState('');
  const [savingVeroProfile, setSavingVeroProfile] = useState<string | null>(null);
  const [verifyingVeroProfile, setVerifyingVeroProfile] = useState<string | null>(null);
  const [verifyingPhotoType, setVerifyingPhotoType] = useState<string | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (![defaultWidth, defaultHeight, autoRefreshInterval].every((value) => Number.isFinite(value) && value > 0)) {
      setConfigError('Kích thước ảnh và tần số đồng bộ phải là số lớn hơn 0.');
      return;
    }
    setConfigError('');
    setAdminApiKey(adminApiKeyValue, { persist: true });
    onAuthUpdated?.();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const testApiConnection = async () => {
    setConnectionStatus('testing');
    setConfigError('');
    setAdminApiKey(adminApiKeyValue, { persist: false });
    try {
      await adminApi.listJobs();
      setConnectionStatus('success');
    } catch (error) {
      setConnectionStatus('error');
      setConfigError(error instanceof Error ? error.message : 'Không kết nối được API Server.');
    }
  };

  const reloadPhotoTypes = async () => {
    setIsLoadingPhotoTypes(true);
    setPhotoTypeError('');
    try {
      setPhotoTypes(await adminApi.listPhotoTypes());
    } catch (error) {
      setPhotoTypeError(error instanceof Error ? error.message : 'Không tải được danh sách loại ảnh.');
    } finally {
      setIsLoadingPhotoTypes(false);
    }
  };

  useEffect(() => {
    void reloadPhotoTypes();
  }, []);

  const reloadVeroProfiles = async () => {
    setIsLoadingVeroProfiles(true);
    setVeroError('');
    try {
      const profiles = await adminApi.listVeroPromptProfiles();
      setVeroProfiles(profiles);
      setVeroDrafts(Object.fromEntries(profiles.map((item) => [item.profileKey, item.instruction])));
    } catch (error) {
      setVeroError(error instanceof Error ? error.message : 'Không tải được cấu hình Vero.');
    } finally {
      setIsLoadingVeroProfiles(false);
    }
  };

  useEffect(() => {
    void reloadVeroProfiles();
  }, []);

  const saveVeroProfile = async (profile: VeroPromptProfile) => {
    const instruction = veroDrafts[profile.profileKey] || '';
    setSavingVeroProfile(profile.profileKey);
    setVeroError('');
    try {
      await adminApi.updateVeroPromptProfile(profile.profileKey, instruction);
      await reloadVeroProfiles();
    } catch (error) {
      setVeroError(error instanceof Error ? error.message : 'Không thể xuất bản cấu hình Vero.');
    } finally {
      setSavingVeroProfile(null);
    }
  };

  const verifyVeroProfile = async (profile: VeroPromptProfile) => {
    setVerifyingVeroProfile(profile.profileKey);
    setVeroError('');
    try {
      await adminApi.verifyVeroPromptProfile(profile.profileKey);
      await reloadVeroProfiles();
    } catch (error) {
      setVeroError(error instanceof Error ? error.message : 'Không thể xác nhận prompt Vero.');
    } finally {
      setVerifyingVeroProfile(null);
    }
  };

  const filteredPhotoTypes = useMemo(() => {
    const keyword = photoTypeSearch.trim().toLowerCase();
    return photoTypes.filter((item) => {
      const matchesKeyword = !keyword || item.label.toLowerCase().includes(keyword) || item.type.toLowerCase().includes(keyword);
      const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
      return matchesKeyword && matchesCategory;
    });
  }, [categoryFilter, photoTypeSearch, photoTypes]);

  const startCreatePhotoType = () => {
    setEditingType(null);
    setIsPhotoTypeEditorOpen(true);
    setDraft({
      ...EMPTY_PHOTO_TYPE_FORM,
      sortOrder: photoTypes.length ? Math.max(...photoTypes.map((item) => item.sortOrder || 0)) + 10 : 10,
    });
  };

  const startEditPhotoType = (item: PhotoTypeOption) => {
    setEditingType(item.type);
    setIsPhotoTypeEditorOpen(true);
    setDraft({
      label: item.label,
      category: item.category,
      iconEmoji: item.iconEmoji,
      verificationMode: item.verificationMode || 'EVIDENCE_ONLY',
      schemaVersion: item.schemaVersion || '1.0',
      outputSchema: item.outputSchema || { type: 'object', required: [], properties: {} },
      aiPromptInstruction: item.aiPromptInstruction,
      isActive: item.isActive ?? true,
      sortOrder: item.sortOrder ?? 999,
    });
  };

  const closePhotoTypeEditor = () => {
    setIsPhotoTypeEditorOpen(false);
    setEditingType(null);
    setDraft(EMPTY_PHOTO_TYPE_FORM);
  };

  const handleSavePhotoType = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPhotoType(true);
    setPhotoTypeError('');
    try {
      if (editingType) {
        await adminApi.updatePhotoType(editingType, draft);
      } else {
        await adminApi.createPhotoType(draft);
      }
      closePhotoTypeEditor();
      await reloadPhotoTypes();
    } catch (error) {
      setPhotoTypeError(error instanceof Error ? error.message : 'Không lưu được loại ảnh.');
    } finally {
      setIsSavingPhotoType(false);
    }
  };

  const handleTogglePhotoType = async (item: PhotoTypeOption) => {
    setPhotoTypeError('');
    try {
      await adminApi.updatePhotoType(item.type, { isActive: !(item.isActive ?? true) });
      await reloadPhotoTypes();
    } catch (error) {
      setPhotoTypeError(error instanceof Error ? error.message : 'Không đổi được trạng thái loại ảnh.');
    }
  };

  const handleDeletePhotoType = async (item: PhotoTypeOption) => {
    if (item.isSystem) {
      setPhotoTypeError('Loại ảnh hệ thống không thể xóa. Hãy tắt trạng thái Đang dùng để ẩn khỏi mẫu mới.');
      return;
    }
    const ok = window.confirm(`Xóa loại ảnh "${item.label}"? Chỉ nên xóa khi loại này chưa được dùng trong mẫu hoặc lệnh QC cũ.`);
    if (!ok) return;
    setPhotoTypeError('');
    try {
      await adminApi.deletePhotoType(item.type);
      if (editingType === item.type) closePhotoTypeEditor();
      await reloadPhotoTypes();
    } catch (error) {
      setPhotoTypeError(error instanceof Error ? error.message : 'Không xóa được loại ảnh.');
    }
  };

  const handleVerifyPhotoType = async (item: PhotoTypeOption) => {
    setVerifyingPhotoType(item.type);
    setPhotoTypeError('');
    try {
      await adminApi.verifyPhotoType(item.type);
      await reloadPhotoTypes();
    } catch (error) {
      setPhotoTypeError(error instanceof Error ? error.message : 'Không thể xác nhận prompt loại ảnh.');
    } finally {
      setVerifyingPhotoType(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Cấu Hình Hệ Thống & Mẫu Xuất Báo Cáo Word
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Thiết lập tiêu đề nhà máy, thông số mặc định cho khung ảnh chèn Word và tần số đồng bộ từ xưởng
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {configError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{configError}</div>}
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

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>Kết Nối API Server Local/VPS</span>
          </h2>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Admin API Key cho tester nội bộ
            </label>
            <div className="flex gap-2">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={adminApiKeyValue}
                onChange={(e) => setAdminApiKeyValue(e.target.value)}
                placeholder="Nhập QC_ADMIN_API_KEY để tải lệnh và xuất URL session"
                className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button type="button" onClick={() => setShowApiKey((value) => !value)} className="rounded-lg border border-slate-300 px-3 text-slate-600 hover:bg-slate-50" title={showApiKey ? 'Ẩn API key' : 'Hiện API key'}>
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button type="button" onClick={() => void testApiConnection()} disabled={connectionStatus === 'testing'} className="whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60">
                {connectionStatus === 'testing' ? 'Đang test...' : 'Test kết nối'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Key được che mặc định. Chỉ hiển thị khi bạn chủ động bấm biểu tượng mắt; không dùng chức năng lưu key trên máy dùng chung.
            </p>
            {connectionStatus === 'success' && <p className="mt-1 text-[11px] font-semibold text-emerald-700">Kết nối API Server thành công.</p>}
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
                  min={1}
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
                  min={1}
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
                  min={1}
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

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50/70">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-600" />
            <span>Cấu hình Vero</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-1 max-w-3xl">
            Quy tắc chung áp dụng cho mọi lần Vero kiểm tra và phân tích ảnh. Khi xuất bản, hệ thống tạo revision mới; kết quả ảnh sau đó sẽ lưu revision và mã kiểm chứng của prompt.
          </p>
        </div>

        {veroError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            {veroError}
          </div>
        )}

        <div className="divide-y divide-slate-200">
          {isLoadingVeroProfiles && <div className="px-6 py-6 text-sm text-slate-500">Đang tải cấu hình Vero...</div>}
          {!isLoadingVeroProfiles && veroProfiles.map((profile) => {
            const draft = veroDrafts[profile.profileKey] ?? profile.instruction;
            const changed = draft.trim() !== profile.instruction;
            const verified = Boolean(profile.verifiedAt && profile.verifiedRevision === profile.revision);
            return (
              <div key={profile.profileKey} className="p-6 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>{profile.label}</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1">{profile.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={`rounded border px-2 py-1 font-bold ${verified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {verified ? 'Đã verify' : 'Chưa verify'}
                      </span>
                      {profile.verifiedAt && (
                        <span className="text-slate-500">
                          {profile.verifiedBy || 'QC Admin'} · {new Date(profile.verifiedAt).toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-500 self-start">REV {profile.revision}</span>
                </div>
                <textarea
                  value={draft}
                  onChange={(event) => setVeroDrafts((current) => ({ ...current, [profile.profileKey]: event.target.value }))}
                  rows={4}
                  maxLength={4000}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg resize-y focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[11px] text-slate-500">{draft.length.toLocaleString('vi-VN')} / 4.000 ký tự. Prompt theo loại ảnh được ghép riêng và không thể thay thế quy tắc này.</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void verifyVeroProfile(profile)}
                      disabled={changed || verifyingVeroProfile === profile.profileKey}
                      className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-xs font-bold flex items-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{verifyingVeroProfile === profile.profileKey ? 'Đang verify...' : 'Verify prompt'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveVeroProfile(profile)}
                      disabled={!changed || savingVeroProfile === profile.profileKey}
                      className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>{savingVeroProfile === profile.profileKey ? 'Đang xuất bản...' : 'Xuất bản revision mới'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Camera className="w-4 h-4 text-indigo-600" />
                <span>Loại ảnh kiểm định</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-1 max-w-3xl">
                Quản lý nhãn ảnh, biểu tượng và hướng dẫn chuyên biệt theo loại ảnh. Hướng dẫn này được ghép với quy tắc Vero đã xuất bản ở trên; không thể làm yếu kiểm tra ảnh rõ, đúng khung và vật thể trung tâm.
              </p>
            </div>
            <button
              type="button"
              onClick={startCreatePhotoType}
              className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-2 self-start"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm loại ảnh</span>
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={photoTypeSearch}
                onChange={(e) => setPhotoTypeSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc mã loại ảnh..."
                className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="ALL">Tất cả nhóm</option>
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {isPhotoTypeEditorOpen && (
          <form onSubmit={handleSavePhotoType} className="p-6 border-b border-slate-200 bg-indigo-50/40 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[160px_1fr_180px_140px_110px] gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Mã loại ảnh</label>
                <input
                  type="text"
                  value={editingType || draft.type || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}
                  disabled={Boolean(editingType)}
                  placeholder="VD: SCREEN_WIFI"
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Tên hiển thị</label>
                <input
                  type="text"
                  value={draft.label || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="VD: Màn hình kết nối Wi-Fi"
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Nhóm</label>
                <select
                  value={draft.category || 'OTHER'}
                  onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value as PhotoTypeOption['category'] }))}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {CATEGORY_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Biểu tượng</label>
                <input
                  type="text"
                  value={draft.iconEmoji || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, iconEmoji: e.target.value }))}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Thứ tự</label>
                <input
                  type="number"
                  value={draft.sortOrder ?? 999}
                  onChange={(e) => setDraft((prev) => ({ ...prev, sortOrder: Number(e.target.value) }))}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[220px_140px_1fr] gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Chế độ xác minh</label>
                <select
                  value={draft.verificationMode || 'EVIDENCE_ONLY'}
                  onChange={(e) => setDraft((prev) => ({ ...prev, verificationMode: e.target.value as NonNullable<PhotoTypeOption['verificationMode']> }))}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  {VERIFICATION_MODE_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Schema version</label>
                <input
                  type="text"
                  value={draft.schemaVersion || '1.0'}
                  onChange={(e) => setDraft((prev) => ({ ...prev, schemaVersion: e.target.value }))}
                  className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Output schema JSON</label>
                <textarea
                  value={JSON.stringify(draft.outputSchema || { type: 'object', required: [], properties: {} }, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      setDraft((prev) => ({ ...prev, outputSchema: parsed }));
                      setPhotoTypeError('');
                    } catch {
                      setPhotoTypeError('Output schema phải là JSON hợp lệ.');
                    }
                  }}
                  rows={5}
                  className="w-full p-2.5 font-mono text-[11px] bg-white border border-slate-300 rounded-lg resize-y"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Hướng dẫn Vero khi phân tích ảnh</label>
              <textarea
                value={draft.aiPromptInstruction || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, aiPromptInstruction: e.target.value }))}
                rows={3}
                maxLength={2000}
                placeholder="Mô tả điều Vero cần kiểm tra trong loại ảnh này..."
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg resize-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">{(draft.aiPromptInstruction || '').length.toLocaleString('vi-VN')} / 2.000 ký tự</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.isActive ?? true}
                  onChange={(e) => setDraft((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="w-4 h-4 accent-indigo-600"
                />
                Đang dùng trong mẫu mới
              </label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closePhotoTypeEditor} className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  Hủy
                </button>
                <button type="submit" disabled={isSavingPhotoType} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  <span>{isSavingPhotoType ? 'Đang lưu...' : 'Lưu loại ảnh'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {photoTypeError && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
            {photoTypeError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3 font-bold">Loại ảnh</th>
                <th className="px-4 py-3 font-bold">Nhóm</th>
                <th className="px-4 py-3 font-bold">Hướng dẫn Vero</th>
                <th className="px-4 py-3 font-bold">Verify</th>
                <th className="px-4 py-3 font-bold text-center">Thứ tự</th>
                <th className="px-4 py-3 font-bold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingPhotoTypes && (
                <tr>
                  <td colSpan={6} className="px-6 py-6 text-sm text-slate-500">Đang tải loại ảnh kiểm định...</td>
                </tr>
              )}
              {!isLoadingPhotoTypes && filteredPhotoTypes.map((item) => (
                <tr key={item.type} className={!item.isActive ? 'bg-slate-50 text-slate-500' : 'bg-white'}>
                  <td className="px-6 py-4 min-w-[260px]">
                    <div className="flex items-start gap-3">
                      <span className="text-lg leading-none mt-0.5">{item.iconEmoji}</span>
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                          <span>{item.label}</span>
                          {item.isSystem && <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 text-[10px]">Hệ thống</span>}
                          {!item.isActive && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">Đã tắt</span>}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">{item.type}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-xs font-semibold text-slate-700 whitespace-nowrap">{CATEGORY_LABELS[item.category]}</td>
                  <td className="px-4 py-4 text-xs text-slate-500 min-w-[300px] max-w-xl">
                    <span className="line-clamp-2">{item.aiPromptInstruction}</span>
                  </td>
                  <td className="px-4 py-4 text-xs min-w-[180px]">
                    <div className="space-y-2">
                      <span className={`inline-flex rounded border px-2 py-1 font-bold ${item.promptVerifiedAt ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                        {item.promptVerifiedAt ? 'Đã verify' : 'Chưa verify'}
                      </span>
                      {item.promptVerifiedAt && (
                        <div className="text-[11px] text-slate-500">
                          {item.promptVerifiedBy || 'QC Admin'} · {new Date(item.promptVerifiedAt).toLocaleString('vi-VN')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center text-xs font-mono text-slate-500">{item.sortOrder ?? 999}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void handleVerifyPhotoType(item)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-emerald-50 text-emerald-600"
                        title="Verify prompt loại ảnh"
                        disabled={verifyingPhotoType === item.type}
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePhotoType(item)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                        title={item.isActive ? 'Tắt khỏi mẫu mới' : 'Bật lại cho mẫu mới'}
                      >
                        {item.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditPhotoType(item)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-indigo-600"
                        title="Sửa loại ảnh"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePhotoType(item)}
                        disabled={Boolean(item.isSystem)}
                        className="p-2 rounded-lg border border-slate-200 hover:bg-red-50 text-red-600 disabled:text-slate-300 disabled:hover:bg-white disabled:cursor-not-allowed"
                        title={item.isSystem ? 'Loại hệ thống không thể xóa' : 'Xóa loại ảnh'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoadingPhotoTypes && filteredPhotoTypes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-sm text-slate-500">Không có loại ảnh phù hợp bộ lọc.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
