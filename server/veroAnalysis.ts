import { toJsonbParam } from './jsonParam.js';

export const VERO_ANALYSIS_STATUSES = ['PASS', 'FAIL', 'INSUFFICIENT_EVIDENCE', 'NOT_APPLICABLE'] as const;
export type VeroAnalysisStatus = typeof VERO_ANALYSIS_STATUSES[number];

export const PHOTO_VERIFICATION_MODES = ['OCR_ID', 'OCR_TEXT', 'SCREEN_STATE', 'VISUAL', 'MEASUREMENT', 'EVIDENCE_ONLY'] as const;
export type PhotoVerificationMode = typeof PHOTO_VERIFICATION_MODES[number];

export interface PhotoTypeAnalysisConfig {
  type: string;
  label: string;
  verificationMode: PhotoVerificationMode;
  schemaVersion: string;
  outputSchema: Record<string, unknown>;
  aiPromptInstruction: string;
}

export interface VeroAnalysisResult {
  schemaVersion: string;
  type: string;
  verificationMode: PhotoVerificationMode;
  status: VeroAnalysisStatus;
  confidence: number;
  data: Record<string, unknown>;
  findings: Array<{ code: string; detail: string }>;
  warnings: string[];
  evidence: {
    visible: string[];
    notVisible: string[];
  };
}

export function normalizeVerificationMode(value: unknown): PhotoVerificationMode {
  return PHOTO_VERIFICATION_MODES.includes(value as PhotoVerificationMode)
    ? value as PhotoVerificationMode
    : 'EVIDENCE_ONLY';
}

export function normalizeSchemaVersion(value: unknown): string {
  const version = String(value ?? '').trim();
  return version || '1.0';
}

export function normalizeOutputSchema(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { type: 'object', required: [], properties: {} };
  }
  const schema = value as Record<string, unknown>;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim())
    : [];
  const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
    ? schema.properties as Record<string, unknown>
    : {};
  return { type: 'object', required, properties };
}

export function defaultOutputSchemaForMode(mode: PhotoVerificationMode): Record<string, unknown> {
  if (mode === 'OCR_ID') {
    return {
      type: 'object',
      required: ['primaryText'],
      properties: {
        primaryText: { type: 'string' },
        imei: { type: 'string' },
        serialNumber: { type: 'string' },
        barcode: { type: 'string' },
      },
    };
  }
  if (mode === 'OCR_TEXT') {
    return {
      type: 'object',
      required: ['primaryText'],
      properties: {
        primaryText: { type: 'string' },
        lines: { type: 'array' },
      },
    };
  }
  if (mode === 'SCREEN_STATE') {
    return {
      type: 'object',
      required: ['screenState'],
      properties: {
        screenState: { type: 'string' },
        visibleTexts: { type: 'array' },
      },
    };
  }
  if (mode === 'MEASUREMENT') {
    return {
      type: 'object',
      required: ['measurementValue'],
      properties: {
        measurementValue: { type: 'string' },
        unit: { type: 'string' },
      },
    };
  }
  return {
    type: 'object',
    required: [],
    properties: {
      primaryObservation: { type: 'string' },
    },
  };
}

export function mapVerificationModeToDetectType(mode: PhotoVerificationMode): 'IMEI_SERIAL' | 'OCR_TEXT' | 'COLOR_SCREEN' | 'GENERAL' {
  if (mode === 'OCR_ID') return 'IMEI_SERIAL';
  if (mode === 'OCR_TEXT') return 'OCR_TEXT';
  if (mode === 'SCREEN_STATE') return 'COLOR_SCREEN';
  return 'GENERAL';
}

function trimList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function normalizeFindings(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ code: string; detail: string }>;
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const code = typeof (item as { code?: unknown }).code === 'string' ? (item as { code: string }).code.trim() : '';
    const detail = typeof (item as { detail?: unknown }).detail === 'string' ? (item as { detail: string }).detail.trim() : '';
    if (!code || !detail) return [];
    return [{ code: code.slice(0, 80), detail: detail.slice(0, 500) }];
  }).slice(0, 20);
}

