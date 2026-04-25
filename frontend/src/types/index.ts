// ─────────────────────────────────────────────
//  Enums (must match backend exactly)
// ─────────────────────────────────────────────

export type StudyType = 'Lateral' | 'PA' | 'CBCT';

export type AnalysisType =
  | 'Steiner' | 'McNamara' | 'Ricketts' | 'Eastman'
  | 'Huddart' | 'Jarabak' | 'McGann' | 'Tweed'
  | 'Bjork' | 'Downs' | 'Hasund' | 'SegnerHasund'
  | 'Krogman' | 'Lischer' | 'Mew' | 'Nance' | 'Full';

export type SessionStatus = 'Draft' | 'Processing' | 'Completed' | 'Failed' | 'Reviewed';
export type StudyStatus = 'Pending' | 'InProgress' | 'Completed' | 'Archived';
export type GenderType = 'Male' | 'Female' | 'Other';
export type ReportFormat = 'PDF' | 'Word';
export type MeasurementType = 'Angle' | 'Distance' | 'Ratio';
export type MeasurementUnit = 'Degrees' | 'Millimeters' | 'Percent';
export type MeasurementStatus = 'Normal' | 'Increased' | 'Decreased';
export type DeviationSeverity = 'Normal' | 'Mild' | 'Moderate' | 'Severe';

export type SkeletalClass = 'ClassI' | 'ClassII' | 'ClassIII';
export type VerticalPattern = 'LowAngle' | 'Normal' | 'HighAngle';
export type JawPosition = 'Normal' | 'Prognathic' | 'Retrognathic';
export type IncisorInclination = 'Normal' | 'Proclined' | 'Retroclined';
export type SoftTissueProfile = 'Normal' | 'Protrusive' | 'Retrusive' | 'Unknown';
export type OverjetStatus = 'Negative' | 'EdgeToEdge' | 'Normal' | 'Increased';
export type OverbiteStatus = 'OpenBite' | 'Normal' | 'Deep';
export type CrowdingSeverity = 'None' | 'Mild' | 'Moderate' | 'Severe';

export type TreatmentType =
  | 'FunctionalAppliance' | 'Headgear' | 'Extraction'
  | 'Expansion' | 'Braces' | 'IPR' | 'Surgery' | 'Observation';

export type TreatmentSource = 'RuleBased' | 'ML' | 'LLM' | 'Hybrid';

// ─────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

// ─────────────────────────────────────────────
//  Patient
// ─────────────────────────────────────────────

