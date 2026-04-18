"""
routers/overlay.py
==================
Endpoints for generating cephalometric image overlays.

POST /ai/generate-overlays
    Generates all requested overlay images (up to 5) from a single base64 X-ray
    and a landmark + measurement payload.  Returns each image as a base64-encoded
    JPEG together with its dimensions and a human-readable label.

GET  /ai/overlay-types
    Returns the list of supported overlay output keys and their descriptions.
"""

import base64
import io
import time
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from PIL import Image

from schemas.schemas import (
    OverlayRequest, OverlayResponse, OverlayImageItem, LandmarkPoint as SchemaLandmarkPoint
)
from engines.overlay_engine import (
    OverlayRequest as EngineRequest,
    LandmarkPoint   as EngineLandmark,
    MeasurementItem  as EngineMeasurement,
    render_all,
    render_xray_with_tracing,
    render_xray_with_measurements,
    render_wiggle_chart,
    render_tracing_only,
    render_measurement_table,
)
from utils.security import verify_service_key

logger = logging.getLogger(__name__)
router = APIRouter()

# ─────────────────────────────────────────────
#  Supported overlay types
# ─────────────────────────────────────────────
OVERLAY_META: dict[str, str] = {
    "xray_tracing":      "X-ray with anatomical tracing + Steiner analysis lines",
    "xray_measurements": "X-ray with color-coded measurement value annotations",
    "wiggle_chart":      "Wiggle deviation chart (Björk–Skieller style)",
    "tracing_only":      "Pure anatomical tracing on white background with measurements",
    "measurement_table": "Measurement table with norm values and Wiggle bars",
}

RENDER_FN = {
    "xray_tracing":      render_xray_with_tracing,
    "xray_measurements": render_xray_with_measurements,
    "wiggle_chart":      render_wiggle_chart,
    "tracing_only":      render_tracing_only,
    "measurement_table": render_measurement_table,
}

HUMAN_LABELS: dict[str, str] = {
    "xray_tracing":      "Tracing on X-ray",
    "xray_measurements": "Measurements on X-ray",
    "wiggle_chart":      "Deviation Chart",
    "tracing_only":      "Clinical Tracing",
    "measurement_table": "Measurement Table",
}


# ─────────────────────────────────────────────
#  Helper: schema → engine conversion
# ─────────────────────────────────────────────
def _build_engine_request(req: OverlayRequest, image_bytes: bytes) -> EngineRequest:
    """Convert the Pydantic schema request into the engine's internal DTO."""
    landmarks: dict[str, EngineLandmark] = {
        name: EngineLandmark(
            x=lm.x,
            y=lm.y,
            name=name,
            confidence=lm.confidence if lm.confidence is not None else 1.0,
        )
        for name, lm in req.landmarks.items()
    }

    measurements: list[EngineMeasurement] = [
        EngineMeasurement(
            code=m.code,
            name=m.name,
            value=m.value,
            unit=m.unit,
            normal_value=m.normal_value,
            std_deviation=m.std_deviation,
            difference=m.difference,
            group_name=m.group_name or "General",
            status=m.status or "Normal",
        )
        for m in req.measurements
    ]

    return EngineRequest(
        image_bytes=image_bytes,
        landmarks=landmarks,
        measurements=measurements,
        patient_label=req.patient_label or "",
        date_label=req.date_label or "",
        scale_bar_mm=req.scale_bar_mm,
        pixel_spacing_mm=req.pixel_spacing_mm,
        analysis_method=req.analysis_method or "Full",
    )


def _image_meta(jpeg_bytes: bytes) -> tuple[int, int]:
    """Return (width, height) from JPEG bytes."""
    with Image.open(io.BytesIO(jpeg_bytes)) as im:
        return im.size


# ─────────────────────────────────────────────
#  Endpoints
# ─────────────────────────────────────────────

@router.get("/overlay-types", tags=["Overlay"])
async def list_overlay_types():
    """
    Returns all supported overlay output keys with descriptions.
    """
    return {
        "overlay_types": [
            {"key": k, "label": HUMAN_LABELS[k], "description": v}
            for k, v in OVERLAY_META.items()
        ]
    }


