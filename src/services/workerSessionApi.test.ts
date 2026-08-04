import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkerSessionApi } from './workerSessionApi';

test('loads worker session details from the API and maps snake_case response fields', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createWorkerSessionApi({
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        job: {
          id: 'JOB-001',
          batchNumber: 'BATCH-001',
          productCode: 'PRD-001',
          productName: 'May test',
          status: 'IN_PROGRESS',
          stepResults: [],
          workerId: null,
          workerName: null,
          shift: 'Ca Sáng',
          line: 'Chuyền 01',
        },
        template: { id: 'TPL-001', title: 'Checklist', steps: [], updatedAt: '2026-08-02T00:00:00.000Z' },
        expiresAt: '2026-08-03T00:00:00.000Z',
        checkedInAt: '2026-08-02T01:00:00.000Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    now: () => new Date('2026-08-02T00:00:00.000Z').getTime(),
  });

  const session = await api.getSession('JOB-001', 'token/a+b');

  assert.equal(calls[0].url, '/api/worker-sessions/JOB-001?token=token%2Fa%2Bb');
  assert.equal(calls[0].init?.method, undefined);
  assert.equal(session.isValid, true);
  assert.equal(session.isExpired, false);
  assert.equal(session.job?.id, 'JOB-001');
  assert.equal(session.job?.workerName, '');
  assert.equal(session.template?.id, 'TPL-001');
  assert.equal(session.hoursRemaining, 24);
  assert.equal(session.minutesRemaining, 0);
  assert.equal(session.checkedInAt, '2026-08-02T01:00:00.000Z');
});

test('returns invalid worker session state for API authorization failures', async () => {
  const api = createWorkerSessionApi({
    fetch: async () => new Response(JSON.stringify({ error: 'Session is invalid' }), { status: 401 }),
  });

  const session = await api.getSession('JOB-001', 'bad-token');

  assert.equal(session.isValid, false);
  assert.equal(session.isExpired, false);
});

test('returns expired worker session state for expired API sessions', async () => {
  const api = createWorkerSessionApi({
    fetch: async () => new Response(JSON.stringify({
      error: 'Session expired',
      expiresAt: '2026-08-01T00:00:00.000Z',
      job: {
        id: 'JOB-001',
        batchNumber: 'BATCH-001',
        productCode: 'PRD-001',
        productName: 'May test',
        status: 'IN_PROGRESS',
        stepResults: [],
      },
    }), { status: 410, headers: { 'Content-Type': 'application/json' } }),
  });

  const session = await api.getSession('JOB-001', 'expired-token');

  assert.equal(session.isValid, true);
  assert.equal(session.isExpired, true);
  assert.equal(session.job?.id, 'JOB-001');
});

test('checks in and submits worker results through the API', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
  const api = createWorkerSessionApi({
    fetch: async (url, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url: String(url), init, body });
      if (String(url).endsWith('/check-in')) {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({
        job: {
          external_id: 'JOB-001',
          batch_number: 'BATCH-001',
          product_code: 'PRD-001',
          product_name: 'May test',
          template_id: 'TPL-001',
          status: 'COMPLETED',
          worker_id: 'W-1',
          worker_name: 'Nguyen Van A',
          shift: 'Ca Sáng',
          line: 'Chuyền 01',
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T01:00:00.000Z',
          completed_at: '2026-08-02T01:00:00.000Z',
          step_results: [{ stepId: 'S1', status: 'PASS', note: '' }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const checkedIn = await api.checkIn('JOB-001', 'token', {
    workerName: 'Nguyen Van A',
    workerId: 'W-1',
    line: 'Chuyền 01',
    shift: 'Ca Sáng',
    deviceInfo: 'Chrome',
  });
  const submitted = await api.submitResults('JOB-001', 'token', [{ stepId: 'S1', status: 'PASS', note: '' }], {
    workerName: 'Nguyen Van A',
    workerId: 'W-1',
    line: 'Chuyền 01',
    shift: 'Ca Sáng',
    deviceInfo: 'Chrome',
  });

  assert.equal(checkedIn, true);
  assert.equal(calls[0].url, '/api/worker-sessions/JOB-001/check-in');
  assert.deepEqual(calls[0].body, {
    token: 'token',
    workerName: 'Nguyen Van A',
    workerId: 'W-1',
    line: 'Chuyền 01',
    shift: 'Ca Sáng',
    deviceInfo: 'Chrome',
  });
  assert.equal(submitted.success, true);
  assert.equal(submitted.job?.id, 'JOB-001');
  assert.equal(submitted.job?.status, 'COMPLETED');
});

test('saves worker draft results without submitting the inspection job', async () => {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
  const api = createWorkerSessionApi({
    fetch: async (url, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url: String(url), init, body });
      return new Response(JSON.stringify({
        job: {
          external_id: 'JOB-001',
          batch_number: 'BATCH-001',
          product_code: 'PRD-001',
          product_name: 'May test',
          template_id: 'TPL-001',
          status: 'IN_PROGRESS',
          worker_id: 'W-1',
          worker_name: 'Nguyen Van A',
          shift: 'Ca Sáng',
          line: 'Chuyền 01',
          created_at: '2026-08-02T00:00:00.000Z',
          updated_at: '2026-08-02T01:00:00.000Z',
          completed_at: null,
          step_results: [{ stepId: 'S1', status: 'PENDING', note: 'draft' }],
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const draft = await api.saveDraftResults('JOB-001', 'token', [{ stepId: 'S1', status: 'PENDING', note: 'draft' }], {
    workerName: 'Nguyen Van A',
    workerId: 'W-1',
    line: 'Chuyền 01',
    shift: 'Ca Sáng',
    deviceInfo: 'Chrome',
  });

  assert.equal(calls[0].url, '/api/worker-sessions/JOB-001/draft');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(calls[0].body, {
    token: 'token',
    stepResults: [{ stepId: 'S1', status: 'PENDING', note: 'draft' }],
    workerInfo: {
      workerName: 'Nguyen Van A',
      workerId: 'W-1',
      line: 'Chuyền 01',
      shift: 'Ca Sáng',
      deviceInfo: 'Chrome',
    },
  });
  assert.equal(draft.success, true);
  assert.equal(draft.job?.status, 'IN_PROGRESS');
  assert.equal(draft.job?.completedAt, undefined);
});
