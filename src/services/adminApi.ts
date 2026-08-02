import { InspectionJob } from '../types/qc';
import { mapInspectionJob } from './workerSessionApi';

interface AdminApiOptions {
  adminKey?: string;
  fetch?: typeof fetch;
  origin?: string;
  pathname?: string;
}

function getDefaultAdminKey() {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
  const envKey = meta.env?.VITE_QC_ADMIN_API_KEY;
  const storedKey = typeof localStorage === 'undefined' ? '' : localStorage.getItem('qc_admin_api_key');
  return envKey || storedKey || '';
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
    async listJobs(): Promise<InspectionJob[]> {
      const payload = await expectOk(await fetchImpl('/api/admin/jobs', {
        headers: headers(),
      }));
      return (payload || []).map(mapInspectionJob);
    },

    async createWorkerSession(jobId: string): Promise<{ sessionUrl: string; expiresAt: string; token: string; isExpired: boolean }> {
      const payload = await expectOk(await fetchImpl(`/api/admin/jobs/${encodeURIComponent(jobId)}/sessions`, {
        method: 'POST',
        headers: headers(),
      }));
      const origin = options.origin ?? window.location.origin;
      const pathname = options.pathname ?? window.location.pathname;
      return {
        sessionUrl: `${origin}${pathname}?jobSession=${encodeURIComponent(jobId)}&token=${encodeURIComponent(payload.token)}`,
        expiresAt: payload.expiresAt,
        token: payload.token,
        isExpired: false,
      };
    },
  };
}

export const adminApi = createAdminApi();