@router.post(
    "/generate-overlays",
    response_model=OverlayResponse,
    dependencies=[Depends(verify_service_key)],
    tags=["Overlay"],
)
async def generate_overlays(req: OverlayRequest):
    """
    Generate one or more cephalometric overlay images.

    **Inputs:**
    - `image_base64`: Base64-encoded X-ray image (JPEG/PNG)
    - `landmarks`: Dictionary of landmark name → {x, y} coordinates (pixel space)
    - `measurements`: List of measurement objects (optional – needed for value overlays)
    - `outputs`: List of overlay keys to generate (default: all 5)
    - `patient_label` / `date_label`: Optional header text
    - `scale_bar_mm` / `pixel_spacing_mm`: Optional scale bar parameters

    **Returns:** Each requested image as a base64-encoded JPEG with dimensions.
    """
    logger.info(
        f"[overlay] session={req.session_id}  "
        f"landmarks={len(req.landmarks)}  "
        f"measurements={len(req.measurements)}  "
        f"outputs={req.outputs}"
    )

    # ── Decode image ─────────────────────────────────────────────────────────
    start = time.time()
    try:
        padded      = req.image_base64 + '=' * (-len(req.image_base64) % 4)
        image_bytes = base64.b64decode(padded)
        # Validate that PIL can open it
        Image.open(io.BytesIO(image_bytes)).verify()
        image_bytes = base64.b64decode(padded)   # re-decode – verify() exhausts the stream
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {e}")

    # ── Validate landmark count ──────────────────────────────────────────────
    if not req.landmarks:
        raise HTTPException(status_code=400, detail="landmarks dict is empty")

    # ── Validate output keys ─────────────────────────────────────────────────
    unknown = [o for o in req.outputs if o not in OVERLAY_META]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown output key(s): {unknown}. "
                   f"Valid keys: {list(OVERLAY_META.keys())}"
        )

    # ── Build engine request ─────────────────────────────────────────────────
    try:
        engine_req = _build_engine_request(req, image_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to build overlay request: {e}")

    # ── Render requested outputs ──────────────────────────────────────────────
    rendered: list[OverlayImageItem] = []

    for key in req.outputs:
        if key not in RENDER_FN:
            continue
        try:
            jpeg_bytes = RENDER_FN[key](engine_req)
            w, h       = _image_meta(jpeg_bytes)
            b64        = base64.b64encode(jpeg_bytes).decode("utf-8")
            rendered.append(OverlayImageItem(
                key=key,
                label=HUMAN_LABELS.get(key, key),
                image_base64=b64,
                width=w,
                height=h,
            ))
            logger.info(f"[overlay] ✓ {key}  {w}×{h}  ({len(jpeg_bytes)//1024} KB)")
        except Exception as e:
            logger.error(f"[overlay] ✗ {key}  {e}", exc_info=True)
            # Don't abort the whole request — skip failed outputs

    if not rendered:
        raise HTTPException(
            status_code=500,
            detail="All requested overlays failed to render. Check logs for details."
        )

    render_ms = int((time.time() - start) * 1000)
    logger.info(f"[overlay] session={req.session_id}  rendered={len(rendered)}/{len(req.outputs)}  {render_ms}ms")

    return OverlayResponse(
        session_id=req.session_id,
        images=rendered,
        render_ms=render_ms,
    )


@router.post(
    "/generate-overlay/{output_key}",
    dependencies=[Depends(verify_service_key)],
    tags=["Overlay"],
)
async def generate_single_overlay(output_key: str, req: OverlayRequest):
    """
    Generate a single specific overlay output and return raw JPEG bytes
    (Content-Type: image/jpeg) — useful for direct preview / embedding in reports.
    """
    if output_key not in OVERLAY_META:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown overlay key '{output_key}'. "
                   f"Valid keys: {list(OVERLAY_META.keys())}"
        )

    try:
        padded      = req.image_base64 + '=' * (-len(req.image_base64) % 4)
        image_bytes = base64.b64decode(padded)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image data: {e}")

    try:
        engine_req = _build_engine_request(req, image_bytes)
        jpeg_bytes = RENDER_FN[output_key](engine_req)
    except Exception as e:
        logger.error(f"[overlay] single render failed for {output_key}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Render failed: {e}")

    from fastapi.responses import Response
    return Response(content=jpeg_bytes, media_type="image/jpeg")
