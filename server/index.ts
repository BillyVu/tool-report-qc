import 'dotenv/config';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { db } from './db.js';
import { createSessionToken, hashSessionToken, verifySessionToken } from './session.js';
import { imageUploadFilter } from './uploads.js';
import { enqueuePhotoProcessing } from './outbox.js';
import { enqueueGeminiAnalysis } from './geminiOutbox.js';
import { toJsonbParam } from './jsonParam.js';
import { serializeTemplateRow, templateDbParams } from './templates.js';
import { attachEvidencePhotosToStepResults, attachUploadedPhotoToStepResults, buildInitialStepResults, moderateStepResults, updateJobStatusSql } from './adminJobs.js';
import { buildX530CustomerReport, isCustomerDocxTemplate } from './customerDocx.js';

const port = Number(process.env.PORT || 3000);
const uploadsDirectory = process.env.UPLOADS_DIR || '/srv/tool-report-qc/uploads';
const docxTemplatesDirectory = process.env.DOCX_TEMPLATES_DIR || '/srv/tool-report-qc/templates';
const adminApiKey = process.env.QC_ADMIN_API_KEY;

if (!adminApiKey) throw new Error('QC_ADMIN_API_KEY is required');
mkdirSync(uploadsDirectory, { recursive: true });
mkdirSync(docxTemplatesDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDirectory),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${extensionFor(file.mimetype)}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => callback(null, imageUploadFilter(file)),
});

function extensionFor(mimeType: string): string {
  return mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const value = req.header('x-qc-admin-key');
  if (!value) return res.status(401).json({ error: 'Admin authentication is required.' });
  const candidate = Buffer.from(value);
  const expected = Buffer.from(adminApiKey);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    return res.status(401).json({ error: 'Admin authentication is required.' });
  }
  next();
}

async function getSession(jobId: string, token: string) {
  const result = await db.query(
    `SELECT s.*, j.external_id AS job_external_id, j.batch_number, j.product_code, j.product_name, j.status,
            j.step_results, j.template_snapshot, j.worker_id AS job_worker_id, j.worker_name AS job_worker_name,
            j.shift, j.line,
            COALESCE(p.evidence_photos, '[]'::jsonb) AS evidence_photos
       FROM worker_sessions s JOIN inspection_jobs j ON j.id = s.job_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'stepId', ep.step_id,
                    'slotIndex', ep.slot_index,
                    'photoUrl', '/uploads/' || ep.storage_path
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
       ) p ON true
      WHERE j.external_id = $1 AND s.revoked_at IS NULL`,
    [jobId],
  );
  return result.rows.find((row) => verifySessionToken(token, row.token_hash));
}

function serializeWorkerSession(session: any) {
  const stepResults = attachEvidencePhotosToStepResults(session.step_results, session.evidence_photos);
  return {
    job: {
      id: session.job_external_id, batchNumber: session.batch_number, productCode: session.product_code,
      productName: session.product_name, status: session.status, stepResults,
      workerId: session.job_worker_id, workerName: session.job_worker_name, shift: session.shift, line: session.line,
    },
    template: session.template_snapshot,
    expiresAt: session.expires_at,
    checkedInAt: session.checked_in_at,
  };
}

async function getHydratedJobById(jobId: string) {
  const result = await db.query(
    `SELECT j.*,
            COALESCE(p.evidence_photos, '[]'::jsonb) AS evidence_photos
       FROM inspection_jobs j
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'stepId', ep.step_id,
                    'slotIndex', ep.slot_index,
                    'photoUrl', '/uploads/' || ep.storage_path
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
       ) p ON true
      WHERE j.id = $1`,
    [jobId],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    ...row,
    step_results: attachEvidencePhotosToStepResults(row.step_results, row.evidence_photos),
    evidence_photos: undefined,
  };
}

async function workerSessionGuard(req: Request, res: Response, next: NextFunction) {
    const token = String(req.body?.token || req.query.token || '');
    const session = token && await getSession(req.params.jobId, token);
    if (!session) return res.status(401).json({ error: 'Session is invalid, revoked, or expired.' });
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: 'Session expired.', ...serializeWorkerSession(session) });
    }
    res.locals.workerSession = session;
    next();
}

