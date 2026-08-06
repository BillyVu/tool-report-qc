import { AuditLogEntry, ChecklistTemplate, DashboardKPI, InspectionJob, StepModerationStatus } from '../types/qc';
import { PhotoTypeOption } from '../constants/photoTypes';
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
  baseUrl?: string;
}

export interface SavePhotoTypePayload {
  type?: string;
  label?: string;
  category?: PhotoTypeOption['category'];
  iconEmoji?: string;
  verificationMode?: PhotoTypeOption['verificationMode'];
  schemaVersion?: string;
  outputSchema?: Record<string, unknown>;
  aiPromptInstruction?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface VeroPromptProfile {
  profileKey: 'PHOTO_QUALITY_GATE' | 'PHOTO_ANALYSIS';
  label: string;
  description: string;
  instruction: string;
  revision: number;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verifiedRevision?: number | null;
  verifiedPromptHash?: string | null;
  updatedAt?: string;
}

let inMemoryAdminKey = '';

export function setAdminApiKey(key: string, options: { persist?: boolean } = {}) {
  inMemoryAdminKey = options.persist ? saveStoredAdminApiKey(key) : key.trim();
}

export function getAdminApiKey() {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  return inMemoryAdminKey || loadStoredAdminApiKey() || meta.env?.VITE_QC_ADMIN_API_KEY || '';
}

export function getAdminApiBaseUrl(options: AdminApiOptions = {}): string {
  if (options.baseUrl !== undefined) {
    return options.baseUrl.trim().replace(/\/+$/, '');
  }
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  const envUrl = meta.env?.VITE_QC_API_BASE_URL || meta.env?.VITE_API_BASE_URL || meta.env?.VITE_API_URL;
  if (envUrl !== undefined && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // When running locally in browser dev mode, use relative path to allow Vite dev proxy without CORS issues
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return '';
  }
  return 'https://qc.apexdev.website';
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
  const getBaseUrl = () => getAdminApiBaseUrl(options);

  const apiUrl = (path: string) => {
    if (!path || path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const base = getBaseUrl();
    if (!base) return path;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
  };

  const headers = () => ({
    'Content-Type': 'application/json',
    'x-qc-admin-key': getAdminKey(),
  });

  return {
    async listTemplates(): Promise<ChecklistTemplate[]> {
      return await expectOk(await fetchImpl(apiUrl('/api/admin/templates'), {
        headers: headers(),
      })) || [];
    },

    async saveTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
      return await expectOk(await fetchImpl(apiUrl('/api/admin/templates'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(template),
      }));
    },

    async updateTemplate(template: ChecklistTemplate): Promise<ChecklistTemplate> {
      return await expectOk(await fetchImpl(apiUrl(`/api/admin/templates/${encodeURIComponent(template.id)}`), {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(template),
      }));
    },

    async deleteTemplate(templateId: string): Promise<void> {
      await expectOk(await fetchImpl(apiUrl(`/api/admin/templates/${encodeURIComponent(templateId)}`), {
        method: 'DELETE',
        headers: headers(),
      }));
    },

    async listJobs(): Promise<InspectionJob[]> {
      const payload = await expectOk(await fetchImpl(apiUrl('/api/admin/jobs'), {
        headers: headers(),
      }));
      return (payload || []).map(mapInspectionJob);
    },

    async getJob(jobId: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}`), {
        headers: headers(),
      }));
      return mapInspectionJob(row);
    },

    async downloadCustomerReport(jobId: string): Promise<Blob> {
      const response = await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/customer-report.docx`), {
        headers: { 'x-qc-admin-key': getAdminKey() },
      });
      if (!response.ok) {
        const payload = await parseJson(response).catch(() => undefined);
        throw new Error(payload?.error || `QC customer report request failed (${response.status})`);
      }
      return response.blob();
    },

    async getKpis(): Promise<DashboardKPI> {
      return await expectOk(await fetchImpl(apiUrl('/api/admin/kpis'), {
        headers: headers(),
      }));
    },

    async listAuditLogs(): Promise<AuditLogEntry[]> {
      return await expectOk(await fetchImpl(apiUrl('/api/admin/audit-events'), {
        headers: headers(),
      })) || [];
    },

    async listPhotoTypes(): Promise<PhotoTypeOption[]> {
      return await expectOk(await fetchImpl('/api/admin/photo-types', {
        headers: headers(),
      })) || [];
    },

    async listVeroPromptProfiles(): Promise<VeroPromptProfile[]> {
      return await expectOk(await fetchImpl('/api/admin/vero-prompt-profiles', {
        headers: headers(),
      })) || [];
    },

    async updateVeroPromptProfile(profileKey: VeroPromptProfile['profileKey'], instruction: string): Promise<VeroPromptProfile> {
      return await expectOk(await fetchImpl(`/api/admin/vero-prompt-profiles/${encodeURIComponent(profileKey)}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ instruction }),
      }));
    },

    async verifyVeroPromptProfile(profileKey: VeroPromptProfile['profileKey']): Promise<VeroPromptProfile> {
      return await expectOk(await fetchImpl(`/api/admin/vero-prompt-profiles/${encodeURIComponent(profileKey)}/verify`, {
        method: 'POST',
        headers: headers(),
      }));
    },

    async createPhotoType(payload: SavePhotoTypePayload): Promise<PhotoTypeOption> {
      return await expectOk(await fetchImpl('/api/admin/photo-types', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      }));
    },

    async updatePhotoType(type: string, payload: SavePhotoTypePayload): Promise<PhotoTypeOption> {
      return await expectOk(await fetchImpl(`/api/admin/photo-types/${encodeURIComponent(type)}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(payload),
      }));
    },

    async verifyPhotoType(type: string): Promise<PhotoTypeOption> {
      return await expectOk(await fetchImpl(`/api/admin/photo-types/${encodeURIComponent(type)}/verify`, {
        method: 'POST',
        headers: headers(),
      }));
    },

    async deletePhotoType(type: string): Promise<void> {
      await expectOk(await fetchImpl(`/api/admin/photo-types/${encodeURIComponent(type)}`, {
        method: 'DELETE',
        headers: headers(),
      }));
    },

    async createJob(payload: CreateJobPayload): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(apiUrl('/api/admin/jobs'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      }));
      return mapInspectionJob(row);
    },

    async createWorkerSession(jobId: string): Promise<{ sessionUrl: string; createdAt: string; expiresAt: string; token: string; isExpired: boolean }> {
      const payload = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/sessions`), {
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

    async extendWorkerSession(jobId: string, hours = 1): Promise<{ createdAt: string; expiresAt: string; token?: string; sessionUrl?: string; extensionHours?: number; isExpired: boolean }> {
      const payload = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/session/extend`), {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ hours }),
      }));
      const origin = options.origin ?? window.location.origin;
      const pathname = options.pathname ?? window.location.pathname;
      const token = payload.token || undefined;
      return {
        createdAt: payload.createdAt,
        expiresAt: payload.expiresAt,
        token,
        sessionUrl: token ? `${origin}${pathname}?jobSession=${encodeURIComponent(jobId)}&token=${encodeURIComponent(token)}` : undefined,
        extensionHours: payload.extensionHours,
        isExpired: false,
      };
    },

    async updateJobStatus(jobId: string, status: InspectionJob['status'], adminNotes?: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/status`), {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ status, adminNotes }),
      }));
      return mapInspectionJob(row);
    },

    async updateJobStepNote(jobId: string, stepId: string, note: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/step-results/${encodeURIComponent(stepId)}/note`), {
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
      const row = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/step-results/${encodeURIComponent(stepId)}/moderation`), {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ moderationStatus, adminReviewNote }),
      }));
      return mapInspectionJob(row);
    },

    async recordExport(jobId: string): Promise<InspectionJob> {
      const row = await expectOk(await fetchImpl(apiUrl(`/api/admin/jobs/${encodeURIComponent(jobId)}/exports`), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ format: 'docx' }),
      }));
      return mapInspectionJob(row);
    },
  };
}

export const adminApi = createAdminApi();
