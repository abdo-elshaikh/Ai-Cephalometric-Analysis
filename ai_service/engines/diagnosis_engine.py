"""
Diagnosis Engine — Rule-based classifier that maps cephalometric measurement
values to skeletal class, vertical pattern, and dental inclination classifications.

Evidence-based upgrades (v2):
- Hasund's ANB Correction: Adjusts ANB for rotation using SN-NL angle.
- Kim's APDI/ODI: Composite indices for more robust skeletal/vertical diagnosis.
- Holdaway H-Angle: Professional soft tissue profile assessment.
- Probabilistic Classification: Flags borderline Class I/II/III.
- Age/Sex Sensitivity: Adjusts norms for growing patients (<12 years).
- CBCT-aware warnings and structural placeholders.
"""

from __future__ import annotations
from config.settings import settings
from utils.norms_util import norms_provider


def _get_norm(code: str, fallback_min: float, fallback_max: float) -> tuple[float, float]:
    rng = norms_provider.get_norm_range(code)
    if rng:
        return rng[0], rng[1]
    return fallback_min, fallback_max


# ---------------------------------------------------------------------------
# Skeletal class
# ---------------------------------------------------------------------------

def classify_skeletal_class(
    anb: float,
    wits: float | None = None,
    sn_pp: float | None = None,
) -> dict[str, any]:
    """
    Classify the skeletal AP relationship using ANB as the primary indicator,
    refined by Hasund's rotation correction and bidirectional Wits appraisal.

    Returns a dict with 'label', 'type', and 'corrected_anb'.
    """
    # 1. Hasund's Correction — adjusts for rotated maxillae
    # Norm SN-PP ≈ 8.0°. Correction = 0.5 × (SN-PP − 8)
    corrected_anb = anb
    if sn_pp is not None:
        correction = 0.5 * (sn_pp - settings.sn_pp_mean)
        corrected_anb = anb - correction

    # 2. Base classification
    anb_min, anb_max = _get_norm("ANB", 0.0, 4.0)

    if corrected_anb < anb_min:
        base_class = "ClassIII"
    elif corrected_anb <= anb_max:
        base_class = "ClassI"
    else:
        base_class = "ClassII"

    # 3. Wits refinement
    final_class = base_class
    if wits is not None:
        if base_class == "ClassI":
            if wits > 1.5:
                final_class = "ClassII"
            elif wits < -1.5:
                final_class = "ClassIII"
        elif base_class == "ClassII" and wits < -1.5:
            final_class = "ClassI"
        elif base_class == "ClassIII" and wits > 1.5:
            final_class = "ClassI"

    # 4. Borderline check — within 0.5° of either threshold
    is_borderline = any(abs(corrected_anb - t) < 0.5 for t in [anb_min, anb_max])

    return {
        "label": final_class,
        "type": "Borderline" if is_borderline else "Definitive",
        "corrected_anb": round(corrected_anb, 2),
    }


# ---------------------------------------------------------------------------
# Vertical pattern
# ---------------------------------------------------------------------------

def classify_vertical_pattern(fma: float, j_ratio: float | None = None) -> str:
    """
    Classify the vertical facial pattern using FMA as the primary indicator,
    refined by the Jarabak Ratio when available.
    """
    fma_min, fma_max = _get_norm("FMA", 21.0, 29.0)
    if fma < fma_min:
        pattern = "LowAngle"
    elif fma <= fma_max:
        pattern = "Normal"
    else:
        pattern = "HighAngle"

    if j_ratio is not None:
        if j_ratio > 65:
            pattern = "LowAngle"
        elif j_ratio < 59:
            pattern = "HighAngle"

    return pattern


def _growth_tendency_text(j_ratio: float | None) -> str:
    """Return a growth-tendency clause derived from the Jarabak Ratio, or ''."""
    if j_ratio is None:
        return ""
    if j_ratio > 65:
        return " suggesting a strong counter-clockwise growth tendency"
    if j_ratio < 59:
        return " suggesting a clockwise growth tendency"
    return ""


