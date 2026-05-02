export type BackendPatientDto = {
  id: string;
  medicalRecordNo?: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  lastSkeletalClass?: string | null;
  totalStudiesCount?: number;
};

export type BackendPagedPatients = {
  items: BackendPatientDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type BackendStudyDto = {
  id: string;
  patientId: string;
  studyType: string;
  status: string;
  title?: string | null;
  clinicalNotes?: string | null;
  studyDate: string;
  createdAt: string;
  lastAnalysisStatus?: string | null;
  lastSkeletalClass?: string | null;
};

export type BackendXRayImageDto = {
  id: string;
  studyId: string;
  fileName: string;
  fileFormat: string;
  storageUrl: string;
  thumbnailUrl?: string | null;
  fileSizeBytes: number;
  widthPx?: number | null;
  heightPx?: number | null;
  pixelSpacingMm?: number | null;
  calibrationRatio?: number | null;
  isCalibrated: boolean;
  uploadedAt: string;
};

export type BackendSessionDto = {
  id: string;
  xRayImageId: string;
  status: string;
  modelVersion?: string | null;
  inferenceDurationMs?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  landmarkCount: number;
  measurementCount: number;
  hasDiagnosis: boolean;
  resultImageUrl?: string | null;
};

export type BackendLandmarkDto = {
  id: string;
  landmarkCode: string;
  landmarkName: string;
  xPx: number;
  yPx: number;
  confidenceScore?: number | null;
  isAiDetected: boolean;
  isManuallyAdjusted: boolean;
  adjustmentReason?: string | null;
  provenance?: string | null;
  expectedErrorMm?: number | null;
  derivedFrom?: string[] | null;
};

export type BackendMeasurementDto = {
  id: string;
  code: string;
  name: string;
  category?: string | null;
  measurementType: string;
  value: number;
  unit: string;
  normalMin: number;
  normalMax: number;
  status: string;
  deviation?: number | null;
  qualityStatus?: string | null;
  reviewReasons?: string[] | null;
  landmarkRefs?: string[] | null;
  landmarkProvenance?: Record<string, string> | null;
};

export type BackendDiagnosisDto = {
  id: string;
  skeletalClass: string;
  verticalPattern: string;
  skeletalType: string;
  correctedAnb?: number | null;
  apdiClassification?: string | null;
  odiClassification?: string | null;
  clinicalNotes?: string[] | null;
  maxillaryPosition: string;
  mandibularPosition: string;
  upperIncisorInclination: string;
  lowerIncisorInclination: string;
  softTissueProfile: string;
  overjetMm?: number | null;
  overjetClassification?: string | null;
  overbitesMm?: number | null;
  overbiteClassification?: string | null;
  confidenceScore?: number | null;
  summaryText?: string | null;
  warnings: string[];
  skeletalDifferential?: Record<string, number> | null;
};

export type BackendTreatmentDto = {
  id: string;
  sessionId: string;
  planIndex: number;
  treatmentType: string;
  treatmentName: string;
  description: string;
  rationale?: string | null;
  risks?: string | null;
  estimatedDurationMonths?: number | null;
  confidenceScore?: number | null;
  source: string;
  isPrimary: boolean;
  evidenceReference?: string | null;
  predictedOutcomes?: Record<string, number> | null;
  evidenceLevel?: string | null;
  retentionRecommendation?: string | null;
};

export type BackendOverlayImageDto = {
  key: string;
  label: string;
  storageUrl: string;
  width: number;
  height: number;
};

export type BackendFullPipelineDto = {
  session: BackendSessionDto;
  landmarks: BackendLandmarkDto[];
  measurements: BackendMeasurementDto[];
  diagnosis?: BackendDiagnosisDto | null;
  treatments: BackendTreatmentDto[];
};

export type BackendReportDto = {
  id: string;
  sessionId: string;
  reportFormat: string;
  language: string;
  storageUrl: string;
  fileSizeBytes?: number | null;
  includesXray: boolean;
  includesLandmarkOverlay: boolean;
  includesMeasurements: boolean;
  includesTreatmentPlan: boolean;
  generatedAt: string;
  expiresAt?: string | null;
  patientName?: string | null;
  medicalRecordNo?: string | null;
};

export type BackendHistoryItemDto = {
  id: string;
  patientName: string;
  patientMrn: string;
  analysisType: string;
  status: string;
  queuedAt: string;
  skeletalClass?: string | null;
  verticalPattern?: string | null;
  completedAt?: string | null;
};

export type BackendAuthUser = {
  id?: string;
  userId?: string;
  email: string;
  fullName?: string;
  name?: string;
  role?: string;
  specialty?: string | null;
  profileImageUrl?: string | null;
};

export type BackendAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: BackendAuthUser;
};

