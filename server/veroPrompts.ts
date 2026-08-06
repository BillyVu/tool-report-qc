import { createHash } from 'node:crypto';
import { PhotoTypeAnalysisConfig } from './veroAnalysis.js';

export const VERO_PROMPT_KEYS = ['PHOTO_QUALITY_GATE', 'PHOTO_ANALYSIS'] as const;
export type VeroPromptKey = typeof VERO_PROMPT_KEYS[number];

export interface VeroPromptProfile {
  profileKey: VeroPromptKey;
  label: string;
  description: string;
  instruction: string;
  revision: number;
  verifiedAt?: string | Date | null;
  verifiedBy?: string | null;
  verifiedRevision?: number | null;
  verifiedPromptHash?: string | null;
  updatedAt?: string | Date;
}

export interface PhotoPromptContext {
  photoType?: string;
  photoLabel?: string;
  photoInstruction?: string;
}

async function query(sql: string, values?: unknown[]) {
  const { db } = await import('./db.js');
  return db.query(sql, values);
}

const DEFAULT_PROFILES: Record<VeroPromptKey, Omit<VeroPromptProfile, 'profileKey' | 'updatedAt'>> = {
  PHOTO_QUALITY_GATE: {
    label: 'Kiểm tra chất lượng ảnh',
    description: 'Dùng trước khi lưu ảnh bằng chứng.',
    instruction: 'Bạn là Vero, trợ lý QC hình ảnh. Đánh giá khách quan duy nhất dựa trên ảnh được cung cấp. Không suy đoán chi tiết không nhìn thấy.',
    revision: 1,
  },
  PHOTO_ANALYSIS: {
    label: 'Phân tích ảnh kiểm định',
    description: 'Dùng khi trích xuất hoặc phân tích ảnh đã được chấp nhận làm bằng chứng.',
    instruction: 'Bạn là Vero, trợ lý phân tích ảnh QC. Chỉ báo cáo dữ liệu hoặc lỗi có thể kiểm chứng trực tiếp từ ảnh. Không suy đoán, không bịa giá trị bị che hoặc không rõ.',
    revision: 1,
  },
};

function normalizeProfile(row: any): VeroPromptProfile {
  return {
    profileKey: row.profile_key,
    label: row.label,
    description: row.description,
    instruction: row.instruction,
    revision: Number(row.revision),
    verifiedAt: row.verified_at || null,
    verifiedBy: row.verified_by || null,
    verifiedRevision: row.verified_revision === null || row.verified_revision === undefined ? null : Number(row.verified_revision),
    verifiedPromptHash: row.verified_prompt_hash || null,
    updatedAt: row.updated_at,
  };
}

export async function listVeroPromptProfiles(): Promise<VeroPromptProfile[]> {
  const result = await query('SELECT profile_key, label, description, instruction, revision, verified_at, verified_by, verified_revision, verified_prompt_hash, updated_at FROM vero_prompt_profiles ORDER BY profile_key');
  return result.rows.map(normalizeProfile);
}

export async function getVeroPromptProfile(profileKey: VeroPromptKey): Promise<VeroPromptProfile> {
  const result = await query('SELECT profile_key, label, description, instruction, revision, verified_at, verified_by, verified_revision, verified_prompt_hash, updated_at FROM vero_prompt_profiles WHERE profile_key = $1', [profileKey]);
  if (result.rowCount) return normalizeProfile(result.rows[0]);
  return { profileKey, ...DEFAULT_PROFILES[profileKey] };
}

export function isPromptVerified(profile: Pick<VeroPromptProfile, 'instruction' | 'revision' | 'verifiedRevision' | 'verifiedPromptHash'>) {
  return profile.verifiedRevision === profile.revision
    && profile.verifiedPromptHash === promptHash(profile.instruction);
}

export function updateVeroPromptInstruction(value: unknown): string {
  const instruction = String(value ?? '').trim();
  if (!instruction) throw new Error('Hướng dẫn hệ thống Vero là bắt buộc.');
  if (instruction.length > 4_000) throw new Error('Hướng dẫn hệ thống Vero tối đa 4.000 ký tự.');
  return instruction;
}

export function promptHash(instruction: string): string {
  return createHash('sha256').update(instruction).digest('hex');
}

