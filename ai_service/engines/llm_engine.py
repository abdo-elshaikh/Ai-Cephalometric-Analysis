"""
LLM Engine — Multi-provider AI text generation for clinical diagnosis summaries,
treatment rationales, and generative treatment plans.

Provider chain (for all functions):
  1. OpenAI  (primary  — async, fast, with tenacity retry for transient errors)
  2. Gemini  (fallback — sync wrapped in asyncio executor)

Design principles:
  - Gemini client is initialised once as a lazy singleton.
  - Prompts include measurement deviations from JSON norms for evidence-based AI.
  - All JSON extraction uses raw_decode for correct nested-object parsing.
  - Tenacity exponential-backoff retry prevents premature Gemini fallback on 429s.
  - Exceptions are always logged with context; callers receive None on failure.
"""

import asyncio
import logging
import json
import re
from typing import Any, Optional
from openai import AsyncOpenAI, RateLimitError, APIConnectionError, APITimeoutError
from google import genai
from tenacity import (
    retry, stop_after_attempt, wait_exponential,
    retry_if_exception_type, before_sleep_log,
)
from config.settings import settings
from utils.norms_util import norms_provider

logger = logging.getLogger(__name__)

# ── Client Initialisation ─────────────────────────────────────────────────────

# OpenAI — async client; None when key is absent
openai_client: Optional[AsyncOpenAI] = (
    AsyncOpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None
)

# Gemini — lazy singleton to avoid re-instantiating on every call
_gemini_client: Optional[genai.Client] = None


def _get_gemini_client() -> Optional[genai.Client]:
    """Return the shared Gemini client, initialising it on first use."""
    global _gemini_client
    if _gemini_client is None and settings.gemini_api_key:
        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


def _llm_available() -> bool:
    """Return True if at least one LLM provider is configured."""
    return bool(settings.openai_api_key or settings.gemini_api_key)


# ── Shared Helpers ────────────────────────────────────────────────────────────

def _build_deviation_table(measurements: dict[str, float]) -> str:
    """
    Build a professional deviation table using 'Code: Value Unit' schema.
    Example row: 'ANB: 6.0° (norm 2.0°, +4.0° above range [0.0-4.0])'
    """
    rows: list[str] = []
    for code, value in measurements.items():
        rng = norms_provider.get_norm_range(code)
        mean = norms_provider.get_norm_mean(code)
        unit = "mm" if any(x in code.upper() for x in ["MM", "OVERJET", "OVERBITE", "DIST"]) else "°"

        if rng is None or mean is None:
            rows.append(f"{code}: {value:.1f}{unit}")
            continue

        lo, hi = rng
        if value < lo:
            status = f"-{lo - value:.1f}{unit} below norm"
        elif value > hi:
            status = f"+{value - hi:.1f}{unit} above norm"
        else:
            status = "within normal range"

        rows.append(
            f"{code}: {value:.1f}{unit} "
            f"(norm {mean:.1f}{unit}, {status} [{lo:.1f}-{hi:.1f}])"
        )
    return "\n".join(rows) if rows else "No measurements provided."


def _extract_json(raw: str) -> Any:
    """
    Robustly extract a JSON value from an LLM response that may contain
    markdown fences, preamble text, or bare arrays.

    Uses json.JSONDecoder.raw_decode() for correct handling of nested
    objects and arrays (greedy regex fails on deeply-nested structures).
    """
    # Strip markdown code fences
    cleaned = re.sub(r"```(?:json)?\s*", "", raw).replace("```", "").strip()

    # Attempt direct parse first (fastest path)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Find the first '{' or '[' and use raw_decode for correct balanced parsing
    decoder = json.JSONDecoder()
    for start_char in ('{', '['):
        idx = cleaned.find(start_char)
        if idx != -1:
            try:
                obj, _ = decoder.raw_decode(cleaned, idx)
                return obj
            except json.JSONDecodeError:
                continue

    raise ValueError(f"Could not extract JSON from LLM response: {raw[:200]}")


