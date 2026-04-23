# AI Cephalometric Analysis Frontend – Improved TODO

## 📌 Legend
- **Priority**: P0 (must have) → P1 (should have) → P2 (nice to have)
- **Effort**: S (small, ≤2h), M (medium, ½‑1d), L (large, 1‑2d), XL (2‑3d)
- **Dependencies** are listed where tasks block others.

---

## Phase 0: Foundation & Infrastructure (P0)

### 0.1 Project Setup
- [ ] [P0] [S] Initialize React + TypeScript + Vite project with strict mode
- [ ] [P0] [S] Configure ESLint, Prettier, and pre‑commit hooks (husky + lint‑staged)
- [ ] [P0] [S] Set up environment variables (API URL, S3 bucket, etc.) with validation
- [ ] [P0] [M] Configure Vitest + React Testing Library + MSW (mock backend)
- [ ] [P0] [M] Install and set up Tailwind CSS (or chosen design system) with dark mode support

### 0.2 Design System & Shared Components
- [ ] [P0] [M] Define design tokens: colors, typography, spacing, shadows, border radius
- [ ] [P0] [S] Create global CSS variables and Tailwind config overrides
- [ ] [P0] [M] Build reusable UI primitives:
  - [ ] Button (variants: primary, secondary, outline, ghost, destructive)
  - [ ] Card, Modal/Dialog, Toast/Notification
  - [ ] DataTable (sorting, pagination, filtering)
  - [ ] Spinner, Skeleton loader, Empty state component
  - [ ] Form components (Input, Select, Textarea, Checkbox, Radio)
- [ ] [P1] [M] Implement light/dark theme toggle (persist in localStorage)

### 0.3 Backend Integration & Auth
- [ ] [P0] [M] Set up tRPC client (create `trpc.ts` with React Query)
- [ ] [P0] [M] Implement authentication context (login, logout, token refresh, role‑based UI)
- [ ] [P0] [S] Protect routes with authentication guard
- [ ] [P0] [S] Create API error handling wrapper (toast on failure, retry logic)

### 0.4 Testing Infrastructure
- [ ] [P0] [M] Write global setup for Vitest (mock ResizeObserver, canvas, etc.)
- [ ] [P0] [S] Add test coverage reporting (c8 / vitest coverage)
- [ ] [P1] [M] Create reusable test utilities (renderWithProviders, mock tRPC, mock auth)

---

## Phase 1: Patient Management (P0)

### 1.1 List & Search
- [ ] [P0] [M] Patient list page with:
  - [ ] Server‑side pagination
  - [ ] Full‑text search (name, phone, email)
  - [ ] Column sorting (last name, DOB, last updated)
- [ ] [P0] [S] Add “Create Patient” floating action button / header button

### 1.2 CRUD Operations
- [ ] [P0] [M] Create patient form (fields: firstName, lastName, DOB, gender, phone, email, notes)
  - [ ] Validation (required fields, email format, phone regex)
  - [ ] Submit with optimistic update
- [ ] [P0] [M] Edit patient form (pre‑populate, same validation)
- [ ] [P0] [S] Patient detail view (show basic info + linked cases list)
- [ ] [P0] [S] Delete patient – custom confirmation dialog (not `window.confirm`)
- [ ] [P0] [S] Toast notifications for success/error of each CRUD operation

### 1.3 Testing
- [ ] [P0] [M] Vitest tests: create, edit, delete, list filtering/pagination, validation errors

---

## Phase 2: Case / Study Management (P0)

### 2.1 Case List & Detail
- [ ] [P0] [M] Case list page (filtered by patient, from patient detail or dedicated route)
  - [ ] Show case status (draft / analysis done / reviewed) and last analysis date
- [ ] [P0] [M] Case detail view (metadata + image preview + link to analysis)

### 2.2 Case CRUD
- [ ] [P0] [M] Create case form:
  - [ ] Study type: Lateral / PA / CBCT (exact match backend)
  - [ ] Title, clinical notes, study date (date picker)
  - [ ] Optional: link to existing image or upload new (see Phase 4)
- [ ] [P0] [M] Edit case form (same fields)
- [ ] [P0] [S] Delete case with confirmation dialog

### 2.3 Testing
- [ ] [P0] [M] Tests for case creation, editing, deletion, status display

---

## Phase 3: Image Upload & Calibration (P0)

### 3.1 Upload Component
- [ ] [P0] [M] Drag‑and‑drop / file picker with:
  - [ ] File validation (type: DICOM, JPEG, PNG; max size 50MB)
  - [ ] Upload progress indicator (Axios progress / tRPC upload)
  - [ ] Thumbnail preview after upload
