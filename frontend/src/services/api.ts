import api from '@/lib/apiClient';
import {
  LoginRequest, RegisterRequest, AuthTokens, AuthUser,
  Patient, PaginatedPatients, CreatePatientRequest, UpdatePatientRequest,
  Study, CreateStudyRequest, UpdateStudyRequest,
  XRayImage, CalibrateImageRequest,
  AnalysisSession, AnalysisType, LandmarkUpdateDto, AdjustLandmarkRequest,
  Landmark, Measurement, Diagnosis, TreatmentPlan,
  Report, GenerateReportRequest, DashboardStats, HistoryFilters,
  OverlayImage, SessionStatus, SkeletalClass,
  XAIRequest, XAIResponse,
} from '@/types';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (body: LoginRequest) => api.post<AuthTokens>('/auth/login', body).then(r => r.data),
  register: (body: RegisterRequest) => api.post<AuthUser>('/auth/register', body).then(r => r.data),
  refresh: (refreshToken: string) => api.post<AuthTokens>('/auth/refresh', { refreshToken }).then(r => r.data),
  logout: () => api.post('/auth/logout').then(r => r.data),
  me: () => api.get<AuthUser>('/auth/me').then(r => r.data),
};

// ── Patients ──────────────────────────────────────────────────────────────────

export const patientsApi = {
  list: (page = 1, pageSize = 20, search?: string) =>
    api.get<PaginatedPatients>('/patients', { params: { page, pageSize, search } }).then(r => r.data),
  get: (id: string) => api.get<Patient>(`/patients/${id}`).then(r => r.data),
  create: (body: CreatePatientRequest) => api.post<Patient>('/patients', body).then(r => r.data),
  update: (id: string, body: UpdatePatientRequest) => api.put<Patient>(`/patients/${id}`, body).then(r => r.data),
  delete: (id: string) => api.delete(`/patients/${id}`).then(r => r.data),
};

// ── Studies ───────────────────────────────────────────────────────────────────

export const studiesApi = {
  create: (body: CreateStudyRequest) => api.post<Study>('/studies', body).then(r => r.data),
  getByPatient: (patientId: string) => api.get<Study[]>(`/studies/patient/${patientId}`).then(r => r.data),
  get: (id: string) => api.get<Study>(`/studies/${id}`).then(r => r.data),
  update: (id: string, body: UpdateStudyRequest) => api.put<Study>(`/studies/${id}`, body).then(r => r.data),
  delete: (id: string) => api.delete(`/studies/${id}`).then(r => r.data),
};

// ── Images ────────────────────────────────────────────────────────────────────

export const imagesApi = {
  upload: (studyId: string, file: File, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<XRayImage>(`/images/study/${studyId}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: e => onProgress?.(Math.round(((e.loaded ?? 0) * 100) / (e.total ?? 1))),
    }).then(r => r.data);
  },
  getByStudy: (studyId: string) => api.get<XRayImage[]>(`/images/study/${studyId}`).then(r => r.data),
  get: (imageId: string) => api.get<XRayImage>(`/images/direct/${imageId}`).then(r => r.data),
  calibrate: (imageId: string, body: CalibrateImageRequest) =>
    api.post<XRayImage>(`/images/${imageId}/calibrate`, body).then(r => r.data),
};

// ── Analysis ──────────────────────────────────────────────────────────────────

export const analysisApi = {
  detect: (imageId: string, type: AnalysisType = 'Steiner') =>
    api.post<AnalysisSession>(`/analysis/detect/${imageId}`, null, { params: { type } }).then(r => r.data),

  fullPipeline: (imageId: string, type: AnalysisType = 'Steiner') =>
    api.post<AnalysisSession>(`/analysis/full-pipeline/${imageId}`, null, { params: { type } }).then(r => r.data),

  getLatestSession: (imageId: string) =>
    api.get<AnalysisSession>(`/analysis/latest-session/${imageId}`).then(r => r.data),

  getSession: (sessionId: string) =>
    api.get<AnalysisSession>(`/analysis/sessions/${sessionId}`).then(r => r.data),

  deleteSession: (sessionId: string) =>
    api.delete(`/analysis/sessions/${sessionId}`).then(r => r.data),

  // Landmarks
  getLandmarks: (sessionId: string) =>
    api.get<Landmark[]>(`/analysis/sessions/${sessionId}/landmarks`).then(r => r.data),
  updateLandmarks: (sessionId: string, landmarks: LandmarkUpdateDto[]) =>
    api.put<Landmark[]>(`/analysis/sessions/${sessionId}/landmarks`, landmarks).then(r => r.data),
  adjustLandmark: (sessionId: string, code: string, body: AdjustLandmarkRequest) =>
    api.put<Landmark>(`/analysis/sessions/${sessionId}/landmarks/${code}`, body).then(r => r.data),

  // Measurements
  calculateMeasurements: (sessionId: string) =>
    api.post<Measurement[]>(`/analysis/sessions/${sessionId}/measurements`).then(r => r.data),
  getMeasurements: (sessionId: string) =>
    api.get<Measurement[]>(`/analysis/sessions/${sessionId}/measurements`).then(r => r.data),

  // Diagnosis
  classifyDiagnosis: (sessionId: string) =>
    api.post<Diagnosis>(`/analysis/sessions/${sessionId}/diagnosis`).then(r => r.data),
  getDiagnosis: (sessionId: string) =>
    api.get<Diagnosis>(`/analysis/sessions/${sessionId}/diagnosis`).then(r => r.data),

  // Treatment
  suggestTreatment: (sessionId: string) =>
    api.post<TreatmentPlan[]>(`/analysis/sessions/${sessionId}/treatment`).then(r => r.data),
  getTreatment: (sessionId: string) =>
    api.get<TreatmentPlan[]>(`/analysis/sessions/${sessionId}/treatment`).then(r => r.data),
  explainDecision: (sessionId: string, body: XAIRequest) =>
    api.post<XAIResponse>(`/analysis/sessions/${sessionId}/explain-decision`, body).then(r => r.data),

  // Finalize
  finalize: (sessionId: string, landmarks: LandmarkUpdateDto[]) =>
    api.post<AnalysisSession>(`/analysis/sessions/${sessionId}/finalize`, landmarks).then(r => r.data),

  // Overlays
  generateOverlays: (sessionId: string, outputs?: string[]) =>
    api.post<OverlayImage[]>(`/analysis/sessions/${sessionId}/overlays`, null, { params: { outputs } }).then(r => r.data),
  getOverlays: (sessionId: string) =>
    api.get<OverlayImage[]>(`/analysis/sessions/${sessionId}/overlays`).then(r => r.data),

  // History & Norms
  history: (filters: HistoryFilters) =>
    api.get<AnalysisSession[]>('/analysis/history', { params: filters }).then(r => r.data),
  norms: () => api.get('/analysis/norms').then(r => r.data),
};

// ── Reports ───────────────────────────────────────────────────────────────────

export const reportsApi = {
  generate: (sessionId: string, body: GenerateReportRequest) =>
    api.post<Report>(`/reports/sessions/${sessionId}`, body).then(r => r.data),
  get: (reportId: string) => api.get<Report>(`/reports/${reportId}`).then(r => r.data),
  getBySession: (sessionId: string) => api.get<Report[]>(`/reports/sessions/${sessionId}`).then(r => r.data),
  getAll: () => api.get<Report[]>('/reports').then(r => r.data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/dashboard/stats').then(r => r.data),
};

// re-export unused types to avoid "unused import" warnings
export type { SessionStatus, SkeletalClass };