async def _gemini_generate(prompt: str, timeout: float = 15.0, image_base64: Optional[str] = None) -> str:
    """
    Run a Gemini generation call in a thread-pool executor (Gemini SDK is synchronous).
    Raises asyncio.TimeoutError when the call exceeds `timeout` seconds.
    """
    client = _get_gemini_client()
    if client is None:
        raise RuntimeError("Gemini API key not configured.")

    def _sync_call() -> str:
        contents = []
        if image_base64:
            import base64
            from google.genai import types
            try:
                b64_data = image_base64.split(",")[-1] if "," in image_base64 else image_base64
                image_bytes = base64.b64decode(b64_data)
                contents.append(types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"))
            except Exception as e:
                logger.warning(f"Failed to decode image for Gemini: {e}")
        
        contents.append(prompt)
        
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=contents,
        )
        return response.text.strip()

    loop = asyncio.get_running_loop()
    return await asyncio.wait_for(
        loop.run_in_executor(None, _sync_call),
        timeout=timeout,
    )


# ── Treatment Rationale ───────────────────────────────────────────────────────

async def generate_treatment_rationale(
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    treatment_name: str,
    treatment_type: str,
    soft_tissue_profile: str = "Unknown",
) -> str | None:
    """
    Generate a 2-sentence clinical rationale for a specific treatment plan.
    Tries OpenAI first, falls back to Gemini.
    """
    system_prompt = (
        "You are an expert consultant orthodontist writing a clinical case note. "
        "Given a patient's cephalometric findings and their deviations from established norms, "
        "write a concise 2-sentence mechanical and orthopedic rationale explaining why the "
        "indicated treatment is appropriate. Be specific — reference the patient's measurements, "
        "not generic descriptions."
    )

    deviation_table = _build_deviation_table(measurements)

    user_prompt = (
        f"Patient Summary:\n"
        f"  Skeletal Class  : {skeletal_class}\n"
        f"  Vertical Pattern: {vertical_pattern}\n"
        f"  Soft Tissue     : {soft_tissue_profile}\n\n"
        f"Cephalometric Measurements (with norm deviations):\n{deviation_table}\n\n"
        f"Proposed Treatment: {treatment_name} ({treatment_type})\n\n"
        f"Write the 2-sentence clinical rationale:"
    )

    # ── Provider 1: OpenAI (with tenacity retry for transient errors) ─────────
    if openai_client:
        @retry(
            retry=retry_if_exception_type((RateLimitError, APIConnectionError, APITimeoutError)),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            stop=stop_after_attempt(3),
            before_sleep=before_sleep_log(logger, logging.WARNING),
            reraise=False,
        )
        async def _openai_rationale() -> str:
            resp = await openai_client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                temperature=0.4,
                max_tokens=180,
                timeout=10,
            )
            return resp.choices[0].message.content.strip()

        try:
            text = await _openai_rationale()
            logger.debug(f"OpenAI rationale OK for '{treatment_name}'")
            return text
        except Exception as e:
            logger.warning(f"OpenAI rationale failed for '{treatment_name}': {e}")

    # ── Provider 2: Gemini ────────────────────────────────────────────────────
    try:
        text = await _gemini_generate(f"{system_prompt}\n\n{user_prompt}", timeout=12)
        logger.debug(f"Gemini rationale OK for '{treatment_name}'")
        return text
    except Exception as e:
        logger.error(f"Gemini rationale failed for '{treatment_name}': {e}")

    return None


# ── Concurrent Rationale Population ──────────────────────────────────────────

