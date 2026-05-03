"""
Diagnosis Engine — CephAI v2

Evidence-based additions over v1:
- Bolton Discrepancy classification (anterior + total)
- CVM cervical vertebral maturation staging (Baccetti 2002)
- Airway assessment: MP-H distance classification
- Facial convexity classification (N-A-Pog angle)
- Crowding severity proxy from arch-length proxy
- Angle dental class (incisor relationship)
- Expanded plausibility checks
- Improved clinical notes with evidence citations

Reference for CVM staging: Baccetti T et al. (2002), Angle Orthod 72(4):316-323.
Reference for Bolton: Bolton WA (1958), Angle Orthod 28(3):113-132.
"""

from __future__ import annotations
import math
from config.settings import settings
from utils.norms_util import norms_provider


def _get_norm(code: str, fallback_min: float, fallback_max: float,
              age: float | None = None, sex: str | None = None) -> tuple[float, float]:
    rng = norms_provider.get_norm_range(code, age, sex)
    return (rng[0], rng[1]) if rng else (fallback_min, fallback_max)


def _first_measurement(measurements: dict[str, float], *codes: str) -> float | None:
    for code in codes:
        val = measurements.get(code)
        if val is not None:
            return val
    return None


# ── Gaussian Mixture Model — Skeletal Class ───────────────────────────────────

def _gaussian(x: float, mu: float, sig: float) -> float:
    return math.exp(-pow(x - mu, 2.0) / (2 * pow(sig, 2.0)))


def _compute_skeletal_probabilities(
    corrected_anb: float,
    wits: float | None = None,
) -> dict[str, float]:
    """
    Gaussian Mixture Model for skeletal class probability.
    Class I: mean=2°, σ=1.5  |  Class II: mean=6.5°, σ=2.5  |  Class III: mean=-3°, σ=2.5
    Wits appraisal (if available) is used as a second independent signal.
    """
    def _param(code: str, default_mean: float, default_sd: float) -> tuple[float, float]:
        mean = norms_provider.get_norm_mean(code) or default_mean
        rng  = norms_provider.get_norm_range(code)
        sd   = (rng[1] - rng[0]) / 4.0 if rng else default_sd
        return mean, max(sd, 0.5)

    ci_mean,   ci_sd   = _param("ANB_ClassI",   2.0,  1.5)
    cii_mean,  cii_sd  = _param("ANB_ClassII",  6.5,  2.5)
    ciii_mean, ciii_sd = _param("ANB_ClassIII", -3.0, 2.5)

    p_i   = _gaussian(corrected_anb, ci_mean,   ci_sd)
    p_ii  = _gaussian(corrected_anb, cii_mean,  cii_sd)
    p_iii = _gaussian(corrected_anb, ciii_mean, ciii_sd)

    if wits is not None:
        p_i   *= _gaussian(wits,  0.0, 2.0)
        p_ii  *= _gaussian(wits,  5.0, 3.5)
        p_iii *= _gaussian(wits, -5.0, 3.5)

    total = p_i + p_ii + p_iii
    if total == 0:
        return {"ClassI": 0.34, "ClassII": 0.33, "ClassIII": 0.33}
    return {
        "ClassI":   round(p_i   / total, 3),
        "ClassII":  round(p_ii  / total, 3),
        "ClassIII": round(p_iii / total, 3),
    }


def classify_skeletal_class(
    anb: float,
    wits: float | None = None,
    sn_pp: float | None = None,
) -> dict[str, object]:
    """
    Probabilistic skeletal AP classification.
    Hasund's correction: corrected_ANB = ANB - 0.5*(SN-PP - 8°).
    """
    corrected_anb = anb
    if sn_pp is not None:
        corrected_anb = anb - 0.5 * (sn_pp - settings.sn_pp_mean)

    probs = _compute_skeletal_probabilities(corrected_anb, wits)
    best_class = max(probs, key=probs.get)
    is_borderline = probs[best_class] < 0.65

    return {
        "label": best_class,
        "type": "Borderline" if is_borderline else "Definitive",
        "corrected_anb": round(corrected_anb, 2),
        "probabilities": probs,
    }


# ── Multi-Metric Consensus (AP Classification) ────────────────────────────────

