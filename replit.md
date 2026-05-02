# CephAnalysis

An AI-powered medical platform for automated cephalometric analysis and treatment planning. Orthodontists can upload lateral cephalometric X-ray images to automatically detect anatomical landmarks, calculate clinical measurements, generate diagnoses, and suggest treatment plans.

## Architecture

Multi-component project:

- **Frontend**: React 19 + Vite (TypeScript, port 5000)
- **Backend**: ASP.NET Core .NET 9 Clean Architecture with CQRS (port 5180)
- **AI Microservice**: Python FastAPI with PyTorch (port 8000)
- **Database**: PostgreSQL 16 with Entity Framework Core
- **Cache**: Redis 7

## Project Structure

```
frontend/              React + Vite (TSX) frontend
  client/
    src/
      pages/           DashboardPage, PatientsPage, CasesPage,
                       AnalysisPage, ViewerPage, ResultsPage,
                       HistoryPage, ReportsPage, AuthPage
      components/      AppShell, ClinicalDialogs, Sidebar, etc.
      lib/             ceph-api.ts, mappers.ts, clinical-utils.ts
      contexts/        ThemeContext
  server/              Minimal tRPC router stub
  shared/              Shared constants
  vite.config.ts       Vite config (host: 0.0.0.0, port: 5000, allowedHosts: true)
backend/               ASP.NET Core Clean Architecture solution
  CephAnalysis.API/    Controllers, middleware, Program.cs
  CephAnalysis.Application/  CQRS handlers
  CephAnalysis.Infrastructure/ EF Core, repositories
  CephAnalysis.Domain/  Domain entities
  CephAnalysis.Shared/  Shared utilities
ai_service/            Python FastAPI AI microservice (CephAI v2)
  engines/
    hrnet.py           Full 4-stage HRNet-W32 (Bottleneck stem + HR modules, out=80ch)
    landmark_engine.py 80-landmark detection, TTA, ensemble variance, 22-edge refiner
    measurement_engine.py 75 measurements: Steiner, Tweed, McNamara, Jarabak, Down's,
                         Ricketts, Burstone soft-tissue, Airway, CVM proxies, Bolton proxy
    diagnosis_engine.py  Probabilistic skeletal class (GMM+ANB+Wits), CVM staging
                         (Baccetti 2002), Bolton discrepancy, airway risk, facial convexity
    treatment_engine.py  20 evidence-based rules (Twin Block, Herbst, Forsus FRD,
                         Carrière, Pendulum, MEAW, SARPE, MSE, BSSO, Le Fort I,
                         bimaxillary, clear aligners, TADs), Proffit/Petrovic growth
                         prediction (+2yr/+5yr/end-of-growth projections)
  routers/             API endpoints (landmark, measurement, diagnosis, treatment, overlay)
  config/settings.py   num_landmarks=80, input_size=512×512, ensemble_size=3, TTA=True
  schemas/schemas.py   DiagnosisResponse updated: CVM, airway, Bolton, convexity fields
docker/                Dockerfiles for services
docs/                  UML diagrams and documentation
```

## Running in Replit

Only the **frontend** is configured as a workflow (port 5000). The backend and AI service require PostgreSQL, Redis, and ML model weights.

### Frontend Workflow
- Command: `cd frontend && pnpm run dev`
- Port: 5000
- Package manager: pnpm
- Vite dev server: `host: '0.0.0.0'`, `port: 5000`, `allowedHosts: true`
- Proxy: `/api` → `http://localhost:5180`, `/uploads` → `http://localhost:5180`, `/health` → `http://localhost:5180`

### Deployment
- Type: static
- Build: `cd frontend && pnpm run build`
- Public dir: `frontend/dist`

## Clinical Workflow (UI)

1. **Register patient** → PatientsPage → create patient form
2. **Create study/case** → CasesPage → study type, title, date
3. **Upload X-ray** → AnalysisPage → file upload (JPG/PNG/BMP/DICOM, max 100MB)
4. **Calibrate image** → ViewerPage → 2-point ruler calibration
5. **Run AI pipeline** → AnalysisPage → fullPipeline()
6. **Review results** → ViewerPage → LandmarkViewer (drag landmarks)
7. **Finalize & export** → ResultsPage → Generate Report

## Backend Storage System

### Categorised File Layout

Files are stored as: `{base}/{patientId:N}/{yyyy-MM}/{category}/{guid}_{filename}`

Categories: `xray`, `thumbnail`, `overlay`, `report`, `other`

When no PatientId is provided (e.g. overlay from AI service), the path falls back to `{base}/{yyyy-MM}/{category}/{guid}_{filename}`.

### Key Interfaces

| Interface | Location | Purpose |
|-----------|----------|---------|
| `IStorageService` | `Application/Interfaces` | Upload, download, delete files. `UploadFileAsync` accepts optional `StorageOptions` for categorised paths. `DeleteFilesAsync` does parallel bulk deletion (max 8 concurrent). |
| `IStorageManager` | `Application/Interfaces` | High-level cascade deletion. Queries DB to collect all URLs, then calls `IStorageService.DeleteFilesAsync`. Three methods: `DeletePatientAssetsAsync`, `DeleteStudyAssetsAsync`, `DeleteSessionAssetsAsync`. |
| `LocalStorageService` | `Infrastructure/Storage` | Dev implementation of `IStorageService` using local filesystem. |
| `StorageManager` | `Infrastructure/Storage` | Implementation of `IStorageManager`. |

