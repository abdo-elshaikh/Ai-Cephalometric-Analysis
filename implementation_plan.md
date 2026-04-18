# AI-Based Cephalometric Analysis & Treatment Planning System
## Comprehensive Project Plan with Timeline

---

> [!IMPORTANT]
> **Total Estimated Duration: ~26 Weeks (6.5 Months)**
> Starting from Week 1 (April 2026), targeting completion by **mid-October 2026**.
> Team assumption: 1 full-stack developer + 1 AI/ML engineer (can be same person for solo dev at adjusted pace).

---

## 🏗️ System Architecture Summary

The system is a **microservices-based medical AI platform** consisting of:

| Layer | Technology |
|---|---|
| Backend API | ASP.NET Core 8 (Clean Architecture) |
| AI Microservice | FastAPI (Python) |
| AI Model | HRNet / YOLOv8 Pose |
| Treatment ML | scikit-learn / PyTorch |
| LLM Explanation | OpenAI API / LLaMA |
| Database | PostgreSQL 16 |
| Frontend | React 18 + TypeScript |
| File Storage | AWS S3 / Azure Blob |
| Caching | Redis |
| Auth | JWT RS256 (RBAC) |

---

## 📅 Phase-by-Phase Plan

---

### Phase 1 — Project Foundation & Infrastructure
**Duration: Weeks 1–3 (3 weeks)**

#### Objectives
- Set up all development tooling
- Scaffold the solution architecture
- Configure CI/CD pipeline
- Establish database connection

#### Week 1 — Environment Setup
- [ ] Initialize Git repository with branching strategy (main/develop/feature)
- [ ] Create Visual Studio Solution: `CephAnalysis.sln`
- [ ] Scaffold 4 C# projects with Clean Architecture:
  - `CephAnalysis.API` (ASP.NET Core 8 Web API)
  - `CephAnalysis.Application` (CQRS, DTOs, interfaces)
  - `CephAnalysis.Domain` (Entities, Enums, Domain Events)
  - `CephAnalysis.Infrastructure` (EF Core, Repositories, External Adapters)
  - `CephAnalysis.Shared` (Constants, Result wrappers, Pagination)
- [ ] Set up Python virtual environment for `ai_service/`
- [ ] Initialize FastAPI app with basic project layout
- [ ] Set up React 18 + TypeScript frontend with Vite
- [ ] Configure Docker and `docker-compose.yml` (PostgreSQL, Redis, API, AI service)

#### Week 2 — Database & Domain Design
- [ ] Define all 10 Domain Entities:
  - `User`, `Patient`, `Study`, `XRayImage`, `AnalysisSession`
  - `Landmark`, `Measurement`, `Diagnosis`, `TreatmentPlan`, `Report`
- [ ] Define all Enums (Role, SkeletalClass, VerticalPattern, AnalysisStatus, TreatmentType, etc.)
- [ ] Configure EF Core DbContext with all entity mappings
- [ ] Write and run initial database migration (all tables, FK constraints)
- [ ] Configure all 10 database indexes (as per schema doc)
- [ ] Set up PostgreSQL 16 instance (Docker)
- [ ] Seed users and test data scripts

#### Week 3 — Infrastructure & CI/CD
- [ ] Configure Blob storage adapter (S3/Azure Blob/local) with abstraction
- [ ] Set up Redis for caching (session & inference cache)
- [ ] Configure GitHub Actions / Azure DevOps CI pipeline
  - Build + test on every PR
  - Lint (ESLint, flake8, dotnet format)
- [ ] Write `docker-compose.yml` with all services
- [ ] Create environment configuration (`.env` templates for all envs)
- [ ] Configure Serilog (structured logging)
- [ ] Set up Swagger/OpenAPI documentation

---

### Phase 2 — Authentication & User Management
**Duration: Weeks 4–5 (2 weeks)**

#### Objectives
- Secure JWT RS256 authentication
- RBAC: Admin | Doctor | Viewer
- Full user management APIs

#### Week 4 — Auth System
- [ ] Implement `POST /api/auth/register` — Register new doctor
- [ ] Implement `POST /api/auth/login` — Return JWT access + refresh tokens
- [ ] Implement `POST /api/auth/refresh` — Refresh access token
- [ ] Implement `POST /api/auth/logout` — Invalidate refresh token
- [ ] JWT RS256 token generation (15-min access, 7-day refresh)
- [ ] HttpOnly cookie handling for refresh tokens
- [ ] Password hashing with BCrypt