async def populate_rationales(
    treatments: list[dict],
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    soft_tissue_profile: str = "Unknown",
) -> list[dict]:
    """
    Concurrently enrich all treatment plans with AI-generated rationales.
    Falls back gracefully to existing rule-based templates on any failure.
    """
    tasks = [
        generate_treatment_rationale(
            skeletal_class, vertical_pattern, measurements,
            t["treatment_name"], t["treatment_type"], soft_tissue_profile,
        )
        for t in treatments
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning(
                f"Rationale generation failed for plan "
                f"'{treatments[i].get('treatment_name')}': {result}"
            )
        elif isinstance(result, str) and len(result) > 10:
            treatments[i]["rationale"] = result
        # else: keep existing rule-based template

    return treatments


# ── Clinical Diagnosis Summary ────────────────────────────────────────────────

async def generate_clinical_diagnosis_summary(
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    soft_tissue_profile: str = "Unknown",
) -> str | None:
    """
    Generate a 100-150 word professional clinical diagnostic summary.
    Tries OpenAI first, falls back to Gemini.
    """
    system_prompt = (
        "You are a senior consultant orthodontist writing a formal clinical case summary. "
        "Describe the patient's skeletal, dental, and soft-tissue relationship in 100-150 words. "
        "Reference specific measurement values and their clinical significance. "
        "Use appropriate clinical terminology (e.g., retrognathic, hyperdivergent, proclined). "
        "Do not suggest treatment — this is a diagnostic description only."
    )

    deviation_table = _build_deviation_table(measurements)

    user_prompt = (
        f"Cephalometric Diagnosis:\n"
        f"  Skeletal Class  : {skeletal_class}\n"
        f"  Vertical Pattern: {vertical_pattern}\n"
        f"  Soft Tissue     : {soft_tissue_profile}\n\n"
        f"Measurements (with deviation from norms):\n{deviation_table}\n\n"
        f"Write the 100-150 word clinical summary:"
    )

    # ── Provider 1: OpenAI ────────────────────────────────────────────────────
    if openai_client:
        try:
            resp = await openai_client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                temperature=0.4,
                max_tokens=280,
                timeout=14,
            )
            text = resp.choices[0].message.content.strip()
            logger.debug("OpenAI clinical summary OK")
            return text
        except Exception as e:
            logger.warning(f"OpenAI clinical summary failed: {e}")

    # ── Provider 2: Gemini ────────────────────────────────────────────────────
    try:
        text = await _gemini_generate(f"{system_prompt}\n\n{user_prompt}", timeout=18)
        logger.debug("Gemini clinical summary OK")
        return text
    except Exception as e:
        logger.error(f"Gemini clinical summary failed: {e}")

    return None


# ── Generative Treatment Plans ────────────────────────────────────────────────

_TREATMENT_JSON_SCHEMA = (
    "Return a JSON object with a single key 'treatments' containing an array of exactly 3 objects. "
    "Each object MUST have these fields: "
    "plan_index (int, 0-based), treatment_type (string), treatment_name (string), "
    "description (string, 1-2 sentences), rationale (string, 1-2 sentences), "
    "risks (string), estimated_duration_months (int), confidence_score (float 0-1), "
    "is_primary (bool, true only for index 0), source (string, always 'LLM'). "
    "Return ONLY the JSON — no markdown, no preamble."
)

# Models known to support JSON-mode response format
_JSON_MODE_MODELS = {"gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4-turbo-preview"}


def _supports_json_mode(model_name: str) -> bool:
    return any(m in model_name for m in _JSON_MODE_MODELS)