- [ ] [P0] [S] Integrate with S3 (presigned URL or direct upload)

### 3.2 Calibration Tool
- [ ] [P0] [L] Two‑point calibration on canvas overlay:
  - [ ] User clicks two points on image
  - [ ] Input known distance (mm) between them
  - [ ] Compute pixel spacing (mm/px) and store
- [ ] [P0] [S] Display calibration status badge and pixel spacing value
- [ ] [P1] [S] Allow recalibration (override existing data)
- [ ] [P0] [M] Store calibration data: point1, point2, knownDistance, pixelSpacing, imageId

### 3.3 Testing
- [ ] [P0] [M] Unit tests for calibration math (pixel spacing calculation)
- [ ] [P1] [M] Component tests for upload and calibration UI

---

## Phase 4: Professional X‑ray Viewer (P0)

### 4.1 Core Viewer
- [ ] [P0] [L] Canvas‑based viewer with:
  - [ ] Zoom (in/out, fit to window, 100%)
  - [ ] Pan (drag to move)
  - [ ] Brightness & contrast sliders (real‑time canvas adjustment)
- [ ] [P0] [S] Toolbar with all controls (zoom buttons, fit, reset, sliders)

### 4.2 Overlays & Metadata
- [ ] [P0] [M] Render landmarks as draggable SVG / canvas circles (see Phase 6)
- [ ] [P0] [S] Display image metadata (dimensions, file size, DICOM tags if any)
- [ ] [P0] [S] Show calibration status and pixel spacing in info panel

### 4.3 Performance
- [ ] [P0] [M] Memoize landmark rendering (avoid re‑draw on every zoom/pan)
- [ ] [P1] [M] Implement canvas caching for brightness/contrast (avoid reprocessing full image every slider change)

### 4.4 Testing
- [ ] [P0] [M] Unit tests for zoom/pan math and brightness/contrast transform
- [ ] [P1] [L] E2E test (or manual test plan) for viewer interactions

---

## Phase 5: Landmark Detection & Display (P0)

### 5.1 Analysis Selection & Trigger
- [ ] [P0] [S] Analysis type dropdown (fetched from backend: Steiner, McNamara, etc.)
- [ ] [P0] [S] “Run AI Detection” button (only enabled when case has image + calibration)
- [ ] [P0] [S] Loading state (spinner + progress text) during detection

### 5.2 Landmark Visualization
- [ ] [P0] [M] On detection success:
  - [ ] Display each landmark as a colored circle (color by confidence: green>0.8, yellow 0.6‑0.8, red<0.6)
  - [ ] Show confidence score on hover tooltip
  - [ ] List of detected landmarks in sidebar (with confidence)
- [ ] [P0] [S] Detection summary toast (e.g., “42 landmarks detected, 3 low confidence”)

### 5.3 Testing
- [ ] [P0] [M] Mock tRPC detection call – test loading, error, and success UI states

---

## Phase 6: Landmark Editing & Audit (P0)

### 6.1 Drag‑to‑Edit
- [ ] [P0] [L] Make landmarks draggable (interaction with canvas coordinates)
  - [ ] On drag end, open **mandatory** dialog: “Reason for adjustment” (free text + dropdown: “AI error”, “Anatomy unclear”, “Clinician correction”)
  - [ ] Track adjustment: original coordinates, new coordinates, reason, timestamp, user
- [ ] [P0] [M] Show adjustment history per landmark (in sidebar or modal)

### 6.2 Save Landmarks
- [ ] [P0] [M] “Save Landmarks” button:
  - [ ] Confirm dialog if unsaved changes exist
  - [ ] Send both AI‑detected and manually adjusted landmarks to backend
  - [ ] Show success / error toast
- [ ] [P0] [S] Disable save if no changes or if calibration missing

### 6.3 Testing
- [ ] [P0] [M] Unit tests for coordinate conversion (canvas ↔ image)
- [ ] [P1] [M] Component test for drag + reason dialog flow

---

## Phase 7: Results Dashboard & Measurements (P0)

### 7.1 Measurements Table
- [ ] [P0] [M] Table grouped by category (angular, linear, ratios) with:
  - [ ] Measurement name, value, unit, normal range, status (normal / abnormal)
  - [ ] Colour‑coded status (green / red) + warning icon for borderline
- [ ] [P0] [S] Sorting and filtering (by category, status, name)

