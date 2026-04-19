from fastapi import APIRouter, HTTPException, Depends
from schemas.schemas import TreatmentRequest, TreatmentResponse, TreatmentItem
from engines.treatment_engine import suggest_treatment
from engines.llm_engine import populate_rationales, generate_generative_treatments, _llm_available
from engines.diagnosis_engine import classify_soft_tissue
from config.settings import settings
from utils.security import verify_service_key
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/suggest-treatment",
    response_model=TreatmentResponse,
    dependencies=[Depends(verify_service_key)],
)
async def suggest_treatment_endpoint(request: TreatmentRequest) -> TreatmentResponse:
    """Generate ranked treatment plan recommendations from a diagnosis."""
    logger.info(f"Treatment suggestion requested for session {request.session_id}")

    try:
        # 1. Determine soft-tissue profile status
        ls_eline = request.measurements.get("Ls-Eline")
        li_eline = request.measurements.get("Li-Eline")
        profile_status = classify_soft_tissue(ls_eline, li_eline)

        # 2. Rule-based clinical baseline (always performed)
        logger.info("Computing rule-based treatment suggestions.")
        rule_treatments = suggest_treatment(
            skeletal_class=request.skeletal_class,
            vertical_pattern=request.vertical_pattern,
            measurements=request.measurements,
            patient_age=request.patient_age,
            profile=profile_status,
        )

        treatments: list[dict] = []
        ai_plans_added = False

        # 3. Enrich with Generative AI suggestions when any LLM provider is configured
        if _llm_available():
            logger.info("Requesting generative AI treatment suggestions...")
            ai_treatments = await generate_generative_treatments(
                skeletal_class=request.skeletal_class,
                vertical_pattern=request.vertical_pattern,
                measurements=request.measurements,
                soft_tissue_profile=profile_status,
                patient_age=request.patient_age,
            )

            if ai_treatments:
                for t in ai_treatments:
                    t["source"] = "LLM"
                    t["plan_index"] += len(rule_treatments)
                treatments = rule_treatments + ai_treatments
                ai_plans_added = True
            else:
                logger.warning("Generative AI treatments unavailable; using rule-based only.")
                treatments = rule_treatments
        else:
            treatments = rule_treatments

        # 4. Inject LLM rationales for rule-based plans
        #    Always do this when AI is available, regardless of whether AI plans were added.
        if _llm_available():
            logger.info("Populating LLM rationales for rule-based plans...")
            rule_slice = treatments[: len(rule_treatments)]
            enriched = await populate_rationales(
                rule_slice,
                request.skeletal_class,
                request.vertical_pattern,
                request.measurements,
                soft_tissue_profile=profile_status,
            )
            treatments = enriched + treatments[len(rule_treatments):]
        else:
            # Static fallback when no LLM is configured
            for t in treatments:
                if not t.get("rationale"):
                    t["rationale"] = "AI-generated rationale available when an LLM API key is configured."

    except Exception as e:
        logger.error(f"Treatment suggestion failed: {e}", exc_info=True)
        raise HTTPException(status_code=422, detail=f"Treatment suggestion failed: {e}")

    items = [TreatmentItem(**t) for t in treatments]
    return TreatmentResponse(session_id=request.session_id, treatments=items)