#### Week 5 — RBAC & User APIs
- [ ] Implement RBAC middleware (Admin | Doctor | Viewer roles)
- [ ] Implement rate limiting (100 req/min per user)
- [ ] User profile management endpoints
- [ ] Audit logging middleware (all patient record read/write)
- [ ] TLS 1.3 / HSTS configuration
- [ ] Frontend: Login page, registration flow, protected routing
- [ ] Frontend: Role-based navigation guards

---

### Phase 3 — Patient & Study Management
**Duration: Weeks 6–8 (3 weeks)**

#### Objectives
- Full CRUD for Patients and Studies
- Satisfies **User Stories 1 & 2**

#### Week 6 — Patient Management APIs
- [ ] `GET /api/patients` — Paginated patient list (doctor-scoped)
- [ ] `POST /api/patients` — Create patient profile
- [ ] `GET /api/patients/{id}` — Patient detail
- [ ] `PUT /api/patients/{id}` — Update demographics
- [ ] `DELETE /api/patients/{id}` — Soft-delete (admin guard)
- [ ] Input validation (FluentValidation)
- [ ] Unit tests (xUnit) for patient service layer

#### Week 7 — Study Management APIs
- [ ] `GET /api/patients/{id}/studies` — List studies for patient
- [ ] `POST /api/patients/{id}/studies` — Create study session
- [ ] Study status management (Pending → Processing → Completed)
- [ ] Cascade delete configuration (Patient → Studies → downstream)
- [ ] Unit tests for study service layer

#### Week 8 — Frontend: Patient & Study Dashboard
- [ ] Patient list view with search/filter/pagination
- [ ] Create/edit patient form
- [ ] Patient detail page with study history timeline
- [ ] Study creation modal
- [ ] Responsive layout with sidebar navigation
- [ ] Loading skeletons and error boundary components

---

### Phase 4 — X-Ray Upload & Calibration
**Duration: Weeks 9–11 (3 weeks)**

#### Objectives
- Secure multi-format X-ray upload
- Pixel-to-mm calibration system
- Satisfies **User Stories 3 & 4**

#### Week 9 — Image Upload API
- [ ] `POST /api/studies/{id}/images` — Multipart upload endpoint
  - Accept: DICOM, PNG, JPG
  - Validate format, size (max 50 MB), MIME type
  - Store binary in blob storage
  - Persist metadata to `xray_images` table
- [ ] DICOM reader/parser (pydicom in AI service)
- [ ] Thumbnail generation for preview
- [ ] `GET /api/images/{id}` — Image metadata + calibration status

#### Week 10 — Calibration System
- [ ] `POST /api/images/{id}/calibrate` — Submit 2 reference points + known mm distance
- [ ] Backend: calculate `pixel_spacing_mm` = `known_mm / pixel_distance`
- [ ] Store: `calibration_ratio`, `calibration_point1`, `calibration_point2`, `calibration_known_mm`
- [ ] Validate: points must be distinct, distance must be positive
- [ ] Update `is_calibrated = true` on success

#### Week 11 — Frontend: X-Ray Viewer & Calibration UI
- [ ] **XrayViewer** component (using Cornerstone.js or OpenSeadragon for DICOM)
  - Pan, zoom, brightness/contrast controls
  - Overlay canvas for landmarks
- [ ] **Calibration tool**: click 2 points on X-ray, enter known mm distance
- [ ] Visual feedback: calibration line drawn on image
- [ ] Upload flow: drag-and-drop, progress bar, format validation

---

### Phase 5 — AI Landmark Detection
**Duration: Weeks 12–15 (4 weeks)**

#### Objectives
- Train/integrate AI model for 19–40 anatomical landmark detection
- AI microservice endpoints
- Manual adjustment capability
- Satisfies **User Story 5**

#### Week 12 — AI Model Research & Setup
- [ ] Evaluate and select model: **HRNet** vs **YOLOv8 Pose**
- [ ] Download and set up ISBI Cephalometric Dataset (400 training images)
- [ ] Implement preprocessing pipeline:
  - `utils/preprocessing.py`: DICOM reader, normalization, resize to model input
- [ ] Set up GPU training environment (CUDA, PyTorch)
- [ ] Define 19 required landmark codes (S, N, Or, Po, A, B, Pog, Gn, Me, Go, ANS, PNS, UI, UIR, LI, LIR, UM, LM, Ar)

#### Week 13 — AI Model Training
- [ ] Implement heatmap regression training loop (for HRNet)
  - OR configure YOLOv8-Pose training
