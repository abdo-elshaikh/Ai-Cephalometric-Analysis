from fastapi import APIRouter, HTTPException, Depends
from schemas.schemas import MeasurementRequest, MeasurementResponse, MeasurementItem
from engines.measurement_engine import compute_all_measurements
from utils.norms_util import norms_provider
from utils.security import verify_service_key
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/calculate-measurements",
    response_model=MeasurementResponse,
    dependencies=[Depends(verify_service_key)],
)
async def calculate_measurements(request: MeasurementRequest) -> MeasurementResponse:
    """Compute all cephalometric measurements from detected landmarks."""
    logger.info(f"Measurement computation requested for session {request.session_id}")

    lm_coords = {code: (pt.x, pt.y) for code, pt in request.landmarks.items()}
    landmark_provenance = {
        code: (pt.provenance or "unknown")
        for code, pt in request.landmarks.items()
    }

    try:
        raw = compute_all_measurements(
            lm_coords,
            request.pixel_spacing_mm,
            age=request.patient_age,
            sex=request.patient_sex,
            population=request.population,
            dentition_stage=request.dentition_stage,
            landmark_provenance=landmark_provenance,
            is_cbct_derived=request.is_cbct_derived,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Measurement computation failed: {e}")

    items = [MeasurementItem(**m) for m in raw]
    return MeasurementResponse(session_id=request.session_id, measurements=items)


@router.get(
    "/analysis-norms",
    response_model=dict,
    dependencies=[Depends(verify_service_key)],
)
async def get_analysis_norms() -> dict:
    """Fetch the dynamically loaded clinical norms and standards."""
    norms = norms_provider.get_all_norms()
    if not norms:
        raise HTTPException(
            status_code=500,
            detail="Cephalometric norms could not be loaded on the server.",
        )
    return norms
