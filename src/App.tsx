import React, { useState, useEffect } from 'react';
import { AdminLayout } from './layouts/AdminLayout';
import { DashboardView } from './views/DashboardView';
import { TemplatesView } from './views/TemplatesView';
import { InspectionsView } from './views/InspectionsView';
import { AuditLogsView } from './views/AuditLogsView';
import { SettingsView } from './views/SettingsView';
import { WorkerSessionPortalView } from './views/WorkerSessionPortalView';
import { InspectionJob } from './types/qc';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings'>('dashboard');
  const [selectedJobForReview, setSelectedJobForReview] = useState<InspectionJob | null>(null);

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

  const handleExitWorkerSession = () => {
    setWorkerSession(null);
    // Clean URL query params without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  const handleSelectJobForReview = (job: InspectionJob) => {
    setSelectedJobForReview(job);
    setActiveTab('inspections');
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

  return (
    <AdminLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
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

      {activeTab === 'settings' && <SettingsView />}
    </AdminLayout>
  );
}
