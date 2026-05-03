import { 
  type BackendFullPipelineDto, 
  type BackendHistoryItemDto, 
  type BackendLandmarkDto, 
  type BackendPatientDto, 
  type BackendReportDto, 
  type BackendStudyDto, 
  type BackendWorkspace, 
  type BackendMeasurementDto, 
  type BackendDiagnosisDto, 
  type BackendTreatmentDto, 
  type BackendOverlayImageDto,
  type BackendAuthUser
} from "./ceph-api";

export { type BackendAuthUser };

// ─── Types ────────────────────────────────────────────────────────────────────

export type Gender = "Male" | "Female" | "Other";

export type CaseStatus =
  | "Draft"
  | "Image uploaded"
  | "Calibrated"
  | "AI completed"
  | "Reviewing"
  | "Reviewed"
  | "Report ready";

export type ReportFormat = "PDF" | "Word";
export type ReportStatus = "pending" | "generated";

export type NotificationType = "success" | "error" | "info" | "warning";
export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  detail: string;
  timestamp: string;
  read: boolean;
};

export type Patient = {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  gender: Gender;
  email: string;
  phone: string;
  mrn: string;
  status: "Active" | "Review" | "Archived";
  lastVisit: string;
};

export type CaseRecord = {
  id: string;
  patientId: string;
  title: string;
  type: "Lateral" | "PA" | "CBCT";
  date: string;
  status: CaseStatus;
  imageId?: string;
  imageName?: string;
  imageUrl?: string;
  calibrated: boolean;
  calibrationDistanceMm?: number;
  calibrationPoints?: Point[];
  aiStatus: "not_started" | "processing" | "completed";
  sessionId?: string;
  reportStatus: ReportStatus;
  updatedAt: string;
};

export type Landmark = {
  code: string;
  name: string;
  x: number;
  y: number;
  confidence: number;
  adjusted?: boolean;
};

export type Measurement = {
  code: string;
  name: string;
  value: number;
  unit: "deg" | "mm" | "%";
  normal: string;
  status: "Normal" | "Increased" | "Decreased";
  severity: "Normal" | "Mild" | "Moderate" | "Severe";
  qualityStatus?: string | null;
  reviewReasons?: string[] | null;
};

export type TreatmentOption = {
  title: string;
  score: number;
  duration: string;
  complexity: "Low" | "Moderate" | "High";
  rationale: string;
  evidenceLevel?: string | null;
  retentionRecommendation?: string | null;
};

export type Report = {
  id: string;
  caseId: string;
  patientName: string;
  format: ReportFormat;
  status: ReportStatus;
  generatedAt: string;
  size: string;
  url?: string;
};

export type ApiMode = "checking" | "live" | "offline";

export type SkeletalConsensus = {
  consensus_class: string;
  consensus_type: string;
  probabilities: Record<string, number>;
  votes: { metric: string; vote: string; weight: number }[];
  metrics_used: number;
  conflict_details: string[];
  agreement_pct: number;
};

export type DentalSkeletalDifferential = {
  skeletal_evidence_pct: number;
  dental_evidence_pct: number;
  skeletal_markers: string[];
  dental_markers: string[];
  interpretation: string;
};

export type DiagnosisSummary = {
  skeletalClass: string;
  verticalPattern: string;
  softTissueProfile: string;
  confidence: number;
  summary: string;
  warnings: string[];
  clinicalNotes: string[];
  skeletalType?: string | null;
  correctedAnb?: number | null;
  apdi?: string | null;
  odi?: string | null;
  aiDisclaimer?: string | null;
  airwayRiskScore?: number | null;
  skeletalConsensus?: SkeletalConsensus | null;
  dentalSkeletalDifferential?: DentalSkeletalDifferential | null;
};

export type ClinicalArtifacts = {
  measurements: Measurement[];
  diagnosis: DiagnosisSummary;
  treatments: TreatmentOption[];
};