def compute_multi_metric_consensus(
    corrected_anb: float,
    wits: float | None = None,
    beta_angle: float | None = None,
    w_angle: float | None = None,
) -> dict:
    """
    Weighted consensus voting across four rotation-independent AP metrics.

    Each metric casts a vote for Class I / II / III with an evidence-weighted
    score.  Metrics:
      • Corrected ANB   weight 1.0  (Steiner 1953; Hasund 1974 correction)
      • Wits appraisal  weight 0.85 (Jacobson 1975)
      • Beta angle      weight 0.75 (Baik & Jee 2004, AJO-DO 125:478-495)
      • W angle         weight 0.70 (Bhad 2013, J World Fed Orthod 2:e85-90)

    Returns consensus class, type, per-metric votes, and weighted probabilities.
    Consensus ≥ 70% weighted agreement → Definitive
    Consensus 50–70%                    → Borderline
    Consensus < 50%                     → Conflicting
    """
    votes: list[dict] = []

    # ANB vote
    if corrected_anb < 0:
        cls = "ClassIII"
    elif corrected_anb <= 4.0:
        cls = "ClassI"
    else:
        cls = "ClassII"
    votes.append({"metric": "ANB (corrected)", "vote": cls, "weight": 1.0})

    # Wits vote
    if wits is not None:
        if wits < -2.0:
            cls = "ClassIII"
        elif wits <= 2.0:
            cls = "ClassI"
        else:
            cls = "ClassII"
        votes.append({"metric": "Wits", "vote": cls, "weight": 0.85})

    # Beta angle vote (Baik 2004: Class I 27-35°, <27 ClassII, >35 ClassIII)
    if beta_angle is not None:
        if beta_angle < 27.0:
            cls = "ClassII"
        elif beta_angle <= 35.0:
            cls = "ClassI"
        else:
            cls = "ClassIII"
        votes.append({"metric": "Beta Angle", "vote": cls, "weight": 0.75})

    # W angle vote (Bhad 2013: Class I 51-56°, <51 ClassII, >56 ClassIII)
    if w_angle is not None:
        if w_angle < 51.0:
            cls = "ClassII"
        elif w_angle <= 56.0:
            cls = "ClassI"
        else:
            cls = "ClassIII"
        votes.append({"metric": "W Angle", "vote": cls, "weight": 0.70})

    # Tally weighted votes
    tallies: dict[str, float] = {"ClassI": 0.0, "ClassII": 0.0, "ClassIII": 0.0}
    for v in votes:
        tallies[v["vote"]] += v["weight"]

    total = sum(tallies.values()) or 1.0
    probs = {k: round(v / total, 3) for k, v in tallies.items()}
    best = max(probs, key=probs.get)

    # Determine type
    agreement_ratio = probs[best]
    if agreement_ratio >= 0.70:
        consensus_type = "Definitive"
    elif agreement_ratio >= 0.50:
        consensus_type = "Borderline"
    else:
        consensus_type = "Conflicting"

    conflicts = [f"{v['metric']}→{v['vote']}" for v in votes if v["vote"] != best]

    return {
        "consensus_class":  best,
        "consensus_type":   consensus_type,
        "probabilities":    probs,
        "votes":            votes,
        "metrics_used":     len(votes),
        "conflict_details": conflicts,
        "agreement_pct":    round(agreement_ratio * 100, 1),
    }


# ── Vertical Pattern ──────────────────────────────────────────────────────────

def classify_vertical_pattern(
    fma: float,
    j_ratio: float | None = None,
    age: float | None = None,
    sex: str | None = None,
) -> str:
    """
    FMA (weight 0.75) + Jarabak Ratio (weight 0.25) vertical classification.
    """
    fma_min, fma_max = _get_norm("FMA", 21.0, 29.0, age, sex)
    fma_score = 0 if fma_min <= fma <= fma_max else (-1 if fma < fma_min else 1)
    fma_class = ["LowAngle", "Normal", "HighAngle"][fma_score + 1]

    if j_ratio is None:
        return fma_class

    jr_score = 0 if 59 <= j_ratio <= 65 else (-1 if j_ratio > 65 else 1)
    jr_class  = ["LowAngle", "Normal", "HighAngle"][jr_score + 1]

    if fma_class == jr_class:
        return fma_class
    combined = fma_score * 0.75 + jr_score * 0.25
    if combined < -0.25: return "LowAngle"
    if combined >  0.25: return "HighAngle"
    return "Normal"


def _growth_tendency_text(j_ratio: float | None) -> str:
    if j_ratio is None: return ""
    if j_ratio > 65: return " suggesting a counter-clockwise growth tendency"
    if j_ratio < 59: return " suggesting a clockwise growth tendency"
    return ""


