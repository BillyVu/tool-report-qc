import 'dotenv/config';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { WebSocketServer } from 'ws';
import { createDbClient, db } from './db.js';
import { createSessionToken, hashSessionToken, verifySessionToken } from './session.js';
import { imageUploadFilter } from './uploads.js';
import { enqueuePhotoProcessing } from './outbox.js';
import { enqueueGeminiAnalysis } from './geminiOutbox.js';
import { toJsonbParam } from './jsonParam.js';
import { serializeTemplateRow, templateDbParams } from './templates.js';
import { attachEvidencePhotosToStepResults, attachUploadedPhotoToStepResults, applyStepResultsUpdate, buildInitialStepResults, calculateExtendedSessionExpiry, moderateStepResults, replacePhotoInStepResults, updateJobStatusSql } from './adminJobs.js';
import { buildX530CustomerReport, applyX530SlotAspectRatios, isCustomerDocxTemplate } from './customerDocx.js';
import { createPhotoTypeParams, serializePhotoTypeRow, updatePhotoTypeParams } from './photoTypes.js';
import { DEFAULT_MIN_SHARPNESS_SCORE, inspectPhotoFile, isAspectRatio } from './photoQuality.js';
import { enqueuePhotoQualityCheck, runPhotoQualityJobs } from './photoQualityJobs.js';
import { inferPhotoTypeFromContext } from './photoTypeInference.js';
import { buildAnalysisPrompt, buildQualityPrompt, getVeroPromptProfile, isPromptVerified, listVeroPromptProfiles, promptHash, updateVeroPromptInstruction, VERO_PROMPT_KEYS, VeroPromptKey } from './veroPrompts.js';
import { defaultOutputSchemaForMode, mapVerificationModeToDetectType, normalizeOutputSchema, normalizeSchemaVersion, normalizeVerificationMode, serializeAnalysisRow } from './veroAnalysis.js';
import { workerSessionRealtime } from './workerRealtime.js';
import { startRealtimeRelay } from './realtimeBridge.js';

const port = Number(process.env.PORT || 3000);
const uploadsDirectory = process.env.UPLOADS_DIR || '/srv/tool-report-qc/uploads';
const docxTemplatesDirectory = process.env.DOCX_TEMPLATES_DIR || '/srv/tool-report-qc/templates';
const adminApiKey = process.env.QC_ADMIN_API_KEY;
const botName = process.env.BOT_NAME || 'Vero';

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

async function resolvePhotoPromptContext(templateSnapshot: any, stepId: string, slotIndex: number) {
  const step = Array.isArray(templateSnapshot?.steps)
    ? templateSnapshot.steps.find((item: any) => item?.stepId === stepId)
    : undefined;
  const slot = Array.isArray(step?.photoSlotConfigs)
    ? step.photoSlotConfigs.find((item: any) => Number(item?.slotIndex) === slotIndex)
    : undefined;
  const photoLabel = typeof slot?.label === 'string'
    ? slot.label
    : Array.isArray(step?.photoSlots) && typeof step.photoSlots[slotIndex - 1] === 'string'
      ? step.photoSlots[slotIndex - 1]
      : typeof step?.title === 'string'
        ? step.title
        : 'Ảnh kiểm định';
  const inferredPhotoType = inferPhotoTypeFromContext({
    stepTitle: step?.title,
    slotLabel: photoLabel,
    aiDetectType: step?.aiDetectType,
  });
  const photoType = typeof slot?.photoType === 'string' && slot.photoType.trim() ? slot.photoType : inferredPhotoType;
  const option = await db.query('SELECT ai_prompt_instruction, verification_mode, schema_version, output_schema FROM photo_type_options WHERE type = $1', [photoType]);
  return {
    photoType,
    photoLabel,
    photoInstruction: option.rows[0]?.ai_prompt_instruction || 'Phân tích tổng quan hình ảnh kiểm định QC sản phẩm điện tử, chỉ kết luận theo bằng chứng nhìn thấy trực tiếp.',
    verificationMode: normalizeVerificationMode(option.rows[0]?.verification_mode),
    schemaVersion: normalizeSchemaVersion(option.rows[0]?.schema_version),
    outputSchema: normalizeOutputSchema(option.rows[0]?.output_schema),
  };
}

async function getSession(jobId: string, token: string) {
  const result = await db.query(
    `SELECT s.*, j.external_id AS job_external_id, j.batch_number, j.product_code, j.product_name, j.status,
            j.step_results, j.template_snapshot, j.worker_id AS job_worker_id, j.worker_name AS job_worker_name,
            j.shift, j.line, j.defects_finding_data, j.packaging_info_data, j.other_info_data,
            COALESCE(p.evidence_photos, '[]'::jsonb) AS evidence_photos
       FROM worker_sessions s JOIN inspection_jobs j ON j.id = s.job_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
                  jsonb_build_object(
                    'stepId', ep.step_id,
                    'slotIndex', ep.slot_index,
                    'photoUrl', '/uploads/' || ep.storage_path,
                    'manualOverride', ep.manual_override,
                    'aiQualityStatus', ep.ai_quality_status
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
            AND ep.ai_quality_status IS DISTINCT FROM 'REJECTED'
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
      defectsFindingData: session.defects_finding_data || session.template_snapshot?.defectsFindingData || [],
      packagingInfoData: session.packaging_info_data || session.template_snapshot?.packagingInfoData || {},
      otherInfoData: session.other_info_data || session.template_snapshot?.otherInfoData || {},
    },
    template: applyX530SlotAspectRatios(session.template_snapshot),
    expiresAt: session.expires_at,
    checkedInAt: session.checked_in_at,
    botName,
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
                    'photoUrl', '/uploads/' || ep.storage_path,
                    'manualOverride', ep.manual_override,
                    'aiQualityStatus', ep.ai_quality_status
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
            AND ep.ai_quality_status IS DISTINCT FROM 'REJECTED'
       ) p ON true
      WHERE j.id = $1`,
    [jobId],
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    ...row,
    step_results: attachEvidencePhotosToStepResults(row.step_results, row.evidence_photos),
    defectsFindingData: row.defects_finding_data || row.template_snapshot?.defectsFindingData || [],
    packagingInfoData: row.packaging_info_data || row.template_snapshot?.packagingInfoData || {},
    otherInfoData: row.other_info_data || row.template_snapshot?.otherInfoData || {},
    evidence_photos: undefined,
  };
}

