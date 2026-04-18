"""
Treatment Planning Engine — Advanced Clinical Decision Support System.
Combines deterministic orthodontic rules with AI-driven rationalization.
"""
from typing import Optional, Any
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
        "rationale_template": "Optimal for Class II correction in hypodivergent patients where orthopedic force can be maximally utilized.",
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
        "rationale_template": "Addresses Class II discrepancy via camouflage by utilizing extraction spaces to retract the maxillary dentition and improve profile.",
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
        "name": "Le Fort I Maxillary Advancment",
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
        "description": "Standard orthodontic alignment to optimize occlusion and smile aesthetics.",
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

def calculate_suitability(rule: dict, skeletal_class: str, vertical_pattern: str, 
                        patient_age: Optional[float], measurements: dict[str, float], 
                        profile: str) -> float:
    """
    Advanced scoring algorithm to determine clinical suitability of a rule.
    Returns a score from 0.0 to 1.0.
    """
    cond = rule["conditions"]
    score = rule["confidence"]
    
    # 1. Mandatory mismatches (Zero score)
    if "skeletal_class" in cond and cond["skeletal_class"] != skeletal_class: return 0.0
    if "vertical_pattern" in cond and cond["vertical_pattern"] != vertical_pattern: return 0.0
    if "profile" in cond and profile != "Unknown" and cond["profile"] != profile:
        score *= 0.8 # Penalize profile mismatch instead of zeroing out (camouflage possible)
        
    # 2. Age Suitability
    if patient_age is not None:
        if "max_age" in cond and patient_age > cond["max_age"]:
            # Hard penalty for growth mod appliances in adults
            if rule["type"] == "Appliance": return 0.0
            score *= 0.5
        if "min_age" in cond and patient_age < cond["min_age"]:
            # Hard penalty for surgery in kids
            if rule["type"] == "Surgery": return 0.0
            score *= 0.5
            
    # 3. Specific Measurement Matching (ANB, Wits, Overjet, JRatio)
    metrics = {
        "anb": measurements.get("ANB"),
        "overjet": measurements.get("OVERJET_MM"),
        "overbite": measurements.get("OVERBITE_MM"),
        "j_ratio": measurements.get("JRatio"),
    }
    
    for key, val in metrics.items():
        if key in cond and val is not None:
            c = cond[key]
            if "min" in c and val < c["min"]: score *= 0.7
            if "max" in c and val > c["max"]: score *= 0.7
            if "min" in c and val >= c["min"]: score += 0.05
            if "max" in c and val <= c["max"]: score += 0.05
            
    return min(1.0, score)

def suggest_treatment(skeletal_class: str, vertical_pattern: str,
                       measurements: dict[str, float],
                       patient_age: Optional[float] = None,
                       profile: str = "Unknown") -> list[dict]:
    """
    Generate ranked treatment plans using advanced suitability scoring.
    """
    scored_plans = []
    
    for rule in TREATMENT_RULES:
        score = calculate_suitability(rule, skeletal_class, vertical_pattern, patient_age, measurements, profile)
        if score > 0.4: # Only suggest plausible plans
            scored_plans.append({
                "plan_index": 0, # To be set after sorting
                "treatment_type": rule["type"],
                "treatment_name": rule["name"],
                "description": rule["description"],
                "rationale": rule["rationale_template"],
                "risks": "Standard orthodontic risks (resorption, decalcification, relapse).",
                "estimated_duration_months": rule["duration"],
                "confidence_score": round(score, 3),
                "source": "RuleBased",
                "is_primary": False
            })
            
    # Sort and refine
    scored_plans.sort(key=lambda x: x["confidence_score"], reverse=True)
    
    for i, plan in enumerate(scored_plans[:3]):
        plan["plan_index"] = i
        plan["is_primary"] = (i == 0)
        
    if not scored_plans:
        # Fallback
        return [{
            "plan_index": 0,
            "treatment_type": "Observation",
            "treatment_name": "Longitudinal Monitoring",
            "description": "Periodical review of growth and dental development.",
            "rationale": "Measurements do not trigger immediate intervention thresholds.",
            "risks": "Potential for malocclusion progression if growth is unfavorable.",
            "estimated_duration_months": 6,
            "confidence_score": 0.50,
            "source": "RuleBased",
            "is_primary": True
        }]
        
    return scored_plans[:3]
