from fastapi import APIRouter, HTTPException, Header, Depends
from schemas.schemas import TreatmentRequest, TreatmentResponse, TreatmentItem
from engines.treatment_engine import suggest_treatment
from engines.llm_engine import populate_rationales, generate_generative_treatments
from engines.diagnosis_engine import classify_soft_tissue
from config.settings import settings
from utils.security import verify_service_key
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/suggest-treatment", response_model=TreatmentResponse, dependencies=[Depends(verify_service_key)])
async def suggest_treatment_endpoint(
    request: TreatmentRequest
):
    """Generate ranked treatment plan recommendations from diagnosis."""
    logger.info(f"Treatment suggestion requested for session {request.session_id}")

    try:
        # 1. Determine profile status
        ls_eline = request.measurements.get("Ls-Eline")
        li_eline = request.measurements.get("Li-Eline")
        profile_status = classify_soft_tissue(ls_eline, li_eline)

        treatments = []
        ai_success = False

        # 2. Start with Rule-Based Suggestions (Clinical Baseline)
        logger.info("Computing rule-based treatment suggestions.")
        rule_treatments = suggest_treatment(
            skeletal_class=request.skeletal_class,
            vertical_pattern=request.vertical_pattern,
            measurements=request.measurements,
            patient_age=request.patient_age,
            profile=profile_status
        )
        
        # 3. Enhance with Generative AI if key configured
        if settings.openai_api_key:
            logger.info("Integrating Generative AI suggestions...")
            ai_treatments = await generate_generative_treatments(
                skeletal_class=request.skeletal_class,
                vertical_pattern=request.vertical_pattern,
                measurements=request.measurements,
                soft_tissue_profile=profile_status,
                patient_age=request.patient_age
            )
            
            if ai_treatments:
                # Append AI suggestions, marking them as LLM source
                for t in ai_treatments:
                    t["source"] = "LLM"
                    t["plan_index"] += len(rule_treatments) # Offset indices
                treatments = rule_treatments + ai_treatments
                ai_success = True
            else:
                treatments = rule_treatments
        else:
            treatments = rule_treatments

        # 4. Inject LLM rationales for rule-based plans to provide clinical justification
        if settings.openai_api_key and not ai_success:
            logger.info("Populating rationales for rule-based plans...")
            treatments = await populate_rationales(
                treatments, 
                request.skeletal_class, 
                request.vertical_pattern, 
                request.measurements,
                soft_tissue_profile=profile_status
            )
        elif not settings.openai_api_key:
            # Provide static rationales if no AI
            for t in treatments:
                if not t.get("rationale"):
                    t["rationale"] = "Rationale available with AI integration."

    except Exception as e:
        logger.error(f"Treatment suggestion failed: {e}")
        raise HTTPException(status_code=422, detail=f"Treatment suggestion failed: {e}")

    items = [TreatmentItem(**t) for t in treatments]
    return TreatmentResponse(session_id=request.session_id, treatments=items)
