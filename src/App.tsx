import React, { useState } from 'react';
import { AdminLayout } from './layouts/AdminLayout';
import { DashboardView } from './views/DashboardView';
import { TemplatesView } from './views/TemplatesView';
import { InspectionsView } from './views/InspectionsView';
import { AuditLogsView } from './views/AuditLogsView';
import { SettingsView } from './views/SettingsView';
import { InspectionJob } from './types/qc';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'templates' | 'inspections' | 'audit' | 'settings'>('dashboard');
  const [selectedJobForReview, setSelectedJobForReview] = useState<InspectionJob | null>(null);

  const handleSelectJobForReview = (job: InspectionJob) => {
    setSelectedJobForReview(job);
    setActiveTab('inspections');
  };

  return (
    <AdminLayout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      onSimulateWorkerJob={() => {
        // Refresh triggers inside components automatically via service listener
      }}
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
