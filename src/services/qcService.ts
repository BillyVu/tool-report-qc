import { ChecklistTemplate, InspectionJob, StepResult, AuditLogEntry, DashboardKPI } from '../types/qc';
import { INITIAL_TEMPLATES, INITIAL_JOBS, INITIAL_AUDIT_LOGS } from './mockData';

const TEMPLATES_KEY = 'qc_admin_templates_v1';
const JOBS_KEY = 'qc_admin_jobs_v1';
const LOGS_KEY = 'qc_admin_logs_v1';

class QCService {
  private templates: ChecklistTemplate[] = [];
  private jobs: InspectionJob[] = [];
  private logs: AuditLogEntry[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      const storedTemplates = localStorage.getItem(TEMPLATES_KEY);
      this.templates = storedTemplates ? JSON.parse(storedTemplates) : INITIAL_TEMPLATES;

      const storedJobs = localStorage.getItem(JOBS_KEY);
      this.jobs = storedJobs ? JSON.parse(storedJobs) : INITIAL_JOBS;

      const storedLogs = localStorage.getItem(LOGS_KEY);
      this.logs = storedLogs ? JSON.parse(storedLogs) : INITIAL_AUDIT_LOGS;
    } catch (e) {
      console.error('Failed to parse QC storage:', e);
      this.templates = INITIAL_TEMPLATES;
      this.jobs = INITIAL_JOBS;
      this.logs = INITIAL_AUDIT_LOGS;
    }
  }

  private saveToStorage() {
    try {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(this.templates));
      localStorage.setItem(JOBS_KEY, JSON.stringify(this.jobs));
      localStorage.setItem(LOGS_KEY, JSON.stringify(this.logs));
      this.notifyListeners();
    } catch (e) {
      console.error('Failed to save to QC storage:', e);
    }
  }

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }

  // --- KPI STATS ---
  public getKPIs(): DashboardKPI {
    const totalJobs = this.jobs.length;
    const inProgress = this.jobs.filter(j => j.status === 'IN_PROGRESS').length;
    const completed = this.jobs.filter(j => j.status === 'COMPLETED').length;
    const failed = this.jobs.filter(j => j.status === 'FAILED').length;
    
    const finishedCount = completed + failed;
    const passRate = finishedCount > 0 ? Math.round((completed / finishedCount) * 100) : 100;

    return {
      totalJobs,
      inProgress,
      completed,
      failed,
      passRate,
      todayCount: totalJobs
    };
  }

  // --- TEMPLATES CRUD ---
  public getTemplates(): ChecklistTemplate[] {
    return [...this.templates];
  }

  public getTemplateById(id: string): ChecklistTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  public saveTemplate(template: ChecklistTemplate): ChecklistTemplate {
    const index = this.templates.findIndex(t => t.id === template.id);
    if (index >= 0) {
      this.templates[index] = { ...template, updatedAt: new Date().toISOString() };
    } else {
      this.templates.unshift({
        ...template,
        updatedAt: new Date().toISOString()
      });
    }
    this.saveToStorage();
    return template;
  }

  public deleteTemplate(id: string): boolean {
    this.templates = this.templates.filter(t => t.id !== id);
    this.saveToStorage();
    return true;
  }

  public duplicateTemplate(id: string): ChecklistTemplate | null {
    const existing = this.getTemplateById(id);
    if (!existing) return null;

    const newId = `TMPL-${Date.now().toString().slice(-6)}`;
    const duplicated: ChecklistTemplate = {
      ...existing,
      id: newId,
      title: `${existing.title} (Bản sao)`,
      updatedAt: new Date().toISOString()
    };
    this.templates.unshift(duplicated);
    this.saveToStorage();
    return duplicated;
  }

  // --- JOBS CRUD & REVIEW ---
  public getJobs(): InspectionJob[] {
    return [...this.jobs];
  }

  public getJobById(id: string): InspectionJob | undefined {
    return this.jobs.find(j => j.id === id);
  }

  public updateJobStepNote(jobId: string, stepId: string, newNote: string, adminName: string = 'QC Manager'): boolean {
    const job = this.getJobById(jobId);
    if (!job) return false;

    const stepResult = job.stepResults.find(s => s.stepId === stepId);
    if (!stepResult) return false;

    const oldValue = stepResult.note;
    if (oldValue === newNote) return true;

    if (!stepResult.originalNote) {
      stepResult.originalNote = oldValue;
    }
    stepResult.note = newNote;
    stepResult.editedByAdmin = true;
    job.updatedAt = new Date().toISOString();

    // Log Audit Entry
    const auditLog: AuditLogEntry = {
      id: `LOG-${Date.now()}`,
      jobId,
      adminName,
      action: 'Sửa Ghi chú Công nhân',
      fieldChanged: `Bước ${stepId} Note`,
      oldValue: oldValue || '(Trống)',
      newValue: newNote,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    this.logs.unshift(auditLog);

    this.saveToStorage();
    return true;
  }

  public updateJobStatus(jobId: string, newStatus: InspectionJob['status'], adminNotes?: string, adminName: string = 'QC Manager'): boolean {
    const job = this.getJobById(jobId);
    if (!job) return false;

    const oldStatus = job.status;
    job.status = newStatus;
    if (adminNotes !== undefined) {
      job.adminNotes = adminNotes;
    }
    job.updatedAt = new Date().toISOString();
    if (newStatus === 'COMPLETED' && !job.completedAt) {
      job.completedAt = new Date().toISOString();
    }

    const auditLog: AuditLogEntry = {
      id: `LOG-${Date.now()}`,
      jobId,
      adminName,
      action: 'Chuyển Trạng thái Lô hàng',
      fieldChanged: 'Status',
      oldValue: oldStatus,
      newValue: newStatus,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    this.logs.unshift(auditLog);

    this.saveToStorage();
    return true;
  }

  public recordExport(jobId: string) {
    const job = this.getJobById(jobId);
    if (job) {
      job.exportCount = (job.exportCount || 0) + 1;
      job.lastExportedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  // --- JOB SESSION EXPORT & URL MANAGEMENT (24h LIMIT) ---
  public generateJobSessionUrl(jobId: string): { sessionUrl: string; expiresAt: string; token: string; isExpired: boolean } {
    this.loadFromStorage();
    const job = this.getJobById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} không tồn tại`);
    }

    const now = new Date();
    const expiresAtDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 1 day (24 hours) from export
    const token = `SESS-${jobId}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    job.sessionToken = token;
    job.sessionCreatedAt = now.toISOString();
    job.sessionExpiresAt = expiresAtDate.toISOString();
    job.sessionExportCount = (job.sessionExportCount || 0) + 1;
    job.exportCount = (job.exportCount || 0) + 1;
    job.lastExportedAt = now.toISOString();

    if (!job.sessionAccessLogs) job.sessionAccessLogs = [];
    job.sessionAccessLogs.unshift({
      id: `LOG-EXPORT-${Date.now()}`,
      timestamp: now.toISOString().replace('T', ' ').slice(0, 19),
      workerName: 'QC Admin System',
      deviceMac: 'N/A (Server Export)',
      deviceInfo: 'Admin Console',
      action: 'URL_OPENED'
    });

    this.saveToStorage();

    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const sessionUrl = `${baseUrl}?jobSession=${jobId}&token=${token}`;

    return {
      sessionUrl,
      expiresAt: job.sessionExpiresAt,
      token,
      isExpired: false
    };
  }

  public validateJobSession(jobId: string, token: string) {
    this.loadFromStorage();
    const job = this.getJobById(jobId);
    if (!job || !job.sessionExpiresAt || !job.sessionToken || job.sessionToken !== token) {
      return { isValid: false, isExpired: false, job: undefined };
    }

    const expiresTime = new Date(job.sessionExpiresAt).getTime();
    const nowTime = Date.now();

    if (nowTime > expiresTime) {
      return {
        isValid: true,
        isExpired: true,
        job,
        expiresAtFormatted: new Date(expiresTime).toLocaleString('vi-VN')
      };
    }

    const diffMs = expiresTime - nowTime;
    const hoursRemaining = Math.floor(diffMs / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    let template = this.getTemplateById(job.templateId);
    if (!template) {
      template = this.templates[0] || INITIAL_TEMPLATES[0];
    }

    return {
      isValid: true,
      isExpired: false,
      job,
      template,
      hoursRemaining,
      minutesRemaining,
      expiresAtFormatted: new Date(expiresTime).toLocaleString('vi-VN')
    };
  }

  public recordWorkerSessionCheckIn(
    jobId: string,
    token: string,
    workerInfo: {
      workerName: string;
      workerId?: string;
      line?: string;
      shift?: string;
      deviceMac: string;
      deviceInfo: string;
    }
  ) {
    this.loadFromStorage();
    const session = this.validateJobSession(jobId, token);
    if (!session.isValid || session.isExpired || !session.job) {
      return false;
    }

    const job = session.job;
    job.workerName = workerInfo.workerName;
    if (workerInfo.workerId) job.workerId = workerInfo.workerId;
    if (workerInfo.line) job.line = workerInfo.line;
    if (workerInfo.shift) job.shift = workerInfo.shift;
    job.workerMac = workerInfo.deviceMac;

    job.sessionTracker = {
      workerName: workerInfo.workerName,
      workerId: workerInfo.workerId,
      deviceMac: workerInfo.deviceMac,
      deviceInfo: workerInfo.deviceInfo,
      joinedAt: new Date().toISOString()
    };

    if (!job.sessionAccessLogs) job.sessionAccessLogs = [];
    job.sessionAccessLogs.unshift({
      id: `ACCESS-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      workerName: workerInfo.workerName,
      workerId: workerInfo.workerId,
      deviceMac: workerInfo.deviceMac,
      deviceInfo: workerInfo.deviceInfo,
      action: 'CHECK_IN'
    });

    this.saveToStorage();
    return true;
  }

  public submitWorkerSessionResults(
    jobId: string,
    token: string,
    stepResults: StepResult[],
    workerInfo?: { workerName?: string; workerId?: string; line?: string; shift?: string; deviceMac?: string; deviceInfo?: string }
  ) {
    this.loadFromStorage();
    const session = this.validateJobSession(jobId, token);
    if (!session.isValid) {
      return { success: false, message: 'URL phiên làm việc không hợp lệ hoặc không tồn tại.' };
    }
    if (session.isExpired) {
      return { success: false, message: 'URL phiên làm việc đã HẾT HẠN (quá 24 giờ kể từ khi xuất link). Vui lòng liên hệ QC Admin.' };
    }

    const job = session.job!;
    job.stepResults = stepResults;
    
    if (workerInfo?.workerName) job.workerName = workerInfo.workerName;
    if (workerInfo?.workerId) job.workerId = workerInfo.workerId;
    if (workerInfo?.line) job.line = workerInfo.line;
    if (workerInfo?.shift) job.shift = workerInfo.shift;
    if (workerInfo?.deviceMac) job.workerMac = workerInfo.deviceMac;

    const hasFailedStep = stepResults.some(s => s.status === 'FAIL');
    job.status = hasFailedStep ? 'FAILED' : 'COMPLETED';
    job.updatedAt = new Date().toISOString();
    job.completedAt = new Date().toISOString();

    if (!job.sessionAccessLogs) job.sessionAccessLogs = [];
    job.sessionAccessLogs.unshift({
      id: `SUBMIT-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
      workerName: job.workerName || 'Công nhân qua Session URL',
      workerId: job.workerId,
      deviceMac: workerInfo?.deviceMac || job.workerMac || 'N/A',
      deviceInfo: workerInfo?.deviceInfo || 'Standard Web Browser',
      action: 'SUBMITTED'
    });

    const auditLog: AuditLogEntry = {
      id: `LOG-${Date.now()}`,
      jobId,
      adminName: job.workerName || 'Công nhân qua Session URL',
      action: `Nộp Kết quả Kiểm định qua URL Session [MAC: ${job.workerMac || 'N/A'}]`,
      fieldChanged: 'StepResults & Status',
      oldValue: 'IN_PROGRESS',
      newValue: job.status,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19)
    };
    this.logs.unshift(auditLog);

    this.saveToStorage();
    return { success: true, message: 'Nộp kết quả kiểm tra thành công!', job };
  }

  // --- WORKER SIMULATION ---
  public simulateWorkerSubmission(): InspectionJob {
    const template = this.templates[0] || INITIAL_TEMPLATES[0];
    const newJobId = `JOB-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(100 + Math.random()*900)}`;
    const isFail = Math.random() < 0.25;

    const newJob: InspectionJob = {
      id: newJobId,
      batchNumber: `BATCH-VN-${Math.floor(9000 + Math.random()*1000)}`,
      productCode: template.productCode,
      productName: template.productName,
      templateId: template.id,
      status: isFail ? 'FAILED' : 'COMPLETED',
      workerId: `W${Math.floor(100 + Math.random()*900)}`,
      workerName: `Công nhân Chuyền ${Math.floor(1 + Math.random()*5)}`,
      shift: 'Ca Sáng (06:00 - 14:00)',
      line: `Chuyền Sản Xuất 0${Math.floor(1 + Math.random()*4)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      stepResults: template.steps.map((s, idx) => {
        const stepFail = isFail && idx === 1;
        return {
          stepId: s.stepId,
          status: stepFail ? 'FAIL' : 'PASS',
          note: stepFail 
            ? 'Phát hiện sai lệch nhỏ bề mặt, đã ghi nhận gửi kiểm tra'
            : `Đã chụp ảnh thực tế kiểm tra cho ${s.title}, đạt tiêu chuẩn`,
          photoUrl: s.referenceImageUrl,
          timestamp: new Date().toISOString()
        };
      })
    };

    this.jobs.unshift(newJob);
    this.saveToStorage();
    return newJob;
  }

  // --- AUDIT LOGS ---
  public getAuditLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  public resetToDefault() {
    this.templates = INITIAL_TEMPLATES;
    this.jobs = INITIAL_JOBS;
    this.logs = INITIAL_AUDIT_LOGS;
    this.saveToStorage();
  }
}

export const qcService = new QCService();
