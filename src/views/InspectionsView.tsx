import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Download, RefreshCw, Zap } from 'lucide-react';
import { InspectionJob } from '../types/qc';
import { qcService } from '../services/qcService';
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
  const [jobs, setJobs] = useState<InspectionJob[]>(qcService.getJobs());
  const [activeJob, setActiveJob] = useState<InspectionJob | null>(selectedJobForReview);
  const [isDrawerOpen, setIsDrawerOpen] = useState(!!selectedJobForReview);

  // Session Export Modal State
  const [exportModalJob, setExportModalJob] = useState<InspectionJob | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    if (selectedJobForReview) {
      setActiveJob(selectedJobForReview);
      setIsDrawerOpen(true);
    }
  }, [selectedJobForReview]);

  const reloadJobs = () => {
    setJobs(qcService.getJobs());
  };

  useEffect(() => {
    const unsubscribe = qcService.subscribe(() => {
      reloadJobs();
    });
    return unsubscribe;
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
      />
    </div>
  );
};

