# CephAnalysis AI Service

Python **FastAPI** microservice for lateral cephalometric analysis: deep-learning landmark detection, automated measurements, clinical diagnosis helpers, AI-assisted treatment suggestions, and publication-style image overlays. It is designed to sit behind the main **.NET API** (or any trusted client) and must not be exposed directly to the public internet without authentication and network controls.

---

## Capabilities

| Area | Description |
|------|-------------|
| **Landmarks** | Loads a PyTorch model at startup and infers anatomical landmarks on radiograph images. |
| **Measurements** | Derives cephalometric measurements from landmarks using norms in `config/analysis_norms.json`. |
| **Diagnosis** | Classifies skeletal/dental patterns from measurement payloads. |
| **Treatment** | Suggests treatment directions; optional LLM integration for narrative justification when API keys are configured. |
| **Overlays** | Renders JPEG overlays (tracing on X-ray, measurement callouts, Björk–Skieller wiggle chart, tracing-only, measurement table). |

Interactive API documentation is available at **`/docs`** (Swagger UI) when the service is running.

---

## Requirements

- **Python** 3.11+ (matches Docker image)
- **PyTorch** CPU wheels (pinned in `requirements.txt`; CUDA builds can be substituted for GPU hosts)
- **Model weights** — place your trained checkpoint at the path configured by `model_path` (see below). Weights are **not** committed to the repository; supply them via volume mount or artifact storage.

---

## Quick start (local)

```bash
cd ai_service
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux / macOS

pip install -r requirements.txt
```

Copy environment template from the repo root (or create `.env` beside `main.py`):

```bash
copy ..\.env.example .env     # Windows — adjust for your setup
```

Set at minimum:

- `SERVICE_KEY` — shared secret; clients must send it in the **`X-Service-Key`** header on protected routes (see [Authentication](#authentication)).
- Paths and device as needed (`model_path`, `device`, etc.).

Run with auto-reload for development:

```bash
python main.py
# Serves http://0.0.0.0:8000 — see main.py
```

Or explicitly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Configuration

Settings are defined in `config/settings.py` and loaded via **pydantic-settings** (environment variables and optional `.env` file).

| Concern | Notes |
|--------|--------|
| **Service key** | Field `service_key` → env **`SERVICE_KEY`**. Must match the `X-Service-Key` header. The repo root `.env.example` uses `AI_SERVICE_KEY` for the .NET API; set **`SERVICE_KEY`** in `ai_service/.env` to the same value (or add a pydantic alias in code if you prefer a single name everywhere). |
| **Model** | `model_path`, `device` (`cpu` / `cuda`), `num_landmarks`, input sizes. |
| **Norms** | `analysis_norms_path` — JSON used for measurement norms and thresholds. |
| **LLM (optional)** | `OPENAI_API_KEY`, `GEMINI_API_KEY` — enable OpenAI / Gemini for features that call `llm_engine`. Omit keys to run non-LLM paths; `/health` reports `missing` vs `available`. |

Never commit real API keys. Use `.env` locally and secrets management in production.

---

## Authentication

Endpoints under `/ai` that perform inference or rendering require the header:

```http
X-Service-Key: <same value as settings.service_key>
```

The public **`GET /health`** endpoint (and **`GET /ai/overlay-types`**) are intended for probes and discovery without the key; all other listed AI routes require a valid key.

---

## HTTP API overview

Base path for feature routes: **`/ai`**.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness / model / LLM provider status |
| `POST` | `/ai/detect-landmarks` | Landmark inference |
| `POST` | `/ai/calculate-measurements` | Measurements from landmarks |
| `GET` | `/ai/analysis-norms` | Norms payload |
| `POST` | `/ai/classify-diagnosis` | Diagnosis classification |
| `POST` | `/ai/suggest-treatment` | Treatment suggestions |
| `GET` | `/ai/overlay-types` | Supported overlay keys and labels |
| `POST` | `/ai/generate-overlays` | One or more overlay JPEGs (base64 in JSON) |
| `POST` | `/ai/generate-overlay/{output_key}` | Single overlay as raw JPEG |

Full request/response schemas are available in **`schemas/schemas.py`** and in the OpenAPI UI at **`/docs`**.

---

## Docker

From the **repository root** (not only `ai_service/`), the stack is defined in `docker-compose.yml`. The AI service is typically built with `docker/Dockerfile.ai`, exposes port **8000**, and expects the model file mounted (for example `./ai_service/models` → `/app/model`).

Align environment variables with `config/settings.py` and your orchestration secrets (e.g. `SERVICE_KEY`, model path inside the container).

---

## Project layout (selected)

```
ai_service/
├── main.py                 # FastAPI app, lifespan (model + norms load)
├── config/                 # settings.py, analysis_norms.json
├── routers/                # landmark, measurement, diagnosis, treatment, overlay
├── engines/                # inference, measurement, diagnosis, treatment, overlay_engine, llm helpers
├── schemas/                # Pydantic models for API I/O
├── utils/                  # security, norms, DICOM helpers
├── requirements.txt
└── scratch/                # ad-hoc tests and experiments (not part of the served API)
```

---

## Operations & troubleshooting

- **Startup** — Logs show model path and device; the landmark model and norms are loaded in the lifespan handler. Failures here usually mean a wrong `model_path` or missing file.
- **Large uploads** — Configure reverse proxy / Uvicorn limits if you send very large images.
- **Push protection / secrets** — Do not commit checkpoints (`.pth` / `.pt`) under `engines/model/` or real API keys; use `.gitignore` and CI secrets.

---

## License & compliance

This service processes medical imaging and metadata. Deploy only in environments that meet your **privacy**, **security**, and **regulatory** requirements (e.g. HIPAA, GDPR). The repository maintainers do not provide legal or clinical compliance guarantees; validate workflows with your organization.

---

## Support

For service behavior and contracts, prefer **`/docs`** and the **`schemas`** package. For integration with the main application, see the parent repository’s documentation and `docker-compose.yml` wiring (`AiService__BaseUrl`, shared keys).
