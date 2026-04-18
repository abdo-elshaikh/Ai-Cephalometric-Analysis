# AI-Based Cephalometric Analysis & Treatment Planning System

> An intelligent, end-to-end platform for automated orthodontic cephalometric analysis using deep learning.

---

## 🏗️ Architecture

```
CephAnalysis/
├── backend/
│   ├── CephAnalysis.API/           # ASP.NET Core 9 Web API (REST endpoints, auth, file upload)
│   ├── CephAnalysis.Application/   # CQRS commands/queries, DTOs, service interfaces
│   ├── CephAnalysis.Domain/        # Entities, Enums, Domain Events (DDD)
│   ├── CephAnalysis.Infrastructure/ # EF Core, Repositories, Storage, Redis
│   └── CephAnalysis.Shared/        # Result wrappers, Pagination
├── ai_service/                     # FastAPI Python microservice
│   ├── engines/                    # Measurement, Diagnosis, Treatment engines
│   ├── routers/                    # API endpoints (/ai/detect-landmarks etc.)
│   ├── schemas/                    # Pydantic request/response models
│   └── models/                     # AI model weights (HRNet/YOLOv8)
├── frontend/                       # React 18 + TypeScript (Vite)
├── docker/                         # Dockerfiles for all services
├── docker-compose.yml              # Full stack orchestration
└── .env.example                    # Environment variable template
```

## 🚀 Quick Start (Development)

### Prerequisites
- .NET 9 SDK
- Python 3.11+
- Node.js 22+
- Docker Desktop

### 1. Clone & Configure
```bash
cp .env.example .env
# Edit .env with your values
```

### 2. Start Infrastructure (Docker)
```bash
docker compose up postgres redis -d
```

### 3. Run .NET API
```bash
cd src/CephAnalysis.API
dotnet run
# API available at http://localhost:5000
# Swagger UI at http://localhost:5000/swagger
```

### 4. Run AI Microservice
```bash
cd ai_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# AI service at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### 5. Run Frontend
```bash
cd frontend
npm install
npm run dev
# Frontend at http://localhost:5173
```

## 📋 Tech Stack

| Layer | Technology |
|---|---|
| Backend API | ASP.NET Core 9 + Clean Architecture |
| AI Microservice | FastAPI (Python 3.11) |
| AI Model | HRNet / YOLOv8 Pose |
| ML Treatment | scikit-learn |
| LLM Explanation | OpenAI GPT-4o |
| Database | PostgreSQL 16 |
| Caching | Redis 7 |
| Frontend | React 18 + TypeScript + Vite |
| Auth | JWT RS256 + RBAC |
| Storage | AWS S3 / Azure Blob / Local |
| DevOps | Docker + Docker Compose |

## 📊 API Overview

See Swagger UI at `http://localhost:5000/swagger` for full API documentation.

Key endpoint groups:
- `POST /api/auth/login` — Authentication
- `GET/POST /api/patients` — Patient management
- `POST /api/studies/{id}/images` — X-ray upload
- `POST /api/images/{id}/analyze` — Trigger AI analysis
- `GET /api/sessions/{id}/diagnosis` — Get diagnosis
- `GET /api/sessions/{id}/treatment` — Get treatment plan
- `POST /api/sessions/{id}/reports` — Generate PDF report

## 🔒 Security

- JWT RS256 tokens (15-min access + 7-day refresh)
- Role-Based Access Control (Admin | Doctor | Viewer)
- AES-256 encryption for stored DICOM files
- TLS 1.3 enforced in production
- HIPAA-compliant audit logging
- Input validation on all file uploads (format, size ≤ 50MB)

## 🧪 Testing

```bash
# .NET unit + integration tests
dotnet test

# Python AI service tests
cd ai_service && pytest

# E2E tests (Phase 10)
cd tests && npx playwright test
```
# Admin user 