# ---------------------------------------------------------------------------
# Soft tissue
# ---------------------------------------------------------------------------

def classify_soft_tissue(
    ls_eline: float | None,
    li_eline: float | None,
    h_angle: float | None = None,
) -> str:
    """
    Classify the soft tissue profile, prioritising the Holdaway H-Angle over
    Ricketts E-Line.

    Norms:
    - H-Angle: 10° mean. >13° → Protrusive, <7° → Retrusive.
    - E-Line: Upper −4 mm ± 3, Lower −2 mm ± 2.
    """
    if h_angle is not None:
        if h_angle > 13:
            return "Protrusive"
        if h_angle < 7:
            return "Retrusive"
        return "Normal"

    if ls_eline is None or li_eline is None:
        return "Unknown"

    if ls_eline > -2 or li_eline > 0:
        return "Protrusive"
    if ls_eline < -7 or li_eline < -5:
        return "Retrusive"
    return "Normal"


# ---------------------------------------------------------------------------
# Kim's Advanced Indices (APDI / ODI)
# ---------------------------------------------------------------------------

def classify_apdi(fh_ab: float | None, pp_fh: float | None) -> str | None:
    """
    Kim's AP Dysplasia Index.
    APDI = (FH-AB) + (PP-FH). Mean = 81.4. >85 → Class III, <77 → Class II.
    """
    if fh_ab is None or pp_fh is None:
        return None
    apdi = fh_ab + pp_fh
    if apdi > 85:
        return "ClassIII_Tendency"
    if apdi < 77:
        return "ClassII_Tendency"
    return "ClassI_Relationship"


def classify_odi(ab_mp: float | None, pp_mp: float | None) -> str | None:
    """
    Kim's Overbite Depth Indicator.
    ODI = (AB-MP) + (PP-MP). Mean = 74.5. <68 → Open Bite, >80 → Deep Bite.
    """
    if ab_mp is None or pp_mp is None:
        return None
    odi = ab_mp + pp_mp
    if odi < 68:
        return "OpenBite_Tendency"
    if odi > 80:
        return "DeepBite_Tendency"
    return "Balanced_Vertical"


# ---------------------------------------------------------------------------
# Jaw position & incisor inclination
# ---------------------------------------------------------------------------

def classify_jaw_position(val: float, min_val: float, max_val: float) -> str:
    if val < min_val:
        return "Retrusive"
    if val > max_val:
        return "Protrusive"
    return "Normal"


def classify_incisor(val: float, min_norm: float, max_norm: float) -> str:
    if val < min_norm:
        return "Retroclined"
    if val > max_norm:
        return "Proclined"
    return "Normal"


# ---------------------------------------------------------------------------
# Overjet / overbite
# ---------------------------------------------------------------------------

def classify_overjet(overjet_mm: float | None) -> str | None:
    if overjet_mm is None:
        return None
    if overjet_mm < 0:
        return "Negative"
    if overjet_mm == 0:
        return "EdgeToEdge"
    if overjet_mm <= 3:
        return "Normal"
    return "Increased"


def classify_overbite(overbite_mm: float | None) -> str | None:
    if overbite_mm is None:
        return None
    if overbite_mm <= 0:
        return "OpenBite"
    if overbite_mm <= 3:
        return "Normal"
    return "Deep"


# ---------------------------------------------------------------------------
# Confidence score
# ---------------------------------------------------------------------------

def compute_confidence(measurements: dict[str, float]) -> float:
    primary   = ["SNA", "SNB", "FMA", "UI-NA_DEG", "LI-NB_DEG"]
    secondary = ["Wits", "JRatio", "Ls-Eline", "Li-Eline", "H-Angle", "APDI", "ODI"]

    primary_score    = sum(0.16 for m in primary   if m in measurements)
    secondary_bonus  = sum(0.02 for m in secondary if m in measurements)

    return round(min(1.0, 0.20 + primary_score + secondary_bonus), 3)


