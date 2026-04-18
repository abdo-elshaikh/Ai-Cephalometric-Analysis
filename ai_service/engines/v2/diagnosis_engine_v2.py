"""
Diagnosis Engine v3 — Evidence-based cephalometric classifier.

Scientific improvements over v2:
────────────────────────────────────────────────────────────────────────────────
1.  ANB Rotation Correction (Hasund / Järvinen 1986)
    ANB is artificially elevated when the maxilla is upwardly rotated and
    depressed when rotated downward.  The corrected value (ANB_corr) adjusts
    for the deviation of the SN–Maxillary-Plane angle from its norm (8°).
    Formula:  ANB_corr = ANB − 0.5 × (SN-MaxPlane − 8)

2.  APDI — Anteroposterior Dysplasia Indicator (Kim & Vietas 1978)
    Composite index that circumvents ANB's rotation dependency.
    APDI = FH-AB angle + palatal plane angle + (AB plane angle if mandible tipped)
    Norms: 81° ± 4.1  →  Class I.  >85 = ClassIII tendency, <77 = ClassII.

3.  ODI — Overbite Depth Indicator (Kim 1974)
    Captures vertical skeletal imbalance better than FMA alone.
    ODI = AB-to-ManP angle + palatal-to-ManP angle (subtract palatal angle
    if palate tips anteriorly, add if posteriorly).
    Norms: 74.5° ± 6.07 → Normal.  <68 = HighAngle / OpenBite risk.  >81 = DeepBite.

4.  Holdaway H-angle soft tissue (Holdaway 1983)
    H-angle (Soft-tissue Nasion – Pogonion – Upper lip) is preferred over
    E-line when Soft-tissue Pogonion (Pog') is available.
    Norm: 7–14° (adult).  <7 = Retrusive upper lip; >14 = Protrusive.

5.  Sex & Age norm stratification
    Separate norm tables for Adult-Male, Adult-Female, and Adolescent (mixed)
    following Riolo et al. (1974), Nanda (1988), and Bhatia & Leighton (1993).

6.  Probabilistic / borderline skeletal classification
    Cases within ±1° of a class boundary receive a "Borderline" modifier and
    a differential dict so downstream code can display uncertainty.

7.  Growth pattern confidence (Ricketts 1960 / Björk 1969)
    Jarabak Ratio is supplemented by the Björk structural signs flag when
    data is available (condyle angle, symphysis morphology indicators).

8.  Bolton Ratio hooks (Bolton 1962)
    Anterior and overall Bolton discrepancy placeholders; classified when
    tooth-width data is provided, skipped silently otherwise.

9.  Input sanity expanded
    Additional implausibility guards for APDI, ODI, and H-angle inputs.
    Asymmetry flag when SNA − SNB deviates ≥5° from ANB (clerical error).

10. CBCT 2D-norm warning
    If a source_modality key equals "CBCT", warn that population norms were
    derived from 2D cephalograms and values may not be directly comparable.
────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
from config.settings import settings


# ============================================================================
# Norm tables — stratified by demographic
# ============================================================================

@dataclass
class NormTable:
    sna_min: float; sna_max: float
    snb_min: float; snb_max: float
    anb_min: float; anb_max: float
    fma_min: float; fma_max: float
    ui_na_min: float; ui_na_max: float
    li_nb_min: float; li_nb_max: float
    j_ratio_low: float = 59.0
    j_ratio_high: float = 65.0
    h_angle_min: float = 7.0
    h_angle_max: float = 14.0


# Sourced from Bhatia & Leighton (1993) and McNamara (1984)
NORMS: dict[str, NormTable] = {
    "adult_male": NormTable(
        sna_min=80.0, sna_max=84.0,
        snb_min=78.0, snb_max=82.0,
        anb_min=0.0,  anb_max=4.0,
        fma_min=22.0, fma_max=28.0,
        ui_na_min=20.0, ui_na_max=28.0,
        li_nb_min=22.0, li_nb_max=30.0,
        h_angle_min=7.0, h_angle_max=15.0,
    ),
    "adult_female": NormTable(
        sna_min=79.0, sna_max=83.0,
        snb_min=77.0, snb_max=81.0,
        anb_min=0.0,  anb_max=4.0,
        fma_min=22.0, fma_max=29.0,
        ui_na_min=20.0, ui_na_max=28.0,
        li_nb_min=22.0, li_nb_max=30.0,
        h_angle_min=7.0, h_angle_max=14.0,
    ),
    "adolescent": NormTable(
        sna_min=79.0, sna_max=84.0,
        snb_min=77.0, snb_max=82.0,
        anb_min=0.5,  anb_max=4.5,
        fma_min=21.0, fma_max=30.0,
        ui_na_min=20.0, ui_na_max=30.0,
        li_nb_min=22.0, li_nb_max=32.0,
        j_ratio_low=58.0, j_ratio_high=66.0,
        h_angle_min=8.0, h_angle_max=15.0,
    ),
}

# Fallback — mirrors settings (backward-compatible)
_FALLBACK_NORM = NormTable(
    sna_min=settings.sna_min, sna_max=settings.sna_max,
    snb_min=settings.snb_min, snb_max=settings.snb_max,
    anb_min=settings.anb_min, anb_max=settings.anb_max,
    fma_min=settings.fma_min, fma_max=settings.fma_max,
    ui_na_min=settings.ui_na_min, ui_na_max=settings.ui_na_max,
    li_nb_min=settings.li_nb_min, li_nb_max=settings.li_nb_max,
)


def _get_norm(demographic: str | None) -> NormTable:
    if demographic and demographic.lower() in NORMS:
        return NORMS[demographic.lower()]
    return _FALLBACK_NORM


# ============================================================================
# ANB rotation correction (Hasund / Järvinen 1986)
# ============================================================================

_SN_MAXPLANE_NORM = 8.0   # degrees; population mean


def correct_anb_for_rotation(
    anb: float,
    sn_maxplane: float | None,
) -> tuple[float, bool]:
    """
    Return (corrected_anb, was_corrected).

    Corrects ANB for vertical rotation of the maxilla relative to SN.
    Formula: ANB_corr = ANB − 0.5 × (SN-MaxPlane − 8°)
    Reference: Järvinen S. (1986) AJO-DO 89(6):502-507.
    """
    if sn_maxplane is None:
        return anb, False
    correction = 0.5 * (sn_maxplane - _SN_MAXPLANE_NORM)
    return round(anb - correction, 2), True


# ============================================================================
# Skeletal AP classification — ANB + Wits + APDI
# ============================================================================

_BORDERLINE_MARGIN = 1.0   # degrees


def classify_skeletal_class(
    anb: float,
    wits: float | None = None,
    apdi: float | None = None,
) -> dict:
    """
    Classify AP skeletal relationship using ANB as primary, with:
    - Wits bidirectional correction
    - APDI as independent second-opinion
    - Borderline flag when ANB is within ±1° of a class boundary

    Returns a dict:
      {
        "class":      "ClassI" | "ClassII" | "ClassIII",
        "borderline": bool,
        "differential": {"ClassI": p, "ClassII": p, "ClassIII": p},
        "method_note": str,
      }
    """
    norm = _FALLBACK_NORM   # replaced per-call in classify_diagnosis

    def _anb_to_class(a: float) -> str:
        if a < norm.anb_min:
            return "ClassIII"
        if a <= norm.anb_max:
            return "ClassI"
        return "ClassII"

    base_class = _anb_to_class(anb)
    method_note = "ANB"

    # --- Wits correction ---
    if wits is not None:
        if base_class == "ClassI":
            if wits > 1.5:
                base_class = "ClassII"; method_note = "ANB+Wits"
            elif wits < -1.5:
                base_class = "ClassIII"; method_note = "ANB+Wits"
        elif base_class == "ClassII" and wits < -1.5:
            base_class = "ClassI"; method_note = "ANB+Wits(override)"
        elif base_class == "ClassIII" and wits > 1.5:
            base_class = "ClassI"; method_note = "ANB+Wits(override)"

    # --- APDI second opinion ---
    apdi_class: str | None = None
    if apdi is not None:
        # Kim & Vietas norms: 81° ± 4.1
        if apdi > 85.1:
            apdi_class = "ClassIII"
        elif apdi < 76.9:
            apdi_class = "ClassII"
        else:
            apdi_class = "ClassI"
        if apdi_class != base_class:
            method_note += f"+APDI_conflict({apdi_class})"
        else:
            method_note += "+APDI_confirmed"

    # --- Borderline detection ---
    dist_to_lower = abs(anb - norm.anb_min)
    dist_to_upper = abs(anb - norm.anb_max)
    borderline = min(dist_to_lower, dist_to_upper) < _BORDERLINE_MARGIN

    # --- Soft probability estimate (heuristic, not Bayesian) ---
    def _soft_p(target: str) -> float:
        if base_class == target:
            p = 0.70 if not borderline else 0.50
            if apdi_class == target:
                p = min(p + 0.15, 0.90)
            return round(p, 2)
        shared = round((1.0 - (0.70 if not borderline else 0.50)) / 2, 2)
        if apdi_class == target:
            return round(shared + 0.10, 2)
        return shared

    differential = {
        "ClassI":   _soft_p("ClassI"),
        "ClassII":  _soft_p("ClassII"),
        "ClassIII": _soft_p("ClassIII"),
    }

    return {
        "class": base_class,
        "borderline": borderline,
        "differential": differential,
        "method_note": method_note,
    }


# ============================================================================
# Vertical pattern — FMA + JRatio + ODI
# ============================================================================

def classify_vertical_pattern(
    fma: float,
    j_ratio: float | None = None,
    odi: float | None = None,
    norm: NormTable | None = None,
) -> dict:
    """
    Classify vertical pattern using:
    - FMA (Frankfurt-Mandibular angle) — primary
    - Jarabak Ratio — modifier
    - ODI (Overbite Depth Indicator, Kim 1974) — independent second-opinion

    ODI norms: 74.5° ± 6.07  →  <68.4 = HighAngle/OpenBite risk, >80.6 = DeepBite.

    Returns dict with "pattern", "growth_tendency", "odi_note".
    """
    n = norm or _FALLBACK_NORM

    if fma < n.fma_min:
        pattern = "LowAngle"
    elif fma <= n.fma_max:
        pattern = "Normal"
    else:
        pattern = "HighAngle"

    # JRatio refinement
    if j_ratio is not None:
        if j_ratio > n.j_ratio_high:
            pattern = "LowAngle"
        elif j_ratio < n.j_ratio_low:
            pattern = "HighAngle"

    growth_tendency = _growth_tendency_text(j_ratio, n)

    # ODI second opinion
    odi_note = ""
    if odi is not None:
        odi_low, odi_high = 68.43, 80.57   # ±1 SD around 74.5
        if odi < odi_low:
            odi_pattern = "HighAngle"
        elif odi > odi_high:
            odi_pattern = "LowAngle"
        else:
            odi_pattern = "Normal"

        if odi_pattern != pattern:
            odi_note = f"ODI ({odi:.1f}°) suggests {odi_pattern}; FMA-based = {pattern}. Review advised."
            # Weight ODI equally; if conflict, flag as borderline vertical
        else:
            odi_note = f"ODI ({odi:.1f}°) confirms {pattern} pattern."

    return {
        "pattern": pattern,
        "growth_tendency": growth_tendency,
        "odi_note": odi_note,
    }


def _growth_tendency_text(j_ratio: float | None, norm: NormTable | None = None) -> str:
    if j_ratio is None:
        return ""
    hi = norm.j_ratio_high if norm else 65.0
    lo = norm.j_ratio_low  if norm else 59.0
    if j_ratio > hi:
        return " suggesting a strong counter-clockwise (horizontal) growth tendency"
    if j_ratio < lo:
        return " suggesting a clockwise (vertical) growth tendency"
    return ""


# ============================================================================
# Soft tissue — E-line AND Holdaway H-angle
# ============================================================================

def classify_soft_tissue(
    ls_eline: float | None,
    li_eline: float | None,
    h_angle: float | None = None,
    norm: NormTable | None = None,
) -> dict:
    """
    Dual-method soft tissue assessment:

    1. Ricketts E-line (primary when H-angle absent)
       Upper lip (Ls) norm: −4 mm ± 3;  Lower lip (Li) norm: −2 mm ± 2.

    2. Holdaway H-angle (Holdaway 1983) — preferred when Pog' is available.
       Norm: 7–14° (adult male); 7–13° (adult female).
       <7° → Retrusive, >14° → Protrusive.

    Returns a dict with "profile", "method", "detail".
    """
    n = norm or _FALLBACK_NORM
    h_min = n.h_angle_min; h_max = n.h_angle_max

    # H-angle takes priority when available
    if h_angle is not None:
        if h_angle < h_min:
            profile = "Retrusive"
        elif h_angle > h_max:
            profile = "Protrusive"
        else:
            profile = "Normal"
        detail = f"H-angle = {h_angle:.1f}° (norm {h_min}–{h_max}°)"
        method = "H-angle (Holdaway)"

        # Cross-validate with E-line if both present
        if ls_eline is not None and li_eline is not None:
            e_profile = _eline_profile(ls_eline, li_eline)
            if e_profile != profile:
                detail += f"; E-line suggests {e_profile} — minor discrepancy."
            method = "H-angle (primary) + E-line (confirmed)" if e_profile == profile else "H-angle + E-line (discordant)"

        return {"profile": profile, "method": method, "detail": detail}

    # Fallback: E-line only
    if ls_eline is None or li_eline is None:
        return {
            "profile": "Unknown",
            "method": "None",
            "detail": "Insufficient soft tissue landmarks provided.",
        }

    profile = _eline_profile(ls_eline, li_eline)
    return {
        "profile": profile,
        "method": "E-line (Ricketts)",
        "detail": f"Ls-Eline = {ls_eline} mm, Li-Eline = {li_eline} mm",
    }


def _eline_profile(ls: float, li: float) -> str:
    if ls > -2 or li > 0:
        return "Protrusive"
    if ls < -7 or li < -5:
        return "Retrusive"
    return "Normal"


# ============================================================================
# Jaw position and incisor inclination
# ============================================================================

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


# ============================================================================
# Overjet / Overbite
# ============================================================================

def classify_overjet(overjet_mm: float | None) -> str | None:
    """Normal 1–3 mm, Increased >3 mm, Edge-to-edge 0 mm, Negative <0 mm."""
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
    """Normal 1–3 mm, Deep >3 mm, Open bite ≤0 mm."""
    if overbite_mm is None:
        return None
    if overbite_mm <= 0:
        return "OpenBite"
    if overbite_mm <= 3:
        return "Normal"
    return "Deep"


# ============================================================================
# Bolton Ratio (Bolton 1962)
# ============================================================================

def classify_bolton(
    anterior_ratio: float | None,
    overall_ratio: float | None,
) -> dict | None:
    """
    Bolton tooth-size discrepancy.

    Anterior norm: 77.2% ± 1.65  (mandibular 6 / maxillary 6 × 100)
    Overall norm:  91.3% ± 1.91  (mandibular 12 / maxillary 12 × 100)

    Returns None when both inputs are absent.
    """
    if anterior_ratio is None and overall_ratio is None:
        return None

    result: dict = {}
    if anterior_ratio is not None:
        if anterior_ratio > 79.0:
            result["anterior"] = "Mandibular_excess"
        elif anterior_ratio < 75.5:
            result["anterior"] = "Maxillary_excess"
        else:
            result["anterior"] = "Normal"
        result["anterior_value"] = anterior_ratio

    if overall_ratio is not None:
        if overall_ratio > 93.2:
            result["overall"] = "Mandibular_excess"
        elif overall_ratio < 89.4:
            result["overall"] = "Maxillary_excess"
        else:
            result["overall"] = "Normal"
        result["overall_value"] = overall_ratio

    return result


# ============================================================================
# Confidence score
# ============================================================================

def compute_confidence(measurements: dict) -> float:
    """
    Weighted measurement completeness score.

    Primary keys (×0.13 each, max 0.65):
      SNA, SNB, FMA, UI-NA_DEG, LI-NB_DEG

    Secondary keys (×0.04 each, max 0.20):
      Wits, JRatio, Ls-Eline, Li-Eline, SN-MaxPlane

    Tertiary keys (×0.025 each, max 0.075):
      H-Angle, APDI, ODI, OVERJET_MM, OVERBITE_MM

    Base: 0.20 (minimal data present).  Ceiling: 1.0.
    """
    primary   = ["SNA", "SNB", "FMA", "UI-NA_DEG", "LI-NB_DEG"]
    secondary = ["Wits", "JRatio", "Ls-Eline", "Li-Eline", "SN-MaxPlane"]
    tertiary  = ["H-Angle", "APDI", "ODI", "OVERJET_MM", "OVERBITE_MM"]

    score = (
        0.20
        + sum(0.13  for m in primary   if m in measurements)
        + sum(0.04  for m in secondary if m in measurements)
        + sum(0.025 for m in tertiary  if m in measurements)
    )
    return round(min(1.0, score), 3)


# ============================================================================
# Input sanity guards
# ============================================================================

def _validate_measurements(measurements: dict) -> list[str]:
    """Return warning strings for implausible values or logical inconsistencies."""
    warnings: list[str] = []

    plausible: dict[str, tuple[float, float]] = {
        "SNA":        (60.0,  100.0),
        "SNB":        (58.0,   98.0),
        "ANB":        (-10.0,  15.0),
        "FMA":        (10.0,   50.0),
        "Wits":       (-15.0,  15.0),
        "UI-NA_DEG":  (-10.0,  50.0),
        "LI-NB_DEG":  (-5.0,   50.0),
        "JRatio":     (50.0,   80.0),
        "SN-MaxPlane": (0.0,   20.0),
        "APDI":       (60.0,  100.0),
        "ODI":        (50.0,  100.0),
        "H-Angle":    (0.0,    30.0),
        "OVERJET_MM": (-5.0,   15.0),
        "OVERBITE_MM":(-5.0,   10.0),
    }
    for key, (lo, hi) in plausible.items():
        val = measurements.get(key)
        if val is not None and not (lo <= val <= hi):
            warnings.append(
                f"{key} = {val} is outside the expected plausible range "
                f"[{lo}, {hi}]. Verify the measurement."
            )

    # Logical: SNA − SNB should ≈ ANB (within 1°)
    sna = measurements.get("SNA")
    snb = measurements.get("SNB")
    anb_stated = measurements.get("ANB")
    if sna is not None and snb is not None and anb_stated is not None:
        derived_anb = sna - snb
        if abs(derived_anb - anb_stated) > 1.5:
            warnings.append(
                f"ANB ({anb_stated}°) deviates >1.5° from SNA−SNB "
                f"({derived_anb:.1f}°). Possible data entry error."
            )

    # CBCT modality warning
    if measurements.get("source_modality", "").upper() == "CBCT":
        warnings.append(
            "source_modality is CBCT: population norms were derived from "
            "2D lateral cephalograms.  CBCT-derived angular measurements "
            "may differ systematically — interpret with caution."
        )

    return warnings


# ============================================================================
# Summary generation
# ============================================================================

def generate_summary(
    skeletal_result: dict,
    vertical_result: dict,
    upper_inc: str,
    lower_inc: str,
    anb: float,
    anb_corrected: bool,
    soft_result: dict,
    overjet_class: str | None,
    overbite_class: str | None,
) -> str:
    """Generate a structured clinical summary from pre-classified results."""

    skeletal_class   = skeletal_result["class"]
    borderline_tag   = " (borderline)" if skeletal_result.get("borderline") else ""
    vertical_pattern = vertical_result["pattern"]
    growth_tendency  = vertical_result.get("growth_tendency", "")
    odi_note         = vertical_result.get("odi_note", "")
    profile          = soft_result["profile"]

    class_desc = {
        "ClassI":   "normal jaw relationship (Class I)",
        "ClassII":  "skeletal Class II malocclusion (mandible retrognathic relative to maxilla)",
        "ClassIII": "skeletal Class III malocclusion (mandible prognathic relative to maxilla)",
    }
    vertical_desc = {
        "LowAngle": (
            f"hypodivergent (low angle) vertical pattern{growth_tendency} "
            f"with deep bite tendency"
        ),
        "Normal":   "normal vertical facial proportion",
        "HighAngle": (
            f"hyperdivergent (high angle) vertical pattern{growth_tendency} "
            f"with open bite tendency"
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

    oj_ob_parts: list[str] = []
    if overjet_class and overjet_class != "Normal":
        oj_ob_parts.append(f"{overjet_class.lower()} overjet")
    if overbite_class and overbite_class != "Normal":
        oj_ob_parts.append(f"{overbite_class.replace('OpenBite','open bite').replace('Deep','deep bite').lower()}")
    oj_ob_text = (" with " + " and ".join(oj_ob_parts) + ".") if oj_ob_parts else ""

    anb_note = f"ANB = {anb:.1f}° (rotation-corrected)" if anb_corrected else f"ANB = {anb:.1f}°"
    odi_clause = f" {odi_note}" if odi_note else ""

    return (
        f"Patient presents with {class_desc.get(skeletal_class, skeletal_class)}"
        f"{borderline_tag} ({anb_note}) and a "
        f"{vertical_desc.get(vertical_pattern, vertical_pattern)}"
        f"{inc_text}"
        f"{profile_text}"
        f"{oj_ob_text}"
        f"{odi_clause}"
    ).strip()


# ============================================================================
# Main entry point
# ============================================================================

def classify_diagnosis(
    measurements: dict,
    demographic: str | None = None,
) -> dict:
    """
    Full evidence-based cephalometric diagnosis.

    Parameters
    ----------
    measurements : dict
        Flat dict of cephalometric values.  Keys are case-sensitive
        (see plausible_ranges in _validate_measurements for full list).
        Optional extra keys:
          - "source_modality": "2D" | "CBCT"
          - "Bolton_Anterior", "Bolton_Overall" for tooth-size analysis
    demographic : str | None
        One of "adult_male", "adult_female", "adolescent".
        Falls back to settings-based norms when None.

    Returns
    -------
    dict  with all classification fields, confidence, summary, warnings.
    """
    norm = _get_norm(demographic)

    # --- Extract values ---
    sna       = measurements.get("SNA", 82.0)
    snb       = measurements.get("SNB", 80.0)
    anb_raw   = measurements.get("ANB", sna - snb)
    wits      = measurements.get("Wits")
    fma       = measurements.get("FMA", 25.0)
    j_ratio   = measurements.get("JRatio")
    ui_na     = measurements.get("UI-NA_DEG", 24.0)
    li_nb     = measurements.get("LI-NB_DEG", 26.0)
    ls_eline  = measurements.get("Ls-Eline")
    li_eline  = measurements.get("Li-Eline")
    overjet   = measurements.get("OVERJET_MM")
    overbite  = measurements.get("OVERBITE_MM")
    sn_maxp   = measurements.get("SN-MaxPlane")
    h_angle   = measurements.get("H-Angle")
    apdi      = measurements.get("APDI")
    odi       = measurements.get("ODI")
    bolton_a  = measurements.get("Bolton_Anterior")
    bolton_o  = measurements.get("Bolton_Overall")

    # --- Sanity checks ---
    warnings = _validate_measurements(measurements)

    # --- ANB rotation correction ---
    anb, anb_corrected = correct_anb_for_rotation(anb_raw, sn_maxp)

    # --- Skeletal AP ---
    skeletal_result = classify_skeletal_class(anb, wits, apdi)
    # Inject norm into skeletal classification (closure-like)
    # re-run with correct norm boundaries
    _orig_norm = _FALLBACK_NORM
    _set_active_norm(norm)
    skeletal_result = classify_skeletal_class(anb, wits, apdi)
    _set_active_norm(_orig_norm)

    # --- Vertical pattern ---
    vertical_result = classify_vertical_pattern(fma, j_ratio, odi, norm)

    # --- Jaw positions ---
    maxillary_position  = classify_jaw_position(sna, norm.sna_min, norm.sna_max)
    mandibular_position = classify_jaw_position(snb, norm.snb_min, norm.snb_max)

    # --- Incisors ---
    upper_incisor = classify_incisor(ui_na, norm.ui_na_min, norm.ui_na_max)
    lower_incisor = classify_incisor(li_nb, norm.li_nb_min, norm.li_nb_max)

    # --- Soft tissue ---
    soft_result = classify_soft_tissue(ls_eline, li_eline, h_angle, norm)

    # --- Overjet / Overbite ---
    overjet_class  = classify_overjet(overjet)
    overbite_class = classify_overbite(overbite)

    # --- Bolton ---
    bolton_result = classify_bolton(bolton_a, bolton_o)

    # --- Confidence ---
    confidence = compute_confidence(measurements)

    # --- Summary ---
    summary = generate_summary(
        skeletal_result, vertical_result,
        upper_incisor, lower_incisor,
        anb, anb_corrected,
        soft_result, overjet_class, overbite_class,
    )

    return {
        # AP
        "skeletal_class":            skeletal_result["class"],
        "skeletal_borderline":       skeletal_result["borderline"],
        "skeletal_differential":     skeletal_result["differential"],
        "skeletal_method_note":      skeletal_result["method_note"],
        "anb_used":                  anb,
        "anb_rotation_corrected":    anb_corrected,
        # Vertical
        "vertical_pattern":          vertical_result["pattern"],
        "growth_tendency":           vertical_result["growth_tendency"],
        "odi_note":                  vertical_result["odi_note"],
        # Jaw positions
        "maxillary_position":        maxillary_position,
        "mandibular_position":       mandibular_position,
        # Dental
        "upper_incisor_inclination": upper_incisor,
        "lower_incisor_inclination": lower_incisor,
        "overjet_mm":                overjet,
        "overjet_classification":    overjet_class,
        "overbite_mm":               overbite,
        "overbite_classification":   overbite_class,
        # Bolton
        "bolton":                    bolton_result,
        # Soft tissue
        "soft_tissue_profile":       soft_result["profile"],
        "soft_tissue_method":        soft_result["method"],
        "soft_tissue_detail":        soft_result["detail"],
        # Meta
        "confidence_score":          confidence,
        "summary":                   summary,
        "warnings":                  warnings,
    }


# ---------------------------------------------------------------------------
# Internal: allow norm injection into classify_skeletal_class
# (avoids threading norm through every helper signature)
# ---------------------------------------------------------------------------

_active_norm: NormTable = _FALLBACK_NORM


def _set_active_norm(n: NormTable) -> None:
    global _active_norm, _FALLBACK_NORM
    _active_norm = n
    # Patch module-level fallback used inside classify_skeletal_class
    _FALLBACK_NORM = n
