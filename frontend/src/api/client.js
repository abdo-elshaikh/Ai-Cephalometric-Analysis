import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT from localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true
      const refresh = localStorage.getItem('refreshToken')
      if (refresh) {
        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken: refresh })
          localStorage.setItem('accessToken', data.accessToken)
          localStorage.setItem('refreshToken', data.refreshToken)
          original.headers.Authorization = `Bearer ${data.accessToken}`
          return api(original)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      } else {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// ── Auth ─────────────────────────────────────────────
export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
}

// ── Dashboard ────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
}

// ── Patients ─────────────────────────────────────────
export const patientsApi = {
  list: (page = 1, pageSize = 20, search = '') =>
    api.get('/patients', { params: { page, pageSize, search } }),
  get: (id) => api.get(`/patients/${id}`),
  create: (data) => api.post('/patients', data),
  update: (id, d) => api.put(`/patients/${id}`, d),
  delete: (id) => api.delete(`/patients/${id}`),
}

// ── Studies ──────────────────────────────────────────
export const studiesApi = {
  create: (data) => api.post('/studies', data),
  listForPatient: (patientId) => api.get(`/studies/patient/${patientId}`),
  get: (id) => api.get(`/studies/${id}`),
  update: (id, data) => api.put(`/studies/${id}`, data),
  delete: (id) => api.delete(`/studies/${id}`),
}

// ── Images ───────────────────────────────────────────
export const imagesApi = {
  upload: (studyId, file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post(`/images/study/${studyId}`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  listForStudy: (studyId) => api.get(`/images/study/${studyId}`),
  get: (imageId) => api.get(`/images/direct/${imageId}`),
  calibrate: (imageId, data) => api.post(`/images/${imageId}/calibrate`, data),
}

// ── Analysis ─────────────────────────────────────────
export const analysisApi = {
  detect: (imageId, type = 'Steiner') =>
    api.post(`/analysis/detect/${imageId}`, null, { params: { type } }),
  getLatestSession: (imageId) => api.get(`/analysis/latest-session/${imageId}`),
  getSession: (sessionId) => api.get(`/analysis/sessions/${sessionId}`),
  getLandmarks: (sessionId) => api.get(`/analysis/sessions/${sessionId}/landmarks`),
  adjustLandmark: (sessionId, code, data) =>
    api.put(`/analysis/sessions/${sessionId}/landmarks/${code}`, data),
  updateLandmarks: (sessionId, landmarks) =>
    api.put(`/analysis/sessions/${sessionId}/landmarks`, landmarks),
  calcMeasurements: (sessionId) => api.post(`/analysis/sessions/${sessionId}/measurements`),
  getMeasurements: (sessionId) => api.get(`/analysis/sessions/${sessionId}/measurements`),
  classifyDiagnosis: (sessionId) => api.post(`/analysis/sessions/${sessionId}/diagnosis`),
  getDiagnosis: (sessionId) => api.get(`/analysis/sessions/${sessionId}/diagnosis`),
  suggestTreatment: (sessionId) => api.post(`/analysis/sessions/${sessionId}/treatment`),
  getTreatment: (sessionId) => api.get(`/analysis/sessions/${sessionId}/treatment`),
  fullPipeline: (imageId, type = 'Steiner') =>
    api.post(`/analysis/full-pipeline/${imageId}`, null, { params: { type } }),
  finalize: (sessionId, landmarks) =>
    api.post(`/analysis/sessions/${sessionId}/finalize`, landmarks),
  generateOverlays: (sessionId) => api.post(`/analysis/sessions/${sessionId}/overlays`),
  getOverlays: (sessionId) => api.get(`/analysis/sessions/${sessionId}/overlays`),
  history: (params) => api.get('/analysis/history', { params }),
  deleteSession: (sessionId) => api.delete(`/analysis/sessions/${sessionId}`),
  norms: () => api.get('/analysis/norms'),
}

// ── Reports ──────────────────────────────────────────
export const reportsApi = {
  generate: (sessionId, data) => api.post(`/reports/sessions/${sessionId}`, data),
  get: (reportId) => api.get(`/reports/${reportId}`),
  list: () => api.get('/reports'),
  listForSession: (sessionId) => api.get(`/reports/sessions/${sessionId}`),
}