async function getAdminJobDetailByExternalId(externalId: string) {
  const jobs = await db.query(
    `SELECT j.external_id, j.batch_number, j.product_code, j.product_name, j.template_id, j.status,
            j.worker_id, j.worker_name, j.shift, j.line, j.created_at, j.updated_at, j.completed_at,
            j.step_results, j.template_snapshot, j.admin_notes, j.export_count, j.last_exported_at,
            j.defects_finding_data, j.packaging_info_data, j.other_info_data,
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
                    'photoUrl', '/uploads/' || ep.storage_path,
                    'manualOverride', ep.manual_override,
                    'aiQualityStatus', ep.ai_quality_status
                  )
                  ORDER BY ep.step_id, ep.slot_index, ep.created_at
                ) AS evidence_photos
           FROM evidence_photos ep
          WHERE ep.job_id = j.id
       ) p ON true
      WHERE j.external_id = $1`,
    [externalId],
  );
  if (!jobs.rowCount) return null;
  const row = jobs.rows[0];
  return {
    ...row,
    step_results: attachEvidencePhotosToStepResults(row.step_results, row.evidence_photos),
    defectsFindingData: row.defects_finding_data || row.template_snapshot?.defectsFindingData || [],
    packagingInfoData: row.packaging_info_data || row.template_snapshot?.packagingInfoData || {},
    otherInfoData: row.other_info_data || row.template_snapshot?.otherInfoData || {},
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

app.get('/api/photo-types', async (_req, res) => {
  const result = await db.query(
    `SELECT type, label, category, icon_emoji, verification_mode, schema_version, output_schema, ai_prompt_instruction, is_system, is_active, sort_order, created_at, updated_at
       FROM photo_type_options
      ORDER BY sort_order ASC, label ASC`,
  );
  res.json(result.rows.map(serializePhotoTypeRow));
});

app.get('/api/admin/photo-types', requireAdmin, async (_req, res) => {
  const result = await db.query(
    `SELECT type, label, category, icon_emoji, verification_mode, schema_version, output_schema, ai_prompt_instruction, is_system, is_active, sort_order, created_at, updated_at
       FROM photo_type_options
      ORDER BY sort_order ASC, label ASC`,
  );
  res.json(result.rows.map(serializePhotoTypeRow));
});

app.get('/api/admin/vero-prompt-profiles', requireAdmin, async (_req, res) => {
  res.json(await listVeroPromptProfiles());
});

app.patch('/api/admin/vero-prompt-profiles/:profileKey', requireAdmin, async (req, res) => {
  const profileKey = req.params.profileKey as VeroPromptKey;
  if (!VERO_PROMPT_KEYS.includes(profileKey)) return res.status(404).json({ error: 'Không tìm thấy cấu hình Vero.' });
  let instruction: string;
  try {
    instruction = updateVeroPromptInstruction(req.body?.instruction);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Cấu hình Vero không hợp lệ.' });
  }
  const result = await db.query(
    `UPDATE vero_prompt_profiles
        SET instruction = $2,
            revision = revision + 1,
            verified_at = NULL,
            verified_by = NULL,
            verified_revision = NULL,
            verified_prompt_hash = NULL,
            updated_at = now()
      WHERE profile_key = $1
      RETURNING profile_key, label, description, instruction, revision, verified_at, verified_by, verified_revision, verified_prompt_hash, updated_at`,
    [profileKey, instruction],
  );
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_label, action, payload)
     VALUES ('ADMIN', 'QC Admin', 'VERO_PROMPT_PUBLISHED', $1)`,
    [toJsonbParam({ profileKey, revision: result.rows[0]?.revision, promptHash: promptHash(instruction) })],
  );
  res.json(result.rows[0] ? {
    profileKey: result.rows[0].profile_key,
    label: result.rows[0].label,
    description: result.rows[0].description,
    instruction: result.rows[0].instruction,
    revision: Number(result.rows[0].revision),
    verifiedAt: result.rows[0].verified_at,
    verifiedBy: result.rows[0].verified_by,
    verifiedRevision: result.rows[0].verified_revision === null ? null : Number(result.rows[0].verified_revision),
    verifiedPromptHash: result.rows[0].verified_prompt_hash,
    updatedAt: result.rows[0].updated_at,
  } : null);
});

app.post('/api/admin/vero-prompt-profiles/:profileKey/verify', requireAdmin, async (req, res) => {
  const profileKey = req.params.profileKey as VeroPromptKey;
  if (!VERO_PROMPT_KEYS.includes(profileKey)) return res.status(404).json({ error: 'Không tìm thấy cấu hình Vero.' });
  const profile = await getVeroPromptProfile(profileKey);
  const hash = promptHash(profile.instruction);
  const result = await db.query(
    `UPDATE vero_prompt_profiles
        SET verified_at = now(),
            verified_by = 'QC Admin',
            verified_revision = revision,
            verified_prompt_hash = $2,
            updated_at = now()
      WHERE profile_key = $1
      RETURNING profile_key, label, description, instruction, revision, verified_at, verified_by, verified_revision, verified_prompt_hash, updated_at`,
    [profileKey, hash],
  );
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_label, action, payload)
     VALUES ('ADMIN', 'QC Admin', 'VERO_PROMPT_VERIFIED', $1)`,
    [toJsonbParam({ profileKey, revision: profile.revision, promptHash: hash })],
  );
  res.json(result.rows[0] ? {
    profileKey: result.rows[0].profile_key,
    label: result.rows[0].label,
    description: result.rows[0].description,
    instruction: result.rows[0].instruction,
    revision: Number(result.rows[0].revision),
    verifiedAt: result.rows[0].verified_at,
    verifiedBy: result.rows[0].verified_by,
    verifiedRevision: result.rows[0].verified_revision === null ? null : Number(result.rows[0].verified_revision),
    verifiedPromptHash: result.rows[0].verified_prompt_hash,
    updatedAt: result.rows[0].updated_at,
  } : null);
});