export type ServiceHealth = {
  backend: {
    ok: boolean;
    status: string;
    detail: string;
  };
  ai: {
    ok: boolean;
    status: string;
    detail: string;
    directProbe: boolean;
  };
};

export type BackendWorkspace = {
  patients: BackendPatientDto[];
  studies: BackendStudyDto[];
  imagesByStudy: Record<string, BackendXRayImageDto[]>;
  sessionsByImage: Record<string, BackendSessionDto | null>;
  reports: BackendReportDto[];
  history: BackendHistoryItemDto[];
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  formData?: FormData;
  skipRefresh?: boolean;
};

const RAW_API_BASE = (import.meta.env.VITE_BACKEND_API_BASE_URL || "/api").replace(/\/$/, "");
const API_BASE = RAW_API_BASE.endsWith("/api") ? RAW_API_BASE : `${RAW_API_BASE}/api`;
const BACKEND_ROOT = API_BASE.replace(/\/api$/, "");
const AI_ROOT = (import.meta.env.VITE_AI_SERVICE_BASE_URL || "").replace(/\/$/, "");

async function fetchJsonWithFallback(paths: string[]) {
  let lastError: unknown;

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(response.statusText);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Health probe failed");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function authHeaders() {
  const token = localStorage.getItem("accessToken") || localStorage.getItem("cephai_access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function storeAuth(auth: BackendAuthResponse) {
  localStorage.setItem("accessToken", auth.accessToken);
  localStorage.setItem("refreshToken", auth.refreshToken);
  localStorage.setItem("cephai_access_token", auth.accessToken);
  localStorage.setItem("cephai_refresh_token", auth.refreshToken);
  localStorage.setItem("cephai_user", JSON.stringify(auth.user));
}

function clearAuth() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("cephai_access_token");
  localStorage.removeItem("cephai_refresh_token");
  localStorage.removeItem("cephai_user");
}

let refreshPromise: Promise<boolean> | null = null;

function getRefreshToken() {
  return localStorage.getItem("refreshToken") || localStorage.getItem("cephai_refresh_token");
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshPromise ??= fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async response => {
      if (!response.ok) return false;
      const auth = (await response.json()) as BackendAuthResponse;
      storeAuth(auth);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  try {
    const { skipRefresh, body: jsonBody, formData, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers);
    Object.entries(authHeaders()).forEach(([key, value]) => headers.set(key, value));

    let body: BodyInit | undefined;
    if (formData) {
      body = formData;
    } else if (jsonBody !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(jsonBody);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      body,
      credentials: "include",
    });

    if (!response.ok) {
      const canRefresh =
        response.status === 401 &&
        !skipRefresh &&
        !path.startsWith("/auth/login") &&
        !path.startsWith("/auth/register") &&
        !path.startsWith("/auth/refresh");

      if (canRefresh && (await refreshAccessToken())) {
        return apiRequest<T>(path, { ...options, skipRefresh: true });
      }

      let detail = response.statusText || "Request failed";
      try {
        const payload: unknown = await response.json();
        if (isRecord(payload) && typeof payload.error === "string") {
          detail = payload.error;
        }
      } catch {
        // Keep the status text if the backend did not return JSON.
      }

      return { ok: false, error: detail, status: response.status };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Network request failed",
    };
  }
}

async function unwrap<T>(result: ApiResult<T>) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

async function firstSettled<T>(task: Promise<ApiResult<T>>, fallback: T): Promise<T> {
  const result = await task;
  return result.ok ? result.data : fallback;
}

