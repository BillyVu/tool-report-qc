import React, { useState, useEffect } from 'react';
import { AdminLayout } from './layouts/AdminLayout';
import { DashboardView } from './views/DashboardView';
import { TemplatesView } from './views/TemplatesView';
import { InspectionsView } from './views/InspectionsView';
import { AuditLogsView } from './views/AuditLogsView';
import { SettingsView } from './views/SettingsView';
import { WorkerSessionPortalView } from './views/WorkerSessionPortalView';
import { LoginView } from './views/LoginView';
import { InspectionJob } from './types/qc';
import { clearStoredAdminApiKey, hasStoredAdminSession } from './services/adminAuth';
import { adminApi, setAdminApiKey } from './services/adminApi';

type AdminAuthState = 'checking' | 'authenticated' | 'unauthenticated';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings'>('dashboard');
  const [selectedJobForReview, setSelectedJobForReview] = useState<InspectionJob | null>(null);
  const [adminAuthState, setAdminAuthState] = useState<AdminAuthState>(() => hasStoredAdminSession() ? 'checking' : 'unauthenticated');

  // Worker Session URL parameters state
  const [workerSession, setWorkerSession] = useState<{ jobId: string; token: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('jobSession') || params.get('jobId');
    const token = params.get('token');

    if (jobId && token) {
      setWorkerSession({ jobId, token });
    }
  }, []);

  useEffect(() => {
    if (workerSession || adminAuthState !== 'checking') return;

    let isActive = true;
    void adminApi.getKpis()
      .then(() => {
        if (isActive) setAdminAuthState('authenticated');
      })
      .catch(() => {
        clearStoredAdminApiKey();
        setAdminApiKey('');
        if (isActive) setAdminAuthState('unauthenticated');
      });

    return () => {
      isActive = false;
    };
  }, [adminAuthState, workerSession]);

  const handleExitWorkerSession = () => {
    setWorkerSession(null);
    // Clean URL query params without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleSelectJobForReview = (job: InspectionJob) => {
    setSelectedJobForReview(job);
    setActiveTab('inspections');
  };

  const handleLogout = () => {
    clearStoredAdminApiKey();
    setAdminApiKey('');
    setSelectedJobForReview(null);
    setActiveTab('dashboard');
    setAdminAuthState('unauthenticated');
  };

  // If opened via Worker Session URL, render the dedicated Session Portal
  if (workerSession) {
    return (
      <WorkerSessionPortalView
        jobId={workerSession.jobId}
        token={workerSession.token}
        onExitSession={handleExitWorkerSession}
      />
    );
  }

  if (adminAuthState === 'checking') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold">Đang kiểm tra phiên đăng nhập...</p>
        </div>
      </div>
    );
  }

  if (adminAuthState !== 'authenticated') {
    return <LoginView onAuthenticated={() => setAdminAuthState('authenticated')} />;
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onLogout={handleLogout}
    >
      {activeTab === 'dashboard' && (
        <DashboardView
          onNavigateTab={setActiveTab}
          onSelectJobForReview={handleSelectJobForReview}
        />
      )}

      {activeTab === 'templates' && <TemplatesView />}

      {activeTab === 'inspections' && (
        <InspectionsView
          selectedJobForReview={selectedJobForReview}
          onClearSelectedJob={() => setSelectedJobForReview(null)}
        />
      )}

      {activeTab === 'audit' && <AuditLogsView />}

      {activeTab === 'settings' && (
        <SettingsView
          onAuthUpdated={() => setAdminAuthState(hasStoredAdminSession() ? 'authenticated' : 'unauthenticated')}
        />
      )}
    </AdminLayout>
  );
}
