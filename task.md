# AI Cephalometric Analysis — Task Tracker

## Phase 1 — Foundation & Infrastructure (Weeks 1–3)

### Week 1 — Environment Setup
- [x] Scaffold .NET Clean Architecture solution (5 projects)
- [x] Create Python FastAPI `ai_service/` project layout
- [x] Create React 18 + TypeScript frontend with Vite
- [x] Create `docker-compose.yml` (PostgreSQL, Redis, API, AI service)
- [x] Create `.env` template files
- [x] Create root `README.md`

### Week 2 — Domain & Database Design
- [x] Define all Domain Entities (10 entities)
- [x] Define all Enums (10 enum files)
- [x] Configure EF Core DbContext + entity mappings
- [x] Write EF Core entity configurations with indexes
- [x] Configure all 10 DB indexes
- [x] Write initial EF Core database migration
- [x] Seed scripts (DataSeeder with admin, doctor, viewer users + 3 patients + 3 studies)

### Week 3 — Infrastructure & CI/CD
- [x] Blob storage adapter (IStorageService + LocalStorageService)
- [x] Redis cache setup (ICacheService + RedisCacheService)
- [x] GitHub Actions CI pipeline (.github/workflows/ci.yml)
- [x] Serilog structured logging (Console + File sinks)
- [x] Swagger/OpenAPI configuration (with JWT Bearer security)

## Phase 2 — Authentication & User Management (Weeks 4–5)
- [x] JWT auth (register, login, refresh, logout) — controllers + MediatR handlers
- [x] RBAC middleware (AdminOnly, DoctorOnly, Viewer policies)
- [x] Rate limiting (built-in .NET FixedWindowLimiter, 100 req/min per user)
- [x] Audit logging middleware (AuditLoggingMiddleware)
- [x] Frontend: Login page
- [x] Frontend: Register page
- [x] Frontend: Role-based navigation guards

## Phase 3 — Patient & Study Management (Weeks 6–8)
- [x] Patient CRUD APIs (list, get, create, update)
- [x] Study management APIs (create study, get patient studies)
- [x] Patient DELETE endpoint (soft-delete, admin guard)
- [x] Frontend: Patient Dashboard (PatientsPage + PatientDetailPage)
- [x] Frontend: Patient form (PatientFormPage)
- [x] Frontend: Study page (StudyPage)

## Phase 4 — X-Ray Upload & Calibration (Weeks 9–11)
- [x] Image upload API (multipart upload to study)
- [x] Calibration endpoint (2-point calibration with pixel spacing)
- [x] Get study images / get image by ID
- [x] Frontend: CalibrationPage
- [x] Frontend: XrayViewer (Cornerstone.js/OpenSeadragon integration)

## Phase 5 — AI Landmark Detection (Weeks 12–15)
- [ ] AI model setup and training
- [x] FastAPI landmark detection endpoint (routers/landmark.py)
- [x] Backend integration (DetectLandmarksCommand → AiService → FastAPI)
- [x] Manual adjustment APIs (PUT landmark)
- [x] Frontend: AnalysisPage (basic)
- [x] Frontend: LandmarkEditor component (draggable points integrated in AnalysisPage)

## Phase 6 — Measurement Engine (Weeks 16–17)
- [x] Python measurement engine (engines/measurement_engine.py)
- [x] FastAPI measurement endpoint (routers/measurement.py)
- [x] Backend: AiService.CalculateMeasurementsAsync integration
- [x] Frontend: Measurement table (in ResultsPage)

## Phase 7 — Diagnosis Engine (Weeks 18–19)
- [x] Diagnosis rule-based classifier (engines/diagnosis_engine.py)
- [x] FastAPI diagnosis endpoint (routers/diagnosis.py)
- [x] Frontend: Diagnosis panel (in ResultsPage)

## Phase 8 — Treatment Planning (Weeks 20–22)
- [x] Treatment engine (engines/treatment_engine.py)
- [x] FastAPI treatment endpoint (routers/treatment.py)
- [x] LLM integration for rationale
- [x] Frontend: Treatment planning UI (in ResultsPage)

## Phase 9 — Report Generation (Weeks 23–24)
- [x] PDF generation engine (backend rendering)
- [x] Report APIs
- [x] Frontend: ReportViewer (ReportsPage list ready, awaiting generation)

## Phase 10 — Integration, Testing & Security (Weeks 25–26)
- [x] E2E Playwright tests
- [x] Load testing
- [x] HIPAA security hardening
- [x] Production Docker build
