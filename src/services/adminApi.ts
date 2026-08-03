import { AuditLogEntry, ChecklistTemplate, DashboardKPI, InspectionJob, StepModerationStatus } from '../types/qc';
import { loadStoredAdminApiKey, saveStoredAdminApiKey } from './adminAuth';
import { mapInspectionJob } from './workerSessionApi';

interface CreateJobPayload {
  externalId: string;
  batchNumber: string;
  productCode: string;
  productName: string;
  templateId: string;
  templateSnapshot: ChecklistTemplate;
  workerId?: string;
  workerName?: string;
  shift?: string;
  line?: string;
}

interface AdminApiOptions {
  adminKey?: string;
  fetch?: typeof fetch;
  origin?: string;
  pathname?: string;
}

let inMemoryAdminKey = '';

export function setAdminApiKey(key: string, options: { persist?: boolean } = {}) {
  inMemoryAdminKey = options.persist ? saveStoredAdminApiKey(key) : key.trim();
}

export function getAdminApiKey() {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return inMemoryAdminKey || loadStoredAdminApiKey() || meta.env?.VITE_QC_ADMIN_API_KEY || '';
}

function getDefaultAdminKey() {
  return getAdminApiKey();
}

async function parseJson(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}

async function expectOk(response: Response) {
  if (response.ok) return parseJson(response);
  const payload = await parseJson(response).catch(() => undefined);
  throw new Error(payload?.error || `QC Admin API request failed (${response.status})`);
}

export function createAdminApi(options: AdminApiOptions = {}) {
  const fetchImpl = options.fetch || fetch;
  const getAdminKey = () => options.adminKey ?? getDefaultAdminKey();

  const headers = () => ({
    'Content-Type': 'application/json',
    'x-qc-admin-key': getAdminKey(),
  });

  return {
    async listTemplates(): Promise<ChecklistTemplate[]> {
      return await expectOk(await fetchImpl('/api/admin/templates', {
        headers: headers(),
      })) || [];
    },

    async saveTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
      return await expectOk(await fetchImpl('/api/admin/templates', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(template),
      }));
    },

    async updateTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
      return await expectOk(await fetchImpl(`/api/admin/templates/${encodeURIComponent(template.id)}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(template),
      }));
    },

    async deleteTemplate(templateId: string): Promise<void> {
      await expectOk(await fetchImpl(`/api/admin/templates/${encodeURIComponent(templateId)}`, {
        method: 'DELETE',
        headers: headers(),
      }));
    },

    async listJobs(): Promise<InspectionJob[]> {
      const payload = await expectOk(await fetchImpl('/api/admin/jobs', {
        headers: headers(),
      }));
      return (payload || []).map(mapInspectionJob);
    },

    async getJob(jobId: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}`, {
        headers: headers(),
      }));
      return mapInspectionJob(row);
    },

    async getKpis(): Promise<DashboardKPI> {
      return await expectOk(await fetchImpl('/api/admin/kpis', {
        headers: headers(),
      }));
    },

    async listAuditLogs(): Promise<AuditLogEntry[]> {
      return await expectOk(await fetchImpl('/api/admin/audit-events', {
        headers: headers(),
      })) || [];
    },

    async createJob(payload: CreateJobPayload): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl('/api/admin/jobs', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      }));
      return mapInspectionJob(row);
    },

    async createWorkerSession(jobId: string): Promise<{ sessionUrl: string; createdAt: string; expiresAt: string; token: string; isExpired: boolean }> {
      const payload = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/sessions`, {
        method: 'POST',
        headers: headers(),
      }));
      const origin = options.origin ?? window.location.origin;
      const pathname = options.pathname ?? window.location.pathname;
      return {
        sessionUrl: `${origin}${pathname}?jobSession=${encodeURIComponent(jobId)}&token=${encodeURIComponent(payload.token)}`,
        createdAt: payload.createdAt || new Date().toISOString(),
        expiresAt: payload.expiresAt,
        token: payload.token,
        isExpired: false,
      };
    },

    async extendWorkerSession(jobId: string): Promise<{ createdAt: string; expiresAt: string; token?: string; sessionUrl?: string; isExpired: boolean }> {
      const payload = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/session/extend`, {
        method: 'PATCH',
        headers: headers(),
      }));
      const origin = options.origin ?? window.location.origin;
      const pathname = options.pathname ?? window.location.pathname;
      const token = payload.token || undefined;
      return {
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt,
        token,
        sessionUrl: token ? `${origin}${pathname}?jobSession=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}` : undefined,
        isExpired: false,
      };
    },

    async updateJobStatus(jobId: string, status: InspectionJob['status'], adminNotes?: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/status`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ status, adminNotes }),
      }));
      return mapInspectionJob(row);
    },

    async updateJobStepNote(jobId: string, stepId: string, note: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/step-results/${encodeURIComponent(stepId)}/note`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ note }),
      }));
      return mapInspectionJob(row);
    },

    async moderateJobStep(
      jobId: string,
      stepId: string,
      moderationStatus: StepModerationStatus,
      adminReviewNote?: string,
    ): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/step-results/${encodeURIComponent(stepId)}/moderation`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ moderationStatus, adminReviewNote }),
      }));
      return mapInspectionJob(row);
    },

    async recordExport(jobId: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/exports`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ format: 'docx' }),
      }));
      return mapInspectionJob(row);
    },
  };
}

export const adminApi = createAdminApi();
