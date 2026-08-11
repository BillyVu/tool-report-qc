import { PhotoType } from '../constants/photoTypes';

export type { PhotoType };
export type JobStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
export type StepStatus = 'PASS' | 'FAIL' | 'PENDING';
export type StepModerationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type StepInputType = 'PHOTO' | 'TEXT' | 'PHOTO_AND_TEXT';
export type AiDetectType = 'IMEI_SERIAL' | 'OCR_TEXT' | 'COLOR_SCREEN' | 'GENERAL';
export type CaptureFrame = 'RECTANGLE' | 'SQUARE';
export type PhotoVerificationMode = 'OCR_ID' | 'OCR_TEXT' | 'SCREEN_STATE' | 'VISUAL' | 'MEASUREMENT' | 'EVIDENCE_ONLY';

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
  captureFrame?: CaptureFrame;
  aspectRatio?: number;
}

export interface TextFieldConfig {
  fieldIndex: number;
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface PhotoSlotData {
  slotIndex: number;
  label: string;
  photoType?: PhotoType;
  captureFrame?: CaptureFrame;
  aspectRatio?: number;
  photoUrl?: string;
  aiDetectedText?: string;
  aiResultJson?: Record<string, unknown>;
  manualOverride?: boolean;
  aiQualityStatus?: 'APPROVED' | 'REJECTED' | 'UNAVAILABLE' | 'PENDING' | 'NOT_CHECKED';
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
  textFieldConfigs?: TextFieldConfig[];
  isRequiredText?: boolean;
  enableAiDetection?: boolean; // Vero extracts data from photos
  aiDetectType?: AiDetectType;
  aiDetectPrompt?: string;
  referenceImageUrl: string;
  isPhotoRequired: boolean;
  passCriteria: string;
  mapping: DocxMapping;
}

export type DefectPhoto = string | { url: string; label?: string };

export interface DefectItem {
  id: string;
  description: string;
  defectType: 'Critical' | 'Major' | 'Minor';
  count: number;
  photos?: DefectPhoto[];
}

export type MeasurementPhoto = string | { url: string; label?: string };

export interface PackagingInfoData {
  cartonSpec?: string;
  cartonMeasuredSize?: string;
  cartonResult?: string;
  cartonNw?: string;
  cartonGw?: string;
  cartonPhotos?: MeasurementPhoto[];

  deviceSpec?: string;
  deviceMeasuredSize?: string;
  deviceResult?: string;
  deviceNw?: string;
  deviceGw?: string;
  devicePhotos?: MeasurementPhoto[];

  barcodeData?: string;
  barcodeResult?: string;
  barcodePhotos?: MeasurementPhoto[];
}

export interface OtherInfoData {
  notes?: string;
  photos?: MeasurementPhoto[];
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
  defectsFindingData?: DefectItem[];
  packagingInfoData?: PackagingInfoData;
  otherInfoData?: OtherInfoData;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  note: string;
  sampleSize?: string;
  photoUrl?: string;
  photoSlotsData?: PhotoSlotData[];
  photos?: { url: string; slotName: string; slotIndex?: number }[];
  textValue?: string;
  aiDetectedValue?: string;
  aiResultJson?: Record<string, unknown>;
  aiDetectStatus?: 'SUCCESS' | 'WARNING' | 'FAILED';
  aiMatchStatus?: string;
  timestamp?: string;
  editedByAdmin?: boolean;
  originalNote?: string;
  moderationStatus?: StepModerationStatus;
  adminReviewNote?: string;
  moderatedBy?: string;
  moderatedAt?: string;
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
  templateSnapshot?: ChecklistTemplate;
  adminNotes?: string;
  exportCount?: number;
  lastExportedAt?: string;
  defectsFindingData?: DefectItem[];
  packagingInfoData?: PackagingInfoData;
  otherInfoData?: OtherInfoData;
  
  // Session URL & Expiration (24h limit)
  sessionToken?: string;
  sessionCreatedAt?: string;
  sessionExpiresAt?: string; // ISO string 24h after export
  sessionRevokedAt?: string;
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

export interface SystemImageConfig {
  allowedTypes: string[]; // e.g. ['png', 'jpg', 'jpeg', 'webp', 'heic', 'bmp']
  exportFormat: 'AUTO' | 'PNG' | 'JPG';
  maxSizeMb: number;
  compressionQuality: 'ORIGINAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  autoOptimizeForDocx: boolean;
}

export interface SystemSettings {
  factoryName: string;
  department: string;
  defaultWidth: number;
  defaultHeight: number;
  autoRefreshInterval: number;
  imageConfig: SystemImageConfig;
}