export function validateVeroAnalysisResult(
  payload: unknown,
  config: Pick<PhotoTypeAnalysisConfig, 'type' | 'verificationMode' | 'schemaVersion' | 'outputSchema'>,
): { ok: true; value: VeroAnalysisResult } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['Kết quả Vero phải là JSON object.'] };
  }

  const candidate = payload as Record<string, unknown>;
  const status = typeof candidate.status === 'string' ? candidate.status.trim() : '';
  if (!VERO_ANALYSIS_STATUSES.includes(status as VeroAnalysisStatus)) errors.push('status không hợp lệ.');

  const confidence = typeof candidate.confidence === 'number' ? candidate.confidence : Number(candidate.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push('confidence phải trong khoảng 0..1.');

  const data = candidate.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) errors.push('data phải là object.');

  const evidence = candidate.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) errors.push('evidence phải là object.');

  const schema = normalizeOutputSchema(config.outputSchema);
  const requiredFields = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
  const dataObject = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  requiredFields.forEach((field) => {
    if (!(field in dataObject)) errors.push(`data.${field} là bắt buộc.`);
  });

  if (config.verificationMode === 'OCR_ID') {
    const imei = typeof dataObject.imei === 'string' ? dataObject.imei.replace(/\D/g, '') : '';
    if (imei && imei.length !== 15) errors.push('data.imei phải có đúng 15 chữ số khi được cung cấp.');
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: typeof candidate.schemaVersion === 'string' && candidate.schemaVersion.trim() ? candidate.schemaVersion.trim() : config.schemaVersion,
      type: typeof candidate.type === 'string' && candidate.type.trim() ? candidate.type.trim() : config.type,
      verificationMode: normalizeVerificationMode(candidate.verificationMode || config.verificationMode),
      status: status as VeroAnalysisStatus,
      confidence,
      data: dataObject,
      findings: normalizeFindings(candidate.findings),
      warnings: trimList(candidate.warnings),
      evidence: {
        visible: trimList((evidence as Record<string, unknown>).visible),
        notVisible: trimList((evidence as Record<string, unknown>).notVisible),
      },
    },
  };
}

export function parseAndValidateVeroAnalysisResult(
  text: string | undefined,
  config: Pick<PhotoTypeAnalysisConfig, 'type' | 'verificationMode' | 'schemaVersion' | 'outputSchema'>,
) {
  if (!text) return { ok: false as const, errors: ['Vero không trả về nội dung.'] };
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
    return validateVeroAnalysisResult(parsed, config);
  } catch {
    return { ok: false as const, errors: ['Vero trả về JSON không hợp lệ.'] };
  }
}

export function summarizeVeroAnalysis(result: VeroAnalysisResult): string {
  const primaryPairs = Object.entries(result.data)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  if (primaryPairs.length > 0) return primaryPairs.join(' | ');
  if (result.findings.length > 0) return result.findings.map((item) => `${item.code}: ${item.detail}`).join(' | ');
  if (result.warnings.length > 0) return result.warnings.join(' | ');
  return `${result.status} (${Math.round(result.confidence * 100)}%)`;
}

export function serializeAnalysisRow(row: any) {
  const parsedResult = row.result_json && typeof row.result_json === 'object'
    ? row.result_json
    : typeof row.result_text === 'string'
      ? (() => {
          try { return JSON.parse(row.result_text); } catch { return null; }
        })()
      : null;
  const summaryText = parsedResult ? summarizeVeroAnalysis(parsedResult as VeroAnalysisResult) : undefined;
  return { ...row, result_json: parsedResult, summaryText };
}

export function toAnalysisJsonb(result: VeroAnalysisResult) {
  return toJsonbParam(result);
}
