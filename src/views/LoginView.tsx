import React, { useState } from 'react';
import { BookOpen, KeyRound, LockKeyhole } from 'lucide-react';
import { createAdminApi, setAdminApiKey } from '../services/adminApi';
import { VeroBrand } from '../components/branding/VeroBrand';

interface LoginViewProps {
  onAuthenticated: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onAuthenticated }) => {
  const [adminKey, setAdminKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextKey = adminKey.trim();
    if (!nextKey) {
      setError('Vui lòng nhập mật khẩu admin.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await createAdminApi({ adminKey: nextKey }).getKpis();
      setAdminApiKey(nextKey, { persist: true });
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mật khẩu không hợp lệ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-900">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <VeroBrand tone="dark" className="mx-auto mb-4 w-fit text-2xl" />
          <h1 className="text-2xl font-bold text-white">Đăng nhập quản trị</h1>
          <p className="mt-2 text-sm text-slate-400">
            Đăng nhập admin để quản lý checklist, lệnh kiểm tra và báo cáo.
          </p>
          <a
            href="/guide"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 transition-colors hover:border-blue-500 hover:bg-slate-900 hover:text-white"
          >
            <BookOpen className="h-4 w-4" />
            <span>Xem hướng dẫn sử dụng</span>
          </a>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <LockKeyhole className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Yêu cầu mật khẩu</h2>
              <p className="text-xs text-slate-500">Dùng QC_ADMIN_API_KEY đã cấu hình trên VPS.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mật khẩu admin
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                autoFocus
                value={adminKey}
                onChange={(event) => setAdminKey(event.target.value)}
                placeholder="Nhập mật khẩu để vào hệ thống"
                className="w-full pl-9 pr-3 py-3 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              Sau khi login thành công, trình duyệt sẽ lưu phiên để lần sau không cần nhập lại trên cùng thiết bị.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-3 text-sm font-bold transition-colors"
          >
            {isSubmitting ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
};
