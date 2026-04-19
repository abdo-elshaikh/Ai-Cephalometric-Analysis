"""
Treatment Planning Engine — Advanced Clinical Decision Support System.
Combines deterministic orthodontic rules with AI-driven rationalisation.
"""
from typing import Optional
from config.settings import settings

# ── Clinical Knowledge Base ──────────────────────────────────────────────────

TREATMENT_RULES: list[dict] = [
    # ── Skeletal Class II ─────────────────────────────────────────────────────
    {
        "id": "c2-functional-twin",
        "name": "Twin Block Functional Appliance",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "max_age": 14, "vertical_pattern": "Normal"},
        "description": "Removable appliance to posture the mandible forward, stimulating condylar growth to correct mandibular retrognathism.",
        "rationale_template": "Indicated for growing Class II patients with retrognathic mandible and normal vertical growth pattern.",
        "duration": 18, "confidence": 0.90
    },
    {
        "id": "c2-functional-herbst",
        "name": "Herbst Fixed Appliance",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "max_age": 15, "vertical_pattern": "LowAngle"},
        "description": "Fixed functional appliance for mandibular advancement; highly effective in low-angle (hypodivergent) cases.",
        "rationale_template": "Optimal for Class II correction in hypodivergent patients where orthopedic force can be maximally utilised.",
        "duration": 12, "confidence": 0.92
    },
    {
        "id": "c2-distalization-tad",
        "name": "Molar Distalization with TADs",
        "type": "Mechanotherapy",
        "conditions": {"skeletal_class": "ClassII", "min_age": 16, "vertical_pattern": "Normal"},
        "description": "Non-extraction approach using Temporary Anchorage Devices (TADs) to distalize maxillary molars into a Class I relationship.",
        "rationale_template": "Indicated for mild-to-moderate Class II in non-growing patients to avoid extractions while maintaining anchorage control.",
        "duration": 24, "confidence": 0.85
    },
    {
        "id": "c2-extraction-camouflage",
        "name": "Premolar Extraction (Upper Only or 4 Premolars)",
        "type": "Extraction",
        "conditions": {"skeletal_class": "ClassII", "profile": "Protrusive"},
        "description": "Skeletal camouflage involving the extraction of upper first premolars to retract the anterior segment.",
        "rationale_template": "Addresses Class II discrepancy via camouflage by utilising extraction spaces to retract the maxillary dentition and improve profile.",
        "duration": 24, "confidence": 0.88
    },
    # ── Skeletal Class III ────────────────────────────────────────────────────
    {
        "id": "c3-facemask",
        "name": "Protraction Facemask (Reverse Pull)",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassIII", "max_age": 11},
        "description": "Apply orthopedic force to the maxilla to stimulate forward growth and correct Class III relationship.",
        "rationale_template": "Early intervention for Class III skeletal pattern due to maxillary deficiency in the mixed or early permanent dentition.",
        "duration": 12, "confidence": 0.85
    },
    {
        "id": "c3-camouflage-elastics",
        "name": "Class III Elastics (Bio-mechanics)",
        "type": "Mechanotherapy",
        "conditions": {"skeletal_class": "ClassIII", "min_age": 13, "overjet": {"min": -2, "max": 0}},
        "description": "Dentoalveolar camouflage using long-term Class III elastics to compensate for skeletal discrepancy.",
        "rationale_template": "Indicated for mild Class III skeletal discrepancy where surgical correction is not desired.",
        "duration": 24, "confidence": 0.75
    },
    # ── Orthognathic Surgery ──────────────────────────────────────────────────
    {
        "id": "surg-bsso-mand",
        "name": "Mandibular Advancement (BSSO)",
        "type": "Surgery",
        "conditions": {"skeletal_class": "ClassII", "min_age": 18, "anb": {"min": 7}},
        "description": "Surgical advancement of the mandible for severe skeletal Class II discrepancies.",
        "rationale_template": "Recommended for severe skeletal Class II (ANB > 7°) in adult patients where orthopedic growth modification is no longer possible.",
        "duration": 36, "confidence": 0.95
    },
    {
        "id": "surg-lefort-max",
        "name": "Le Fort I Maxillary Advancement",
        "type": "Surgery",
        "conditions": {"skeletal_class": "ClassIII", "min_age": 18, "anb": {"max": -3}},
        "description": "Surgical advancement of the maxilla to address severe skeletal Class III due to midface deficiency.",
        "rationale_template": "Indicated for significant Class III skeletal discrepancy in non-growing patients with maxillary hypoplasia.",
        "duration": 40, "confidence": 0.92
    },
    # ── Vertical Control ──────────────────────────────────────────────────────
    {
        "id": "vert-molar-intrusion",
        "name": "Molar Intrusion with TADs",
        "type": "Mechanotherapy",
        "conditions": {"vertical_pattern": "HighAngle", "j_ratio": {"max": 59}},
        "description": "Intrude posterior segments using TADs to allow mandibular auto-rotation and reduce the anterior open bite.",
        "rationale_template": "Specifically addresses hyperdivergent pattern by controlling the vertical dimension through posterior intrusion.",
        "duration": 18, "confidence": 0.82
    },
    {
        "id": "vert-intrusion-deepbite",
        "name": "Anterior Intrusion (Utility Arches)",
        "type": "Mechanotherapy",
        "conditions": {"vertical_pattern": "LowAngle", "overbite": {"min": 4}},
        "description": "Intrusion of incisors to correct deep bite in low-angle skeletal patterns.",
        "rationale_template": "Addresses deep overbite in hypodivergent patients through controlled intrusion of the anterior teeth.",
        "duration": 14, "confidence": 0.80
    },
    # ── Comprehensive ─────────────────────────────────────────────────────────
    {
        "id": "gen-braces-align",
        "name": "Comprehensive Fixed Braces",
        "type": "Fixed",
        "conditions": {"skeletal_class": "ClassI"},
        "description": "Standard orthodontic alignment to optimise occlusion and smile aesthetics.",
        "rationale_template": "Indicated for dental crowding or spacing correction in an orthognathic skeletal pattern.",
        "duration": 18, "confidence": 0.98
    },
    {
        "id": "gen-clear-aligners",
        "name": "Clear Aligner Therapy (Invisalign)",
        "type": "Removable",
        "conditions": {"skeletal_class": "ClassI", "profile": "Normal"},
        "description": "Esthetic sequence of clear trays for dental alignment in mild-to-moderate cases.",
        "rationale_template": "Suitable for Class I dental malocclusions where esthetic compliance is a priority.",
        "duration": 12, "confidence": 0.90
    }
]


