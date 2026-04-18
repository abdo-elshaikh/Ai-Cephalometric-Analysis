from fastapi import FastAPI, Request, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import traceback
import time
from routers import landmark, measurement, diagnosis, treatment, overlay
from config.settings import settings

START_TIME = time.time()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "type": "https://httpstatuses.com/500",
            "title": "An unexpected error occurred",
            "status": 500,
            "instance": str(request.url)
        }
    )


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "type": f"https://httpstatuses.com/{exc.status_code}",
            "title": "API Request Error",
            "status": exc.status_code,
            "instance": str(request.url)
        }
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error for {request.url}: {exc.errors()}\nBody: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "body": str(await request.body()),
            "type": "https://httpstatuses.com/422",
            "title": "Validation Error",
            "status": 422,
            "instance": str(request.url)
        }
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 AI Service starting up...")
    logger.info(f"   Model path: {settings.model_path}")
    logger.info(f"   Device: {settings.device}")
    
    # Actually boot the PyTorch model into memory!
    from engines.landmark_engine import load_model
    load_model(settings.model_path, settings.device)
    
    # Load analysis norms into memory
    from utils.norms_util import norms_provider
    norms_provider.load(settings.analysis_norms_path)
    
    yield
    logger.info("🛑 AI Service shutting down...")


app = FastAPI(
    title="CephAnalysis AI Service",
    description="AI microservice for cephalometric landmark detection, "
                "measurement, diagnosis, and treatment planning",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(Exception, global_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

# Register routers
app.include_router(landmark.router, prefix="/ai", tags=["Landmark Detection"])
app.include_router(measurement.router, prefix="/ai", tags=["Measurements"])
app.include_router(diagnosis.router, prefix="/ai", tags=["Diagnosis"])
app.include_router(treatment.router, prefix="/ai", tags=["Treatment Planning"])
app.include_router(overlay.router,   prefix="/ai", tags=["Overlay"])


@app.get("/health", tags=["Health"])
async def health_check():
    """Detailed telemetry endpoint for dashboard visualization."""
    from engines.landmark_engine import _model
    
    return {
        "status": "healthy",
        "uptime_seconds": int(time.time() - START_TIME),
        "service": "CephAnalysis AI Service",
        "version": "1.0.0",
        "engine": {
            "model_loaded": _model is not None,
            "device": settings.device,
            "landmarks_count": settings.num_landmarks
        },
        "providers": {
            "openai": "available" if settings.openai_api_key else "missing",
            "gemini": "available" if settings.gemini_api_key else "missing"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