- [ ] Training: 80/10/10 train/val/test split
- [ ] Track eval metrics: MRE (Mean Radial Error), SDR (2mm, 2.5mm, 3mm, 4mm)
- [ ] Target: MRE < 1.5mm on ISBI benchmark
- [ ] Save best model weights to `ai_service/models/`

#### Week 14 — AI Microservice Endpoints
- [ ] FastAPI app factory and router setup
- [ ] `POST /ai/detect-landmarks` — Run inference, return landmark coordinates dict
  - Input: preprocessed image binary
  - Output: `{landmark_code: {x, y, confidence}}`
- [ ] `engines/landmark_engine.py` — Load model, run heatmap inference
- [ ] `utils/visualization.py` — Draw landmark overlay PNG
- [ ] Pydantic schemas for request/response
- [ ] Internal service key authentication (not public)
- [ ] Unit tests (pytest) for landmark engine

#### Week 15 — Landmark Integration & Manual Adjustment
- [ ] `POST /api/images/{id}/analyze` — Trigger AI pipeline (enqueue job)
- [ ] `GET /api/sessions/{id}` — Analysis session status polling
- [ ] `GET /api/sessions/{id}/landmarks` — Retrieve all landmark records
- [ ] `PUT /api/sessions/{id}/landmarks/{code}` — Manual landmark adjustment
  - Store `is_manually_adjusted = true`, `adjustment_reason`
- [ ] Frontend: **LandmarkEditor** component
  - Draggable landmark points on X-ray overlay
  - Color coding: AI-detected (green) vs manual (yellow)
  - Confidence score badges per landmark
  - Zoom-in on individual landmarks

---

### Phase 6 — Measurement Engine
**Duration: Weeks 16–17 (2 weeks)**

#### Objectives
- Compute all standard cephalometric measurements
- Compare against clinical normal ranges
- Satisfies **User Story 6**

#### Week 16 — Measurement Engine (Python)
- [ ] `engines/measurement_engine.py` — Pure calculation functions:
  - `calculate_angle(p1, p2, p3)` — 3-point angle computation
  - `calculate_distance(p1, p2)` — Euclidean distance in mm
  - `calculate_ratio(dist1, dist2)` — Ratio calculation
- [ ] Implement all 13+ measurements with normal ranges:

| Code | Normal Range | Type |
|---|---|---|
| SNA | 80°–84° | Angle |
| SNB | 78°–82° | Angle |
| ANB | 0°–4° | Angle |
| FMA | 22°–28° | Angle |
| IMPA | 87°–95° | Angle |
| FMIA | 65°–75° | Angle |
| SN-GoGn | 28°–38° | Angle |
| UI-NA° | 20°–28° | Angle |
| UI-NA mm | 2–6 mm | Distance |
| LI-NB° | 23°–29° | Angle |
| LI-NB mm | 2–5 mm | Distance |

- [ ] `POST /ai/calculate-measurements` — FastAPI endpoint
- [ ] Compute: `status` (Normal/Increased/Decreased), `deviation` from midpoint
- [ ] `landmark_refs` JSON array stored with each measurement

#### Week 17 — Measurement API & Frontend
- [ ] `GET /api/sessions/{id}/measurements` — Return measurements table
- [ ] Persist all measurements to `measurements` table
- [ ] Frontend: Measurement table component
  - Color-coded rows (green = Normal, orange = Increased, red = Decreased)
  - Normal range column with deviation indicator
  - Steiner / McNamara / Ricketts / Tweed analysis tabs

---

### Phase 7 — Diagnosis Engine
**Duration: Weeks 18–19 (2 weeks)**

#### Objectives
- Rule-based classification of skeletal class, vertical pattern, dental inclination
- Satisfies **User Story 7**

#### Week 18 — Diagnosis Engine (Python)
- [ ] `engines/diagnosis_engine.py` — Rule table classifier:
  - **Skeletal Class** from ANB: ClassI (0°–4°), ClassII (>4°), ClassIII (<0°)
  - **Vertical Pattern** from FMA: LowAngle (<22°), Normal (22°–28°), HighAngle (>28°)
  - **Maxillary Position** from SNA: Retrognathic (<80°), Normal (80°–84°), Prognathic (>84°)
  - **Mandibular Position** from SNB: Retrognathic (<78°), Normal (78°–82°), Prognathic (>82°)
  - **Upper/Lower Incisor Inclination** from UI-NA°, LI-NB°
  - **Overjet/Overbite** in mm computation