### Cascade Deletion Flow

When a **Patient** is deleted:
1. `DeletePatientHandler` calls `IStorageManager.DeletePatientAssetsAsync(patientId)`
2. `StorageManager` queries all XRayImages → AnalysisSessions → Reports for that patient
3. Collects all StorageUrls, ThumbnailUrls, ResultImageUrls, OverlayImagesJson entries, Report StorageUrls
4. Calls `IStorageService.DeleteFilesAsync` (parallel, max 8 concurrent)
5. EF cascade handles DB deletion

Same pattern for **Study** deletion.

### SkiaImageOverlayService Enhancements

- **Defensive per-layer rendering**: each `Draw*` call is wrapped in `SafeDraw(try/catch)` so a single layer failure never aborts the whole render
- **Enhanced patient header**: now includes MRN, study date, generation timestamp (UTC)
- **Quality score badge**: top-right badge showing average landmark confidence with colour-coded progress bar (Excellent/Good/Moderate/Low)
- **Uncalibrated watermark**: diagonal "UNCALIBRATED" banner drawn when `IsCalibrated == false`

### QuestPdfReportGenerator Enhancements

- **Risk Signals card**: executive summary metric card now shows abnormal count vs. total with colour coding (green=0, amber=1-3, red=4+)
- **Landmark quality tone**: landmark count card colour-coded by low-confidence count
- **Normative References section**: auto-generated at end of report, listing all cited literature sources for measurement categories present in the session

## Environment Variables

See `.env.example`:
- `JWT_SECRET_KEY` — JWT signing key
- `AI_SERVICE_KEY` — Internal API key between .NET and AI service
- `POSTGRES_USER/PASSWORD/DB` — Database credentials
- `REDIS_CONNECTION_STRING` — Redis connection
- `OPENAI_API_KEY` — Optional, for LLM treatment justification
- `STORAGE_PROVIDER` — `Local`, `S3`, or `Azure`
- `VITE_BACKEND_API_BASE_URL` — Backend URL (default: http://localhost:5180)

## Frontend Design System — ClinicalComponents.tsx

The core design-system module (`src/components/_core/ClinicalComponents.tsx`) exports:

| Component | Purpose |
|-----------|---------|
| `Card` | Glassmorphism card with optional glow |
| `Pill` | Status badge (success/warning/danger/info/accent/neutral) |
| `KpiCard` | Metric tile with icon and delta |
| `PageHeader` | Eyebrow + title + description + actions |
| `TabBar<T>` | Horizontal tab navigation with badge support |
| `DeviationBar` | Bullet-chart bar showing value vs. normal range |
| `SectionHeader` | Labelled subsection divider |
| `PrimaryBtn / SecondaryBtn / DangerBtn / IconBtn` | Button variants |
| `TextInput / SearchInput / Select / Field` | Form inputs |
| `Modal` | Radix Dialog-based modal |
| `EmptyState` | Empty placeholder with CTA |
| `ThemeToggle` | Dark/light mode switch |

### DeviationBar Details

`<DeviationBar value={m.value} normal={m.normal} severity={m.severity} />`

Parses the `normal` string (e.g. `"80-84"`, `"≥3"`, `"<5"`) to render:
- Green zone = normative band
- Colored marker = patient's value (green/yellow/orange/red by severity)

## ViewerPage — CephPreview SVG Viewer

The embedded SVG viewer (`CephPreview`) supports:

- **80 landmarks** rendered as crosshair reticles color-coded by anatomical group
- **11 cephalometric tracing planes**: SN, FH, NA, NB, N-Pog, Mandibular Plane, Go-Me, Incisal, Occlusal, E-Line, Facial Profile
- Extended lines (60px beyond endpoints) for realistic cephalometric tracing appearance
- **Grouped landmark inventory**: 7 anatomical groups (Cranial Base, Maxilla, Mandible, Dental, Soft Tissue, Airway/CVM, Ricketts), each collapsible
- **Minimap** (bottom-right corner) visible during zoom showing current viewport position
- Zoom (scroll wheel or ±buttons) + pan (Alt+drag or middle-mouse)
- Per-group landmark color coding (blue=cranial, green=maxilla, amber=mandible, purple=dental, pink=soft tissue, sky=airway, fuchsia=Ricketts)

## ResultsPage — Tabbed Analysis View

Five tabs:

| Tab | Contents |
|-----|---------|
| **Overview** | Diagnosis card, confidence bar, top-8 measurements with deviation bars, top treatment recommendation |
| **Measurements** | Collapsible group sections (Steiner/Skeletal, McNamara, Vertical/Jarabak, Dental, Soft Tissue, Airway/CVM), each with deviation bars; search + filter-by-abnormal |
| **Treatment** | Expandable treatment option cards with evidence level, retention recommendation, duration, complexity |
| **Growth** | CVM staging guide (Baccetti 2002 CS1–CS6) + Proffit/Petrovic growth prediction timeline |
| **Reports** | PDF/Word export buttons + generated report list with preview/download |

## Key Frontend Dependencies

- React 19, Wouter (routing), Vite 7
- TanStack Query v5 — server state
- Recharts — charts and visualizations
- Radix UI — accessible component primitives
- Sonner — toast notifications
- Lucide React — icons
- Tailwind CSS v4 — styling
- Zod — schema validation
- date-fns — date formatting