def calculate_suitability(
    rule: dict,
    skeletal_class: str,
    vertical_pattern: str,
    patient_age: Optional[float],
    measurements: dict[str, float],
    profile: str,
) -> float:
    """
    Score a treatment rule against the patient's clinical profile.

    Returns a suitability score in [0.0, 1.0].
    A score of 0.0 means the rule is contraindicated; it will not be included.
    """
    cond = rule["conditions"]
    score = rule["confidence"]

    # ── Mandatory mismatches (hard exclusions) ────────────────────────────────
    if "skeletal_class" in cond and cond["skeletal_class"] != skeletal_class:
        return 0.0
    if "vertical_pattern" in cond and cond["vertical_pattern"] != vertical_pattern:
        return 0.0
    if "profile" in cond and profile != "Unknown" and cond["profile"] != profile:
        # Penalise rather than zero out — camouflage may still apply
        score *= 0.8

    # ── Age suitability ───────────────────────────────────────────────────────
    if patient_age is not None:
        if "max_age" in cond and patient_age > cond["max_age"]:
            if rule["type"] == "Appliance":
                return 0.0  # Growth modification contraindicated in adults
            score *= 0.5
        if "min_age" in cond and patient_age < cond["min_age"]:
            if rule["type"] == "Surgery":
                return 0.0  # Surgery contraindicated in growing patients
            score *= 0.5

    # ── Specific measurement thresholds ───────────────────────────────────────
    metrics = {
        "anb":     measurements.get("ANB"),
        "overjet": measurements.get("OVERJET_MM"),
        "overbite": measurements.get("OVERBITE_MM"),
        "j_ratio": measurements.get("JRatio"),
    }

    for key, val in metrics.items():
        if key in cond and val is not None:
            c = cond[key]
            if "min" in c and val < c["min"]:
                score *= 0.7
            if "max" in c and val > c["max"]:
                score *= 0.7
            # Bonus for values that fall within the ideal range
            if "min" in c and val >= c["min"]:
                score += 0.05
            if "max" in c and val <= c["max"]:
                score += 0.05

    return min(1.0, score)


_MINIMUM_SUITABILITY = 0.4


def suggest_treatment(
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    patient_age: Optional[float] = None,
    profile: str = "Unknown",
) -> list[dict]:
    """
    Generate ranked treatment plans using the clinical suitability scoring algorithm.

    Returns up to 3 plans sorted by descending confidence score.
    Falls back to a monitoring plan when no rule exceeds the suitability threshold.
    """
    scored_plans: list[dict] = []

    for rule in TREATMENT_RULES:
        score = calculate_suitability(
            rule, skeletal_class, vertical_pattern, patient_age, measurements, profile
        )
        if score >= _MINIMUM_SUITABILITY:
            scored_plans.append({
                "plan_index": 0,  # Set after sorting
                "treatment_type": rule["type"],
                "treatment_name": rule["name"],
                "description": rule["description"],
                "rationale": rule["rationale_template"],
                "risks": "Standard orthodontic risks (resorption, decalcification, relapse).",
                "estimated_duration_months": rule["duration"],
                "confidence_score": round(score, 3),
                "source": "RuleBased",
                "is_primary": False,
            })

    # Sort descending by confidence; take the top 3
    scored_plans.sort(key=lambda x: x["confidence_score"], reverse=True)
    top_plans = scored_plans[:3]

    for i, plan in enumerate(top_plans):
        plan["plan_index"] = i
        plan["is_primary"] = i == 0

    if not top_plans:
        return [{
            "plan_index": 0,
            "treatment_type": "Observation",
            "treatment_name": "Longitudinal Monitoring",
            "description": "Periodic review of growth and dental development.",
            "rationale": "Current measurements do not meet immediate intervention thresholds.",
            "risks": "Potential for malocclusion progression if growth is unfavourable.",
            "estimated_duration_months": 6,
            "confidence_score": 0.50,
            "source": "RuleBased",
            "is_primary": True,
        }]

    return top_plans
