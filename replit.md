# CephAnalysis

An AI-powered medical platform for automated cephalometric analysis and treatment planning. Orthodontists can upload lateral cephalometric X-ray images to automatically detect anatomical landmarks, calculate clinical measurements, generate diagnoses, and suggest treatment plans.

## Architecture

This is a multi-component project:

- **Frontend**: React 19 + TypeScript + Vite (port 5000)
- **Backend**: ASP.NET Core .NET 9 Clean Architecture with CQRS (typically port 5180)
- **AI Microservice**: Python FastAPI with PyTorch/YOLOv8 (typically port 8000)
- **Database**: PostgreSQL 16 with Entity Framework Core
- **Cache**: Redis 7

## Project Structure

```
frontend/         React + Vite frontend app
backend/          ASP.NET Core Clean Architecture solution
  CephAnalysis.API/           API layer (controllers, middleware)
  CephAnalysis.Application/   Business logic, CQRS
  CephAnalysis.Domain/        Domain entities
  CephAnalysis.Infrastructure/ DB context, migrations, services
  CephAnalysis.Shared/        Common DTOs
ai_service/       Python FastAPI AI microservice
  engines/        Landmark detection, measurement, diagnosis
  routers/        API endpoints
  schemas/        Pydantic models
docker/           Dockerfiles
docs/             UML diagrams and documentation
```

## Running in Replit

Only the **frontend** is configured as a workflow (port 5000). The backend and AI service require PostgreSQL, Redis, and ML model weights — they are configured for Docker-based deployments.

### Frontend Workflow
- Command: `cd frontend && npm run dev`
- Port: 5000
- The Vite dev server is configured with `host: '0.0.0.0'` and `allowedHosts: true` for the Replit proxy.

## Environment Variables

See `.env.example` for required configuration:
- `JWT_SECRET_KEY` - JWT signing key
- `AI_SERVICE_KEY` - Internal API key between .NET and AI service
- `POSTGRES_USER/PASSWORD/DB` - Database credentials
- `REDIS_CONNECTION_STRING` - Redis connection
- `OPENAI_API_KEY` - Optional, for LLM treatment justification
- `STORAGE_PROVIDER` - `Local`, `S3`, or `Azure`

## Key Dependencies

### Frontend
- React 19, React Router 7, TypeScript
- TanStack Query (server state), Zustand (client state)
- Konva / React-Konva (X-ray landmark interaction)
- OpenSeadragon (high-res medical image viewing)
- Axios (HTTP client)

### Backend
- .NET 9, MediatR (CQRS), Entity Framework Core
- QuestPDF (PDF report generation)
- JWT RS256 authentication

### AI Service
- FastAPI, PyTorch, YOLOv8/HRNet
- OpenCV, Pillow, scikit-learn
- OpenAI/Gemini LLM integration (multi-provider failover)
- MONAI UNet for professional medical landmark detection

## AI Service — Code Quality Notes

The following best-practice improvements have been applied to `ai_service/`:

- **Security**: `security.py` — uses `secrets.compare_digest` for timing-safe service-key validation.
- **Async correctness**: `llm_engine.py` — uses `asyncio.get_running_loop()` instead of deprecated `get_event_loop()`.
- **Import hygiene**: `landmark_engine.py` — `import math` moved to top of file; `measurement.py` router imports reordered.
- **Silent error elimination**: `measurement_engine.py` — bare `except: pass` replaced with `logger.debug(...)`.
- **Fallback transparency**: `landmark_engine.py` — fallback landmark confidences set to 0.50 so clients can distinguish model-inferred from placeholder points; dummy model sentinel (`"dummy_model_loaded"` string) replaced with `None`.
- **Bug fix**: `diagnosis_engine.py` — incorrect check for Frankfort landmarks in the measurements dict (floats) corrected.
- **LLM JSON mode**: `llm_engine.py` — `response_format=json_object` now correctly applied to all GPT-4o/GPT-4o-mini models.
- **Treatment rationale**: `treatment.py` router — LLM rationale enrichment is now applied to rule-based plans whenever any LLM provider (OpenAI or Gemini) is configured.
- **`_llm_available()` helper**: centralised check for either LLM key being present.
- **Typo fix**: `treatment_engine.py` — "Advancment" → "Advancement" in Le Fort I surgery name.
- **DICOM windowing**: `dicom_util.py` — applies DICOM WindowCenter/WindowWidth when available for clinically accurate rendering.
- **Norms utility refactor**: `norms_util.py` — `_iter_analyses()` and `_find_measurement()` helpers eliminate duplicated search logic across all lookup methods.
