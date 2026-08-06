import { ChecklistTemplate, InspectionJob, StepResult } from '../types/qc';

export interface WorkerSessionState {
  isValid: boolean;
  isExpired: boolean;
  job?: InspectionJob;
  template?: ChecklistTemplate;
  hoursRemaining?: number;
  minutesRemaining?: number;
  expiresAtFormatted?: string;
  checkedInAt?: string | null;
}

interface WorkerSessionApiOptions {
  fetch?: typeof fetch;
  now?: () => number;
}

interface WorkerInfo {
  workerName: string;
  workerId?: string;
  line?: string;
  shift?: string;
  deviceInfo?: string;
}

interface ApiInspectionJob {
  id?: string;
  external_id?: string;
  batchNumber?: string;
  batch_number?: string;
  productCode?: string;
  product_code?: string;
  productName?: string;
  product_name?: string;
  templateId?: string;
  template_id?: string;
  status?: InspectionJob['status'];
  workerId?: string | null;
  worker_id?: string | null;
  workerName?: string | null;
  worker_name?: string | null;
  shift?: string | null;
  line?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  completedAt?: string | null;
  completed_at?: string | null;
  stepResults?: StepResult[];
  step_results?: StepResult[];
  templateSnapshot?: ChecklistTemplate;
  template_snapshot?: ChecklistTemplate;
  adminNotes?: string | null;
  admin_notes?: string | null;
  exportCount?: number;
  export_count?: number;
  lastExportedAt?: string | null;
  last_exported_at?: string | null;
  sessionCreatedAt?: string | null;
  session_created_at?: string | null;
  sessionToken?: string | null;
  session_token?: string | null;
  sessionExpiresAt?: string | null;
  session_expires_at?: string | null;
  sessionRevokedAt?: string | null;
  session_revoked_at?: string | null;
}

function tokenQuery(token: string) {
  return `token=${encodeURIComponent(token)}`;
}

async function parseJson(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function expectOk(response: Response) {
  if (response.ok) return parseJson(response);
  if (response.status === 413) {
    throw new Error('Dung lượng ảnh/dữ liệu nộp lên quá lớn (413 Payload Too Large). Hệ thống đã tự động nén ảnh, vui lòng bấm nộp lại.');
  }
  const payload = await parseJson(response).catch(() => undefined);
  throw new Error(payload?.error || `QC API request failed (${response.status})`);
}

export function mapInspectionJob(row: ApiInspectionJob): InspectionJob {
  const id = row.external_id || row.id || '';
  return {
    id,
    batchNumber: row.batchNumber || row.batch_number || '',
    productCode: row.productCode || row.product_code || '',
    productName: row.productName || row.product_name || '',
    templateId: row.templateId || row.template_id || '',
    status: row.status || 'IN_PROGRESS',
    workerId: row.workerId || row.worker_id || '',
    workerName: row.workerName || row.worker_name || '',
    shift: row.shift || '',
    line: row.line || '',
    createdAt: row.createdAt || row.created_at || '',
    updatedAt: row.updatedAt || row.updated_at || '',
    completedAt: row.completedAt || row.completed_at || undefined,
    stepResults: row.stepResults || row.step_results || [],
    templateSnapshot: row.templateSnapshot || row.template_snapshot || undefined,
    adminNotes: row.adminNotes || row.admin_notes || undefined,
    exportCount: row.exportCount ?? row.export_count,
    lastExportedAt: row.lastExportedAt || row.last_exported_at || undefined,
    sessionToken: row.sessionToken || row.session_token || undefined,
    sessionCreatedAt: row.sessionCreatedAt || row.session_created_at || undefined,
    sessionExpiresAt: row.sessionExpiresAt || row.session_expires_at || undefined,
    sessionRevokedAt: row.sessionRevokedAt || row.session_revoked_at || undefined,
    defectsFindingData: (row as any).defectsFindingData || (row as any).defects_finding_data || undefined,
    packagingInfoData: (row as any).packagingInfoData || (row as any).packaging_info_data || undefined,
    otherInfoData: (row as any).otherInfoData || (row as any).other_info_data || undefined,
  };
}

function calculateRemaining(expiresAt: string, now: () => number) {
  const expiresTime = new Date(expiresAt).getTime();
  const diffMs = Math.max(0, expiresTime - now());
  return {
    isExpired: diffMs <= 0,
    hoursRemaining: Math.floor(diffMs / (1000 * 60 * 60)),
    minutesRemaining: Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)),
    expiresAtFormatted: new Date(expiresAt).toLocaleString('vi-VN'),
  };
}

export function createWorkerSessionApi(options: WorkerSessionApiOptions = {}) {
  const fetchImpl = options.fetch || fetch;
  const now = options.now || Date.now;

  return {
    async getSession(jobId: string, token: string): Promise<WorkerSessionState> {
      const response = await fetchImpl(`/api/worker-sessions/${encodeURIComponent(jobId)}?${tokenQuery(token)}`);
      if (response.status === 401 || response.status === 404) {
        return { isValid: false, isExpired: false };
      }
      if (response.status === 410) {
        const payload = await parseJson(response);
        return {
          isValid: true,
          isExpired: true,
          job: payload?.job ? mapInspectionJob(payload.job) : undefined,
          template: payload?.template,
          expiresAtFormatted: payload?.expiresAt ? new Date(payload.expiresAt).toLocaleString('vi-VN') : undefined,
        };
      }
      const payload = await expectOk(response);
      const remaining = calculateRemaining(payload.expiresAt, now);
      return {
        isValid: true,
        isExpired: remaining.isExpired,
        job: mapInspectionJob(payload.job),
        template: payload.template,
        hoursRemaining: remaining.hoursRemaining,
        minutesRemaining: remaining.minutesRemaining,
        expiresAtFormatted: remaining.expiresAtFormatted,
        checkedInAt: payload.checkedInAt || payload.checked_in_at || null,
      };
    },

    async checkIn(jobId: string, token: string, workerInfo: WorkerInfo): Promise<boolean> {
      const response = await fetchImpl(`/api/worker-sessions/${encodeURIComponent(jobId)}/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...workerInfo }),
      });
      await expectOk(response);
      return true;
    },

    async saveDraftResults(
      jobId: string,
      token: string,
      stepResults: StepResult[],
      workerInfo: WorkerInfo,
      additionalData?: {
        defectsFindingData?: any;
        packagingInfoData?: any;
        otherInfoData?: any;
      }
    ): Promise<{ success: boolean; message: string; job?: InspectionJob }> {
      const response = await fetchImpl(`/api/worker-sessions/${encodeURIComponent(jobId)}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, stepResults, workerInfo, ...additionalData }),
      });
      const payload = await expectOk(response);
      return {
        success: true,
        message: 'Đã lưu nháp kết quả kiểm tra. Chưa nộp chính thức.',
        job: mapInspectionJob(payload.job),
      };
    },

    async submitResults(
      jobId: string,
      token: string,
      stepResults: StepResult[],
      workerInfo: WorkerInfo,
      additionalData?: {
        defectsFindingData?: any;
        packagingInfoData?: any;
        otherInfoData?: any;
      }
    ): Promise<{ success: boolean; message: string; job?: InspectionJob }> {
      const response = await fetchImpl(`/api/worker-sessions/${encodeURIComponent(jobId)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, stepResults, workerInfo, ...additionalData }),
      });
      const payload = await expectOk(response);
      return {
        success: true,
        message: 'Nộp kết quả kiểm tra thành công!',
        job: mapInspectionJob(payload.job),
      };
    },
  };
}

export const workerSessionApi = createWorkerSessionApi();