export type OverlayArtifact = {
  key: string;
  label: string;
  url: string;
  width: number;
  height: number;
};

export type AuditSeverity = "info" | "warning" | "critical";
export type AuditAction = "created" | "updated" | "deleted" | "reviewed" | "processed" | "exported" | "viewed";
export type AuditResourceType = "patient" | "case" | "image" | "analysis" | "report" | "landmark" | "measurement" | "diagnosis";

export type TimelineItem = {
  id: string;
  at: string;
  type: string;
  title: string;
  detail: string;
  severity?: AuditSeverity;
  action?: AuditAction;
  resourceType?: AuditResourceType;
  userId?: string;
  userName?: string;
  caseId?: string;
  patientId?: string;
  metadata?: Record<string, unknown>;
};

export type Point = {
  x: number;
  y: number;
};

export type PatientFormState = Omit<Patient, "id" | "lastVisit" | "status">;
export type CaseFormState = Pick<CaseRecord, "patientId" | "title" | "type" | "date">;

// ─── Default Values ───────────────────────────────────────────────────────────

export const DEFAULT_DIAGNOSIS: DiagnosisSummary = {
  skeletalClass: "Not available",
  verticalPattern: "Not available",
  softTissueProfile: "Not available",
  confidence: 0,
  summary: "Run a backend AI analysis session to populate diagnosis information.",
  warnings: [],
  clinicalNotes: [],
};

export const DEFAULT_ARTIFACTS: ClinicalArtifacts = {
  measurements: [],
  diagnosis: DEFAULT_DIAGNOSIS,
  treatments: [],
};

// ─── Utility Helpers ──────────────────────────────────────────────────────────

export function isGuid(value: string | undefined): value is string {
  return Boolean(value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i));
}

export function calculateAge(dateOfBirth?: string | null) {
  if (!dateOfBirth) return 12;
  const date = new Date(dateOfBirth);
  if (Number.isNaN(date.getTime())) return 12;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return Math.max(0, age);
}

export function birthDateFromAge(age: number) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - Math.max(0, age || 0));
  return date.toISOString().slice(0, 10);
}