const app = express();
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-qc-admin-key, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(uploadsDirectory));

app.get('/api/health', async (_req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok' });
});

app.post('/api/admin/jobs', requireAdmin, async (req, res) => {
  const { externalId, batchNumber, productCode, productName, templateId, templateSnapshot, workerId, workerName, shift, line } = req.body;
  if (![externalId, batchNumber, productCode, productName, templateSnapshot].every(Boolean)) {
    return res.status(400).json({ error: 'externalId, batchNumber, productCode, productName, and templateSnapshot are required.' });
  }
  const stepResults = buildInitialStepResults(templateSnapshot);
  const job = await db.query(
    `INSERT INTO inspection_jobs (external_id, batch_number, product_code, product_name, template_id, template_snapshot, step_results, worker_id, worker_name, shift, line)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      externalId,
      batchNumber,
      productCode,
      productName,
      templateId || null,
      toJsonbParam(templateSnapshot),
      toJsonbParam(stepResults),
      workerId || null,
      workerName || null,
      shift || null,
      line || null,
    ],
  );
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action) VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_CREATED')`, [job.rows[0].id]);
  res.status(201).json(job.rows[0]);
});

app.get('/api/admin/templates', requireAdmin, async (_req, res) => {
  const templates = await db.query(
    `SELECT external_id, title, product_code, product_name, version, definition, created_at, updated_at
       FROM templates
      ORDER BY updated_at DESC, created_at DESC`,
  );
  res.json(templates.rows.map(serializeTemplateRow));
});

