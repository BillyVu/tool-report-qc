export type PhotoTypeCategory = 'VISUAL' | 'ANIMATION' | 'IMEI' | 'CAMERA' | 'BLUETOOTH' | 'MMI' | 'OTHER';
export type PhotoVerificationMode = 'OCR_ID' | 'OCR_TEXT' | 'SCREEN_STATE' | 'VISUAL' | 'MEASUREMENT' | 'EVIDENCE_ONLY';

export interface PhotoTypeOptionPayload {
  type?: string;
  label?: string;
  category?: PhotoTypeCategory;
  iconEmoji?: string;
  verificationMode?: PhotoVerificationMode;
  schemaVersion?: string;
  outputSchema?: Record<string, unknown>;
  aiPromptInstruction?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface PhotoTypeOptionRow {
  type: string;
  label: string;
  category: PhotoTypeCategory;
  icon_emoji: string;
  verification_mode?: PhotoVerificationMode;
  schema_version?: string;
  output_schema?: Record<string, unknown>;
  ai_prompt_instruction: string;
  prompt_verified_at?: string | Date | null;
  prompt_verified_by?: string | null;
  prompt_verified_hash?: string | null;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string | Date;
  updated_at?: string | Date;
}

export const PHOTO_TYPE_CATEGORIES: PhotoTypeCategory[] = ['VISUAL', 'ANIMATION', 'IMEI', 'CAMERA', 'BLUETOOTH', 'MMI', 'OTHER'];
export const PHOTO_VERIFICATION_MODES: PhotoVerificationMode[] = ['OCR_ID', 'OCR_TEXT', 'SCREEN_STATE', 'VISUAL', 'MEASUREMENT', 'EVIDENCE_ONLY'];

function iso(value?: string | Date): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

export function serializePhotoTypeRow(row: PhotoTypeOptionRow) {
  return {
    type: row.type,
    label: row.label,
    category: row.category,
    iconEmoji: row.icon_emoji,
    verificationMode: row.verification_mode || 'EVIDENCE_ONLY',
    schemaVersion: row.schema_version || '1.0',
    outputSchema: row.output_schema || { type: 'object', required: [], properties: {} },
    aiPromptInstruction: row.ai_prompt_instruction,
    promptVerifiedAt: iso(row.prompt_verified_at || undefined) ?? null,
    promptVerifiedBy: row.prompt_verified_by || null,
    promptVerifiedHash: row.prompt_verified_hash || null,
    isSystem: row.is_system,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function normalizePhotoTypeCode(value: unknown) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

export function createPhotoTypeParams(payload: PhotoTypeOptionPayload) {
  const type = normalizePhotoTypeCode(payload.type);
  const label = payload.label?.trim();
  const category = payload.category || 'OTHER';
  const iconEmoji = payload.iconEmoji?.trim() || '📷';
  const verificationMode = payload.verificationMode || 'EVIDENCE_ONLY';
  const schemaVersion = String(payload.schemaVersion ?? '').trim() || '1.0';
  const outputSchema = payload.outputSchema && typeof payload.outputSchema === 'object' && !Array.isArray(payload.outputSchema)
    ? payload.outputSchema
    : { type: 'object', required: [], properties: {} };
  const aiPromptInstruction = payload.aiPromptInstruction?.trim();
  const sortOrder = Number.isFinite(payload.sortOrder) ? Number(payload.sortOrder) : 999;

  if (!type) throw new Error('Mã loại ảnh là bắt buộc.');
  if (type.length > 80) throw new Error('Mã loại ảnh tối đa 80 ký tự.');
  if (!label) throw new Error('Tên loại ảnh là bắt buộc.');
  if (!PHOTO_TYPE_CATEGORIES.includes(category)) throw new Error('Nhóm loại ảnh không hợp lệ.');
  if (!PHOTO_VERIFICATION_MODES.includes(verificationMode)) throw new Error('Chế độ xác minh không hợp lệ.');
  if (schemaVersion.length > 40) throw new Error('Phiên bản schema tối đa 40 ký tự.');
  if (!aiPromptInstruction) throw new Error('Hướng dẫn Vero là bắt buộc.');
  if (aiPromptInstruction.length > 2_000) throw new Error('Hướng dẫn Vero tối đa 2.000 ký tự.');

  return {
    type,
    label,
    category,
    iconEmoji,
    verificationMode,
    schemaVersion,
    outputSchema,
    aiPromptInstruction,
    isActive: payload.isActive ?? true,
    sortOrder,
  };
}

export function updatePhotoTypeParams(payload: PhotoTypeOptionPayload) {
  if (payload.type !== undefined) throw new Error('Không thể đổi mã loại ảnh sau khi tạo.');
  const category = payload.category;
  if (category && !PHOTO_TYPE_CATEGORIES.includes(category)) throw new Error('Nhóm loại ảnh không hợp lệ.');
  const verificationMode = payload.verificationMode;
  if (verificationMode && !PHOTO_VERIFICATION_MODES.includes(verificationMode)) throw new Error('Chế độ xác minh không hợp lệ.');
  const schemaVersion = payload.schemaVersion === undefined ? undefined : String(payload.schemaVersion).trim();
  if (schemaVersion !== undefined && !schemaVersion) throw new Error('Phiên bản schema không được để trống.');
  if (schemaVersion && schemaVersion.length > 40) throw new Error('Phiên bản schema tối đa 40 ký tự.');
  const outputSchema = payload.outputSchema === undefined
    ? undefined
    : (payload.outputSchema && typeof payload.outputSchema === 'object' && !Array.isArray(payload.outputSchema)
      ? payload.outputSchema
      : (() => { throw new Error('Output schema phải là JSON object.'); })());
  const aiPromptInstruction = payload.aiPromptInstruction?.trim();
  if (aiPromptInstruction !== undefined && !aiPromptInstruction) throw new Error('Hướng dẫn Vero không được để trống.');
  if (aiPromptInstruction && aiPromptInstruction.length > 2_000) throw new Error('Hướng dẫn Vero tối đa 2.000 ký tự.');
  return {
    label: payload.label?.trim(),
    category,
    iconEmoji: payload.iconEmoji?.trim(),
    verificationMode,
    schemaVersion,
    outputSchema,
    aiPromptInstruction,
    isActive: payload.isActive,
    sortOrder: Number.isFinite(payload.sortOrder) ? Number(payload.sortOrder) : undefined,
  };
}