app.post('/api/admin/photo-types', requireAdmin, async (req, res) => {
  let params;
  try {
    params = createPhotoTypeParams(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Loại ảnh không hợp lệ.' });
  }
  try {
    const result = await db.query(
      `INSERT INTO photo_type_options (type, label, category, icon_emoji, verification_mode, schema_version, output_schema, ai_prompt_instruction, prompt_verified_at, prompt_verified_by, prompt_verified_hash, is_system, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, false, $9, $10)
       RETURNING type, label, category, icon_emoji, verification_mode, schema_version, output_schema, ai_prompt_instruction, prompt_verified_at, prompt_verified_by, prompt_verified_hash, is_system, is_active, sort_order, created_at, updated_at`,
      [params.type, params.label, params.category, params.iconEmoji, params.verificationMode, params.schemaVersion, toJsonbParam(params.outputSchema), params.aiPromptInstruction, params.isActive, params.sortOrder],
    );
    await db.query(
      `INSERT INTO audit_events (actor_type, actor_label, action, payload)
       VALUES ('ADMIN', 'QC Admin', 'PHOTO_TYPE_CREATED', $1)`,
      [toJsonbParam({ type: params.type })],
    );
    res.status(201).json(serializePhotoTypeRow(result.rows[0]));
  } catch (error: any) {
    if (error?.code === '23505') return res.status(409).json({ error: 'Mã loại ảnh đã tồn tại.' });
    throw error;
  }
});

app.patch('/api/admin/photo-types/:type', requireAdmin, async (req, res) => {
  let params;
  try {
    params = updatePhotoTypeParams(req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Loại ảnh không hợp lệ.' });
  }
  const result = await db.query(
    `UPDATE photo_type_options
        SET label = COALESCE($2, label),
            category = COALESCE($3, category),
            icon_emoji = COALESCE($4, icon_emoji),
            verification_mode = COALESCE($5, verification_mode),
            schema_version = COALESCE($6, schema_version),
            output_schema = COALESCE($7, output_schema),
            ai_prompt_instruction = COALESCE($8, ai_prompt_instruction),
            is_active = COALESCE($9, is_active),
            sort_order = COALESCE($10, sort_order),
            prompt_verified_at = CASE
              WHEN $3 IS NOT NULL OR $5 IS NOT NULL OR $6 IS NOT NULL OR $7 IS NOT NULL OR $8 IS NOT NULL
                THEN NULL ELSE prompt_verified_at END,
            prompt_verified_by = CASE
              WHEN $3 IS NOT NULL OR $5 IS NOT NULL OR $6 IS NOT NULL OR $7 IS NOT NULL OR $8 IS NOT NULL
                THEN NULL ELSE prompt_verified_by END,
            prompt_verified_hash = CASE
              WHEN $3 IS NOT NULL OR $5 IS NOT NULL OR $6 IS NOT NULL OR $7 IS NOT NULL OR $8 IS NOT NULL
                THEN NULL ELSE prompt_verified_hash END,
            updated_at = now()
      WHERE type = $1
      RETURNING type, label, category, icon_emoji, verification_mode, schema_version, output_schema, ai_prompt_instruction, prompt_verified_at, prompt_verified_by, prompt_verified_hash, is_system, is_active, sort_order, created_at, updated_at`,
    [
      req.params.type,
      params.label || null,
      params.category || null,
      params.iconEmoji || null,
      params.verificationMode || null,
      params.schemaVersion || null,
      params.outputSchema ? toJsonbParam(params.outputSchema) : null,
      params.aiPromptInstruction || null,
      params.isActive ?? null,
      params.sortOrder ?? null,
    ],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Không tìm thấy loại ảnh.' });
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_label, action, payload)
     VALUES ('ADMIN', 'QC Admin', 'PHOTO_TYPE_UPDATED', $1)`,
    [toJsonbParam({ type: req.params.type })],
  );
  res.json(serializePhotoTypeRow(result.rows[0]));
});

app.post('/api/admin/photo-types/:type/verify', requireAdmin, async (req, res) => {
  const existing = await db.query(
    `SELECT type, ai_prompt_instruction, verification_mode, schema_version, output_schema
       FROM photo_type_options
      WHERE type = $1`,
    [req.params.type],
  );
  if (!existing.rowCount) return res.status(404).json({ error: 'Không tìm thấy loại ảnh.' });
  const row = existing.rows[0];
  const hash = promptHash(JSON.stringify({
    aiPromptInstruction: row.ai_prompt_instruction,
    verificationMode: row.verification_mode,
    schemaVersion: row.schema_version,
    outputSchema: row.output_schema,
  }));
  const result = await db.query(
    `UPDATE photo_type_options
        SET prompt_verified_at = now(),
            prompt_verified_by = 'QC Admin',
            prompt_verified_hash = $2,
            updated_at = now()
      WHERE type = $1
      RETURNING type, label, category, icon_emoji, verification_mode, schema_version, output_schema, ai_prompt_instruction, prompt_verified_at, prompt_verified_by, prompt_verified_hash, is_system, is_active, sort_order, created_at, updated_at`,
    [req.params.type, hash],
  );
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_label, action, payload)
     VALUES ('ADMIN', 'QC Admin', 'PHOTO_TYPE_PROMPT_VERIFIED', $1)`,
    [toJsonbParam({ type: req.params.type, promptHash: hash })],
  );
  res.json(serializePhotoTypeRow(result.rows[0]));
});

app.delete('/api/admin/photo-types/:type', requireAdmin, async (req, res) => {
  const type = req.params.type;
  const existing = await db.query(`SELECT type, is_system FROM photo_type_options WHERE type = $1`, [type]);
  if (!existing.rowCount) return res.status(404).json({ error: 'Không tìm thấy loại ảnh.' });
  if (existing.rows[0].is_system) {
    return res.status(409).json({ error: 'Loại ảnh hệ thống không thể xóa. Hãy tắt trạng thái Đang dùng để ẩn khỏi mẫu mới.' });
  }

  const usage = await db.query(
    `SELECT
       (SELECT count(*)::int
          FROM templates
         WHERE jsonb_path_exists(definition, '$.steps[*].photoSlotConfigs[*] ? (@.photoType == $photoType)', jsonb_build_object('photoType', $1::text))) AS template_count,
       (SELECT count(*)::int
          FROM inspection_jobs
         WHERE jsonb_path_exists(template_snapshot, '$.steps[*].photoSlotConfigs[*] ? (@.photoType == $photoType)', jsonb_build_object('photoType', $1::text))
            OR jsonb_path_exists(step_results, '$[*].photoSlotsData[*] ? (@.photoType == $photoType)', jsonb_build_object('photoType', $1::text))) AS job_count`,
    [type],
  );
  const templateCount = Number(usage.rows[0]?.template_count || 0);
  const jobCount = Number(usage.rows[0]?.job_count || 0);
  if (templateCount > 0 || jobCount > 0) {
    return res.status(409).json({
      error: `Loại ảnh đang được dùng trong ${templateCount} mẫu hoặc ${jobCount} lệnh QC. Hãy tắt trạng thái Đang dùng để ẩn khỏi mẫu mới.`,
    });
  }

  await db.query(`DELETE FROM photo_type_options WHERE type = $1`, [type]);
  await db.query(
    `INSERT INTO audit_events (actor_type, actor_label, action, payload)
     VALUES ('ADMIN', 'QC Admin', 'PHOTO_TYPE_DELETED', $1)`,
    [toJsonbParam({ type })],
  );
  res.status(204).end();
});

app.post('/api/admin/jobs', requireAdmin, async (req, res) => {
  const { externalId, batchNumber, productCode, productName, templateId, templateSnapshot, workerId, workerName, shift, line, defectsFindingData, packagingInfoData, otherInfoData } = req.body;
  if (![externalId, batchNumber, productCode, productName, templateSnapshot].every(Boolean)) {
    return res.status(400).json({ error: 'externalId, batchNumber, productCode, productName, and templateSnapshot are required.' });
  }
  const stepResults = buildInitialStepResults(templateSnapshot);
  const initialDefects = defectsFindingData || templateSnapshot?.defectsFindingData || [];
  const initialPackaging = packagingInfoData || templateSnapshot?.packagingInfoData || {};
  const initialOther = otherInfoData || templateSnapshot?.otherInfoData || {};

  const job = await db.query(
    `INSERT INTO inspection_jobs (external_id, batch_number, product_code, product_name, template_id, template_snapshot, step_results, worker_id, worker_name, shift, line, defects_finding_data, packaging_info_data, other_info_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
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
      toJsonbParam(initialDefects),
      toJsonbParam(initialPackaging),
      toJsonbParam(initialOther),
    ],
  );
  await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action) VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_CREATED')`, [job.rows[0].id]);
  res.status(201).json({
    ...job.rows[0],
    defectsFindingData: job.rows[0].defects_finding_data,
    packagingInfoData: job.rows[0].packaging_info_data,
    otherInfoData: job.rows[0].other_info_data,
  });
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
            j.defects_finding_data, j.packaging_info_data, j.other_info_data,
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
                    'photoUrl', '/uploads/' || ep.storage_path,
                    'manualOverride', ep.manual_override,
                    'aiQualityStatus', ep.ai_quality_status
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
    defectsFindingData: row.defects_finding_data || row.template_snapshot?.defectsFindingData || [],
    packagingInfoData: row.packaging_info_data || row.template_snapshot?.packagingInfoData || {},
    otherInfoData: row.other_info_data || row.template_snapshot?.otherInfoData || {},
    evidence_photos: undefined,
  })));
});

