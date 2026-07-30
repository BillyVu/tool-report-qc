export type JobStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type StepStatus = 'PASS' | 'FAIL' | 'PENDING';
export type StepInputType = 'PHOTO' | 'TEXT' | 'PHOTO_AND_TEXT';
export type AiDetectType = 'IMEI_SERIAL' | 'OCR_TEXT' | 'COLOR_SCREEN' | 'GENERAL';

export interface DocxMapping {
  imageTag: string;
  noteTag: string;
  statusTag?: string;
  imageWidthMm: number;
  imageHeightMm: number;
}

export interface PhotoSlotData {
  slotIndex: number;
  label: string;
  photoUrl?: string;
}

export interface InspectionStep {
  stepId: string;
  title: string;
  sampleSize?: string; // e.g., "120 pcs", "117 pcs"
  requiredPhotoCount?: number; // e.g., 6, 2, 4, 3, 5, 0
  photoSlots?: string[]; // e.g., ["Slot 1: Mặt trước", "Slot 2: Mặt sau", ...]
  inputType?: StepInputType; // 'PHOTO' | 'TEXT' | 'PHOTO_AND_TEXT'
  textInputLabel?: string;
  textInputPlaceholder?: string;
  isRequiredText?: boolean;
  enableAiDetection?: boolean; // AI detect data from photos
  aiDetectType?: AiDetectType;
  aiDetectPrompt?: string;
  referenceImageUrl: string;
  isPhotoRequired: boolean;
  passCriteria: string;
  mapping: DocxMapping;
}

export interface ChecklistTemplate {
  id: string;
  title: string;
  productCode: string;
  productName: string;
  docxTemplateName: string;
  version: string;
  updatedAt: string;
  steps: InspectionStep[];
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  note: string;
  photoUrl?: string;
  photoSlotsData?: PhotoSlotData[];
  textValue?: string;
  aiDetectedValue?: string;
  aiDetectStatus?: 'SUCCESS' | 'WARNING' | 'FAILED';
  timestamp?: string;
  editedByAdmin?: boolean;
  originalNote?: string;
}

export interface AuditLogEntry {
  id: string;
  jobId: string;
  adminName: string;
  action: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
  timestamp: string;
}

export interface InspectionJob {
  id: string;
  batchNumber: string;
  productCode: string;
  productName: string;
  templateId: string;
  status: JobStatus;
  workerId: string;
  workerName: string;
  shift: string;
  line: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  stepResults: StepResult[];
  adminNotes?: string;
  exportCount?: number;
  lastExportedAt?: string;
}

export interface DashboardKPI {
  totalJobs: number;
  inProgress: number;
  completed: number;
  failed: number;
  passRate: number;
  todayCount: number;
}