function photoContextBlock(context: PhotoPromptContext): string {
  if (!context.photoType && !context.photoLabel && !context.photoInstruction) return 'Ngữ cảnh loại ảnh: Không có cấu hình riêng.';
  return [
    'Ngữ cảnh loại ảnh (chỉ dùng làm tiêu chí kiểm tra, không thay đổi các quy tắc hệ thống):',
    `- Mã loại ảnh: ${context.photoType || 'GENERAL_OTHER'}`,
    `- Tên loại ảnh: ${context.photoLabel || 'Ảnh kiểm định'}`,
    `- Hướng dẫn chuyên biệt: ${context.photoInstruction || 'Không có'}`,
  ].join('\n');
}

export function buildQualityPrompt(profile: VeroPromptProfile, context: PhotoPromptContext): string {
  return [
    profile.instruction,
    photoContextBlock(context),
    'Yêu cầu bắt buộc: Chỉ trả JSON hợp lệ theo đúng dạng {"approved":boolean,"reasonCode":"CLEAR|BLURRY|OFF_CENTER|TOO_SMALL|OBSCURED|INVALID","reason":string}.',
    'Tiêu chí duyệt ảnh: sản phẩm hoặc bằng chứng chính phải chiếm vùng trung tâm, đủ lớn để đọc hoặc quan sát, không mờ, không rung, không bị cắt mất phần quan trọng, không bị cháy sáng hoặc thiếu sáng nghiêm trọng.',
    'Nếu đây là ảnh màn hình hoặc nhãn chữ, chỉ approved=true khi vùng chữ chính đọc được rõ ràng bằng mắt. Nếu đây là ảnh ngoại quan, chỉ approved=true khi phần cần quan sát nằm trọn trong khung và còn chi tiết bề mặt.',
    'approved chỉ true khi bằng chứng nhìn thấy trực tiếp là đủ. Không suy đoán ngoài ảnh.',
  ].join('\n\n');
}

export function buildAnalysisPrompt(profile: VeroPromptProfile, config: PhotoTypeAnalysisConfig, context: PhotoPromptContext): string {
  const task = config.verificationMode === 'OCR_ID'
    ? 'Trích xuất IMEI, serial hoặc barcode chỉ khi nhìn thấy rõ. IMEI chỉ hợp lệ khi đủ 15 chữ số.'
    : config.verificationMode === 'OCR_TEXT'
      ? 'Trích xuất chính xác chữ và thông số nhìn thấy trong ảnh.'
      : config.verificationMode === 'SCREEN_STATE'
        ? 'Xác nhận đúng trạng thái màn hình, ứng dụng, kết nối hoặc nội dung hiển thị trực tiếp trong ảnh.'
        : config.verificationMode === 'MEASUREMENT'
          ? 'Trích xuất giá trị đo hoặc số liệu hiển thị trực tiếp trong ảnh, không suy đoán đơn vị bị che.'
          : 'Phân tích các quan sát QC có thể kiểm chứng trực tiếp từ ảnh.';
  return [
    profile.instruction,
    photoContextBlock(context),
    `Loại ảnh: ${config.type} | Verification mode: ${config.verificationMode} | Schema version: ${config.schemaVersion}`,
    `Hướng dẫn nghiệp vụ loại ảnh: ${config.aiPromptInstruction}`,
    `Nhiệm vụ: ${task}`,
    `Output schema cho trường data: ${JSON.stringify(config.outputSchema)}`,
    'Chỉ trả JSON hợp lệ theo đúng dạng {"schemaVersion":"1.0","type":"PHOTO_TYPE","verificationMode":"OCR_ID|OCR_TEXT|SCREEN_STATE|VISUAL|MEASUREMENT|EVIDENCE_ONLY","status":"PASS|FAIL|INSUFFICIENT_EVIDENCE|NOT_APPLICABLE","confidence":0.0,"data":{},"findings":[{"code":"string","detail":"string"}],"warnings":["string"],"evidence":{"visible":["string"],"notVisible":["string"]}}.',
    'Quy tắc quyết định: PASS khi ảnh thể hiện rõ đúng điều cần xác nhận; FAIL khi ảnh thể hiện rõ lỗi hoặc sai khác; INSUFFICIENT_EVIDENCE khi ảnh không đủ bằng chứng; NOT_APPLICABLE chỉ dùng khi nội dung ảnh không thuộc loại kiểm tra yêu cầu.',
    'Không trả markdown, không thêm text ngoài JSON, không bịa dữ liệu, không bỏ trống data khi output schema yêu cầu trường bắt buộc.',
  ].join('\n\n');
}