async def generate_generative_treatments(
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    soft_tissue_profile: str,
    patient_age: float | None = None,
    image_base64: str | None = None,
) -> list[dict] | None:
    """
    Generate 3 evidence-based treatment plans from an LLM.
    Tries OpenAI first, falls back to Gemini.
    """
    system_prompt = (
        "You are an expert orthodontic consultant with 20 years of clinical experience. "
        "Analyse the patient's cephalometric data — including deviations from established norms — "
        "and propose exactly 3 evidence-based treatment plans ranked by suitability. "
        f"{_TREATMENT_JSON_SCHEMA}"
    )

    deviation_table = _build_deviation_table(measurements)
    norm_context = norms_provider.build_norm_context_for_llm(list(measurements.keys())[:12])

    context = (
        f"Patient Profile:\n"
        f"  Age             : {patient_age if patient_age else 'Not specified'}\n"
        f"  Skeletal Class  : {skeletal_class}\n"
        f"  Vertical Pattern: {vertical_pattern}\n"
        f"  Soft Tissue     : {soft_tissue_profile}\n\n"
        f"Cephalometric Measurements (patient value vs. norms):\n{deviation_table}\n\n"
        f"Normative Reference Summary:\n{norm_context}"
    )

    def _parse_treatments(raw: str) -> list[dict] | None:
        """Parse and validate the JSON treatment array from an LLM response."""
        try:
            data = _extract_json(raw)
        except ValueError as e:
            logger.warning(f"JSON extraction failed: {e}")
            return None

        plans = data.get("treatments", data) if isinstance(data, dict) else data
        if not isinstance(plans, list) or len(plans) == 0:
            logger.warning(f"Unexpected treatment structure: {type(data)}")
            return None

        required = {"plan_index", "treatment_type", "treatment_name",
                    "description", "confidence_score", "is_primary"}
        validated: list[dict] = []
        for i, plan in enumerate(plans[:3]):
            if not isinstance(plan, dict) or not required.issubset(plan.keys()):
                logger.warning(f"Plan {i} missing required fields, skipping.")
                continue
            plan.setdefault("source", "LLM")
            plan.setdefault("rationale", "")
            plan.setdefault("risks", "Standard orthodontic risks apply.")
            plan.setdefault("estimated_duration_months", 18)
            validated.append(plan)

        return validated if validated else None

    # ── Provider 1: OpenAI ────────────────────────────────────────────────────
    if openai_client:
        try:
            response_format = (
                {"type": "json_object"} if _supports_json_mode(settings.openai_model) else None
            )
            
            user_content = []
            user_content.append({"type": "text", "text": context})
            if image_base64:
                b64_data = image_base64.split(",")[-1] if "," in image_base64 else image_base64
                user_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{b64_data}"}
                })
                
            resp = await openai_client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_content},
                ],
                response_format=response_format,
                temperature=0.5,
                max_tokens=1200,
                timeout=18,
            )
            raw = resp.choices[0].message.content.strip()
            plans = _parse_treatments(raw)
            if plans:
                logger.info(f"OpenAI generated {len(plans)} treatment plans.")
                return plans
        except Exception as e:
            logger.warning(f"OpenAI generative treatments failed: {e}")

    # ── Provider 2: Gemini ────────────────────────────────────────────────────
    try:
        full_prompt = f"{system_prompt}\n\nClinical Context:\n{context}"
        raw = await _gemini_generate(full_prompt, timeout=22, image_base64=image_base64)
        plans = _parse_treatments(raw)
        if plans:
            logger.info(f"Gemini generated {len(plans)} treatment plans.")
            return plans
        logger.warning("Gemini returned unparseable treatment JSON.")
    except Exception as e:
        logger.error(f"Gemini generative treatments failed: {e}")

    return None


# ── Explainable AI (XAI) — Decision Transparency ─────────────────────────────

_XAI_JSON_SCHEMA = (
    "Return a JSON object with exactly these keys: "
    "\"decision_chain\" (array of objects each with \"step\" (int), \"factor\" (str), \"evidence\" (str), \"impact\" (str 'High'|'Medium'|'Low')), "
    "\"key_drivers\" (array of strings, max 3), "
    "\"uncertainty_factors\" (array of strings), "
    "\"clinical_confidence\" (str 'High'|'Moderate'|'Low'), "
    "\"alternative_interpretation\" (str). "
    "Return ONLY valid JSON — no markdown, no preamble."
)


