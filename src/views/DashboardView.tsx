import React, { useEffect, useState } from 'react';
import { 
  ClipboardList, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  AlertCircle, 
  FileText, 
  FileCheck2, 
  Download, 
  TrendingUp, 
  UserCheck, 
  Building2,
  Eye,
  Zap
} from 'lucide-react';
import { DashboardKPI, InspectionJob } from '../types/qc';
import { adminApi } from '../services/adminApi';
import { generateDocxReport } from '../services/docxExportService';

interface DashboardViewProps {
  onNavigateTab: (tab: 'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings') => void;
  onSelectJobForReview: (job: InspectionJob) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateTab,
  onSelectJobForReview
}) => {
  const [kpis, setKpis] = useState<DashboardKPI>({ totalJobs: 0, inProgress: 0, completed: 0, failed: 0, passRate: 100, todayCount: 0 });
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState<'today' | '7d' | 'all'>('all');

  const loadDashboard = async () => {
    setLoadError('');
    try {
      const [nextKpis, nextJobs] = await Promise.all([adminApi.getKpis(), adminApi.listJobs()]);
      setKpis(nextKpis);
      setJobs(nextJobs);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Không tải được dashboard từ server.');
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const scopedJobs = jobs.filter((job) => {
    if (period === 'all') return true;
    const createdAt = new Date(job.createdAt).getTime();
    const cutoff = Date.now() - (period === 'today' ? 24 : 7 * 24) * 60 * 60 * 1000;
    return createdAt >= cutoff;
  });
  const scopedCompleted = scopedJobs.filter((job) => job.status === 'COMPLETED').length;
  const scopedFailed = scopedJobs.filter((job) => job.status === 'FAILED').length;
  const scopedFinished = scopedCompleted + scopedFailed;
  const scopedKpis: DashboardKPI = {
    totalJobs: scopedJobs.length,
    inProgress: scopedJobs.filter((job) => job.status === 'IN_PROGRESS').length,
    completed: scopedCompleted,
    failed: scopedFailed,
    passRate: scopedFinished ? Math.round((scopedCompleted / scopedFinished) * 100) : 0,
    todayCount: scopedJobs.filter((job) => new Date(job.createdAt).getTime() >= Date.now() - 86400000).length,
  };
  const recentJobs = scopedJobs.slice(0, 5);
  const failedJobs = scopedJobs.filter(j => j.status === 'FAILED');

  const handleQuickExport = async (job: InspectionJob, e: React.MouseEvent) => {
    e.stopPropagation();
    await generateDocxReport(job);
    await loadDashboard();
  };

  return (
    <div className="space-y-6">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Giám sát Quality Control & Dashboard KPI
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Theo dõi tiến độ thu thập dữ liệu ảnh từ xưởng sản xuất theo thời gian thực và quản lý xuất báo cáo Word.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          Thời gian
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700">
            <option value="today">24 giờ qua</option>
            <option value="7d">7 ngày qua</option>
            <option value="all">Toàn bộ</option>
          </select>
        </label>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <button
            onClick={() => onNavigateTab('templates')}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <FileCheck2 className="w-4 h-4 text-slate-500" />
            <span>Cấu hình Mẫu Word</span>
          </button>
          <button
            onClick={() => onNavigateTab('inspections')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            <span>Quản lý Tất cả Lô QC ({scopedKpis.totalJobs})</span>
          </button>
        </div>
      </div>

      {/* 4 Core KPI Cards */}
      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {loadError}. Kiểm tra Admin API Key trong mục Cài đặt.
        </div>
      )}

      <div data-tour="dashboard-kpis" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Jobs */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Tổng số Lệnh Kiểm Tra
            </span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900">{scopedKpis.totalJobs}</span>
            <span className="text-xs text-slate-500 font-medium">lô hàng</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span title="Chỉ tính các lô đã kết thúc: Đã hoàn thành / (Đã hoàn thành + Có lỗi)">Tỷ lệ đạt (lô đã kết thúc)</span>
            <span className="font-bold text-emerald-600">{scopedKpis.passRate}%</span>
          </div>
        </div>

        {/* In Progress */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Đang Kiểm Tra Tại Xưởng
            </span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5 animate-spin" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-amber-900">{scopedKpis.inProgress}</span>
            <span className="text-xs text-amber-700 font-medium">chuyền đang chạy</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Công nhân đang gửi ảnh</span>
            <span className="font-bold text-amber-600">Thời gian thực</span>
          </div>
        </div>

        {/* Completed / Ready for Review */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Đã Hoàn Thành / Chờ Duyệt
            </span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-900">{scopedKpis.completed}</span>
            <span className="text-xs text-emerald-700 font-medium">sẵn sàng xuất Word</span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Sẵn sàng tải báo cáo</span>
            <span className="font-bold text-emerald-600">Đạt ISO</span>
          </div>
        </div>

        {/* Failed Jobs - High Priority Red Alert */}
        <div className="bg-red-50 p-5 rounded-xl border border-red-200 shadow-sm relative overflow-hidden group hover:border-red-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-800">
              Lô Hàng Có Lỗi (FAIL)
            </span>
            <div className="w-9 h-9 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-red-900">{scopedKpis.failed}</span>
            <span className="text-xs text-red-700 font-medium">cần xử lý khẩn cấp</span>
          </div>
          <div className="mt-3 pt-3 border-t border-red-200/60 flex items-center justify-between text-xs text-red-700">
            <span>{scopedKpis.failed > 0 ? 'Cảnh báo ưu tiên' : 'Không có lô cần xử lý'}</span>
            {scopedKpis.failed > 0 && <span className="font-bold underline cursor-pointer" onClick={() => onNavigateTab('inspections')}>Xem chi tiết →</span>}
          </div>
        </div>
      </div>

      {/* High Priority Warning Bar for FAIL Jobs */}
      {failedJobs.length > 0 && (
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/10 shrink-0">
              <AlertCircle className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="font-bold text-sm">
                Cảnh báo QC: Có {failedJobs.length} lô hàng không đạt tiêu chuẩn kiểm định!
              </div>
              <div className="text-xs text-red-100">
                Lô hàng gần nhất: <strong className="underline">{failedJobs[0].id}</strong> - Mã sản phẩm: {failedJobs[0].productCode} ({failedJobs[0].workerName})
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelectJobForReview(failedJobs[0])}
            className="px-4 py-2 bg-white text-red-700 hover:bg-slate-100 font-bold text-xs rounded-lg shadow shrink-0 transition-all active:scale-95"
          >
            Kiểm Duyệt Khẩn Cấp & Sửa Lỗi →
          </button>
        </div>
      )}

      {/* Recent Activity Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Nhật ký Lệnh Kiểm Tra QC Mới Nhất
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cập nhật trực tiếp từ xưởng sản xuất theo thời gian thực
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('inspections')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>Xem toàn bộ danh sách</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-bold text-xs uppercase border-b border-slate-200">
                <th className="py-3.5 px-4">Mã Lệnh & Lô</th>
                <th className="py-3.5 px-4">Sản Phẩm</th>
                <th className="py-3.5 px-4">Công Nhân & Chuyền</th>
                <th className="py-3.5 px-4 text-center">Trạng Thái QC</th>
                <th className="py-3.5 px-4">Thời Gian</th>
                <th className="py-3.5 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {recentJobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-sm text-slate-500">
                    Chưa có lệnh QC để kiểm tra.
                  </td>
                </tr>
              )}
              {recentJobs.map((job) => {
                const isFail = job.status === 'FAILED';
                const isDone = job.status === 'COMPLETED';
                const isProgress = job.status === 'IN_PROGRESS';

                return (
                  <tr 
                    key={job.id} 
                    onClick={() => onSelectJobForReview(job)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 group-hover:text-blue-600">
                        {job.id}
                      </div>
                      <div className="text-xs text-slate-500">
                        Lô: <code className="font-semibold text-slate-700">{job.batchNumber}</code>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{job.productName}</div>
                      <div className="text-xs text-slate-500">Mã: {job.productCode}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{job.workerName}</div>
                      <div className="text-xs text-slate-500">{job.line}</div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {isDone && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-green-50 text-green-700 text-[10px] font-bold rounded-full border border-green-100">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ĐÃ XONG (PASS)</span>
                        </span>
                      )}
                      {isFail && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-700 text-[10px] font-bold rounded-full border border-red-100">
                          <XCircle className="w-3 h-3" />
                          <span>CÓ LỖI (FAIL)</span>
                        </span>
                      )}
                      {isProgress && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full border border-amber-100">
                          <Clock className="w-3 h-3 animate-spin" />
                          <span>ĐANG LÀM</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-500">
                      {new Date(job.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectJobForReview(job);
                          }}
                          className="px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-medium transition-colors flex items-center gap-1"
                          title="Xem ảnh chụp thực tế & sửa câu chữ"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Kiểm duyệt</span>
                        </button>
                        <button
                          onClick={(e) => handleQuickExport(job, e)}
                          className="px-2.5 py-1.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold transition-colors flex items-center gap-1"
                          title="Xuất file báo cáo Word .docx"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Xuất Word</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