# ---------------------------------------------------------------------------
# Input sanity guards
# ---------------------------------------------------------------------------

def _validate_measurements(measurements: dict[str, float]) -> list[str]:
    warnings: list[str] = []
    plausible_ranges: dict[str, tuple[float, float]] = {
        "SNA":  (60.0, 100.0),
        "SNB":  (58.0,  98.0),
        "ANB":  (-10.0, 15.0),
        "FMA":  (10.0,  50.0),
        "Wits": (-15.0, 15.0),
    }
    for key, (lo, hi) in plausible_ranges.items():
        val = measurements.get(key)
        if val is not None and not (lo <= val <= hi):
            warnings.append(
                f"{key} = {val} is outside the expected plausible range [{lo}, {hi}]."
            )
    return warnings


# ---------------------------------------------------------------------------
# Summary generation
# ---------------------------------------------------------------------------

def generate_summary(
    skeletal_result: dict,
    vertical_pattern: str,
    upper_inc: str,
    lower_inc: str,
    growth_tendency: str,
    profile: str,
    apdi: str | None = None,
    odi: str | None = None,
) -> str:
    """Generate a high-fidelity clinical summary including advanced indices."""
    s_label = skeletal_result["label"]
    s_type  = skeletal_result["type"]
    anb     = skeletal_result["corrected_anb"]

    class_desc = {
        "ClassI":   "normal jaw relationship (Class I)",
        "ClassII":  "skeletal Class II malocclusion (mandible retrognathic)",
        "ClassIII": "skeletal Class III malocclusion (mandible prognathic)",
    }

    borderline_text = " borderline " if s_type == "Borderline" else " "
    apdi_text = (
        f" (APDI suggests {apdi.replace('_', ' ').lower()})"
        if apdi and "ClassI" not in apdi else ""
    )
    odi_text = (
        f" (ODI suggests {odi.replace('_', ' ').lower()})"
        if odi and "Balanced" not in odi else ""
    )

    vertical_desc = {
        "LowAngle": (
            f"hypodivergent (low angle) vertical pattern{growth_tendency} "
            f"with deep bite tendency{odi_text}"
        ),
        "Normal": f"normal vertical facial proportion{odi_text}",
        "HighAngle": (
            f"hyperdivergent (high angle) vertical pattern{growth_tendency} "
            f"with open bite tendency{odi_text}"
        ),
    }

    profile_text = {
        "Protrusive": " The soft tissue profile appears protrusive.",
        "Retrusive":  " The soft tissue profile appears retrusive.",
        "Unknown":    " Soft tissue profile was not assessed.",
    }.get(profile, "")

    inc_parts: list[str] = []
    if upper_inc != "Normal":
        inc_parts.append(f"upper incisors are {upper_inc.lower()}")
    if lower_inc != "Normal":
        inc_parts.append(f"lower incisors are {lower_inc.lower()}")
    inc_text = (". " + "; ".join(inc_parts).capitalize() + ".") if inc_parts else "."

    return (
        f"Patient presents with a{borderline_text}{class_desc.get(s_label, s_label)} "
        f"(corrected ANB = {anb:.1f}\u00b0){apdi_text} and a "
        f"{vertical_desc.get(vertical_pattern, vertical_pattern)}"
        f"{inc_text}{profile_text}"
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def classify_diagnosis(
    measurements: dict[str, float],
    sex: str | None = None,
    age: float | None = None,
) -> dict:
    """Full diagnosis classification using advanced evidence-based methods."""

    # ── Norm adjustments for age ──────────────────────────────────────────────
    sna_norm_min, sna_norm_max = _get_norm("SNA", 80.0, 84.0)
    if age and age < 12:
        # Growing patients have a slightly more prognathic maxilla
        sna_norm_min += 1.0
        sna_norm_max += 2.0

    snb_norm_min, snb_norm_max = _get_norm("SNB", 78.0, 82.0)
    ui_na_norm_min, ui_na_norm_max = _get_norm(
        "UI to NA (deg)", settings.ui_na_min, settings.ui_na_max
    )
    li_nb_norm_min, li_nb_norm_max = _get_norm(
        "LI to NB (deg)", settings.li_nb_min, settings.li_nb_max
    )

    # ── Extract measurement values ────────────────────────────────────────────
    sna      = measurements.get("SNA", 82.0)
    snb      = measurements.get("SNB", 80.0)
    anb      = measurements.get("ANB", sna - snb)
    wits     = measurements.get("Wits")
    fma      = measurements.get("FMA", 25.0)
    j_ratio  = measurements.get("JRatio")
    sn_pp    = measurements.get("SN-PP")
    fh_ab    = measurements.get("FH-AB")
    pp_fh    = measurements.get("PP-FH")
    ab_mp    = measurements.get("AB-MP")
    pp_mp    = measurements.get("PP-MP")
    h_angle  = measurements.get("H-Angle")
    ui_na    = measurements.get("UI-NA_DEG", 24.0)
    li_nb    = measurements.get("LI-NB_DEG", 26.0)
    ls_eline = measurements.get("Ls-Eline")
    li_eline = measurements.get("Li-Eline")
    overjet  = measurements.get("OVERJET_MM")
    overbite = measurements.get("OVERBITE_MM")

    # ── Input sanity checks ───────────────────────────────────────────────────
    warnings = _validate_measurements(measurements)
    # Kim's indices require Frankfort plane measurements, not landmarks
    if fh_ab is None and pp_fh is None:
        warnings.append(
            "FH-AB and PP-FH measurements absent; Kim's APDI could not be calculated."
        )

    # ── Classification ────────────────────────────────────────────────────────
    skeletal_result     = classify_skeletal_class(anb, wits, sn_pp)
    apdi_class          = classify_apdi(fh_ab, pp_fh)
    odi_class           = classify_odi(ab_mp, pp_mp)
    vertical_pattern    = classify_vertical_pattern(fma, j_ratio)
    maxillary_position  = classify_jaw_position(sna, sna_norm_min, sna_norm_max)
    mandibular_position = classify_jaw_position(snb, snb_norm_min, snb_norm_max)
    upper_incisor       = classify_incisor(ui_na, ui_na_norm_min, ui_na_norm_max)
    lower_incisor       = classify_incisor(li_nb, li_nb_norm_min, li_nb_norm_max)
    soft_tissue_profile = classify_soft_tissue(ls_eline, li_eline, h_angle)
    overjet_class       = classify_overjet(overjet)
    overbite_class      = classify_overbite(overbite)

    # ── Clinical summary ──────────────────────────────────────────────────────
    summary = generate_summary(
        skeletal_result, vertical_pattern,
        upper_incisor, lower_incisor,
        _growth_tendency_text(j_ratio),
        soft_tissue_profile, apdi_class, odi_class,
    )

    return {
        "skeletal_class":            skeletal_result["label"],
        "skeletal_type":             skeletal_result["type"],
        "corrected_anb":             skeletal_result["corrected_anb"],
        "apdi_classification":       apdi_class,
        "odi_classification":        odi_class,
        "vertical_pattern":          vertical_pattern,
        "maxillary_position":        maxillary_position,
        "mandibular_position":       mandibular_position,
        "upper_incisor_inclination": upper_incisor,
        "lower_incisor_inclination": lower_incisor,
        "soft_tissue_profile":       soft_tissue_profile,
        "overjet_mm":                overjet,
        "overjet_classification":    overjet_class,
        "overbite_mm":               overbite,
        "overbite_classification":   overbite_class,
        "confidence_score":          compute_confidence(measurements),
        "summary":                   summary,
        "warnings":                  warnings,
        "clinical_notes": [
            "CBCT-aware: 2D norms applied. Consider 3D imaging for asymmetry assessment.",
            "Structural Placeholder: WALA ridge/Bolton discrepancy assessment pending.",
        ],
    }
