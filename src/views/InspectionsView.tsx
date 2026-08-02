import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Download, RefreshCw, Zap } from 'lucide-react';
import { InspectionJob } from '../types/qc';
import { adminApi } from '../services/adminApi';
import { InspectionTable } from '../components/inspections/InspectionTable';
import { InspectionDetailDrawer } from '../components/inspections/InspectionDetailDrawer';
import { ExportJobSessionModal } from '../components/inspections/ExportJobSessionModal';

interface InspectionsViewProps {
  selectedJobForReview: InspectionJob | null;
  onClearSelectedJob: () => void;
}

export const InspectionsView: React.FC<InspectionsViewProps> = ({
  selectedJobForReview,
  onClearSelectedJob
}) => {
  const [jobs, setJobs] = useState<InspectionJob[]>([]);
  const [activeJob, setActiveJob] = useState<InspectionJob | null>(selectedJobForReview);
  const [isDrawerOpen, setIsDrawerOpen] = useState(!!selectedJobForReview);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Session Export Modal State
  const [exportModalJob, setExportModalJob] = useState<InspectionJob | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    if (selectedJobForReview) {
      setActiveJob(selectedJobForReview);
      setIsDrawerOpen(true);
    }
  }, [selectedJobForReview]);

  const reloadJobs = async () => {
    setIsLoadingJobs(true);
    setLoadError('');
    try {
      setJobs(await adminApi.listJobs());
    } catch (error) {
      console.error('Failed to load admin jobs:', error);
      setJobs([]);
      setLoadError(error instanceof Error ? error.message : 'Không thể tải danh sách lệnh từ server.');
    } finally {
      setIsLoadingJobs(false);
    }
  };

  useEffect(() => {
    reloadJobs();
  }, []);

  const handleSelectJob = (job: InspectionJob) => {
    setActiveJob(job);
    setIsDrawerOpen(true);
  };

  const handleOpenExportModal = (job: InspectionJob) => {
    setExportModalJob(job);
    setIsExportModalOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setActiveJob(null);
    onClearSelectedJob();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Giám Sát Lệnh Kiểm Tra QC & Kiểm Duyệt Kết Quả
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý tập trung danh sách lô hàng đang kiểm tra tại xưởng, kiểm duyệt ảnh chụp và xuất file báo cáo Word .docx
          </p>
        </div>

        <button
          onClick={reloadJobs}
          className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Tải Lại Dữ Liệu Real-time</span>
        </button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          {loadError}
        </div>
      )}

      {isLoadingJobs && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Đang tải dữ liệu từ server...</span>
        </div>
      )}

      {/* Main Table Grid */}
      <InspectionTable
        jobs={jobs}
        onSelectJob={handleSelectJob}
        onExportSessionUrl={handleOpenExportModal}
        onRefreshData={reloadJobs}
      />

      {/* Slide-over Inspection Review Drawer */}
      <InspectionDetailDrawer
        job={activeJob}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onJobUpdated={reloadJobs}
      />

      {/* Export Session URL Modal */}
      <ExportJobSessionModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        job={exportModalJob}
        onSessionCreated={reloadJobs}
      />
    </div>
  );
};