app.post('/api/admin/templates', requireAdmin, async (req, res) => {
  let params;
  try {
    params = templateDbParams(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid template payload.' });
  }
  try {
    const result = await db.query(
      `INSERT INTO templates (external_id, title, product_code, product_name, version, definition)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING external_id, title, product_code, product_name, version, definition, created_at, updated_at`,
      [params.externalId, params.title, params.productCode, params.productName, params.version, params.definitionJson],
    );
    await db.query(`INSERT INTO audit_events (actor_type, actor_label, action, payload) VALUES ('ADMIN', 'QC Admin', 'TEMPLATE_CREATED', $1)`, [toJsonbParam({ templateId: params.externalId })]);
    res.status(201).json(serializeTemplateRow(result.rows[0]));
  } catch (error: any) {
    if (error?.code === '23505') return res.status(409).json({ error: 'Template id already exists.' });
    throw error;
  }
});

app.put('/api/admin/templates/:templateId', requireAdmin, async (req, res) => {
  let params;
  try {
    params = templateDbParams(req.body, req.params.templateId);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid template payload.' });
  }
  const result = await db.query(
    `UPDATE templates
        SET title = $2, product_code = $3, product_name = $4, version = $5, definition = $6, updated_at = now()
      WHERE external_id = $1
      RETURNING external_id, title, product_code, product_name, version, definition, created_at, updated_at`,
    [params.externalId, params.title, params.productCode, params.productName, params.version, params.definitionJson],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Template not found.' });
  await db.query(`INSERT INTO audit_events (actor_type, actor_label, action, payload) VALUES ('ADMIN', 'QC Admin', 'TEMPLATE_UPDATED', $1)`, [toJsonbParam({ templateId: params.externalId })]);
  res.json(serializeTemplateRow(result.rows[0]));
});

app.delete('/api/admin/templates/:templateId', requireAdmin, async (req, res) => {
  const result = await db.query(`DELETE FROM templates WHERE external_id = $1 RETURNING external_id`, [req.params.templateId]);
  if (!result.rowCount) return res.status(404).json({ error: 'Template not found.' });
  await db.query(`INSERT INTO audit_events (actor_type, actor_label, action, payload) VALUES ('ADMIN', 'QC Admin', 'TEMPLATE_DELETED', $1)`, [toJsonbParam({ templateId: req.params.templateId })]);
  res.status(204).end();
});

app.get('/api/admin/jobs', requireAdmin, async (_req, res) => {
  const jobs = await db.query(
    `SELECT j.external_id, j.batch_number, j.product_code, j.product_name, j.template_id, j.status,
            j.worker_id, j.worker_name, j.shift, j.line, j.created_at, j.updated_at, j.completed_at,
            j.step_results, j.template_snapshot, j.admin_notes, j.export_count, j.last_exported_at,
            s.token_value AS session_token, s.created_at AS session_created_at, s.expires_at AS session_expires_at, s.revoked_at AS session_revoked_at,
            COALESCE(p.evidence_photos, '[]'::jsonb) AS evidence_photos
       FROM inspection_jobs j
       LEFT JOIN LATERAL (
         SELECT token_value, created_at, expires_at, revoked_at
           FROM worker_sessions
          WHERE job_id = j.id AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'stepId', ep.step_id,
                    'slotIndex', ep.slot_index,
                    'photoUrl', '/uploads/' || ep.storage_path
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
       ) p ON true
      ORDER BY j.created_at DESC`,
  );
  res.json(jobs.rows.map((row) => ({
    ...row,
    step_results: attachEvidencePhotosToStepResults(row.step_results, row.evidence_photos),
    evidence_photos: undefined,
  })));
});

app.get('/api/admin/jobs/:jobId', requireAdmin, async (req, res) => {
  const jobs = await db.query(
    `SELECT j.external_id, j.batch_number, j.product_code, j.product_name, j.template_id, j.status,
            j.worker_id, j.worker_name, j.shift, j.line, j.created_at, j.updated_at, j.completed_at,
            j.step_results, j.template_snapshot, j.admin_notes, j.export_count, j.last_exported_at,
            s.created_at AS session_created_at, s.expires_at AS session_expires_at, s.revoked_at AS session_revoked_at,
            COALESCE(p.evidence_photos, '[]'::jsonb) AS evidence_photos
       FROM inspection_jobs j
       LEFT JOIN LATERAL (
         SELECT created_at, expires_at, revoked_at
           FROM worker_sessions
          WHERE job_id = j.id AND revoked_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
       ) s ON true
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'stepId', ep.step_id,
                    'slotIndex', ep.slot_index,
                    'photoUrl', '/uploads/' || ep.storage_path
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
       ) p ON true
      WHERE j.external_id = $1`,
    [req.params.jobId],
  );
  if (!jobs.rowCount) return res.status(404).json({ error: 'Job not found.' });
  const row = jobs.rows[0];
  res.json({
    ...row,
    step_results: attachEvidencePhotosToStepResults(row.step_results, row.evidence_photos),
    evidence_photos: undefined,
  });
});

app.get('/api/admin/jobs/:jobId/customer-report.docx', requireAdmin, async (req, res) => {
  const result = await db.query(
    `SELECT j.id, j.external_id, j.batch_number, j.worker_name, j.created_at, j.template_snapshot,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'step_id', ep.step_id,
                  'slot_index', ep.slot_index,
                  'storage_path', ep.storage_path,
                  'created_at', ep.created_at
                ) ORDER BY ep.step_id, ep.slot_index, ep.created_at
              ) FILTER (WHERE ep.id IS NOT NULL),
              '[]'::jsonb
            ) AS evidence_photos
       FROM inspection_jobs j
       LEFT JOIN evidence_photos ep ON ep.job_id = j.id
      WHERE j.external_id = $1
      GROUP BY j.id`,
    [req.params.jobId],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });

  const job = result.rows[0];
  if (!isCustomerDocxTemplate(job.template_snapshot?.docxTemplateName)) {
    return res.status(409).json({ error: 'Lệnh QC này không sử dụng mẫu DOCX khách hàng được hỗ trợ.' });
  }

  try {
    const report = await buildX530CustomerReport({
      templateDirectory: docxTemplatesDirectory,
      uploadsDirectory,
      job,
      photos: job.evidence_photos,
    });
    const filename = `[ATT_X530_Inspection_Report]_${job.external_id}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(report);
  } catch (error) {
    console.error('Could not build customer DOCX report:', error);
    res.status(500).json({ error: 'Không thể tạo báo cáo theo mẫu DOCX khách hàng.' });
  }
});

app.get('/api/admin/jobs/:jobId/photos/:storagePath', requireAdmin, async (req, res) => {
  const photo = await db.query(
    `SELECT ep.storage_path, ep.mime_type, ep.original_filename
       FROM evidence_photos ep
       JOIN inspection_jobs j ON j.id = ep.job_id
      WHERE j.external_id = $1 AND ep.storage_path = $2`,
    [req.params.jobId, req.params.storagePath],
  );
  if (!photo.rowCount) return res.status(404).json({ error: 'Evidence photo not found.' });

  const storagePath = photo.rows[0].storage_path;
  if (storagePath.includes('/') || storagePath.includes('\\')) {
    return res.status(400).json({ error: 'Invalid evidence photo path.' });
  }

  const filePath = join(uploadsDirectory, storagePath);
  res.setHeader('Content-Type', photo.rows[0].mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${photo.rows[0].original_filename || storagePath}"`);
  res.sendFile(filePath);
});

app.get('/api/admin/kpis', requireAdmin, async (_req, res) => {
  const result = await db.query(
    `SELECT
       count(*)::int AS total_jobs,
       count(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
       count(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       count(*) FILTER (WHERE status = 'FAILED')::int AS failed,
       count(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today_count
     FROM inspection_jobs`,
  );
  const row = result.rows[0];
  const finished = Number(row.completed) + Number(row.failed);
  res.json({
    totalJobs: Number(row.total_jobs),
    inProgress: Number(row.in_progress),
    completed: Number(row.completed),
    failed: Number(row.failed),
    todayCount: Number(row.today_count),
    passRate: finished > 0 ? Math.round((Number(row.completed) / finished) * 100) : 100,
  });
});

app.get('/api/admin/audit-events', requireAdmin, async (_req, res) => {
  const result = await db.query(
    `SELECT a.id, j.external_id AS job_external_id, a.actor_label, a.action, a.payload, a.created_at
       FROM audit_events a
       LEFT JOIN inspection_jobs j ON j.id = a.job_id
      ORDER BY a.created_at DESC
      LIMIT 500`,
  );
  res.json(result.rows.map((row) => ({
    id: String(row.id),
    jobId: row.job_external_id || '',
    adminName: row.actor_label,
    action: row.action,
    fieldChanged: row.payload?.fieldChanged || row.payload?.field || row.action,
    oldValue: row.payload?.oldValue || '',
    newValue: row.payload?.newValue || '',
    timestamp: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  })));
});

app.patch('/api/admin/jobs/:jobId/status', requireAdmin, async (req, res) => {
  const { status, adminNotes } = req.body;
  if (!['IN_PROGRESS', 'COMPLETED', 'FAILED'].includes(status)) return res.status(400).json({ error: 'A valid status is required.' });
  const result = await db.query(
    updateJobStatusSql,
    [req.params.jobId, status, adminNotes ?? null],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_STATUS_UPDATED', $2)`,
    [result.rows[0].id, toJsonbParam({ fieldChanged: 'Status', newValue: status, adminNotes })],
  );
  res.json(result.rows[0]);
});

app.patch('/api/admin/jobs/:jobId/step-results/:stepId/note', requireAdmin, async (req, res) => {
  const note = String(req.body?.note ?? '');
  const job = await db.query(`SELECT id, step_results FROM inspection_jobs WHERE external_id = $1`, [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });
  const stepResults = Array.isArray(job.rows[0].step_results) ? job.rows[0].step_results : [];
  let oldValue = '';
  let found = false;
  const updatedSteps = stepResults.map((step) => {
    if (step?.stepId !== req.params.stepId) return step;
    found = true;
    oldValue = step.note || '';
    return { ...step, originalNote: step.originalNote || step.note || '', note, editedByAdmin: true };
  });
  if (!found) return res.status(404).json({ error: 'Step result not found.' });
  const result = await db.query(
    `UPDATE inspection_jobs SET step_results = $2, updated_at = now(), version = version + 1 WHERE external_id = $1 RETURNING *`,
    [req.params.jobId, toJsonbParam(updatedSteps)],
  );
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_STEP_NOTE_UPDATED', $2)`,
    [job.rows[0].id, toJsonbParam({ fieldChanged: `Step ${req.params.stepId} Note`, oldValue, newValue: note })],
  );
  res.json(result.rows[0]);
});

