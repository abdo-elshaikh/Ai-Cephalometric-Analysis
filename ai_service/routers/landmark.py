import time
import base64
import io
from fastapi import APIRouter, HTTPException, Header, Depends
from schemas.schemas import LandmarkDetectionRequest, LandmarkDetectionResponse, LandmarkPoint
from config.settings import settings
from engines import landmark_engine
from utils.security import verify_service_key
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/detect-landmarks", response_model=LandmarkDetectionResponse, dependencies=[Depends(verify_service_key)])
async def detect_landmarks(
    request: LandmarkDetectionRequest
):
    """
    Detect anatomical landmarks on a cephalometric X-ray.

    Accepts base64-encoded preprocessed image and returns landmark coordinates.
    When ``pixel_spacing_mm`` is provided (image has been calibrated), the
    landmark engine uses real-world millimetre distances to validate positions
    and improve confidence scores via anatomical norm checks.
    """
    pixel_spacing = request.pixel_spacing_mm
    if pixel_spacing and pixel_spacing > 0:
        logger.info(
            f"Landmark detection for session {request.session_id} — "
            f"calibrated: {pixel_spacing:.4f} mm/px"
        )
    else:
        logger.info(
            f"Landmark detection for session {request.session_id} — "
            f"no calibration (pixel heuristics only)"
        )

    start = time.time()

    # Decode image bytes
    try:
        padded = request.image_base64 + '=' * (-len(request.image_base64) % 4)
        image_bytes = base64.b64decode(padded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {e}")

    # Run inference through the engine, passing calibration scale
    try:
        landmarks = landmark_engine.infer(
            image_bytes,
            pixel_spacing_mm=pixel_spacing if pixel_spacing and pixel_spacing > 0 else None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model inference failed: {e}")

    inference_ms = int((time.time() - start) * 1000)

    return LandmarkDetectionResponse(
        session_id=request.session_id,
        model_version=settings.model_version,
        landmarks=landmarks,
        inference_ms=inference_ms,
    )
