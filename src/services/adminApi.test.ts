import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminApi } from './adminApi';
import { ChecklistTemplate } from '../types/qc';

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

test('creates an inspection job from a database template snapshot', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createAdminApi({
    adminKey: 'secret',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        external_id: 'JOB-NEW',
        batch_number: 'BATCH-NEW',
        product_code: 'PRD-NEW',
        product_name: 'Product mới',
        template_id: 'TMPL-NEW',
        status: 'IN_PROGRESS',
        worker_id: null,
        worker_name: 'Worker',
        shift: 'Ca Sáng',
        line: 'Chuyền 01',
        created_at: '2026-08-02T00:00:00.000Z',
        updated_at: '2026-08-02T00:00:00.000Z',
        step_results: [],
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const job = await api.createJob({
    externalId: 'JOB-NEW',
    batchNumber: 'BATCH-NEW',
    productCode: 'PRD-NEW',
    productName: 'Product mới',
    templateId: 'TMPL-NEW',
    templateSnapshot: {
      id: 'TMPL-NEW',
      title: 'Checklist mới',
      productCode: 'PRD-NEW',
      productName: 'Product mới',
      docxTemplateName: 'report.docx',
      version: '1.0.0',
      updatedAt: '2026-08-02T00:00:00.000Z',
      steps: [],
    },
    workerName: 'Worker',
    shift: 'Ca Sáng',
    line: 'Chuyền 01',
  });

  assert.equal(calls[0].url, '/api/admin/jobs');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.headers?.['x-qc-admin-key' as keyof HeadersInit], 'secret');
  assert.equal(JSON.parse(String(calls[0].init?.body)).templateSnapshot.id, 'TMPL-NEW');
  assert.equal(job.id, 'JOB-NEW');
});

test('loads checklist templates from the admin API database endpoint', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createAdminApi({
    adminKey: 'secret',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify([
        {
          id: 'TMPL-001',
          title: 'Checklist DB',
          productCode: 'PRD-001',
          productName: 'Product',
          docxTemplateName: 'report.docx',
          version: '1.0.0',
          steps: [],
          createdAt: '2026-08-02T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const templates = await api.listTemplates();

  assert.equal(calls[0].url, '/api/admin/templates');
  assert.equal(calls[0].init?.headers?.['x-qc-admin-key' as keyof HeadersInit], 'secret');
  assert.equal(templates[0].id, 'TMPL-001');
  assert.equal(templates[0].title, 'Checklist DB');
});

test('saves a checklist template to the admin API database endpoint', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const template: ChecklistTemplate = {
    id: 'TMPL-NEW',
    title: 'Checklist mới',
    productCode: 'PRD-NEW',
    productName: 'Product mới',
    docxTemplateName: 'report.docx',
    version: '1.0.0',
    updatedAt: '2026-08-02T00:00:00.000Z',
    steps: [],
  };
  const api = createAdminApi({
    adminKey: 'secret',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ ...template, createdAt: template.updatedAt }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    },
  });

  const saved = await api.saveTemplate(template);

  assert.equal(calls[0].url, '/api/admin/templates');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.headers?.['x-qc-admin-key' as keyof HeadersInit], 'secret');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), template);
  assert.equal(saved.id, 'TMPL-NEW');
});

test('updates and deletes checklist templates through the admin API', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const template: ChecklistTemplate = {
    id: 'TMPL-EDIT',
    title: 'Checklist sửa',
    productCode: 'PRD-EDIT',
    productName: 'Product sửa',
    docxTemplateName: 'report.docx',
    version: '1.0.1',
    updatedAt: '2026-08-02T00:00:00.000Z',
    steps: [],
  };
  const api = createAdminApi({
    adminKey: 'secret',
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response(JSON.stringify(template), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });

  await api.updateTemplate(template);
  await api.deleteTemplate('TMPL-EDIT');

  assert.equal(calls[0].url, '/api/admin/templates/TMPL-EDIT');
  assert.equal(calls[0].init?.method, 'PUT');
  assert.equal(calls[1].url, '/api/admin/templates/TMPL-EDIT');
  assert.equal(calls[1].init?.method, 'DELETE');
});