app.patch('/api/admin/jobs/:jobId/step-results/:stepId/moderation', requireAdmin, async (req, res) => {
  const moderationStatus = String(req.body?.moderationStatus || '');
  if (!['PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(moderationStatus)) {
    return res.status(400).json({ error: 'A valid moderationStatus is required.' });
  }
  const adminReviewNote = String(req.body?.adminReviewNote ?? '');
  const job = await db.query(`SELECT id, step_results FROM inspection_jobs WHERE external_id = $1`, [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });

  const { found, previousStatus, updatedSteps } = moderateStepResults(
    job.rows[0].step_results,
    req.params.stepId,
    moderationStatus as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
    adminReviewNote,
  );
  if (!found) return res.status(404).json({ error: 'Step result not found.' });

  const result = await db.query(
    `UPDATE inspection_jobs SET step_results = $2, updated_at = now(), version = version + 1 WHERE external_id = $1 RETURNING *`,
    [req.params.jobId, toJsonbParam(updatedSteps)],
  );
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_STEP_MODERATED', $2)`,
    [
      job.rows[0].id,
      toJsonbParam({
        fieldChanged: `Step ${req.params.stepId} Moderation`,
        oldValue: previousStatus,
        newValue: moderationStatus,
        adminReviewNote,
      }),
    ],
  );
  res.json(result.rows[0]);
});