export function toStudyType(value?: string | null): CaseRecord["type"] {
  if (value === "PA" || value === "CBCT") return value;
  return "Lateral";
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function mapPatient(dto: BackendPatientDto): Patient {
  return {
    id: dto.id,
    firstName: dto.firstName,
    lastName: dto.lastName,
    age: calculateAge(dto.dateOfBirth),
    gender: dto.gender === "Male" || dto.gender === "Other" ? dto.gender : "Female",
    email: dto.email ?? "",
    phone: dto.phone ?? "",
    mrn: dto.medicalRecordNo || "N/A",
    status: dto.totalStudiesCount ? "Active" : "Review",
    lastVisit: (dto.updatedAt ?? dto.createdAt ?? todayIso()).slice(0, 10),
  };
}

export function statusFromBackend(study: BackendStudyDto, imageName?: string, calibrated?: boolean, sessionId?: string, reportReady?: boolean): CaseStatus {
  if (reportReady) return "Report ready";
  if (sessionId) return "Reviewing";
  if (calibrated) return "Calibrated";
  if (imageName) return "Image uploaded";
  if (study.status === "Completed") return "Reviewed";
  return "Draft";
}

export function mapLandmarks(dtos: BackendLandmarkDto[]): Landmark[] {
  return dtos.map(dto => ({
    code: dto.landmarkCode,
    name: dto.landmarkName || dto.landmarkCode,
    x: Number(dto.xPx),
    y: Number(dto.yPx),
    confidence: Number(dto.confidenceScore ?? 0.75),
    adjusted: dto.isManuallyAdjusted,
  }));
}

export function mergePipelineIntoLandmarks(pipeline: BackendFullPipelineDto): Landmark[] {
  if (!pipeline.landmarks?.length) return [];
  const session = pipeline.session;
  return pipeline.landmarks.map(dto => ({
    code: dto.landmarkCode,
    name: dto.landmarkName || dto.landmarkCode,
    x: Number(dto.xPx),
    y: Number(dto.yPx),
    confidence: Number(dto.confidenceScore ?? 0.75),
    adjusted: dto.isManuallyAdjusted,
  }));
}

export function mapReport(dto: BackendReportDto, caseId?: string): Report {
  return {
    id: dto.id,
    caseId: caseId ?? dto.sessionId,
    patientName: dto.patientName ?? dto.medicalRecordNo ?? "Clinical patient",
    format: dto.reportFormat === "Word" ? "Word" : "PDF",
    status: "generated",
    generatedAt: dto.generatedAt.slice(0, 10),
    size: dto.fileSizeBytes ? `${(dto.fileSizeBytes / 1_000_000).toFixed(1)} MB` : "Ready",
    url: dto.storageUrl,
  };
}

function mapMeasurementUnit(unit: string): Measurement["unit"] {
  const u = unit.toLowerCase();
  if (u.includes("millimeter") || u === "mm") return "mm";
  if (u.includes("percent") || u === "%") return "%";
  return "deg";
}

function mapMeasurementStatus(status: string): Measurement["status"] {
  const normalized = status.toLowerCase();
  if (normalized.includes("increase")) return "Increased";
  if (normalized.includes("decrease")) return "Decreased";
  return "Normal";
}

function mapSeverity(value: number, min: number, max: number): Measurement["severity"] {
  if (value >= min && value <= max) return "Normal";
  const range = Math.max(1, Math.abs(max - min));
  const distance = value < min ? min - value : value - max;
  if (distance > range) return "Severe";
  if (distance > range * 0.5) return "Moderate";
  return "Mild";
}

export function mapMeasurements(dtos: BackendMeasurementDto[]): Measurement[] {
  return dtos.map(dto => ({
    code: dto.code,
    name: dto.name,
    value: Number(dto.value),
    unit: mapMeasurementUnit(dto.unit),
    normal: `${Number(dto.normalMin).toFixed(1)}–${Number(dto.normalMax).toFixed(1)}`,
    status: mapMeasurementStatus(dto.status),
    severity: mapSeverity(Number(dto.value), Number(dto.normalMin), Number(dto.normalMax)),
    qualityStatus: dto.qualityStatus ?? null,
    reviewReasons: dto.reviewReasons ?? null,
  }));
}

export function labelFromClinicalEnum(value?: string | null) {
  if (!value) return "Unknown";
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^ClassI$/, "Class I")
    .replace(/^ClassII$/, "Class II")
    .replace(/^ClassIII$/, "Class III");
}

export function mapDiagnosis(dto?: BackendDiagnosisDto | null): DiagnosisSummary {
  if (!dto) return DEFAULT_DIAGNOSIS;
  return {
    skeletalClass: labelFromClinicalEnum(dto.skeletalClass),
    verticalPattern: labelFromClinicalEnum(dto.verticalPattern),
    skeletalType: labelFromClinicalEnum(dto.skeletalType),
    correctedAnb: dto.correctedAnb,
    apdi: labelFromClinicalEnum(dto.apdiClassification),
    odi: labelFromClinicalEnum(dto.odiClassification),
    clinicalNotes: dto.clinicalNotes || [],
    softTissueProfile: labelFromClinicalEnum(dto.softTissueProfile),
    confidence: Number(dto.confidenceScore ?? DEFAULT_DIAGNOSIS.confidence),
    summary: dto.summaryText || DEFAULT_DIAGNOSIS.summary,
    warnings: dto.warnings?.length ? dto.warnings : DEFAULT_DIAGNOSIS.warnings,
    aiDisclaimer: dto.aiDisclaimer ?? null,
    airwayRiskScore: dto.airwayRiskScore ?? null,
    skeletalConsensus: dto.skeletalConsensus ?? null,
    dentalSkeletalDifferential: dto.dentalSkeletalDifferential ?? null,
  };
}

