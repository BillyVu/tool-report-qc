import React, { useState } from 'react';
import { KeyRound, Building2, RefreshCw, FileText, Check } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [factoryName, setFactoryName] = useState('NHÀ MÁY SẢN XUẤT ĐIỆN TỬ & THIẾT BỊ THÔNG MINH');
  const [department, setDepartment] = useState('BỘ PHẬN PHÁT TRIỂN & QUẢN LÝ CHẤT LƯỢNG (QA/QC)');
  const [defaultWidth, setDefaultWidth] = useState(60);
  const [defaultHeight, setDefaultHeight] = useState(45);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);
  const [adminApiKey, setAdminApiKey] = useState(() => localStorage.getItem('qc_admin_api_key') || '');
  const [isSaved, setIsSaved] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('qc_admin_api_key', adminApiKey.trim());
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleResetData = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa cache local trên trình duyệt này? Dữ liệu server PostgreSQL không bị ảnh hưởng.')) {
      ['qc_admin_templates_v2', 'qc_admin_jobs_v2', 'qc_admin_logs_v2'].forEach((key) => localStorage.removeItem(key));
      window.location.reload();
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
            <input
              type="password"
              value={adminApiKey}
              onChange={(e) => setAdminApiKey(e.target.value)}
              placeholder="Nhập QC_ADMIN_API_KEY để tải lệnh và xuất URL session"
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Key này lưu trong trình duyệt để verify nội bộ. Production cần thay bằng đăng nhập/RBAC trước khi public.
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
        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            onClick={handleResetData}
            className="px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Xóa Cache Local Của Trình Duyệt</span>
          </button>

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