app.post('/api/admin/jobs/:jobId/exports', requireAdmin, async (req, res) => {
  const result = await db.query(
    `UPDATE inspection_jobs
        SET export_count = COALESCE(export_count, 0) + 1,
            last_exported_at = now(),
            updated_at = now()
      WHERE external_id = $1
      RETURNING *`,
    [req.params.jobId],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_EXPORTED', $2)`,
    [result.rows[0].id, toJsonbParam({ format: req.body?.format || 'docx' })],
  );
  res.json(result.rows[0]);
});

app.post('/api/admin/jobs/:jobId/sessions', requireAdmin, async (req, res) => {
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const job = await db.query('SELECT id FROM inspection_jobs WHERE external_id = $1', [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });
  const existing = await db.query(
    'SELECT token_value, created_at, expires_at FROM worker_sessions WHERE job_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [job.rows[0].id],
  );
  if (existing.rowCount) {
    return res.status(409).json({
      error: 'Session link đã được tạo cho lệnh này. Không được gen lại link; nếu đã hết hạn hãy dùng chức năng gia hạn thời gian.',
      token: existing.rows[0].token_value || undefined,
      createdAt: existing.rows[0].created_at instanceof Date ? existing.rows[0].created_at.toISOString() : existing.rows[0].created_at,
      expiresAt: existing.rows[0].expires_at instanceof Date ? existing.rows[0].expires_at.toISOString() : existing.rows[0].expires_at,
    });
  }
  const session = await db.query(
    'INSERT INTO worker_sessions (job_id, token_hash, token_value, expires_at) VALUES ($1, $2, $3, $4) RETURNING created_at, expires_at',
    [job.rows[0].id, hashSessionToken(token), token, expiresAt],
  );
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action) VALUES ($1, 'ADMIN', 'QC Admin', 'WORKER_SESSION_CREATED')`, [job.rows[0].id]);
  res.status(201).json({
    token,
    createdAt: session.rows[0].created_at instanceof Date ? session.rows[0].created_at.toISOString() : session.rows[0].created_at,
    expiresAt: session.rows[0].expires_at instanceof Date ? session.rows[0].expires_at.toISOString() : session.rows[0].expires_at,
  });
});

app.patch('/api/admin/jobs/:jobId/session/extend', requireAdmin, async (req, res) => {
  const requestedHours = Number(req.body?.hours ?? 1);
  const extensionHours = [1, 2, 4].includes(requestedHours) ? requestedHours : 1;
  const expiresAt = new Date(Date.now() + extensionHours * 60 * 60 * 1000);
  const job = await db.query('SELECT id FROM inspection_jobs WHERE external_id = $1', [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });
  const session = await db.query(
    `UPDATE worker_sessions
        SET expires_at = $2
      WHERE id = (
        SELECT id FROM worker_sessions
         WHERE job_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1
      )
      RETURNING token_value, created_at, expires_at`,
    [job.rows[0].id, expiresAt],
  );
  if (!session.rowCount) return res.status(404).json({ error: 'Session link has not been created for this job.' });
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action) VALUES ($1, 'ADMIN', 'QC Admin', 'WORKER_SESSION_EXTENDED')`, [job.rows[0].id]);
  res.json({
    token: session.rows[0].token_value || undefined,
    createdAt: session.rows[0].created_at instanceof Date ? session.rows[0].created_at.toISOString() : session.rows[0].created_at,
    expiresAt: session.rows[0].expires_at instanceof Date ? session.rows[0].expires_at.toISOString() : session.rows[0].expires_at,
    extensionHours,
  });
});