app.get('/api/admin/jobs/:jobId', requireAdmin, async (req, res) => {
  const jobs = await db.query(
    `SELECT j.external_id, j.batch_number, j.product_code, j.product_name, j.template_id, j.status,
            j.worker_id, j.worker_name, j.shift, j.line, j.created_at, j.updated_at, j.completed_at,
            j.step_results, j.template_snapshot, j.admin_notes, j.export_count, j.last_exported_at,
            j.defects_finding_data, j.packaging_info_data, j.other_info_data,
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
                    'photoUrl', '/uploads/' || ep.storage_path,
                    'manualOverride', ep.manual_override,
                    'aiQualityStatus', ep.ai_quality_status
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
    defectsFindingData: row.defects_finding_data || row.template_snapshot?.defectsFindingData || [],
    packagingInfoData: row.packaging_info_data || row.template_snapshot?.packagingInfoData || {},
    otherInfoData: row.other_info_data || row.template_snapshot?.otherInfoData || {},
    evidence_photos: undefined,
  });
});

app.get('/api/admin/jobs/:jobId/customer-report.docx', requireAdmin, async (req, res) => {
  const result = await db.query(
    `SELECT j.id, j.external_id, j.batch_number, j.worker_name, j.created_at, j.template_snapshot,
            j.defects_finding_data, j.packaging_info_data, j.other_info_data, j.step_results,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'step_id', ep.step_id,
                  'slot_index', ep.slot_index,
                  'storage_path', ep.storage_path,
                  'created_at', ep.created_at
                ) ORDER BY ep.step_id, ep.slot_index, ep.created_at
            ) FILTER (WHERE ep.id IS NOT NULL AND ep.ai_quality_status IS DISTINCT FROM 'REJECTED'),
              '[]'::jsonb
            ) AS evidence_photos
       FROM inspection_jobs j
       LEFT JOIN evidence_photos ep ON ep.job_id = j.id
      WHERE j.external_id = $1
      GROUP BY j.id`,
    [req.params.jobId],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });

  const dbJob = result.rows[0];
  if (!isCustomerDocxTemplate(dbJob.template_snapshot?.docxTemplateName)) {
    return res.status(409).json({ error: 'Lệnh QC này không sử dụng mẫu DOCX khách hàng được hỗ trợ.' });
  }

  const job = {
    external_id: dbJob.external_id,
    batch_number: dbJob.batch_number,
    worker_name: dbJob.worker_name,
    created_at: dbJob.created_at,
    template_snapshot: dbJob.template_snapshot,
    defectsFindingData: Array.isArray(dbJob.defects_finding_data) ? dbJob.defects_finding_data : [],
    packagingInfoData: dbJob.packaging_info_data || {},
    otherInfoData: dbJob.other_info_data || {},
    stepResults: dbJob.step_results || [],
  };

  try {
    const report = await buildX530CustomerReport({
      templateDirectory: docxTemplatesDirectory,
      uploadsDirectory,
      job,
      photos: dbJob.evidence_photos,
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

// Admin replaces a worker-submitted evidence photo for a specific step/slot.
// The old evidence photo rows (and their files) are removed and a fresh photo is
// stored as an admin manual override so the async quality pump never flips it.
app.post('/api/admin/jobs/:jobId/step-results/:stepId/slot/:slotIndex/photo', requireAdmin, upload.single('photo'), async (req, res) => {
  const jobId = String(req.params.jobId);
  const stepId = String(req.params.stepId);
  const slotIndex = Number(req.params.slotIndex);
  if (!req.file) return res.status(400).json({ error: 'A JPEG, PNG, or WEBP photo is required.' });
  if (!stepId || !Number.isInteger(slotIndex) || slotIndex < 1) {
    await fs.unlink(req.file.path).catch(() => undefined);
    return res.status(400).json({ error: 'stepId and an integer slotIndex are required.' });
  }
  const source = String(req.body?.source || 'UPLOAD');
  if (source !== 'CAMERA' && source !== 'UPLOAD') {
    await fs.unlink(req.file.path).catch(() => undefined);
    return res.status(400).json({ error: 'source must be CAMERA or UPLOAD.' });
  }

  const job = await db.query(
    `SELECT j.id, j.template_snapshot
       FROM inspection_jobs j
      WHERE j.external_id = $1`,
    [jobId],
  );
  if (!job.rowCount) {
    await fs.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ error: 'Job not found.' });
  }
  const stepDef = Array.isArray(job.rows[0].template_snapshot?.steps)
    ? job.rows[0].template_snapshot.steps.find((item: any) => item?.stepId === stepId)
    : undefined;
  if (!stepDef) {
    await fs.unlink(req.file.path).catch(() => undefined);
    return res.status(404).json({ error: 'Step not found in this job template.' });
  }
  const slotDef = Array.isArray(stepDef.photoSlotConfigs)
    ? stepDef.photoSlotConfigs.find((item: any) => Number(item?.slotIndex) === slotIndex)
    : undefined;
  const captureFrame = slotDef?.captureFrame || 'RECTANGLE';
  if (captureFrame !== 'RECTANGLE' && captureFrame !== 'SQUARE') {
    await fs.unlink(req.file.path).catch(() => undefined);
    return res.status(400).json({ error: 'captureFrame must be RECTANGLE or SQUARE.' });
  }
  const requestedAspectRatio = req.body?.aspectRatio !== undefined && req.body?.aspectRatio !== null && req.body?.aspectRatio !== ''
    ? Number(req.body.aspectRatio)
    : (slotDef?.aspectRatio ?? NaN);
  const targetAspect = Number.isFinite(requestedAspectRatio) && requestedAspectRatio > 0 && requestedAspectRatio < 5
    ? requestedAspectRatio
    : (captureFrame === 'SQUARE' ? 1 : 4 / 3);

  try {
    const inspection = await inspectPhotoFile(req.file.path);
    const minSharpness = Number(process.env.QC_MIN_SHARPNESS_SCORE || DEFAULT_MIN_SHARPNESS_SCORE);
    if (!isAspectRatio(inspection.width, inspection.height, targetAspect)) {
      await fs.unlink(req.file.path);
      const frameLabel = captureFrame === 'SQUARE' ? '1:1' : '4:3';
      return res.status(422).json({ error: `Ảnh cần được căn chỉnh theo khung ${frameLabel} trước khi lưu.` });
    }
    if (inspection.sharpnessScore < minSharpness) {
      await fs.unlink(req.file.path);
      return res.status(422).json({ error: 'Ảnh bị mờ hoặc thiếu chi tiết. Vui lòng chọn ảnh rõ nét hơn.', sharpnessScore: inspection.sharpnessScore });
    }

    const data = await fs.readFile(req.file.path);
    const sha256 = createHash('sha256').update(data).digest('hex');

    const oldPhotos = await db.query(
      `SELECT storage_path FROM evidence_photos WHERE job_id = $1 AND step_id = $2 AND slot_index = $3`,
      [job.rows[0].id, stepId, slotIndex],
    );

    await db.query(
      `DELETE FROM evidence_photos WHERE job_id = $1 AND step_id = $2 AND slot_index = $3`,
      [job.rows[0].id, stepId, slotIndex],
    );

    const photo = await db.query(
      `INSERT INTO evidence_photos (job_id, session_id, step_id, slot_index, storage_path, original_filename, mime_type, byte_size, sha256, capture_source, crop_ratio, sharpness_score, ai_quality_status, ai_quality_message, manual_override)
       VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'UNAVAILABLE', $12, true)
       RETURNING id, step_id, slot_index, mime_type, byte_size, sha256, created_at, manual_override, ai_quality_status`,
      [job.rows[0].id, stepId, slotIndex, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, sha256, source, targetAspect, inspection.sharpnessScore, `${botName} đã kiểm tra ảnh thay thế do QC Admin thực hiện.`],
    );

    const photoUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
    await applyStepResultsUpdate(job.rows[0].id, (currentStepResults) =>
      replacePhotoInStepResults(currentStepResults, {
        stepId,
        slotIndex,
        photoUrl,
        manualOverride: true,
        aiQualityStatus: 'UNAVAILABLE',
      }),
    );

    await enqueuePhotoProcessing(photo.rows[0].id);
    await db.query(
      `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
       VALUES ($1, 'ADMIN', 'QC Admin', 'PHOTO_REPLACED', $2)`,
      [job.rows[0].id, toJsonbParam({ stepId, slotIndex, photoId: photo.rows[0].id, source })],
    );

    for (const old of oldPhotos.rows) {
      const oldPath = join(uploadsDirectory, String(old.storage_path));
      await fs.unlink(oldPath).catch(() => undefined);
    }

    const hydrated = await getAdminJobDetailByExternalId(jobId);
    res.json(hydrated);
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => undefined);
    throw error;
  }
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
    jobId: row.job_external_id || 'Hệ thống',
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
  const previous = await db.query(`SELECT id, status, admin_notes FROM inspection_jobs WHERE external_id = $1`, [req.params.jobId]);
  if (!previous.rowCount) return res.status(404).json({ error: 'Job not found.' });
  const result = await db.query(
    updateJobStatusSql,
    [req.params.jobId, status, adminNotes ?? null],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Job not found.' });
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_STATUS_UPDATED', $2)`,
    [result.rows[0].id, toJsonbParam({ fieldChanged: 'Status', oldValue: previous.rows[0].status, newValue: status, oldAdminNotes: previous.rows[0].admin_notes || '', adminNotes })],
  );
  res.json(result.rows[0]);
});

