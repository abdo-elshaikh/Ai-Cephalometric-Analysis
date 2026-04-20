# CephAnalysis

An AI-powered medical platform for automated cephalometric analysis and treatment planning. Orthodontists can upload lateral cephalometric X-ray images to automatically detect anatomical landmarks, calculate clinical measurements, generate diagnoses, and suggest treatment plans.

## Architecture

Multi-component project:

- **Frontend**: React 19 + Vite (JSX, port 5000)
- **Backend**: ASP.NET Core .NET 9 Clean Architecture with CQRS (port 5001)
- **AI Microservice**: Python FastAPI with PyTorch (port 8000)
- **Database**: PostgreSQL 16 with Entity Framework Core
- **Cache**: Redis 7

## Project Structure

```
frontend/              React + Vite (JSX) frontend
  src/
    pages/             DashboardPage, PatientsPage, PatientDetailPage,
                       StudyDetailPage, AnalysisPage, HistoryPage, ReportsPage,
                       Login, Register
    components/        Layout (sidebar), LandmarkViewer, ErrorBoundary
    api/client.js      Axios API client (patientsApi, studiesApi, imagesApi,
                       analysisApi, reportsApi, dashboardApi)
    context/           AuthContext (JWT auth, auto-refresh)
    index.css          Dark medical-grade design system (CSS variables + classes)
backend/               ASP.NET Core Clean Architecture solution
ai_service/            Python FastAPI AI microservice
  engines/             Landmark detection, measurement, diagnosis
  routers/             API endpoints
docker/                Dockerfiles
docs/                  UML diagrams and documentation
```

## Frontend Tech Stack (actual)

- React 19, React Router 7, Vite 8
- **JSX only** — no .tsx files in src/
- TanStack Query v5 (@tanstack/react-query) — server state
- Recharts — area chart, radar chart
- React Dropzone — X-ray upload
- React Hot Toast — notifications
- Lucide React — icons
- date-fns — date formatting
- Axios — HTTP client with JWT interceptors

## Running in Replit

Only the **frontend** is configured as a workflow (port 5000). The backend and AI service require PostgreSQL, Redis, and ML model weights.

### Frontend Workflow
- Command: `cd frontend && npm run dev`
- Port: 5000
- Vite dev server: `host: '0.0.0.0'`, `allowedHosts: true`
- Proxy: `/api` → `http://localhost:5001`, `/ai` → `http://localhost:8000`, `/uploads` → `http://localhost:5001`

## Clinical Workflow (UI)

1. **Register patient** → PatientsPage → modal with MRN, DOB, gender, contact
2. **Create study/case** → PatientDetailPage → modal with study type, referral reason
3. **Upload X-ray** → StudyDetailPage → react-dropzone (JPG/PNG/BMP/DICOM, max 100MB)
4. **Calibrate image** → CalibrationModal (canvas: 2-point ruler, known distance in mm, loupe tool)
5. **Run AI pipeline** → AnalysisTypeModal → select Steiner/McNamara/Tweed → fullPipeline()
6. **Review results** → AnalysisPage → left: LandmarkViewer (drag landmarks, undo/redo), right: tabs
   - Measurements (radar chart, grouped measurements with normal ranges)
   - Diagnosis (skeletal class, vertical pattern, overjet/overbite)
   - Treatment (ranked treatment plans with rationale, risks, evidence)
   - AI Overlays (generated overlay images)
7. **Finalize & export** → AnalysisPage → Finalize button → Generate Report → ReportsPage

## Key Features

### LandmarkViewer.jsx
- Canvas-based interactive X-ray viewer
- Drag-to-move landmarks with confidence color coding (green ≥0.80, yellow ≥0.60, red <0.60)
- Zoom/pan, brightness/contrast controls
- Undo/redo (50-state history)
- Angle arcs, coordinate readout, confidence legend

### CalibrationModal (in StudyDetailPage.jsx)
- Canvas 2-point calibration with loupe tool
- Sets pixel spacing (mm/px) used by AI engine for anatomical validation

### AnalysisPage.jsx
- Full-screen split view: landmark editor (left) + analysis panel (right)
- Pipeline steps progress indicator in header
- Finalize + Export Report actions

## Environment Variables

See `.env.example`:
- `JWT_SECRET_KEY` — JWT signing key
- `AI_SERVICE_KEY` — Internal API key between .NET and AI service
- `POSTGRES_USER/PASSWORD/DB` — Database credentials
- `REDIS_CONNECTION_STRING` — Redis connection
- `OPENAI_API_KEY` — Optional, for LLM treatment justification
- `STORAGE_PROVIDER` — `Local`, `S3`, or `Azure`

## AI Service Code Quality

Applied improvements:
- `security.py` — `secrets.compare_digest` for timing-safe service-key validation
- `llm_engine.py` — `asyncio.get_running_loop()`, `response_format=json_object`
- `landmark_engine.py` — fallback landmark confidences set to 0.50; `pixel_spacing_mm` wired through
- `measurement_engine.py` — bare `except: pass` replaced with `logger.debug(...)`
- `diagnosis_engine.py` — Frankfort landmark dict lookup fix
- `treatment_engine.py` — "Advancment" → "Advancement" typo fix
- `norms_util.py` — helper functions eliminate duplicate search logic
- `dicom_util.py` — WindowCenter/WindowWidth for clinical DICOM rendering