app.get('/api/worker-sessions/:jobId', workerSessionGuard, async (_req, res) => {
  const session = res.locals.workerSession;
  res.json(serializeWorkerSession(session));
});

app.post('/api/worker-sessions/:jobId/check-in', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const { workerName, workerId, deviceInfo, shift, line } = req.body;
  if (!workerName?.trim()) return res.status(400).json({ error: 'workerName is required.' });
  await db.query('UPDATE worker_sessions SET checked_in_at = now(), worker_name = $1, worker_id = $2, device_info = $3 WHERE id = $4', [workerName.trim(), workerId || null, deviceInfo || null, session.id]);
  await db.query('UPDATE inspection_jobs SET worker_name = $1, worker_id = $2, shift = COALESCE($3, shift), line = COALESCE($4, line), updated_at = now(), version = version + 1 WHERE id = $5', [workerName.trim(), workerId || null, shift || null, line || null, session.job_id]);
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action) VALUES ($1, 'WORKER', $2, 'WORKER_CHECKED_IN')`, [session.job_id, workerName.trim()]);
  res.status(204).end();
});

app.post('/api/worker-sessions/:jobId/photos', workerSessionGuard, upload.single('photo'), async (req, res) => {
  const session = res.locals.workerSession;
  if (!req.file) return res.status(400).json({ error: 'A JPEG, PNG, or WEBP photo is required.' });
  const { stepId, slotIndex } = req.body;
  if (!stepId || !Number.isInteger(Number(slotIndex))) {
    await fs.unlink(req.file.path);
    return res.status(400).json({ error: 'stepId and integer slotIndex are required.' });
  }
  const data = await fs.readFile(req.file.path);
  const sha256 = createHash('sha256').update(data).digest('hex');
  const photo = await db.query(
    `INSERT INTO evidence_photos (job_id, session_id, step_id, slot_index, storage_path, original_filename, mime_type, byte_size, sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, step_id, slot_index, mime_type, byte_size, sha256, created_at`,
    [session.job_id, session.id, stepId, Number(slotIndex), req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, sha256],
  );
  const photoUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
  const { found, updatedSteps } = attachUploadedPhotoToStepResults(session.step_results, {
    stepId,
    slotIndex: Number(slotIndex),
    photoUrl,
  });
  if (found) {
    await db.query(
      `UPDATE inspection_jobs
          SET step_results = $1,
              updated_at = now(),
              version = version + 1
        WHERE id = $2`,
      [toJsonbParam(updatedSteps), session.job_id],
    );
  }
  await enqueuePhotoProcessing(photo.rows[0].id);
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload) VALUES ($1, 'WORKER', $2, 'PHOTO_UPLOADED', $3)`, [session.job_id, session.worker_name || 'Worker', toJsonbParam({ photoId: photo.rows[0].id, stepId })]);
  res.status(201).json({ ...photo.rows[0], photoUrl });
});

