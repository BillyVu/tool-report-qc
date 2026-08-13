import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard, 
  FileCheck2, 
  ClipboardCheck, 
  History, 
  Settings, 
  Plus,
  LogOut,
  BookOpen,
  Map
} from 'lucide-react';
import { DashboardKPI, InspectionJob } from '../types/qc';
import { adminApi } from '../services/adminApi';
import { CreateInspectionJobModal } from '../components/inspections/CreateInspectionJobModal';
import { VeroBrand } from '../components/branding/VeroBrand';
import { QuickTour } from '../components/onboarding/QuickTour';

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings') => void;
  onLogout: () => void;
  onJobCreated?: (job: InspectionJob) => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  children,
  activeTab,
  setActiveTab,
  onLogout,
  onJobCreated
}) => {
  const [kpis, setKpis] = useState<DashboardKPI>({ totalJobs: 0, inProgress: 0, completed: 0, failed: 0, passRate: 100, todayCount: 0 });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const startQuickTourRef = useRef<(() => void) | null>(null);

  const refreshKpis = useCallback(() => {
    void adminApi.getKpis().then(setKpis).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshKpis();
  }, [refreshKpis]);

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

  const handleStartQuickTour = () => {
    setActiveTab('dashboard');
    window.requestAnimationFrame(() => startQuickTourRef.current?.());
  };

  const handleQuickTourReady = useCallback((startTour: () => void) => {
    startQuickTourRef.current = startTour;
  }, []);

  return (
    <div className="flex min-h-dvh w-full bg-slate-50 font-sans text-slate-800 lg:h-screen lg:overflow-hidden">
      {/* SLEEK SIDEBAR */}
      <aside className="hidden w-64 bg-slate-900 flex-col flex-shrink-0 border-r border-slate-800 lg:flex">
        {/* Brand Header */}
        <div className="p-6">
          <VeroBrand tone="dark" />
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
                data-tour={item.id === 'dashboard' ? 'dashboard-nav' : item.id === 'inspections' ? 'inspections-nav' : item.id === 'templates' ? 'templates-nav' : undefined}
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

        {/* User Profile Footer */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <button
            type="button"
            onClick={handleStartQuickTour}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-blue-900/40 transition-colors hover:bg-blue-500"
          >
            <Map className="w-4 h-4" />
            <span>Xem hướng dẫn nhanh</span>
          </button>
          <a
            href="/guide"
            target="_blank"
            rel="noreferrer"
            data-tour="guide-link"
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            <span>Hướng dẫn</span>
          </a>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs text-white font-bold border border-slate-600">
              QA
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">Nguyễn Admin</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Quản trị viên QC</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex min-h-dvh flex-col min-w-0 bg-slate-50 lg:min-h-0 lg:overflow-hidden">
        {/* TOP HEADER */}
        <header className="bg-white border-b border-slate-200 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:h-16 lg:px-8 lg:py-0 flex-shrink-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-4">
            <VeroBrand compact className="lg:hidden" />
            <h1 className="min-w-0 flex-1 text-base font-bold text-slate-800 tracking-tight sm:text-lg">
              {pageTitles[activeTab] || 'Bảng Điều Khiển QC'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              Real-time
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              data-tour="create-inspection"
              className="flex w-full items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs sm:w-auto lg:text-sm font-semibold transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Lệnh Kiểm Tra</span>
            </button>
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <div className="flex-1 overflow-y-auto p-4 pb-24 sm:p-5 lg:p-6 lg:pb-6 flex flex-col space-y-6">
          {toastMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
              {toastMessage}
            </div>
          )}
          {children}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as any)}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
                {item.badge && (
                  <span className={`absolute right-1.5 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-black ${item.badgeColor || 'bg-slate-900 text-white'}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Create Inspection Job Modal */}
      <CreateInspectionJobModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onJobCreated={(newJob) => {
          setActiveTab('inspections');
          refreshKpis();
          onJobCreated?.(newJob);
          setToastMessage(`✨ Đã khởi tạo lệnh kiểm tra mới: ${newJob.batchNumber}`);
          setTimeout(() => setToastMessage(null), 4000);
        }}
      />
      <QuickTour onStartTour={handleQuickTourReady} />
    </div>
  );
};