- [ ] Confidence score calculation (based on measurement certainty)
- [ ] AI-generated summary paragraph (template or LLM)
- [ ] `POST /ai/classify-diagnosis` — FastAPI endpoint

#### Week 19 — Diagnosis API & Frontend
- [ ] `GET /api/sessions/{id}/diagnosis` — Return diagnosis classification
- [ ] Persist to `diagnoses` table (1:1 with session)
- [ ] Frontend: Diagnosis Summary panel
  - Skeletal class badge (I/II/III) with color coding
  - Vertical pattern indicator
  - Dental inclination summary
  - Confidence gauge meter
  - AI-generated summary text block

---

### Phase 8 — Treatment Planning Engine
**Duration: Weeks 20–22 (3 weeks)**

#### Objectives
- ML + rule-based hybrid treatment recommendation
- LLM-generated clinical justification
- Satisfies **User Story 8**

#### Week 20 — Treatment ML Classifier
- [ ] Prepare training dataset: diagnosis → treatment mappings (from clinical guidelines)
- [ ] Train ML classifier (scikit-learn Random Forest or PyTorch MLP):
  - Input: ANB, FMA, IMPA, skeletal class, age group, severity
  - Output: ranked treatment type probabilities
- [ ] Implement rule-based fallback (clinical protocol tables)
- [ ] `engines/treatment_engine.py` — ML + rule hybrid

#### Week 21 — LLM Integration & Treatment API
- [ ] Integrate OpenAI API (or local LLaMA) for clinical justification text generation
- [ ] Prompt engineering: "Given skeletal Class II with high angle pattern, explain why Twin Block is recommended..."
- [ ] `POST /ai/suggest-treatment` — Return ranked treatment options with rationale/risks
- [ ] `GET /api/sessions/{id}/treatment` — Return all treatment plan options
- [ ] Persist to `treatment_plans` table (plan_index 0=primary, 1,2=alternatives)
- [ ] Support treatment types:
  - FunctionalAppliance, Headgear, Extraction, Expansion, Braces, IPR, Surgery, Observation

#### Week 22 — Frontend: Treatment Planning UI
- [ ] Treatment recommendation cards (primary + alternatives)
- [ ] Confidence score bars per treatment option
- [ ] "Why this treatment?" expandable explanation panel (LLM rationale)
- [ ] Risk and considerations section
- [ ] Estimated duration badge
- [ ] Doctor can approve/modify treatment plan

---

### Phase 9 — Report Generation
**Duration: Weeks 23–24 (2 weeks)**

#### Objectives
- Automated PDF report generation
- Download and export functionality
- Satisfies **User Story 9**

#### Week 23 — PDF Generation Engine
- [ ] Select PDF library: **WeasyPrint** (Python) or **QuestPDF** (.NET)
- [ ] Report template design with sections:
  1. Patient header (name, age, gender, study date)
  2. X-ray image with landmark overlay
  3. Measurement table (with normal range, status)
  4. Diagnosis summary
  5. Treatment plan (primary + alternatives)
  6. Doctor signature / clinic branding
- [ ] `POST /api/sessions/{id}/reports` — Generate and store PDF
- [ ] Store to blob storage, persist metadata to `reports` table
- [ ] Language support field (`en` default, extensible)

#### Week 24 — Report API & Frontend
- [ ] `GET /api/sessions/{id}/reports` — List all reports for session
- [ ] `GET /api/reports/{id}/download` — Signed blob URL (with expiry)
- [ ] Frontend: **ReportViewer** component
  - In-browser PDF preview (PDF.js)
  - Download button
  - Report history list
  - Regenerate report option
  - Toggle sections: include/exclude X-ray overlay, measurements, treatment plan

---

### Phase 10 — Integration, Testing & Security Hardening
**Duration: Weeks 25–26 (2 weeks)**

#### Objectives
- End-to-end pipeline testing
- Security audit and HIPAA-aligned hardening
- Performance optimization

#### Week 25 — Full Integration Testing
- [ ] E2E test suite with Playwright:
  - Register doctor → Upload X-ray → Run analysis → View results → Download report
- [ ] xUnit integration tests for all API endpoints
- [ ] pytest tests for AI service engines
- [ ] Load testing (k6 or Locust): 100 req/min limit, 10 concurrent AI jobs
- [ ] Verify all performance targets (P95):
  - Image upload < 3s
  - AI landmark detection < 5s
  - Full pipeline < 15s
  - PDF generation < 10s
  - API CRUD < 200ms
  - Dashboard load < 1.5s