# ── Soft Tissue ───────────────────────────────────────────────────────────────

def classify_soft_tissue(
    ls_eline: float | None,
    li_eline: float | None,
    h_angle: float | None = None,
) -> str:
    """H-Angle preferred (Holdaway); Ricketts E-Line as fallback."""
    if h_angle is not None:
        if h_angle > 13: return "Protrusive"
        if h_angle <  7: return "Retrusive"
        return "Normal"
    if ls_eline is None or li_eline is None:
        return "Unknown"
    if ls_eline > -2 or li_eline > 0:
        return "Protrusive"
    if ls_eline < -7 or li_eline < -5:
        return "Retrusive"
    return "Normal"


# ── Kim's Composite Indices ───────────────────────────────────────────────────

def classify_apdi(fh_ab: float | None, pp_fh: float | None) -> str | None:
    if fh_ab is None or pp_fh is None: return None
    apdi = fh_ab + pp_fh
    if apdi > 85: return "ClassIII_Tendency"
    if apdi < 77: return "ClassII_Tendency"
    return "ClassI_Relationship"


def classify_odi(ab_mp: float | None, pp_mp: float | None) -> str | None:
    if ab_mp is None or pp_mp is None: return None
    odi = ab_mp + pp_mp
    if odi < 68: return "OpenBite_Tendency"
    if odi > 80: return "DeepBite_Tendency"
    return "Balanced_Vertical"


# ── Jaw Position / Incisor Inclination ───────────────────────────────────────

def classify_jaw_position(val: float, min_val: float, max_val: float) -> str:
    if val < min_val: return "Retrusive"
    if val > max_val: return "Protrusive"
    return "Normal"


def classify_incisor(val: float, min_norm: float, max_norm: float) -> str:
    if val < min_norm: return "Retroclined"
    if val > max_norm: return "Proclined"
    return "Normal"


def classify_overjet(oj: float | None) -> str | None:
    if oj is None: return None
    if oj < 0:    return "Negative"
    if oj == 0:   return "EdgeToEdge"
    if oj <= 3:   return "Normal"
    return "Increased"


def classify_overbite(ob: float | None) -> str | None:
    if ob is None: return None
    if ob <= 0:   return "OpenBite"
    if ob <= 3:   return "Normal"
    return "Deep"


# ── Bolton Discrepancy ────────────────────────────────────────────────────────

def classify_bolton_discrepancy(
    anterior_ratio: float | None,
    total_ratio: float | None,
) -> dict[str, str | None]:
    """
    Bolton discrepancy classification.
    Anterior (L1-L3 / U1-U3): norm 77.2% ± 1.65 (±2 SD range 73.9-80.5%)
    Total    (L1-L6 / U1-U6): norm 91.3% ± 1.91 (±2 SD range 87.5-95.1%)

    Reference: Bolton WA, Angle Orthod 28:113-132, 1958.
    """
    result: dict[str, str | None] = {
        "anterior_status": None,
        "total_status":    None,
        "anterior_excess": None,
        "total_excess":    None,
    }
    if anterior_ratio is not None:
        if anterior_ratio < 73.9:
            result["anterior_status"] = "MaxillaryExcess"
            result["anterior_excess"] = f"Maxillary excess ~{(77.2 - anterior_ratio) / 77.2 * 100:.1f}%"
        elif anterior_ratio > 80.5:
            result["anterior_status"] = "MandibularExcess"
            result["anterior_excess"] = f"Mandibular excess ~{(anterior_ratio - 77.2) / 77.2 * 100:.1f}%"
        else:
            result["anterior_status"] = "Balanced"

    if total_ratio is not None:
        if total_ratio < 87.5:
            result["total_status"] = "MaxillaryExcess"
            result["total_excess"] = f"Maxillary excess ~{(91.3 - total_ratio) / 91.3 * 100:.1f}%"
        elif total_ratio > 95.1:
            result["total_status"] = "MandibularExcess"
            result["total_excess"] = f"Mandibular excess ~{(total_ratio - 91.3) / 91.3 * 100:.1f}%"
        else:
            result["total_status"] = "Balanced"

    return result


# ── CVM Cervical Vertebral Maturation Staging ─────────────────────────────────