app.patch('/api/admin/jobs/:jobId/step-results/:stepId/note', requireAdmin, async (req, res) => {
  const note = String(req.body?.note ?? '');
  const job = await db.query(`SELECT id, step_results FROM inspection_jobs WHERE external_id = $1`, [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });
  let oldValue = '';
  const { found, row } = await applyStepResultsUpdate(job.rows[0].id, (currentStepResults) => {
    const stepResults = Array.isArray(currentStepResults) ? currentStepResults : [];
    let localFound = false;
    const updatedSteps = stepResults.map((step) => {
      if (step?.stepId !== req.params.stepId) return step;
      localFound = true;
      oldValue = step.note || '';
      return { ...step, originalNote: step.originalNote || step.note || '', note, editedByAdmin: true };
    });
    return { found: localFound, updatedSteps };
  });
  if (!found) return res.status(404).json({ error: 'Step result not found.' });
  await db.query(
    `INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload)
     VALUES ($1, 'ADMIN', 'QC Admin', 'JOB_STEP_NOTE_UPDATED', $2)`,
    [job.rows[0].id, toJsonbParam({ fieldChanged: `Step ${req.params.stepId} Note`, oldValue, newValue: note })],
  );
  res.json(row);
});

app.patch('/api/admin/jobs/:jobId/step-results/:stepId/moderation', requireAdmin, async (req, res) => {
  const moderationStatus = String(req.body?.moderationStatus || '');
  if (!['PENDING_REVIEW', 'APPROVED', 'REJECTED'].includes(moderationStatus)) {
    return res.status(400).json({ error: 'A valid moderationStatus is required.' });
  }
  const adminReviewNote = String(req.body?.adminReviewNote ?? '');
  const job = await db.query(`SELECT id, step_results, template_snapshot FROM inspection_jobs WHERE external_id = $1`, [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });

  if (moderationStatus === 'APPROVED') {
    const templateStep = Array.isArray(job.rows[0].template_snapshot?.steps)
      ? job.rows[0].template_snapshot.steps.find((step: any) => step?.stepId === req.params.stepId)
      : undefined;
    const requiredPhotoCount = Number(templateStep?.requiredPhotoCount ?? templateStep?.photoSlots?.length ?? 0);
    const resultStep = Array.isArray(job.rows[0].step_results)
      ? job.rows[0].step_results.find((step: any) => step?.stepId === req.params.stepId)
      : undefined;
    const actualPhotoCount = Array.isArray(resultStep?.photoSlotsData)
      ? resultStep.photoSlotsData.filter((slot: any) => Boolean(slot?.photoUrl)).length
      : resultStep?.photoUrl ? 1 : 0;
    if (actualPhotoCount < requiredPhotoCount) {
      return res.status(409).json({ error: `Cần đủ ${requiredPhotoCount} ảnh bằng chứng trước khi duyệt bước này.` });
    }
  }

  let previousStatus = '';
  const { found, row } = await applyStepResultsUpdate(job.rows[0].id, (currentStepResults) => {
    const result = moderateStepResults(
      currentStepResults,
      req.params.stepId,
      moderationStatus as 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED',
      adminReviewNote,
    );
    previousStatus = result.previousStatus;
    return { found: result.found, updatedSteps: result.updatedSteps };
  });
  if (!found) return res.status(404).json({ error: 'Step result not found.' });

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
  res.json(row);
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
  const job = await db.query('SELECT id FROM inspection_jobs WHERE external_id = $1', [req.params.jobId]);
  if (!job.rowCount) return res.status(404).json({ error: 'Job not found.' });
  const existingSession = await db.query(
    `SELECT id, expires_at
       FROM worker_sessions
      WHERE job_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [job.rows[0].id],
  );
  if (!existingSession.rowCount) return res.status(404).json({ error: 'Session link has not been created for this job.' });
  const expiresAt = calculateExtendedSessionExpiry(existingSession.rows[0].expires_at, extensionHours);
  const session = await db.query(
    `UPDATE worker_sessions
        SET expires_at = $2
      WHERE id = $1
      RETURNING token_value, created_at, expires_at`,
    [existingSession.rows[0].id, expiresAt],
  );
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
  const { stepId, slotIndex, source, manualOverride, captureFrame, aspectRatio } = req.body;
  if (!stepId || !Number.isInteger(Number(slotIndex))) {
    await fs.unlink(req.file.path);
    return res.status(400).json({ error: 'stepId and integer slotIndex are required.' });
  }
  if (source !== 'CAMERA' && source !== 'UPLOAD') {
    await fs.unlink(req.file.path);
    return res.status(400).json({ error: 'source must be CAMERA or UPLOAD.' });
  }
  const normalizedCaptureFrame = captureFrame || 'RECTANGLE';
  if (normalizedCaptureFrame !== 'RECTANGLE' && normalizedCaptureFrame !== 'SQUARE') {
    await fs.unlink(req.file.path);
    return res.status(400).json({ error: 'captureFrame must be RECTANGLE or SQUARE.' });
  }
  const parsedAspectRatio = aspectRatio !== undefined && aspectRatio !== null && aspectRatio !== ''
    ? Number(aspectRatio)
    : NaN;
  const requestedAspectRatio = Number.isFinite(parsedAspectRatio) && parsedAspectRatio > 0 && parsedAspectRatio < 5
    ? parsedAspectRatio
    : null;

  workerSessionRealtime.publish(req.params.jobId, {
    type: 'PHOTO_RECEIVED',
    stepId,
    slotIndex: Number(slotIndex),
    message: `Ảnh đã đến server. ${botName} đang kiểm tra chất lượng...`,
  });

  try {
    const photoContext = await resolvePhotoPromptContext(session.template_snapshot, stepId, Number(slotIndex));
    const qualityProfile = await getVeroPromptProfile('PHOTO_QUALITY_GATE');
    const qualityPrompt = buildQualityPrompt(qualityProfile, photoContext);
    const qualityPromptHash = promptHash(qualityPrompt);
    const inspection = await inspectPhotoFile(req.file.path);
    const minSharpness = Number(process.env.QC_MIN_SHARPNESS_SCORE || DEFAULT_MIN_SHARPNESS_SCORE);
    const targetAspect = requestedAspectRatio ?? (normalizedCaptureFrame === 'SQUARE' ? 1 : 4 / 3);
    const hasExpectedAspect = isAspectRatio(inspection.width, inspection.height, targetAspect);
    if (!hasExpectedAspect) {
      await fs.unlink(req.file.path);
      const frameLabel = requestedAspectRatio
        ? `tỉ lệ ${Math.round(requestedAspectRatio * 100)}%`
        : normalizedCaptureFrame === 'SQUARE' ? '1:1' : '4:3';
      return res.status(422).json({ error: `Ảnh cần được căn chỉnh theo khung ${frameLabel} trước khi tải lên.` });
    }
    if (inspection.sharpnessScore < minSharpness) {
      await fs.unlink(req.file.path);
      return res.status(422).json({ error: 'Ảnh bị mờ hoặc thiếu chi tiết. Vui lòng căn và chụp lại.', sharpnessScore: inspection.sharpnessScore });
    }

    const isManualOverride = manualOverride === 'true';
    const aiQualityStatus = isManualOverride ? 'UNAVAILABLE' : 'PENDING';

    const data = await fs.readFile(req.file.path);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const photo = await db.query(
      `INSERT INTO evidence_photos (job_id, session_id, step_id, slot_index, storage_path, original_filename, mime_type, byte_size, sha256, capture_source, crop_ratio, sharpness_score, ai_quality_status, ai_quality_message, manual_override, photo_type, photo_label, photo_prompt_instruction, quality_prompt_revision, quality_prompt_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id, step_id, slot_index, mime_type, byte_size, sha256, created_at, manual_override, ai_quality_status`,
      [session.job_id, session.id, stepId, Number(slotIndex), req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, sha256, source, targetAspect, inspection.sharpnessScore, aiQualityStatus, isManualOverride ? `${botName} chưa thể kiểm tra ảnh. Công nhân xác nhận tải thủ công.` : null, isManualOverride, photoContext.photoType, photoContext.photoLabel, photoContext.photoInstruction, qualityProfile.revision, qualityPromptHash],
    );
    await db.query(
      `UPDATE evidence_photos
          SET photo_verification_mode = $2,
              photo_schema_version = $3,
              photo_output_schema = $4
        WHERE id = $1`,
      [photo.rows[0].id, photoContext.verificationMode, photoContext.schemaVersion, toJsonbParam(photoContext.outputSchema)],
    );
    const photoUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
    await applyStepResultsUpdate(session.job_id, (currentStepResults) =>
      attachUploadedPhotoToStepResults(currentStepResults, {
        stepId,
        slotIndex: Number(slotIndex),
        photoUrl,
        manualOverride: photo.rows[0].manual_override,
        aiQualityStatus: photo.rows[0].ai_quality_status,
      }),
    );
    await enqueuePhotoProcessing(photo.rows[0].id);
    if (!isManualOverride) {
      await enqueuePhotoQualityCheck({
        photoId: photo.rows[0].id,
        jobId: session.job_id,
        stepId,
        slotIndex: Number(slotIndex),
        mimeType: req.file.mimetype,
        storagePath: req.file.filename,
        prompt: qualityPrompt,
        promptHash: qualityPromptHash,
        profileRevision: qualityProfile.revision,
      });
    }
    const action = photo.rows[0].manual_override ? 'PHOTO_UPLOADED_MANUAL_OVERRIDE' : 'PHOTO_UPLOADED';
    await db.query(`INSERT INTO audit_events (job_id, actor_type, actor_label, action, payload) VALUES ($1, 'WORKER', $2, $3, $4)`, [session.job_id, session.worker_name || 'Worker', action, toJsonbParam({ photoId: photo.rows[0].id, stepId, slotIndex: Number(slotIndex), source, sharpnessScore: inspection.sharpnessScore, aiQualityStatus, isManualOverride })]);
    workerSessionRealtime.publish(req.params.jobId, {
      type: 'PHOTO_SAVED',
      photoId: photo.rows[0].id,
      stepId,
      slotIndex: Number(slotIndex),
      photoUrl,
      manualOverride: photo.rows[0].manual_override,
      aiQualityStatus: photo.rows[0].ai_quality_status,
      message: aiQualityStatus === 'PENDING' ? 'Ảnh đã lưu. Đang kiểm tra chất lượng...' : 'Ảnh đã được lưu trên server.',
    });
    res.status(201).json({
      ...photo.rows[0],
      photoUrl,
      manualOverride: photo.rows[0].manual_override,
      qualityStatus: photo.rows[0].ai_quality_status,
    });
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => undefined);
    throw error;
  }
});

app.post('/api/worker-sessions/:jobId/section-photos', workerSessionGuard, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'A JPEG, PNG, or WEBP photo is required.' });
  res.status(201).json({ photoUrl: `/uploads/${encodeURIComponent(req.file.filename)}` });
});

app.post('/api/worker-sessions/:jobId/photos/:photoId/analyze', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const photo = await db.query(`SELECT id, sha256, step_id, slot_index, photo_type, photo_label, photo_prompt_instruction, photo_verification_mode, photo_schema_version, photo_output_schema FROM evidence_photos WHERE id = $1 AND job_id = $2`, [req.params.photoId, session.job_id]);
  if (!photo.rowCount) return res.status(404).json({ error: 'Photo not found.' });
  const verificationMode = normalizeVerificationMode(photo.rows[0].photo_verification_mode);
  const schemaVersion = normalizeSchemaVersion(photo.rows[0].photo_schema_version);
  const outputSchema = normalizeOutputSchema(photo.rows[0].photo_output_schema || defaultOutputSchemaForMode(verificationMode));
  const detectType = mapVerificationModeToDetectType(verificationMode);
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const analysisProfile = await getVeroPromptProfile('PHOTO_ANALYSIS');
  const analysisPrompt = buildAnalysisPrompt(analysisProfile, {
    type: photo.rows[0].photo_type || 'GENERAL_OTHER',
    label: photo.rows[0].photo_label || 'Ảnh kiểm định',
    verificationMode,
    schemaVersion,
    outputSchema,
    aiPromptInstruction: photo.rows[0].photo_prompt_instruction || '',
  }, {
    photoType: photo.rows[0].photo_type,
    photoLabel: photo.rows[0].photo_label,
    photoInstruction: photo.rows[0].photo_prompt_instruction,
  });
  const analysisPromptHash = promptHash(analysisPrompt);
  const existing = await db.query(`SELECT * FROM gemini_analyses WHERE source_sha256 = $1 AND detect_type = $2 AND model = $3 AND prompt_hash = $4`, [photo.rows[0].sha256, detectType, geminiModel, analysisPromptHash]);
  if (existing.rowCount) return res.status(200).json(serializeAnalysisRow(existing.rows[0]));
  try {
    const analysis = await db.query(
      `INSERT INTO gemini_analyses (photo_id, source_sha256, detect_type, model, prompt_version, prompt_profile_key, prompt_revision, prompt_instruction, prompt_hash, photo_type, photo_label, photo_prompt_instruction, verification_mode, schema_version, output_schema, validation_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PENDING') RETURNING *`,
      [photo.rows[0].id, photo.rows[0].sha256, detectType, geminiModel, `v${analysisProfile.revision}`, 'PHOTO_ANALYSIS', analysisProfile.revision, analysisPrompt, analysisPromptHash, photo.rows[0].photo_type, photo.rows[0].photo_label, photo.rows[0].photo_prompt_instruction, verificationMode, schemaVersion, toJsonbParam(outputSchema)],
    );
    await enqueueGeminiAnalysis(analysis.rows[0].id, photo.rows[0].id);
    workerSessionRealtime.publish(req.params.jobId, {
      type: 'ANALYSIS_QUEUED',
      photoId: photo.rows[0].id,
      stepId: photo.rows[0].step_id,
      slotIndex: Number(photo.rows[0].slot_index),
      message: `${botName} đã nhận tác vụ phân tích ảnh.`,
    });
    res.status(202).json(serializeAnalysisRow(analysis.rows[0]));
  } catch (error: any) {
    if (error?.code !== '23505') throw error;
    const concurrent = await db.query(`SELECT * FROM gemini_analyses WHERE source_sha256 = $1 AND detect_type = $2 AND model = $3 AND prompt_hash = $4`, [photo.rows[0].sha256, detectType, geminiModel, analysisPromptHash]);
    res.status(200).json(serializeAnalysisRow(concurrent.rows[0]));
  }
});

app.get('/api/worker-sessions/:jobId/analyses/:analysisId', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const analysis = await db.query(`SELECT a.* FROM gemini_analyses a JOIN evidence_photos p ON p.id = a.photo_id WHERE a.id = $1 AND p.job_id = $2`, [req.params.analysisId, session.job_id]);
  if (!analysis.rowCount) return res.status(404).json({ error: 'Analysis not found.' });
  res.json(serializeAnalysisRow(analysis.rows[0]));
});