app.post('/api/worker-sessions/:jobId/photos/:photoId/analyze', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const detectType = req.body?.detectType;
  if (!['IMEI_SERIAL', 'OCR_TEXT', 'COLOR_SCREEN', 'GENERAL'].includes(detectType)) {
    return res.status(400).json({ error: 'A valid detectType is required.' });
  }
  const photo = await db.query(`SELECT id, sha256 FROM evidence_photos WHERE id = $1 AND job_id = $2`, [req.params.photoId, session.job_id]);
  if (!photo.rowCount) return res.status(404).json({ error: 'Photo not found.' });
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const existing = await db.query(`SELECT * FROM gemini_analyses WHERE source_sha256 = $1 AND detect_type = $2 AND model = $3 AND prompt_version = 'v1'`, [photo.rows[0].sha256, detectType, geminiModel]);
  if (existing.rowCount) return res.status(200).json(existing.rows[0]);
  try {
    const analysis = await db.query(`INSERT INTO gemini_analyses (photo_id, source_sha256, detect_type, model) VALUES ($1, $2, $3, $4) RETURNING *`, [photo.rows[0].id, photo.rows[0].sha256, detectType, geminiModel]);
    await enqueueGeminiAnalysis(analysis.rows[0].id, photo.rows[0].id);
    res.status(202).json(analysis.rows[0]);
  } catch (error: any) {
    if (error?.code !== '23505') throw error;
    const concurrent = await db.query(`SELECT * FROM gemini_analyses WHERE source_sha256 = $1 AND detect_type = $2 AND model = $3 AND prompt_version = 'v1'`, [photo.rows[0].sha256, detectType, geminiModel]);
    res.status(200).json(concurrent.rows[0]);
  }
});

app.get('/api/worker-sessions/:jobId/analyses/:analysisId', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const analysis = await db.query(`SELECT a.* FROM gemini_analyses a JOIN evidence_photos p ON p.id = a.photo_id WHERE a.id = $1 AND p.job_id = $2`, [req.params.analysisId, session.job_id]);
  if (!analysis.rowCount) return res.status(404).json({ error: 'Analysis not found.' });
  res.json(analysis.rows[0]);
});

app.post('/api/worker-sessions/:jobId/draft', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const { stepResults, workerInfo } = req.body;
  if (!Array.isArray(stepResults)) return res.status(400).json({ error: 'stepResults must be an array.' });
  await db.query(
    `UPDATE inspection_jobs
        SET step_results = $1,
            worker_name = COALESCE($2, worker_name), worker_id = COALESCE($3, worker_id),
            shift = COALESCE($4, shift), line = COALESCE($5, line),
            updated_at = now(), version = version + 1
      WHERE id = $6 RETURNING *`,
    [
      toJsonbParam(stepResults),
      workerInfo?.workerName || null,
      workerInfo?.workerId || null,
      workerInfo?.shift || null,
      workerInfo?.line || null,
      session.job_id,
    ],
  );
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'WORKER', $2, 'WORKER_DRAFT_SAVED', $3)`,
    [session.job_id, workerInfo?.workerName || session.worker_name || 'Worker', toJsonbParam({ stepCount: stepResults.length })],
  );
  const hydratedJob = await getHydratedJobById(session.job_id);
  res.json({ job: hydratedJob });
});

app.post('/api/worker-sessions/:jobId/submit', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const { stepResults, workerInfo } = req.body;
  if (!Array.isArray(stepResults)) return res.status(400).json({ error: 'stepResults must be an array.' });
  const failed = stepResults.some((step) => step?.status === 'FAIL');
  const status = failed ? 'FAILED' : 'COMPLETED';
  await db.query(
    `UPDATE inspection_jobs
        SET step_results = $1, status = $2::qc_job_status, completed_at = now(),
            worker_name = COALESCE($3, worker_name), worker_id = COALESCE($4, worker_id),
            shift = COALESCE($5, shift), line = COALESCE($6, line),
            updated_at = now(), version = version + 1
      WHERE id = $7 RETURNING *`,
    [
      toJsonbParam(stepResults),
      status,
      workerInfo?.workerName || null,
      workerInfo?.workerId || null,
      workerInfo?.shift || null,
      workerInfo?.line || null,
      session.job_id,
    ],
  );
  await db.query('UPDATE worker_sessions SET submitted_at = now() WHERE id = $1', [session.id]);
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload) VALUES ($1, 'WORKER', $2, 'WORKER_SUBMITTED', $3)`, [session.job_id, workerInfo?.workerName || session.worker_name || 'Worker', toJsonbParam({ status })]);
  const hydratedJob = await getHydratedJobById(session.job_id);
  res.json({ job: hydratedJob });
});

const distDirectory = join(process.cwd(), 'dist');
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory));
  app.get('*', (_req, res) => {
    res.sendFile(join(distDirectory, 'index.html'));
  });
}

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(error instanceof multer.MulterError ? 400 : 500).json({ error: error.message || 'Internal server error.' });
});

app.listen(port, () => console.log(`QC API listening on ${port}`));