export function mapTreatments(dtos: BackendTreatmentDto[]): TreatmentOption[] {
  if (!dtos.length) return [];
  return dtos.map(dto => ({
    title: dto.treatmentName,
    score: (() => {
      const rawScore = Number(dto.confidenceScore ?? 0.72);
      return Math.round(Math.min(100, Math.max(0, rawScore > 1 ? rawScore : rawScore * 100)));
    })(),
    duration: dto.estimatedDurationMonths ? `${dto.estimatedDurationMonths} months` : "To be confirmed",
    complexity: Number(dto.estimatedDurationMonths ?? 18) > 24 ? "High" : Number(dto.estimatedDurationMonths ?? 18) > 12 ? "Moderate" : "Low",
    rationale: dto.rationale || dto.description,
    evidenceLevel: dto.evidenceLevel,
    retentionRecommendation: dto.retentionRecommendation,
  }));
}

export function mapPipelineArtifacts(result: BackendFullPipelineDto): ClinicalArtifacts {
  return {
    measurements: result.measurements?.length ? mapMeasurements(result.measurements) : [],
    diagnosis: mapDiagnosis(result.diagnosis),
    treatments: result.treatments?.length ? mapTreatments(result.treatments) : [],
  };
}

export function mapOverlay(dto: BackendOverlayImageDto): OverlayArtifact {
  return {
    key: dto.key,
    label: dto.label,
    url: dto.storageUrl,
    width: dto.width,
    height: dto.height,
  };
}

export function mapHistoryItem(dto: BackendHistoryItemDto): TimelineItem {
  return {
    id: dto.id,
    at: dto.completedAt ?? dto.queuedAt,
    type: "AI analysis",
    title: `${dto.analysisType} ${dto.status}`,
    detail: [
      dto.patientName,
      dto.skeletalClass ? `Skeletal: ${dto.skeletalClass}` : null,
      dto.verticalPattern ? `Vertical: ${dto.verticalPattern}` : null,
    ]
      .filter(Boolean)
      .join(" — "),
  };
}

export function mapWorkspace(workspace: BackendWorkspace) {
  const patients = workspace.patients.map(mapPatient);
  const reportsBySession = new Map(workspace.reports.map(report => [report.sessionId, report]));

  const cases = workspace.studies.map(study => {
    const images = workspace.imagesByStudy[study.id] ?? [];
    const image = images[0];
    const session = image ? workspace.sessionsByImage[image.id] : null;
    const report = session ? reportsBySession.get(session.id) : undefined;

    return {
      id: study.id,
      patientId: study.patientId,
      title: study.title || `${study.studyType} cephalometric study`,
      type: toStudyType(study.studyType),
      date: study.studyDate,
      status: statusFromBackend(study, image?.fileName, image?.isCalibrated, session?.id, Boolean(report)),
      imageId: image?.id,
      imageName: image?.fileName,
      imageUrl: image?.storageUrl,
      calibrated: Boolean(image?.isCalibrated),
      calibrationDistanceMm: image?.pixelSpacingMm ? Number(image.pixelSpacingMm) : undefined,
      aiStatus: session ? "completed" : "not_started",
      sessionId: session?.id,
      reportStatus: report ? "generated" : "pending",
      updatedAt: study.createdAt.slice(0, 10),
    } satisfies CaseRecord;
  });

  const sessionToCase = new Map(cases.filter(item => item.sessionId).map(item => [item.sessionId!, item.id]));
  const reports = workspace.reports.map(report => mapReport(report, sessionToCase.get(report.sessionId)));
  const history = workspace.history.map(mapHistoryItem);

  return { patients, cases, reports, history };
}

export function displayUserName(user: BackendAuthUser | null) {
  return user?.fullName || user?.name || user?.email || "Clinical user";
}