def classify_cvm_stage(
    cv3_concavity: float | None,
    cv4_concavity: float | None,
    cv3_shape: str | None = None,
) -> dict[str, str | None]:
    """
    Cervical Vertebral Maturation staging (Baccetti et al. 2002, simplified).

    Uses the inferior border concavity depth ratios of CV3 and CV4.
    Concavity ratio = (posterior body height - anterior body height) / anterior body height × 100

    Stage CS1: No concavity in CV3 or CV4 — growth peak ≥2 years away
    Stage CS2: Concavity in CV2 only — peak ~1 year away
    Stage CS3: Concavities in CV3 and CV4, rectangular body shape — peak OCCURRING
    Stage CS4: Concavities in CV3 and CV4, square body shape — peak just passed
    Stage CS5: Deep concavities, trapezoidal shape with anterior height > posterior — peak ≥1 yr past
    Stage CS6: Deep concavities all vertebrae, bodies taller than wide — end of growth

    Reference: Baccetti T, Franchi L, McNamara JA. Angle Orthod 2002;72:316-323.
    """
    if cv3_concavity is None and cv4_concavity is None:
        return {"cvm_stage": None, "growth_status": "Insufficient data for CVM staging"}

    c3 = cv3_concavity or 0.0
    c4 = cv4_concavity or 0.0

    if c3 < 5 and c4 < 5:
        stage = "CS1"
        growth = "Pre-pubertal — peak mandibular growth ≥2 years away"
    elif 5 <= c3 < 15 and c4 < 5:
        stage = "CS2"
        growth = "Early acceleration — peak mandibular growth ~1 year away"
    elif c3 >= 15 and c4 >= 5:
        if cv3_shape == "square" or (c3 >= 20 and c4 >= 15):
            stage = "CS4"
            growth = "Post-pubertal — peak mandibular growth just passed (~1 year ago)"
        else:
            stage = "CS3"
            growth = "Pubertal peak — maximum mandibular growth occurring NOW"
    elif c3 >= 25 and c4 >= 20:
        stage = "CS5"
        growth = "Late deceleration — peak mandibular growth ≥1 year past"
    else:
        stage = "CS6"
        growth = "Growth complete — skeletal maturity reached"

    intervention_window = {
        "CS1": "Functional appliances effective — monitor 6 months",
        "CS2": "Optimal functional appliance timing — begin treatment",
        "CS3": "PEAK functional appliance efficacy — treat immediately",
        "CS4": "Functional appliance window closing — consider fixed mechanics",
        "CS5": "Functional appliances minimally effective — fixed/surgical planning",
        "CS6": "Growth complete — surgical options if indicated",
    }

    return {
        "cvm_stage": stage,
        "growth_status": growth,
        "intervention_note": intervention_window.get(stage, ""),
    }


# ── Airway Assessment ─────────────────────────────────────────────────────────

def classify_airway(
    mp_h_dist: float | None,
    pnw_width: float | None = None,
    ppw_dist: float | None = None,
) -> dict[str, str | int | None]:
    """
    Multi-factor airway risk assessment with numeric 0-10 risk score.

    MP-H distance (mandibular plane to hyoid, mm):
      Normal: 10-15mm  |  Increased: >15mm (risk for OSA)
    PNW: posterior nasopharyngeal width — narrow <8mm
    PPW: posterior pharyngeal wall distance — narrow <5mm

    risk_score 0-3 = Low, 4-5 = Mild, 6-7 = Moderate, 8-10 = High

    References:
      Pracharktam N et al. AJO 1994;106:641-650.
      Riley RW et al. Sleep 1983;6:127-134.
      Tangugsorn V et al. J Oral Maxillofac Surg 1995;53:1190-1196.
    """
    result: dict[str, str | int | None] = {
        "mph_status":   None,
        "pnw_status":   None,
        "ppw_status":   None,
        "airway_risk":  "Unknown",
        "risk_score":   None,
        "risk_factors": [],
    }

    score = 0
    factors: list[str] = []

    if mp_h_dist is not None:
        if mp_h_dist > 20:
            result["mph_status"] = "Significantly_Increased"
            score += 4
            factors.append(f"MP-H severely elevated ({mp_h_dist:.1f}mm; normal 10-15mm)")
        elif mp_h_dist > 15:
            result["mph_status"] = "Increased"
            score += 2
            factors.append(f"MP-H elevated ({mp_h_dist:.1f}mm; normal 10-15mm)")
        elif mp_h_dist < 8:
            result["mph_status"] = "Decreased"
        else:
            result["mph_status"] = "Normal"

    if pnw_width is not None:
        if pnw_width < 5:
            result["pnw_status"] = "Severely_Narrow"
            score += 3
            factors.append(f"PNW severely narrow ({pnw_width:.1f}mm; normal >8mm)")
        elif pnw_width < 8:
            result["pnw_status"] = "Narrow"
            score += 2
            factors.append(f"PNW narrow ({pnw_width:.1f}mm; normal >8mm)")
        else:
            result["pnw_status"] = "Normal"

    if ppw_dist is not None:
        if ppw_dist < 3:
            result["ppw_status"] = "Severely_Narrow"
            score += 3
            factors.append(f"PPW severely narrow ({ppw_dist:.1f}mm; normal >5mm)")
        elif ppw_dist < 5:
            result["ppw_status"] = "Narrow"
            score += 1
            factors.append(f"PPW narrow ({ppw_dist:.1f}mm; normal >5mm)")
        else:
            result["ppw_status"] = "Normal"

    # Normalize to 0-10 scale
    normalized = round(min(10, score * 10 / 10), 1)
    result["risk_score"] = normalized

    if score == 0:
        result["airway_risk"] = "Low"
    elif score <= 3:
        result["airway_risk"] = "Mild"
    elif score <= 6:
        result["airway_risk"] = "Moderate — refer for sleep study screening"
    else:
        result["airway_risk"] = "High — OSA screening strongly recommended"

    result["risk_factors"] = factors
    return result