export interface Patient {
  id: string;
  doctorId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: string; // ISO date
  gender: GenderType;
  phone?: string;
  email?: string;
  medicalRecordNo?: string;
  notes?: string;
  age: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedPatients {
  items: Patient[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: GenderType;
  phone?: string;
  email?: string;
  medicalRecordNo?: string;
  notes?: string;
}

export type UpdatePatientRequest = Partial<CreatePatientRequest>;

// ─────────────────────────────────────────────
//  Study
// ─────────────────────────────────────────────

export interface Study {
  id: string;
  patientId: string;
  doctorId: string;
  studyDate: string;
  studyType: StudyType;
  title?: string;
  clinicalNotes?: string;
  status: StudyStatus;
  createdAt: string;
  updatedAt: string;
  xRayImages?: XRayImage[];
}

export interface CreateStudyRequest {
  patientId: string;
  studyDate: string;
  studyType: StudyType;
  title?: string;
  clinicalNotes?: string;
}

export type UpdateStudyRequest = Partial<Omit<CreateStudyRequest, 'patientId'>>;

// ─────────────────────────────────────────────
//  XRayImage
// ─────────────────────────────────────────────

export interface XRayImage {
  id: string;
  studyId: string;
  fileName: string;
  fileFormat: string;
  storageUrl: string;
  thumbnailUrl?: string;
  fileSizeBytes: number;
  widthPx?: number;
  heightPx?: number;
  pixelSpacingMm?: number;
  calibrationRatio?: number;
  calibrationPoint1?: { x: number; y: number };
  calibrationPoint2?: { x: number; y: number };
  calibrationKnownMm?: number;
  isCalibrated: boolean;
  uploadedAt: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface CalibrateImageRequest {
  point1: Point2D;
  point2: Point2D;
  knownDistanceMm: number;
}

// ─────────────────────────────────────────────
//  Landmark
// ─────────────────────────────────────────────

export interface Landmark {
  id: string;
  sessionId: string;
  landmarkCode: string;
  landmarkName: string;
  xPx: number;
  yPx: number;
  xMm?: number;
  yMm?: number;
  confidenceScore?: number;
  expectedErrorMm: number;
  isAiDetected: boolean;
  isManuallyAdjusted: boolean;
  adjustmentReason?: string;
  createdAt: string;
}

export interface LandmarkUpdateDto {
  landmarkCode: string;
  xPx: number;
  yPx: number;
  adjustmentReason?: string;
}

export interface AdjustLandmarkRequest {
  x: number;
  y: number;
  reason: string;
}

// ─────────────────────────────────────────────
//  Analysis Session
// ─────────────────────────────────────────────

export interface AnalysisSession {
  id: string;
  xRayImageId: string;
  triggeredBy: string;
  modelVersion: string;
  analysisType: AnalysisType;
  status: SessionStatus;
  errorMessage?: string;
  resultImageUrl?: string;
  overlayImagesJson?: string;
  inferenceDurationMs?: number;
  totalDurationMs?: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  landmarks?: Landmark[];
  measurements?: Measurement[];
  diagnosis?: Diagnosis;
}

export interface OverlayImage {
  label: string;
  url: string;
}

// ─────────────────────────────────────────────
//  Measurement
// ─────────────────────────────────────────────

export interface Measurement {
  id: string;
  sessionId: string;
  category?: AnalysisType;
  measurementCode: string;
  measurementName: string;
  measurementType: MeasurementType;
  value: number;
  unit: MeasurementUnit;
  normalMin: number;
  normalMax: number;
  status: MeasurementStatus;
  expectedError?: number;
  deviation?: number;
  normMean: number;
  normSD: number;
  severity: DeviationSeverity;
  landmarkRefs?: string[];
  createdAt: string;
}

// ─────────────────────────────────────────────
//  Diagnosis
// ─────────────────────────────────────────────

export interface BoltonResult {
  anteriorRatio?: number;
  overallRatio?: number;
  discrepancyMm?: number;
}

export interface Diagnosis {
  id: string;
  sessionId: string;
  skeletalClass: SkeletalClass;
  verticalPattern: VerticalPattern;
  maxillaryPosition: JawPosition;
  mandibularPosition: JawPosition;
  upperIncisorInclination: IncisorInclination;
  lowerIncisorInclination: IncisorInclination;
  overjetMm?: number;
  overjetClassification?: OverjetStatus;
  overbitesMm?: number;
  overbiteClassification?: OverbiteStatus;
  softTissueProfile: SoftTissueProfile;
  warnings: string[];
  crowdingSeverity?: CrowdingSeverity;
  confidenceScore?: number;
  skeletalBorderline: boolean;
  skeletalDifferential?: Record<string, number>;
  anbUsed: number;
  anbRotationCorrected: boolean;
  odiNote?: string;
  growthTendency?: string;
  boltonResult?: BoltonResult;
  summaryText?: string;
  createdAt: string;
  treatmentPlans?: TreatmentPlan[];
}

// ─────────────────────────────────────────────
//  Treatment Plan
// ─────────────────────────────────────────────

export interface TreatmentPlan {
  id: string;
  diagnosisId: string;
  planIndex: number;
  treatmentType: TreatmentType;
  treatmentName: string;
  description: string;
  rationale?: string;
  risks?: string;
  estimatedDurationMonths?: number;
  confidenceScore?: number;
  source: TreatmentSource;
  isPrimary: boolean;
  evidenceReference?: string;
  /** Predicted post-treatment cephalometric values from the biomechanical simulation engine */
  predictedOutcomes?: Record<string, number>;
  createdAt: string;
}

// ─────────────────────────────────────────────
//  XAI (Explainable AI)
// ─────────────────────────────────────────────

export interface XAIDecisionStep {
  step: number;
  factor: string;
  evidence: string;
  impact: 'High' | 'Medium' | 'Low';
}

export interface XAIRequest {
  skeletalClass: SkeletalClass;
  skeletalProbabilities: Record<string, number>;
  verticalPattern: VerticalPattern;
  measurements: Record<string, number>;
  treatmentName: string;
  predictedOutcomes: Record<string, number>;
  uncertaintyLandmarks?: string[];
}

export interface XAIResponse {
  decisionChain: XAIDecisionStep[];
  keyDrivers: string[];
  uncertaintyFactors: string[];
  clinicalConfidence: 'High' | 'Moderate' | 'Low';
  alternativeInterpretation: string;
}

// ─────────────────────────────────────────────
//  Report
// ─────────────────────────────────────────────

export interface Report {
  id: string;
  sessionId: string;
  generatedBy: string;
  reportFormat: ReportFormat;
  language: string;
  storageUrl: string;
  fileSizeBytes?: number;
  includesXray: boolean;
  includesLandmarkOverlay: boolean;
  includesMeasurements: boolean;
  includesTreatmentPlan: boolean;
  generatedAt: string;
  expiresAt?: string;
}

export interface GenerateReportRequest {
  format: ReportFormat;
  language?: string;
  includesXray?: boolean;
  includesLandmarkOverlay?: boolean;
  includesMeasurements?: boolean;
  includesTreatmentPlan?: boolean;
}

// ─────────────────────────────────────────────
//  Dashboard
// ─────────────────────────────────────────────

export interface DashboardStats {
  totalPatients: number;
  totalStudies: number;
  totalSessions: number;
  completedSessions: number;
  pendingStudies: number;
  recentSessions: AnalysisSession[];
}

// ─────────────────────────────────────────────
//  API Generic
// ─────────────────────────────────────────────

export interface ApiError {
  error: string;
  statusCode?: number;
}

export interface HistoryFilters {
  searchTerm?: string;
  type?: AnalysisType;
  status?: SessionStatus;
  skeletalClass?: SkeletalClass;
  startDate?: string;
  endDate?: string;
}
