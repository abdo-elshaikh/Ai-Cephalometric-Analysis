from fastapi import APIRouter, HTTPException, Header, Depends
from schemas.schemas import DiagnosisRequest, DiagnosisResponse
from engines.diagnosis_engine import classify_diagnosis
from engines.llm_engine import generate_clinical_diagnosis_summary
from config.settings import settings
from utils.security import verify_service_key
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/classify-diagnosis", response_model=DiagnosisResponse, dependencies=[Depends(verify_service_key)])
async def classify_diagnosis_endpoint(
    request: DiagnosisRequest
):
    """Classify skeletal and dental diagnosis from measurement values."""
    logger.info(f"Diagnosis classification requested for session {request.session_id}")

    try:
        # 1. Perform rule-based classification first (Primary classification)
        result = classify_diagnosis(
            request.measurements, 
            sex=request.patient_sex, 
            age=request.patient_age
        )
        
        # 2. Enrich with LLM-generated summary if API key available
        llm_summary = await generate_clinical_diagnosis_summary(
            skeletal_class=result["skeletal_class"],
            vertical_pattern=result["vertical_pattern"],
            measurements=request.measurements,
            soft_tissue_profile=result["soft_tissue_profile"]
        )
        
        if llm_summary:
            result["summary"] = llm_summary
            
    except Exception as e:
        logger.error(f"Diagnosis classification failed: {e}")
        raise HTTPException(status_code=422, detail=f"Diagnosis classification failed: {e}")

    return DiagnosisResponse(session_id=request.session_id, **result)