### 7.2 Diagnosis & Treatment
- [ ] [P0] [M] Diagnosis summary card:
  - [ ] Skeletal class (I, II, III)
  - [ ] Vertical pattern (normal, open bite, deep bite)
  - [ ] Incisor inclinations, soft tissue profile
- [ ] [P0] [M] Treatment plan card (type, name, description, rationale, risks, duration, evidence)
- [ ] [P0] [S] Overlay visualization images (pre‑/post‑treatment overlays, if available)

### 7.3 Testing
- [ ] [P0] [M] Unit tests for measurement status calculation (normal vs abnormal)
- [ ] [P0] [M] Component test for measurements table rendering and filtering

---

## Phase 8: Report Generation & Export (P1)

### 8.1 Report Builder
- [ ] [P1] [M] Report generation form with checkboxes:
  - [ ] Include patient info
  - [ ] Include measurements (full or selected categories)
  - [ ] Include diagnosis summary
  - [ ] Include treatment plan
  - [ ] Include landmark adjustment audit log (optional)
- [ ] [P1] [M] Integration with backend report endpoint (PDF and Word)
- [ ] [P1] [S] Export progress indicator (polling or websocket for long reports)

### 8.2 Report UI
- [ ] [P1] [S] Add “Generate Report” button on ResultsPage
- [ ] [P1] [S] Format selector (PDF / Word)
- [ ] [P1] [S] Include report metadata (analysis date, analysis type, clinician name)

### 8.3 Testing
- [ ] [P1] [M] Mock report generation – test loading and success/error states

---

## Phase 9: Polish, Performance & Accessibility (P0/P1)

### 9.1 Responsive & Mobile
- [ ] [P0] [M] Ensure viewer works on tablet (touch pan/zoom, draggable landmarks)
- [ ] [P1] [M] Responsive layout for patient/case lists and forms

### 9.2 Accessibility
- [ ] [P0] [M] Keyboard navigation for viewer (zoom, pan, landmark selection)
- [ ] [P0] [M] ARIA labels on all interactive elements
- [ ] [P1] [M] High contrast mode support + focus indicators

### 9.3 Performance
- [ ] [P0] [M] Lazy load viewer and heavy components (React.lazy + Suspense)
- [ ] [P0] [S] Virtualize long tables (measurements, patient list)
- [ ] [P1] [M] Implement requestIdleCallback for non‑critical UI updates

### 9.4 Error Handling & Edge Cases
- [ ] [P0] [M] Global error boundary with fallback UI
- [ ] [P0] [M] Graceful degradation when image fails to load or calibration missing
- [ ] [P0] [S] Network status detection (offline indicator, auto‑retry)

### 9.5 Empty & Loading States
- [ ] [P0] [S] Skeletons for all data‑fetching pages (patients, cases, results)
- [ ] [P0] [S] Empty states with call‑to‑action (e.g., “No patients yet – create one”)

---

## Phase 10: Deployment & CI/CD (P0)

### 10.1 Build & Deploy
- [ ] [P0] [M] Configure production build (minification, chunk splitting, asset hashing)
- [ ] [P0] [M] Dockerfile for frontend (nginx serving static files)
- [ ] [P0] [M] GitHub Actions / GitLab CI:
  - [ ] Run lint, typecheck, tests on PR
  - [ ] Build and deploy to staging on merge to main
  - [ ] Manual approval for production deployment

### 10.2 Monitoring & Analytics
- [ ] [P1] [S] Integrate Sentry (or similar) for error tracking
- [ ] [P2] [S] Add basic usage analytics (optional, with consent)

---

## Cross‑Cutting Acceptance Criteria (must be true for all phases)

- [ ] **TypeScript strict** – no `any`, all props and API responses typed
- [ ] **No console errors/warnings** in production build
- [ ] **All tests pass** (unit + integration) before merge
- [ ] **Design system consistency** – all components use design tokens
- [ ] **Toast notifications** for every user action (success / error)
- [ ] **Loading states** for any async operation >200ms
- [ ] **Error messages** are user‑friendly (no raw API errors)

---

## Notes for Developers

- **Backend naming** must match exactly: `StudyType` = `"Lateral" | "PA" | "CBCT"`, `AnalysisType` = `"Steiner" | "McNamara" | "Ricketts"` (etc.)
- **Landmark adjustment reason** is mandatory – enforce on the frontend.
- **Calibration** must be completed before AI detection is allowed.
- **Reports** are generated server‑side; frontend only requests and downloads.
- All **image processing** (brightness/contrast) happens client‑side for speed.