#### Week 26 — Security Hardening & Production Prep
- [ ] HIPAA audit log verification (all patient record accesses logged)
- [ ] AES-256 encryption for DICOM files in blob storage
- [ ] PostgreSQL PII column-level encryption
- [ ] Input validation: all file uploads (format, 50MB size, MIME)
- [ ] Rate limiting verification (100 req/min per user)
- [ ] OWASP Top 10 security checklist
- [ ] Azure Key Vault / environment secrets setup (no hardcoded credentials)
- [ ] Final Docker production build and deployment scripts
- [ ] README and deployment documentation

---

## 📊 Summary Timeline Table

| Phase | Name | Weeks | Duration |
|---|---|---|---|
| 1 | Foundation & Infrastructure | 1–3 | 3 weeks |
| 2 | Authentication & User Management | 4–5 | 2 weeks |
| 3 | Patient & Study Management | 6–8 | 3 weeks |
| 4 | X-Ray Upload & Calibration | 9–11 | 3 weeks |
| 5 | AI Landmark Detection | 12–15 | 4 weeks |
| 6 | Measurement Engine | 16–17 | 2 weeks |
| 7 | Diagnosis Engine | 18–19 | 2 weeks |
| 8 | Treatment Planning Engine | 20–22 | 3 weeks |
| 9 | Report Generation | 23–24 | 2 weeks |
| 10 | Integration, Testing & Security | 25–26 | 2 weeks |
| **Total** | | **1–26** | **26 weeks** |

---

## 🗓️ Gantt Overview

```
Week:    01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26
Phase 1: ██ ██ ██
Phase 2:          ██ ██
Phase 3:                ██ ██ ██
Phase 4:                            ██ ██ ██
Phase 5:                                      ██ ██ ██ ██
Phase 6:                                                  ██ ██
Phase 7:                                                        ██ ██
Phase 8:                                                              ██ ██ ██
Phase 9:                                                                        ██ ██
Phase 10:                                                                             ██ ██
```

---

## 📋 User Story Coverage

| User Story | Feature | Phase |
|---|---|---|
| US-1 | Patient profile CRUD | Phase 3 |
| US-2 | Study/session management | Phase 3 |
| US-3 | X-ray image upload | Phase 4 |
| US-4 | X-ray calibration | Phase 4 |
| US-5 | AI landmark detection + manual adjustment | Phase 5 |
| US-6 | Cephalometric measurement calculation | Phase 6 |
| US-7 | Automatic diagnosis classification | Phase 7 |
| US-8 | AI treatment planning + LLM explanation | Phase 8 |
| US-9 | PDF report generation & download | Phase 9 |

---

## ⚠️ Key Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| AI model accuracy below target (MRE > 2mm) | High | Use ensemble (HRNet + YOLO), fine-tune on additional datasets |
| DICOM parsing complexity | Medium | Use established pydicom library; handle edge cases early |
| LLM API cost/latency | Medium | Cache LLM outputs per diagnosis type; use local LLaMA as fallback |
| HIPAA compliance gaps | High | Implement audit logging from Phase 2; legal review before launch |
| Training data availability | High | Use ISBI Cephalometric Dataset; augment with rotation, flipping, brightness |
| Blob storage config differences (S3 vs Azure) | Low | Abstract behind `IStorageService` interface from day 1 |

---

## 🔧 Recommended Development Stack (Confirmed)

```
Backend:       ASP.NET Core 8 + EF Core 8 + FluentValidation + MediatR (CQRS)
AI Service:    Python 3.11 + FastAPI + PyTorch + scikit-learn + pydicom + WeasyPrint
Frontend:      React 18 + TypeScript + Vite + React Query + Axios + PDF.js
Database:      PostgreSQL 16 + Redis 7
DevOps:        Docker + docker-compose + GitHub Actions
Testing:       xUnit + pytest + Playwright
Auth:          JWT RS256 + BCrypt
Storage:       AWS S3 / Azure Blob (abstracted)
LLM:           OpenAI GPT-4o / LLaMA 3 (local)
```

---

## ✅ Definition of Done

Each phase is considered **Done** when:
1. All API endpoints are implemented and documented in Swagger
2. Unit + integration tests pass (≥ 80% coverage)
3. Frontend UI is functional and responsive
4. Docker compose runs all services cleanly
5. Performance targets are met (P95)
6. Code is reviewed and merged to `develop` branch
