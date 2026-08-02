import { PhotoType } from '../constants/photoTypes';

export type { PhotoType };
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

export interface PhotoSlotConfig {
  slotIndex: number;
  label: string;
  photoType: PhotoType;
}

export interface PhotoSlotData {
  slotIndex: number;
  label: string;
  photoType?: PhotoType;
  photoUrl?: string;
  aiDetectedText?: string;
}

export interface InspectionStep {
  stepId: string;
  title: string;
  sampleSize?: string; // e.g., "120 pcs", "117 pcs"
  requiredPhotoCount?: number; // e.g., 6, 2, 4, 3, 5, 0
  photoSlots?: string[]; // e.g., ["Slot 1: Mặt trước", "Slot 2: Mặt sau", ...]
  photoSlotConfigs?: PhotoSlotConfig[]; // Typed photo slot list
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
  createdAt?: string;
  updatedAt: string;
  // Các thông tin mở rộng từ file kiểm định thực tế (Ví dụ: X530 Report)
  clientName?: string;
  supplierName?: string;
  supplierLocation?: string;
  supplierContact?: string;
  serviceRequired?: string;
  aqlStandard?: string;
  inspectionLevel?: string;
  orderQty?: string;
  cartonQty?: string;
  cartonSpec?: string;
  deviceSpec?: string;
  systemVersion?: string;
  hardwareVersion?: string;
  buildNumber?: string;
  steps: InspectionStep[];
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  note: string;
  photoUrl?: string;
  photoSlotsData?: PhotoSlotData[];
  photos?: { url: string; slotName: string }[];
  textValue?: string;
  aiDetectedValue?: string;
  aiDetectStatus?: 'SUCCESS' | 'WARNING' | 'FAILED';
  aiMatchStatus?: string;
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

export interface SessionAccessLog {
  id: string;
  timestamp: string;
  workerName: string;
  workerId?: string;
  deviceMac: string;
  deviceInfo: string;
  action: 'URL_OPENED' | 'CHECK_IN' | 'STEP_UPDATE' | 'SUBMITTED';
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
  
  // Session URL & Expiration (24h limit)
  sessionToken?: string;
  sessionCreatedAt?: string;
  sessionExpiresAt?: string; // ISO string 24h after export
  sessionExportCount?: number;

  // Worker & Device Tracking (MAC Address & Check-in)
  workerMac?: string;
  sessionTracker?: {
    workerName: string;
    workerId?: string;
    deviceMac: string;
    deviceInfo: string;
    joinedAt: string;
  };
  sessionAccessLogs?: SessionAccessLog[];
}

export interface DashboardKPI {
  totalJobs: number;
  inProgress: number;
  completed: number;
  failed: number;
  passRate: number;
  todayCount: number;
}