export const cephApi = {
  getStoredUser(): BackendAuthUser | null {
    const raw = localStorage.getItem("cephai_user");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as BackendAuthUser;
    } catch {
      return null;
    }
  },

  hasAccessToken() {
    return Boolean(localStorage.getItem("accessToken") || localStorage.getItem("cephai_access_token"));
  },

  async login(input: { email: string; password: string }) {
    const result = await apiRequest<BackendAuthResponse>("/auth/login", {
      method: "POST",
      body: input,
    });
    if (result.ok) storeAuth(result.data);
    return result;
  },

  async register(input: { email: string; password: string; fullName: string; specialty?: string }) {
    const result = await apiRequest<BackendAuthResponse>("/auth/register", {
      method: "POST",
      body: input,
    });
    if (result.ok) storeAuth(result.data);
    return result;
  },

  async logout() {
    const result = await apiRequest<void>("/auth/logout", { method: "POST" });
    clearAuth();
    return result;
  },

  async loginWithGoogle(googleUser: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }): Promise<ApiResult<{ user: BackendAuthUser }>> {
    const user: BackendAuthUser = {
      id: googleUser.uid,
      userId: googleUser.uid,
      email: googleUser.email ?? "",
      fullName: googleUser.displayName ?? undefined,
      name: googleUser.displayName ?? undefined,
      profileImageUrl: googleUser.photoURL ?? undefined,
      role: "Clinician",
      specialty: null,
    };
    localStorage.setItem("cephai_user", JSON.stringify(user));
    localStorage.setItem("cephai_google_auth", "1");
    return { ok: true, data: { user } };
  },

  async me() {
    const result = await apiRequest<BackendAuthUser>("/auth/me");
    if (result.ok) {
      localStorage.setItem("cephai_user", JSON.stringify(result.data));
    }
    return result;
  },

  clearAuth,

  async getServiceHealth(): Promise<ServiceHealth> {
    const backendHealthPaths = BACKEND_ROOT ? [`${BACKEND_ROOT}/health`, "/health"] : ["/health"];
    const backend = await fetchJsonWithFallback(backendHealthPaths)
      .then(payload => {
        return {
          ok: true,
          status: String(payload.status ?? "healthy"),
          detail: String(payload.service ?? "CephAnalysis API"),
        };
      })
      .catch(error => ({
        ok: false,
        status: "unreachable",
        detail: error instanceof Error ? error.message : "Backend health probe failed",
      }));

    const ai = AI_ROOT
      ? await fetch(`${AI_ROOT}/health`)
          .then(async response => {
            if (!response.ok) throw new Error(response.statusText);
            const payload = await response.json();
            const modelLoaded = isRecord(payload.engine) ? payload.engine.model_loaded : undefined;
            return {
              ok: true,
              status: String(payload.status ?? "healthy"),
              detail: `Direct dev probe: ${String(payload.service ?? "AI service")}${modelLoaded === false ? " (model not loaded)" : ""}`,
              directProbe: true,
            };
          })
          .catch(error => ({
            ok: false,
            status: "unreachable",
            detail: error instanceof Error ? error.message : "AI health probe failed",
            directProbe: true,
          }))
      : {
          ok: false,
          status: "not configured",
          detail: "Frontend AI direct health probe disabled; production AI calls go through backend.",
          directProbe: false,
        };

    return { backend, ai };
  },

  async loadWorkspace(): Promise<ApiResult<BackendWorkspace>> {
    const patientsResult = await apiRequest<BackendPagedPatients>("/patients?page=1&pageSize=100");
    if (!patientsResult.ok) {
      return patientsResult;
    }

    const studies = await firstSettled(apiRequest<BackendStudyDto[]>("/studies"), []);
    const reports = await firstSettled(apiRequest<BackendReportDto[]>("/reports"), []);
    const history = await firstSettled(apiRequest<BackendHistoryItemDto[]>("/analysis/history"), []);

    const imagePairs = await Promise.all(
      studies.map(async study => [study.id, await firstSettled(apiRequest<BackendXRayImageDto[]>(`/images/study/${study.id}`), [])] as const)
    );
    const imagesByStudy = Object.fromEntries(imagePairs);
    const allImages = Object.values(imagesByStudy).flat();

    const sessionPairs = await Promise.all(
      allImages.map(async image => [
        image.id,
        await firstSettled(apiRequest<BackendSessionDto | null>(`/analysis/latest-session/${image.id}`), null),
      ] as const)
    );
    const sessionsByImage = Object.fromEntries(sessionPairs);

    return {
      ok: true,
      data: {
        patients: patientsResult.data.items,
        studies,
        imagesByStudy,
        sessionsByImage,
        reports,
        history,
      },
    };
  },

  createPatient(input: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    phone?: string;
    email?: string;
    medicalRecordNo?: string;
    notes?: string;
  }) {
    return apiRequest<BackendPatientDto>("/patients", {
      method: "POST",
      body: input,
    });
  },

  updatePatient(patientId: string, input: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    gender: string;
    phone?: string;
    email?: string;
    medicalRecordNo?: string;
    notes?: string;
  }) {
    return apiRequest<BackendPatientDto>(`/patients/${patientId}`, {
      method: "PUT",
      body: input,
    });
  },

  deletePatient(patientId: string) {
    return apiRequest<void>(`/patients/${patientId}`, { method: "DELETE" });
  },

  createStudy(input: {
    patientId: string;
    studyType: string;
    title?: string;
    clinicalNotes?: string;
    studyDate?: string;
  }) {
    return apiRequest<BackendStudyDto>("/studies", {
      method: "POST",
      body: input,
    });
  },

  async uploadImage(studyId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest<BackendXRayImageDto>(`/images/study/${studyId}`, {
      method: "POST",
      formData,
    });
  },

  calibrateImage(imageId: string, point1: { x: number; y: number }, point2: { x: number; y: number }, knownDistanceMm: number) {
    return apiRequest<BackendXRayImageDto>(`/images/${imageId}/calibrate`, {
      method: "POST",
      body: {
        point1,
        point2,
        knownDistanceMm,
      },
    });
  },

  fullPipeline(imageId: string, type = "Steiner", isCbctDerived = false) {
    return apiRequest<BackendFullPipelineDto>(`/analysis/full-pipeline/${imageId}?type=${encodeURIComponent(type)}&isCbctDerived=${isCbctDerived}`, {
      method: "POST",
    });
  },

  getLatestSession(imageId: string) {
    return apiRequest<BackendSessionDto | null>(`/analysis/latest-session/${imageId}`);
  },

  getLandmarks(sessionId: string) {
    return apiRequest<BackendLandmarkDto[]>(`/analysis/sessions/${sessionId}/landmarks`);
  },

  getMeasurements(sessionId: string) {
    return apiRequest<BackendMeasurementDto[]>(`/analysis/sessions/${sessionId}/measurements`);
  },

  getDiagnosis(sessionId: string) {
    return apiRequest<BackendDiagnosisDto>(`/analysis/sessions/${sessionId}/diagnosis`);
  },

  getTreatment(sessionId: string) {
    return apiRequest<BackendTreatmentDto[]>(`/analysis/sessions/${sessionId}/treatment`);
  },

  getOverlays(sessionId: string) {
    return apiRequest<BackendOverlayImageDto[]>(`/analysis/sessions/${sessionId}/overlays`);
  },

  generateOverlays(sessionId: string) {
    return apiRequest<{ sessionId: string; images: BackendOverlayImageDto[]; renderMs: number }>(
      `/analysis/sessions/${sessionId}/overlays`,
      { method: "POST" }
    );
  },

  finalize(sessionId: string, landmarks: Array<{ landmarkCode: string; x: number; y: number }>, isCbctDerived = false) {
    return apiRequest<BackendFullPipelineDto>(`/analysis/sessions/${sessionId}/finalize?isCbctDerived=${isCbctDerived}`, {
      method: "POST",
      body: landmarks,
    });
  },

  generateReport(sessionId: string, format: "PDF" | "Word") {
    return apiRequest<BackendReportDto>(`/reports/sessions/${sessionId}`, {
      method: "POST",
      body: {
        language: "en",
        includesXray: true,
        includesLandmarkOverlay: true,
        includesMeasurements: true,
        includesTreatmentPlan: true,
        // Current backend always generates PDF; this preserves UI intent for
        // when Word export is added server-side.
        requestedFormat: format,
      },
    });
  },

  unwrap,
};
