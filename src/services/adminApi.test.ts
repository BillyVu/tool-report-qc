import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminApi } from './adminApi';

test('loads admin jobs using the configured admin API key', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createAdminApi({
    adminKey: 'secret',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify([
        {
          external_id: 'JOB-001',
          batch_number: 'BATCH-001',
          product_code: 'PRD-001',
          product_name: 'May test',
          template_id: 'TPL-001',
          status: 'IN_PROGRESS',
          worker_id: null,
          worker_name: null,
          shift: 'Ca Sáng',
          line: 'Chuyền 01',
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T00:00:00.000Z',
          completed_at: null,
          step_results: [],
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const jobs = await api.listJobs();

  assert.equal(calls[0].url, '/api/admin/jobs');
  assert.equal(calls[0].init?.headers?.['x-qc-admin-key' as keyof HeadersInit], 'secret');
  assert.equal(jobs[0].id, 'JOB-001');
  assert.equal(jobs[0].workerName, '');
});

test('creates a worker session URL for an admin job', async () => {
  const api = createAdminApi({
    adminKey: 'secret',
    origin: 'http://localhost:5173',
    pathname: '/',
    fetch: async () => new Response(JSON.stringify({
      token: 'worker-token',
      expiresAt: '2026-08-03T00:00:00.000Z',
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
  });

  const session = await api.createWorkerSession('JOB-001');

  assert.equal(session.token, 'worker-token');
  assert.equal(session.expiresAt, '2026-08-03T00:00:00.000Z');
  assert.equal(session.sessionUrl, 'http://localhost:5173/?jobSession=JOB-001&token=worker-token');
});