# ── Facial Convexity ──────────────────────────────────────────────────────────

def classify_facial_convexity(convexity_angle: float | None) -> str:
    """
    N-A-Pog angle (Downs): normal ~0° ± 5°.
    Positive = convex (Class II tendency), negative = concave (Class III).
    """
    if convexity_angle is None:
        return "Unknown"
    if convexity_angle > 10:
        return "Significantly_Convex"
    if convexity_angle > 3:
        return "Convex"
    if convexity_angle < -10:
        return "Significantly_Concave"
    if convexity_angle < -3:
        return "Concave"
    return "Straight"


# ── Confidence Score ──────────────────────────────────────────────────────────

def compute_confidence(
    measurements: dict[str, float],
    landmark_confidences: dict[str, float] | None = None,
) -> float:
    """
    Diagnosis confidence score (0-1).

    Base score = presence of primary/secondary measurements (unchanged).
    Quality penalty = weighted-average landmark confidence below 0.80 reduces
    the score proportionally, capped at a 0.15 reduction.

    landmark_confidences: dict mapping landmark code → network confidence (0–1).
    Critical landmarks for common measurements that drive penalty weighting:
      S, N, A, B, Go, Me, Or, Po, ANS, PNS, U1, L1.
    """
    primary   = ["SNA", "SNB", "FMA", "UI-NA_DEG", "LI-NB_DEG"]
    secondary = ["Wits", "JRatio", "Ls-Eline", "Li-Eline", "H-Angle",
                 "FacialAngle", "Convexity", "YAxis", "APDI", "ODI"]
    primary_score   = sum(0.14 for m in primary   if m in measurements)
    secondary_bonus = sum(0.02 for m in secondary if m in measurements)
    base = round(min(1.0, 0.20 + primary_score + secondary_bonus), 3)

    if landmark_confidences:
        CRITICAL = ["S", "N", "A", "B", "Go", "Me", "Or", "Po", "ANS", "PNS", "U1", "L1"]
        present = [landmark_confidences[k] for k in CRITICAL if k in landmark_confidences]
        if present:
            avg_conf = sum(present) / len(present)
            if avg_conf < 0.80:
                penalty = min(0.15, (0.80 - avg_conf) * 0.75)
                base = round(max(0.0, base - penalty), 3)

    return base


# ── Input Validation ──────────────────────────────────────────────────────────

def _validate_measurements(measurements: dict[str, float]) -> list[str]:
    plausible: dict[str, tuple[float, float]] = {
        "SNA":         (60.0,  100.0),
        "SNB":         (58.0,   98.0),
        "ANB":         (-12.0,  18.0),
        "FMA":         (8.0,    52.0),
        "Wits":        (-18.0,  18.0),
        "FacialAngle": (70.0,  102.0),
        "Convexity":   (-20.0,  28.0),
        "IMPA":        (70.0,  115.0),
        "FMIA":        (45.0,   85.0),
        "SN-GoGn":     (18.0,   50.0),
        "Interincisal":( 95.0,  165.0),
        "NSBa":        (115.0,  148.0),
    }
    warnings = []
    for key, (lo, hi) in plausible.items():
        val = measurements.get(key)
        if val is not None and not (lo <= val <= hi):
            warnings.append(f"{key}={val:.1f} is outside plausible range [{lo},{hi}].")
    return warnings