app.post('/api/worker-sessions/:jobId/draft', workerSessionGuard, async (req, res) => {
  const session = res.locals.workerSession;
  const { stepResults, workerInfo, defectsFindingData, packagingInfoData, otherInfoData } = req.body;
  if (!Array.isArray(stepResults)) return res.status(400).json({ error: 'stepResults must be an array.' });
  await db.query(
    `UPDATE inspection_jobs
        SET step_results = $1,
            worker_name = COALESCE($2, worker_name), worker_id = COALESCE($3, worker_id),
            shift = COALESCE($4, shift), line = COALESCE($5, line),
            defects_finding_data = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE defects_finding_data END,
            packaging_info_data = CASE WHEN $7::jsonb IS NOT NULL THEN $7::jsonb ELSE packaging_info_data END,
            other_info_data = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE other_info_data END,
            updated_at = now(), version = version + 1
      WHERE id = $9 RETURNING *`,
    [
      toJsonbParam(stepResults),
      workerInfo?.workerName || null,
      workerInfo?.workerId || null,
      workerInfo?.shift || null,
      workerInfo?.line || null,
      defectsFindingData ? toJsonbParam(defectsFindingData) : null,
      packagingInfoData ? toJsonbParam(packagingInfoData) : null,
      otherInfoData ? toJsonbParam(otherInfoData) : null,
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
  const { stepResults, workerInfo, defectsFindingData, packagingInfoData, otherInfoData } = req.body;
  if (!Array.isArray(stepResults)) return res.status(400).json({ error: 'stepResults must be an array.' });
  const failed = stepResults.some((step) => step?.status === 'FAIL');
  const status = failed ? 'FAILED' : 'COMPLETED';
  await db.query(
    `UPDATE inspection_jobs
        SET step_results = $1, status = $2::qc_job_status, completed_at = now(),
            worker_name = COALESCE($3, worker_name), worker_id = COALESCE($4, worker_id),
            shift = COALESCE($5, shift), line = COALESCE($6, line),
            defects_finding_data = CASE WHEN $7::jsonb IS NOT NULL THEN $7::jsonb ELSE defects_finding_data END,
            packaging_info_data = CASE WHEN $8::jsonb IS NOT NULL THEN $8::jsonb ELSE packaging_info_data END,
            other_info_data = CASE WHEN $9::jsonb IS NOT NULL THEN $9::jsonb ELSE other_info_data END,
            updated_at = now(), version = version + 1
      WHERE id = $10 RETURNING *`,
    [
      toJsonbParam(stepResults),
      status,
      workerInfo?.workerName || null,
      workerInfo?.workerId || null,
      workerInfo?.shift || null,
      workerInfo?.line || null,
      defectsFindingData ? toJsonbParam(defectsFindingData) : null,
      packagingInfoData ? toJsonbParam(packagingInfoData) : null,
      otherInfoData ? toJsonbParam(otherInfoData) : null,
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

const httpServer = createServer(app);
const workerSessionWebSocket = new WebSocketServer({ noServer: true });

startRealtimeRelay({
  createClient: () => createDbClient(),
  onEvent: (jobId, event) => workerSessionRealtime.publish(jobId, event),
}).then(() => console.log('Worker session realtime relay listening'))
  .catch((error) => console.error('Worker session realtime relay failed:', error));

const runPhotoQualityPump = () => {
  runPhotoQualityJobs({
    uploadsDirectory,
    onPublish: (jobId, event) => workerSessionRealtime.publish(jobId, event),
  }).catch((error) => console.error('Photo quality pump failed:', error));
};
runPhotoQualityPump();
setInterval(runPhotoQualityPump, 3_000);

httpServer.on('upgrade', (request, socket, head) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const match = requestUrl.pathname.match(/^\/api\/worker-sessions\/([^/]+)\/events$/);
  if (!match) {
    socket.destroy();
    return;
  }

  void (async () => {
    const jobId = decodeURIComponent(match[1]);
    const token = requestUrl.searchParams.get('token') || '';
    const session = token && await getSession(jobId, token);
    if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    workerSessionWebSocket.handleUpgrade(request, socket, head, (webSocket) => {
      workerSessionRealtime.add(jobId, webSocket);
      webSocket.send(JSON.stringify({ type: 'READY' }));
    });
  })().catch((error) => {
    console.error('Worker session WebSocket upgrade failed:', error);
    socket.destroy();
  });
});

httpServer.listen(port, () => console.log(`QC API listening on ${port}`));
