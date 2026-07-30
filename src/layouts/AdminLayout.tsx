import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileCheck2, 
  ClipboardCheck, 
  History, 
  Settings, 
  Zap, 
  Sparkles, 
  ShieldCheck, 
  User,
  Plus,
  RefreshCw
} from 'lucide-react';
import { qcService } from '../services/qcService';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings') => void;
  onSimulateWorkerJob?: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  onSimulateWorkerJob
}) => {
  const [kpis, setKpis] = useState(qcService.getKPIs());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const unsubscribe = qcService.subscribe(() => {
      setKpis(qcService.getKPIs());
    });
    return unsubscribe;
  }, []);

  const handleSimulate = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      const newJob = qcService.simulateWorkerSubmission();
      setIsRefreshing(false);
      setToastMessage(`⚡ Đã nhận dữ liệu QC mới: ${newJob.id} (${newJob.workerName})`);
      if (onSimulateWorkerJob) onSimulateWorkerJob();
      
      setTimeout(() => setToastMessage(null), 4000);
    }, 500);
  };

  const navItems = [
    {
      id: 'dashboard',
      label: 'Bảng điều khiển',
      icon: LayoutDashboard,
      badge: kpis.inProgress > 0 ? `${kpis.inProgress}` : undefined,
    },
    {
      id: 'inspections',
      label: 'Lệnh Kiểm tra',
      icon: ClipboardCheck,
      badge: kpis.failed > 0 ? `${kpis.failed}` : undefined,
      badgeColor: 'bg-red-500 text-white'
    },
    {
      id: 'templates',
      label: 'Mẫu Checklist',
      icon: FileCheck2
    },
    {
      id: 'audit',
      label: 'Nhật ký Lịch sử',
      icon: History
    },
    {
      id: 'settings',
      label: 'Cài đặt hệ thống',
      icon: Settings
    }
  ];

  const pageTitles: Record<string, string> = {
    dashboard: 'Giám sát Trạng thái Lô hàng',
    inspections: 'Quản lý Lệnh Kiểm tra & Báo cáo',
    templates: 'Quản lý Mẫu Checklist & Ánh xạ Word',
    audit: 'Nhật ký Lịch sử Audit Log',
    settings: 'Cấu hình Hệ thống & Xuất Báo cáo'
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden text-slate-800">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3 animate-bounce text-xs font-medium">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
          <button 
            onClick={() => setToastMessage(null)} 
            className="ml-2 text-slate-400 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* SLEEK SIDEBAR */}
      <aside className="w-64 bg-slate-900 flex flex-col flex-shrink-0 border-r border-slate-800">
        {/* Brand Header */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-600/30">
            QC
          </div>
          <span className="text-white font-semibold text-lg tracking-tight">Core System</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick Simulator Button in Sidebar */}
        <div className="p-4 border-t border-slate-800/80">
          <button
            onClick={handleSimulate}
            disabled={isRefreshing}
            className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all border border-slate-700/60 active:scale-95 disabled:opacity-50"
            title="Mô phỏng công nhân từ xưởng gửi ảnh kiểm định"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Giả Lập Dữ Liệu Xưởng</span>
          </button>
        </div>

        {/* User Profile Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white font-bold border border-slate-600">
              QA
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">Nguyễn Admin</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Quản trị viên QC</p>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
        {/* TOP HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              {pageTitles[activeTab] || 'Bảng Điều Khiển QC'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              Real-time
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSimulate}
              disabled={isRefreshing}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs lg:text-sm font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 text-amber-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Gửi Giả Lập QC</span>
            </button>
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
};