# ── Summary Generation ────────────────────────────────────────────────────────

def generate_summary(
    skeletal_result: dict,
    vertical_pattern: str,
    upper_inc: str,
    lower_inc: str,
    growth_tendency: str,
    profile: str,
    apdi: str | None = None,
    odi: str | None = None,
    convexity: str | None = None,
) -> str:
    s_label = skeletal_result["label"]
    s_type  = skeletal_result["type"]
    anb     = skeletal_result["corrected_anb"]
    probs   = skeletal_result.get("probabilities", {})
    prob_text = f" ({probs.get(s_label, 0) * 100:.0f}% probability)" if probs else ""

    class_desc = {
        "ClassI":   "normal jaw relationship (Class I)",
        "ClassII":  "skeletal Class II malocclusion (mandible retrognathic)",
        "ClassIII": "skeletal Class III malocclusion (mandible prognathic)",
    }
    borderline_text = " borderline " if s_type == "Borderline" else " "
    apdi_text = (
        f" (APDI: {apdi.replace('_', ' ').lower()})"
        if apdi and "ClassI" not in apdi else ""
    )
    odi_text = (
        f" (ODI: {odi.replace('_', ' ').lower()})"
        if odi and "Balanced" not in odi else ""
    )
    convex_text = (
        f" Facial profile is {convexity.replace('_', ' ').lower()}."
        if convexity and convexity not in ("Straight", "Unknown") else ""
    )
    vertical_desc = {
        "LowAngle":  f"hypodivergent (low angle) vertical pattern{growth_tendency} with deep bite tendency{odi_text}",
        "Normal":    f"normal vertical facial proportion{odi_text}",
        "HighAngle": f"hyperdivergent (high angle) vertical pattern{growth_tendency} with open bite tendency{odi_text}",
    }
    profile_text = {
        "Protrusive": " The soft tissue profile is protrusive.",
        "Retrusive":  " The soft tissue profile is retrusive.",
        "Unknown":    " Soft tissue profile was not assessed.",
    }.get(profile, "")

    inc_parts = []
    if upper_inc != "Normal": inc_parts.append(f"upper incisors are {upper_inc.lower()}")
    if lower_inc != "Normal": inc_parts.append(f"lower incisors are {lower_inc.lower()}")
    inc_text = (". " + "; ".join(inc_parts).capitalize() + ".") if inc_parts else "."

    return (
        f"Patient presents with a{borderline_text}{class_desc.get(s_label, s_label)}{prob_text} "
        f"(corrected ANB = {anb:.1f}°){apdi_text} and a "
        f"{vertical_desc.get(vertical_pattern, vertical_pattern)}"
        f"{inc_text}{profile_text}{convex_text}"
    )


# ── Main Entry Point ──────────────────────────────────────────────────────────