async def generate_xai_explanation(
    skeletal_class: str,
    skeletal_probabilities: dict[str, float],
    vertical_pattern: str,
    measurements: dict[str, float],
    treatment_name: str,
    predicted_outcomes: dict[str, float],
    uncertainty_landmarks: list[str] | None = None,
) -> dict | None:
    """
    Explainable AI: Generate a structured reasoning chain that transparently
    explains HOW the AI arrived at its diagnosis and treatment recommendation.

    Returns a structured dict with decision_chain, key_drivers, and uncertainty_factors
    so the frontend can render a visual audit trail of the clinical reasoning.
    """
    if not _llm_available():
        return None

    deviation_table = _build_deviation_table(measurements)

    prob_text = ", ".join(
        f"{cls.replace('Class', 'Class ')}: {round(p * 100)}%"
        for cls, p in sorted(skeletal_probabilities.items(), key=lambda x: -x[1])
    )

    outcome_text = ", ".join(
        f"{k}: {v:.1f}" for k, v in predicted_outcomes.items()
    ) if predicted_outcomes else "No simulation data"

    low_conf_text = (
        f"Landmark uncertainty detected at: {', '.join(uncertainty_landmarks)}."
        if uncertainty_landmarks else "No landmark uncertainty flags."
    )

    system_prompt = (
        "You are an Explainable AI system for an orthodontic clinical decision support tool. "
        "Your task is to produce a transparent, structured reasoning chain explaining exactly "
        "why the AI system reached a specific diagnosis and treatment recommendation. "
        "Be precise: reference the actual measurement values and norms. "
        f"{_XAI_JSON_SCHEMA}"
    )

    user_prompt = (
        f"AI DECISION AUDIT REQUEST\n\n"
        f"Diagnosis:\n"
        f"  Skeletal Class Selected: {skeletal_class}\n"
        f"  Skeletal Probability Distribution: {prob_text}\n"
        f"  Vertical Pattern: {vertical_pattern}\n\n"
        f"Recommended Treatment: {treatment_name}\n"
        f"Predicted Cephalometric Outcomes: {outcome_text}\n\n"
        f"Landmark Confidence Status: {low_conf_text}\n\n"
        f"Cephalometric Measurements (with norm deviations):\n{deviation_table}\n\n"
        f"Generate the structured XAI reasoning chain:"
    )

    # ── Provider 1: OpenAI ────────────────────────────────────────────────────
    if openai_client:
        try:
            response_format = (
                {"type": "json_object"} if _supports_json_mode(settings.openai_model) else None
            )
            resp = await openai_client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                response_format=response_format,
                temperature=0.2,
                max_tokens=800,
                timeout=16,
            )
            raw = resp.choices[0].message.content.strip()
            data = _extract_json(raw)
            logger.info("OpenAI XAI explanation OK")
            return data
        except Exception as e:
            logger.warning(f"OpenAI XAI explanation failed: {e}")

    # ── Provider 2: Gemini ────────────────────────────────────────────────────
    try:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        raw = await _gemini_generate(full_prompt, timeout=20)
        data = _extract_json(raw)
        logger.info("Gemini XAI explanation OK")
        return data
    except Exception as e:
        logger.error(f"Gemini XAI explanation failed: {e}")

    return None


# ── Unified Diagnostic Package ────────────────────────────────────────────────

_DIAGNOSTIC_PACKAGE_SCHEMA = {
    "type": "object",
    "properties": {
        "clinical_summary": {"type": "string", "description": "100-150 word diagnostic summary."},
        "rationales": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "treatment_name": {"type": "string"},
                    "rationale": {"type": "string", "description": "2-sentence mechanical rationale."}
                }
            }
        }
    },
    "required": ["clinical_summary", "rationales"]
}

async def generate_diagnostic_package(
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    treatments: list[dict],
    soft_tissue_profile: str = "Unknown",
) -> dict | None:
    """
    Generate the complete diagnostic documentation (summary + all rationales) 
    in a single parallelised LLM call. This reduces total system latency by 
    avoiding multiple serial round-trips.
    """
    if not _llm_available():
        return None

    system_prompt = (
        "You are a senior consultant orthodontist writing a comprehensive case review. "
        "Based on the measurements provided, generate a 100-150 word diagnostic summary "
        "AND a specific 2-sentence rationale for EACH proposed treatment plan. "
        "Return the result as a structured JSON object."
    )

    deviation_table = _build_deviation_table(measurements)
    treatment_list = ", ".join([t["treatment_name"] for t in treatments])

    user_prompt = (
        f"PATIENT DATA:\n"
        f"  Class: {skeletal_class}, Vertical: {vertical_pattern}, Soft Tissue: {soft_tissue_profile}\n\n"
        f"MEASUREMENTS:\n{deviation_table}\n\n"
        f"PROPOSED TREATMENTS: {treatment_list}\n\n"
        f"Output JSON matching schema: {_DIAGNOSTIC_PACKAGE_SCHEMA}"
    )

    # ── Provider 1: OpenAI ─────────
    if openai_client:
        try:
            resp = await openai_client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=1000,
                timeout=20,
            )
            raw = resp.choices[0].message.content.strip()
            return _extract_json(raw)
        except Exception as e:
            logger.warning(f"OpenAI diagnostic package failed: {e}")

    # ── Provider 2: Gemini ─────────
    try:
        raw = await _gemini_generate(f"{system_prompt}\n\n{user_prompt}", timeout=25)
        return _extract_json(raw)
    except Exception as e:
        logger.error(f"Gemini diagnostic package failed: {e}")

    return None
