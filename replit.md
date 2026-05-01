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
ai_service/            Python FastAPI AI microservice
  engines/             Landmark detection, measurement, diagnosis, treatment
  routers/             API endpoints
  models/              Pydantic schemas
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

## Environment Variables

See `.env.example`:
- `JWT_SECRET_KEY` — JWT signing key
- `AI_SERVICE_KEY` — Internal API key between .NET and AI service
- `POSTGRES_USER/PASSWORD/DB` — Database credentials
- `REDIS_CONNECTION_STRING` — Redis connection
- `OPENAI_API_KEY` — Optional, for LLM treatment justification
- `STORAGE_PROVIDER` — `Local`, `S3`, or `Azure`
- `VITE_BACKEND_API_BASE_URL` — Backend URL (default: http://localhost:5180)

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