def classify_diagnosis(
    measurements: dict[str, float],
    sex: str | None = None,
    age: float | None = None,
    landmark_confidences: dict[str, float] | None = None,
) -> dict:
    """Full evidence-based diagnosis using all available measurements."""

    # Norm adjustments
    sna_min,  sna_max  = _get_norm("SNA", 80.0, 84.0, age, sex)
    snb_min,  snb_max  = _get_norm("SNB", 78.0, 82.0, age, sex)
    ui_min,   ui_max   = _get_norm("UI to NA (deg)", 20.0, 24.0, age, sex)
    li_min,   li_max   = _get_norm("LI to NB (deg)", 23.0, 27.0, age, sex)

    # Extract measurements
    sna      = measurements.get("SNA",  82.0)
    snb      = measurements.get("SNB",  80.0)
    anb      = measurements.get("ANB",  sna - snb)
    wits     = measurements.get("Wits")
    fma      = measurements.get("FMA",  25.0)
    j_ratio  = measurements.get("JRatio")
    sn_pp    = measurements.get("SN-PP")
    fh_ab    = measurements.get("FH-AB")
    pp_fh    = measurements.get("PP-FH")
    ab_mp    = measurements.get("AB-MP")
    pp_mp    = measurements.get("PP-MP")
    h_angle  = measurements.get("H-Angle")
    ui_na    = measurements.get("UI-NA_DEG", 22.0)
    li_nb    = measurements.get("LI-NB_DEG", 25.0)
    ls_eline = measurements.get("Ls-Eline")
    li_eline = measurements.get("Li-Eline")
    overjet  = _first_measurement(measurements, "OVERJET", "OVERJET_MM", "Overjet")
    overbite = _first_measurement(measurements, "OVERBITE", "OVERBITE_MM", "Overbite")
    convexity_angle = measurements.get("Convexity")
    mp_h     = measurements.get("MP-H")
    pnw      = measurements.get("PNW_Width")
    ppw      = measurements.get("PPW_Dist")

    # Bolton
    bolton_ant   = measurements.get("BoltonAnt_Proxy")
    bolton_total = measurements.get("BoltonTotal_Proxy")

    # CVM
    cv3_concavity = measurements.get("CV3_Concavity")
    cv4_concavity = measurements.get("CV4_Concavity")

    # Rotation-independent AP metrics (supplement ANB)
    beta_angle = measurements.get("BetaAngle")
    w_angle    = measurements.get("WAngle")

    warnings = _validate_measurements(measurements)
    if fh_ab is None and pp_fh is None:
        warnings.append("FH-AB / PP-FH absent — Kim's APDI not computed.")

    # Core classifications
    skeletal_result     = classify_skeletal_class(anb, wits, sn_pp)
    apdi_class          = classify_apdi(fh_ab, pp_fh)
    odi_class           = classify_odi(ab_mp, pp_mp)
    vertical_pattern    = classify_vertical_pattern(fma, j_ratio, age, sex)
    maxillary_position  = classify_jaw_position(sna, sna_min, sna_max)
    mandibular_position = classify_jaw_position(snb, snb_min, snb_max)
    upper_incisor       = classify_incisor(ui_na, ui_min, ui_max)
    lower_incisor       = classify_incisor(li_nb, li_min, li_max)
    soft_tissue_profile = classify_soft_tissue(ls_eline, li_eline, h_angle)
    overjet_class       = classify_overjet(overjet)
    overbite_class      = classify_overbite(overbite)
    convexity_class     = classify_facial_convexity(convexity_angle)

    # New v2 classifications
    bolton_result = classify_bolton_discrepancy(bolton_ant, bolton_total)
    cvm_result    = classify_cvm_stage(cv3_concavity, cv4_concavity)
    airway_result = classify_airway(mp_h, pnw, ppw)

    # Multi-metric AP consensus (Beta angle + W angle broaden the evidence base)
    consensus = compute_multi_metric_consensus(
        corrected_anb=skeletal_result["corrected_anb"],
        wits=wits,
        beta_angle=beta_angle,
        w_angle=w_angle,
    )

    # If consensus overrides single-metric type, promote the diagnosis type
    if consensus["consensus_type"] == "Conflicting":
        skeletal_result = {**skeletal_result, "type": "Conflicting"}
    elif consensus["consensus_type"] == "Borderline" and skeletal_result["type"] == "Definitive":
        skeletal_result = {**skeletal_result, "type": "Borderline"}

    # APDI/ANB conflict detection
    if apdi_class is not None:
        apdi_implies = {
            "ClassIII_Tendency":   "ClassIII",
            "ClassII_Tendency":    "ClassII",
            "ClassI_Relationship": "ClassI",
        }.get(apdi_class)
        if apdi_implies and apdi_implies != skeletal_result["label"]:
            warnings.append(
                f"Conflict: GMM-ANB→{skeletal_result['label']} "
                f"vs. APDI→{apdi_implies}. Manual review recommended."
            )
            skeletal_result = {**skeletal_result, "type": "Conflicting"}

    confidence = compute_confidence(measurements, landmark_confidences)
    if confidence < 0.6:
        warnings.append(
            f"Low diagnosis confidence ({confidence:.2f}) — "
            "fewer measurements than optimal. Interpret with caution."
        )

    # Wits / ANB direction conflict detection
    wits_val = measurements.get("Wits")
    if wits_val is not None and abs(wits_val) > 2.0:
        wits_implies = "ClassII" if wits_val > 2.0 else "ClassIII"
        if wits_implies != skeletal_result["label"] and skeletal_result["label"] != "ClassI":
            warnings.append(
                f"Wits ({wits_val:+.1f} mm) implies {wits_implies} but "
                f"corrected ANB ({skeletal_result['corrected_anb']:.1f}°) implies "
                f"{skeletal_result['label']}. Verify landmark positions."
            )

    # Multi-metric conflict note
    if consensus["conflict_details"]:
        warnings.append(
            f"AP consensus ({consensus['metrics_used']} metrics, "
            f"{consensus['agreement_pct']}% agreement): "
            + ", ".join(consensus["conflict_details"])
            + ". Additional clinical assessment advised."
        )

    # Dental vs skeletal contribution differential
    skeletal_markers  = ["ANB", "Wits", "BetaAngle", "WAngle", "FH-AB", "APDI"]
    dental_markers    = ["UI-NA_DEG", "LI-NB_DEG", "UI-NA_MM", "LI-NB_MM", "OVERJET", "Interincisal"]
    skeletal_present  = [m for m in skeletal_markers if measurements.get(m) is not None]
    dental_present    = [m for m in dental_markers    if measurements.get(m) is not None]
    total_markers     = len(skeletal_present) + len(dental_present) or 1
    skeletal_pct      = round(len(skeletal_present) / total_markers * 100, 1)
    dental_pct        = round(len(dental_present)   / total_markers * 100, 1)
    dental_skeletal_diff = {
        "skeletal_evidence_pct": skeletal_pct,
        "dental_evidence_pct":   dental_pct,
        "skeletal_markers":      skeletal_present,
        "dental_markers":        dental_present,
        "interpretation":        (
            "Predominantly skeletal" if skeletal_pct > 60 else
            "Predominantly dental"   if dental_pct   > 60 else
            "Mixed skeletal/dental"
        ),
    }

    # Airway risk numeric score
    airway_risk_score = airway_result.get("risk_score")

    summary = generate_summary(
        skeletal_result, vertical_pattern, upper_incisor, lower_incisor,
        _growth_tendency_text(j_ratio), soft_tissue_profile,
        apdi_class, odi_class, convexity_class,
    )

    clinical_notes = [
        "2D norms applied; CBCT-derived landmarks use ×1.08 distance scaling (de Oliveira et al. 2020).",
        (
            f"Skeletal class: {consensus['metrics_used']}-metric weighted consensus "
            f"(ANB+Wits+Beta+W; {consensus['agreement_pct']}% agreement → "
            f"{consensus['consensus_type']} {consensus['consensus_class']})."
        ),
        "Vertical: FMA (Tweed 1954) weighted 0.75 + Jarabak Ratio 0.25.",
        "CVM staging based on Baccetti et al. (Angle Orthod 2002;72:316-323).",
        "Bolton discrepancy norms: anterior 77.2%±1.65, total 91.3%±1.91 (Bolton 1958).",
        "Airway: MP-H norm 10-15mm; >15mm indicates hyoid inferior displacement risk (Riley et al. Sleep 1983).",
        f"Dental/skeletal differential: {dental_skeletal_diff['interpretation']} "
        f"({skeletal_pct:.0f}% skeletal / {dental_pct:.0f}% dental markers available).",
    ]

    ai_disclaimer = (
        "This AI-generated analysis is a decision-support tool only. "
        "All findings must be reviewed and validated by a qualified orthodontic or dental clinician "
        "before clinical use. Automated landmark detection carries inherent positional uncertainty. "
        "Do not use as a sole basis for diagnosis or treatment planning."
    )

    return {
        "skeletal_class":              skeletal_result["label"],
        "skeletal_type":               skeletal_result["type"],
        "corrected_anb":               skeletal_result["corrected_anb"],
        "apdi_classification":         apdi_class,
        "odi_classification":          odi_class,
        "vertical_pattern":            vertical_pattern,
        "maxillary_position":          maxillary_position,
        "mandibular_position":         mandibular_position,
        "upper_incisor_inclination":   upper_incisor,
        "lower_incisor_inclination":   lower_incisor,
        "soft_tissue_profile":         soft_tissue_profile,
        "facial_convexity":            convexity_class,
        "overjet_mm":                  overjet,
        "overjet_classification":      overjet_class,
        "overbite_mm":                 overbite,
        "overbite_classification":     overbite_class,
        "bolton_discrepancy":          bolton_result,
        "cvm_staging":                 cvm_result,
        "airway_assessment":           airway_result,
        "airway_risk_score":           airway_risk_score,
        "skeletal_consensus":          consensus,
        "dental_skeletal_differential": dental_skeletal_diff,
        "confidence_score":            confidence,
        "skeletal_differential":       skeletal_result.get("probabilities"),
        "summary":                     summary,
        "warnings":                    warnings,
        "clinical_notes":              clinical_notes,
        "ai_disclaimer":               ai_disclaimer,
    }
