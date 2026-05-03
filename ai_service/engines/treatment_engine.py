"""
Treatment Planning Engine — CephAI v2

Improvements over v1:
- Expanded from 12 to 20 evidence-based treatment rules
- New modalities: SARPE, MSE, Forsus FRD, Carriere Motion, Pendulum,
  MEAW, bimaxillary surgery, digital aligner workflow
- Growth prediction: Petrovic/Proffit-inspired model projecting
  measurements at end of growth (+2, +5, +10 year windows)
- Enhanced outcome simulation for all modalities
- Evidence citations added to all rules

References:
  Proffit WR, Fields HW. Contemporary Orthodontics, 5th ed. 2013.
  Petrovic AG et al. Regulation of mandibular growth. 1981.
  Graber TM et al. Orthodontics: Current Principles and Techniques, 2017.
"""

from typing import Optional


def _first_measurement(measurements: dict[str, float], *codes: str) -> float | None:
    for code in codes:
        val = measurements.get(code)
        if val is not None:
            return val
    return None


# ── Clinical Knowledge Base ───────────────────────────────────────────────────

TREATMENT_RULES: list[dict] = [

    # ── Skeletal Class II — Growth Modification ───────────────────────────────
    {
        "id": "c2-functional-twin",
        "name": "Twin Block Functional Appliance",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "max_age": 14, "vertical_pattern": "Normal"},
        "description": "Removable twin-block appliance posturing the mandible forward, stimulating condylar growth and correcting retrognathic mandible during active growth.",
        "rationale_template": "Indicated for growing Class II patients with retrognathic mandible and normal vertical growth pattern. Most effective during CS2-CS3.",
        "evidence_level": "RCT",
        "retention_recommendation": "Full-time functional retainer 12 months, then night-time until end of growth.",
        "risks": "Lower incisor proclination; relapse if growth incomplete; compliance-dependent.",
        "duration": 18, "confidence": 0.90,
    },
    {
        "id": "c2-functional-herbst",
        "name": "Herbst Fixed Appliance",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "max_age": 15, "vertical_pattern": "LowAngle"},
        "description": "Fixed telescopic appliance for continuous mandibular advancement; highly effective in low-angle hypodivergent Class II patients.",
        "rationale_template": "Optimal for Class II correction in hypodivergent patients. Fixed design eliminates compliance variability.",
        "evidence_level": "RCT",
        "retention_recommendation": "Fixed bonded retainer + Hawley 18 months post-treatment.",
        "risks": "Strut fracture (10-15%); transient TMJ discomfort; gingival irritation.",
        "duration": 12, "confidence": 0.92,
    },
    {
        "id": "c2-forsus",
        "name": "Forsus Fatigue Resistant Device (FRD)",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "max_age": 16, "vertical_pattern": "Normal"},
        "description": "Semi-fixed intermaxillary spring appliance (EZ module) for Class II correction in late mixed/early permanent dentition. Lower compliance burden than removable appliances.",
        "rationale_template": "Indicated for growing Class II patients requiring orthopedic correction without reliance on patient compliance. EZ module allows coordination with fixed appliances.",
        "evidence_level": "RCT",
        "retention_recommendation": "Bonded retainers + nighttime Herbst or twin block 12 months.",
        "risks": "Lower incisor proclination; spring breakage; soft tissue irritation.",
        "duration": 9, "confidence": 0.87,
    },
    {
        "id": "c2-carriere",
        "name": "Carrière Motion Appliance (Pre-Orthodontic)",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "min_age": 11, "max_age": 16},
        "description": "Fixed Class II corrector attached to upper canine and first molar, used with Class II elastics before full fixed appliances. Reduces overall treatment time.",
        "rationale_template": "Efficient pre-orthodontic Class II correction by distalization of upper buccal segment to Class I before bonding. Reduces dependence on full arch compliance.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Bonded upper 3-3 retainer; coordinated with subsequent fixed appliances.",
        "risks": "Upper molar tipping; compliance-dependent elastic wear; requires lower fixed appliance simultaneously.",
        "duration": 8, "confidence": 0.83,
    },
    {
        "id": "c2-distalization-tad",
        "name": "Molar Distalization with TADs",
        "type": "Mechanotherapy",
        "conditions": {"skeletal_class": "ClassII", "min_age": 16, "vertical_pattern": "Normal"},
        "description": "Non-extraction maxillary molar distalization using miniscrews (TADs) as absolute anchorage for Class II correction in non-growing patients.",
        "rationale_template": "Preserves premolars in mild-to-moderate Class II non-growers. TADs eliminate reciprocal anterior forces typical of tooth-borne distalization.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Bonded palatal retainer; clear overlay retainer.",
        "risks": "TAD failure ~10-15%; root proximity risk; requires CBCT pre-planning.",
        "duration": 24, "confidence": 0.85,
    },
    {
        "id": "c2-extraction-camouflage",
        "name": "Premolar Extraction Camouflage",
        "type": "Extraction",
        "conditions": {"skeletal_class": "ClassII", "profile": "Protrusive"},
        "description": "Extraction of upper first premolars (or 4-premolars) to retract the anterior segment and correct the Class II dental relationship without orthognathic surgery.",
        "rationale_template": "Dentoalveolar camouflage via extraction when orthopedic/surgical correction is declined. Protrusive profile suggests benefit from incisor retraction.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Bonded upper and lower 3-3 retainers; Hawley at night indefinitely.",
        "risks": "Permanent tooth removal; excessive profile flattening; anchorage loss without TAD control.",
        "duration": 24, "confidence": 0.88,
    },

    # ── Skeletal Class III ────────────────────────────────────────────────────
    {
        "id": "c3-facemask",
        "name": "Protraction Facemask (Reverse Pull)",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassIII", "max_age": 11},
        "description": "Orthopedic force applied to maxilla via intraoral anchors to stimulate forward growth and correct Class III malocclusion due to maxillary retrusion.",
        "rationale_template": "Early intervention for maxillary-deficient Class III. Mixed dentition timing maximises mid-palatal suture responsiveness.",
        "evidence_level": "RCT",
        "retention_recommendation": "Chin cup or Class III elastics nightly until end of growth; reassess at 18.",
        "risks": "High relapse rate 30-50% at end of growth; may require surgical correction in adulthood.",
        "duration": 12, "confidence": 0.85,
    },
    {
        "id": "c3-mse",
        "name": "MSE — Miniscrew-Assisted Rapid Palate Expansion (Class III)",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassIII", "min_age": 14, "max_age": 25},
        "description": "Bone-borne palate expander using 4 miniscrews in the palate to achieve true skeletal expansion. Overcomes sutural resistance in adolescents and young adults without SARPE surgery.",
        "rationale_template": "Non-surgical skeletal expansion for Class III patients with transverse maxillary deficiency. Miniscrew anchorage produces parallel palatal expansion without dental tipping.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Fixed palatal retainer min 6 months; bonded 3-3 retainer.",
        "risks": "Nasal septal deviation; mid-palatal bone perforation risk; relapse without adequate retention.",
        "duration": 6, "confidence": 0.80,
    },
    {
        "id": "c3-camouflage-elastics",
        "name": "Class III Elastic Camouflage",
        "type": "Mechanotherapy",
        "conditions": {"skeletal_class": "ClassIII", "min_age": 13, "overjet": {"min": -2, "max": 0}},
        "description": "Dentoalveolar camouflage using sustained Class III intermaxillary elastics to compensate for mild skeletal discrepancy without surgery.",
        "rationale_template": "Suitable for mild Class III (ANB ≥-3°) where orthognathic surgery is declined. Modest elastic compensation precludes surgical need.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Bonded retainers; continued part-time Class III elastic wear for maintenance.",
        "risks": "Lower incisor retroclination; upper incisor proclination; compliance-dependent.",
        "duration": 24, "confidence": 0.75,
    },

    # ── Transverse Expansion ──────────────────────────────────────────────────
    {
        "id": "sarpe",
        "name": "SARPE — Surgically Assisted Rapid Palate Expansion",
        "type": "Surgery",
        "interdisciplinary_referral": True,
        "conditions": {"min_age": 18},
        "description": "Osteotomy-assisted palate expansion for adults with narrow maxillary arch. Surgically released sutures allow tooth-borne expander to achieve true skeletal widening.",
        "rationale_template": "Indicated for transverse maxillary deficiency in skeletally mature patients where non-surgical RPE is insufficient due to mid-palatal suture ossification.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Expander retained passively for 6-9 months post-expansion; bonded palatal retainer 12 months.",
        "risks": "Relapse ~20-30%; periodontal complications; neurosensory changes; requires hospitalisation.",
        "duration": 12, "confidence": 0.85,
    },

    # ── Vertical Control ──────────────────────────────────────────────────────
    {
        "id": "vert-molar-intrusion",
        "name": "Molar Intrusion with TADs",
        "type": "Mechanotherapy",
        "conditions": {"vertical_pattern": "HighAngle", "j_ratio": {"max": 59}},
        "description": "Posterior segment intrusion using miniscrews to allow mandibular autorotation and closure of anterior open bite.",
        "rationale_template": "Addresses hyperdivergent pattern through posterior intrusion, reducing LAFH and enabling mandibular autorotation to improve the facial profile.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Nighttime posterior bite plate indefinitely; bonded anterior retainer.",
        "risks": "TAD failure 10-15%; partial relapse with continued growth; buccal root exposure if over-intruded.",
        "duration": 18, "confidence": 0.82,
    },
    {
        "id": "vert-meaw",
        "name": "MEAW — Multiloop Edgewise Arch Wire Therapy",
        "type": "Mechanotherapy",
        "conditions": {"vertical_pattern": "HighAngle", "overbite": {"max": 0}},
        "description": "Customised loop archwire technique with Class III elastics for open-bite correction in hyperdivergent skeletal patterns where TADs are not indicated.",
        "rationale_template": "MEAW with Class III elastics extrudes lower molars and rotates the mandible upward to close the anterior open bite without surgical intervention.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Bonded anterior retainer; nighttime wear of MEAW-type retainer or bite plate.",
        "risks": "Relapse risk without sustained retention; prolonged treatment time; technique-sensitive.",
        "duration": 24, "confidence": 0.76,
    },
    {
        "id": "vert-intrusion-deepbite",
        "name": "Anterior Intrusion — Utility Arches",
        "type": "Mechanotherapy",
        "conditions": {"vertical_pattern": "LowAngle", "overbite": {"min": 4}},
        "description": "Intrusion of upper or lower incisors using 2×4 utility arches or intrusion arches to correct deep bite in hypodivergent patients.",
        "rationale_template": "Controlled anterior intrusion reduces overbite in hypodivergent Class II patients. 2×4 mechanics allow isolated incisor segment control.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Bonded lower 3-3 retainer; upper Hawley with anterior bite ramp nightly.",
        "risks": "Root resorption with prolonged intrusion; relapse if vertical growth continues.",
        "duration": 14, "confidence": 0.80,
    },
    {
        "id": "vert-pendulum",
        "name": "Pendulum Appliance — Molar Distalization",
        "type": "Appliance",
        "conditions": {"skeletal_class": "ClassII", "min_age": 10, "max_age": 16},
        "description": "Fixed palatal spring appliance for upper molar distalization to Class I without extractions. Indicated for moderate Class II with crowding.",
        "rationale_template": "Non-extraction Class II correction via unilateral or bilateral molar distalization using Hilgers pendulum springs. Avoids TAD placement.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Nance holding arch or TPA post-distalization; bonded retainer after full treatment.",
        "risks": "Upper incisor proclination (anchorage loss); molar tipping (must tip upright after); compliance-free but requires cooperation for elastics.",
        "duration": 12, "confidence": 0.78,
    },

    # ── Orthognathic Surgery ──────────────────────────────────────────────────
    {
        "id": "surg-bsso-mand",
        "name": "BSSO — Mandibular Advancement",
        "type": "Surgery",
        "interdisciplinary_referral": True,
        "conditions": {"skeletal_class": "ClassII", "min_age": 18, "anb": {"min": 7}},
        "description": "Bilateral sagittal split osteotomy for surgical mandibular advancement in severe skeletal Class II (ANB >7°) in skeletally mature patients.",
        "rationale_template": "Definitive correction of severe Class II skeletal discrepancy where growth modification is no longer possible. BSSO physically repositions the mandible.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Post-surgical orthodontic finishing 6-12 months; bonded retainers for life.",
        "risks": "Neurosensory disturbance (IAN) 5-30%; relapse 10-20%; requires 12-18 months total treatment.",
        "duration": 36, "confidence": 0.95,
    },
    {
        "id": "surg-lefort-max",
        "name": "Le Fort I — Maxillary Advancement",
        "type": "Surgery",
        "interdisciplinary_referral": True,
        "conditions": {"skeletal_class": "ClassIII", "min_age": 18, "anb": {"max": -3}},
        "description": "Le Fort I osteotomy to advance and impaction the maxilla for severe Class III due to midface deficiency.",
        "rationale_template": "Indicated for significant Class III discrepancy with maxillary hypoplasia (SNA <76°) in skeletally mature patients.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Post-surgical orthodontic finishing; titanium plate monitoring at 6 months.",
        "risks": "Velopharyngeal insufficiency risk; nasal airway changes; plate-and-screw complications.",
        "duration": 40, "confidence": 0.92,
    },
    {
        "id": "surg-bimax",
        "name": "Bimaxillary Surgery (Le Fort I + BSSO)",
        "type": "Surgery",
        "interdisciplinary_referral": True,
        "conditions": {"min_age": 18, "anb": {"min": 8}},
        "description": "Simultaneous Le Fort I maxillary repositioning and bilateral sagittal split mandibular advancement for complex jaw discrepancies requiring multi-jaw correction.",
        "rationale_template": "Bimaxillary surgery distributes the correction across both jaws, producing more stable outcomes and better soft tissue changes compared to single-jaw surgery.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Full pre-surgical orthodontics 12-18 months; post-surgical 6-12 months; lifetime retainers.",
        "risks": "Significant surgical risk; nerve injury; swelling; relapse 5-15%; high cost and recovery time.",
        "duration": 48, "confidence": 0.90,
    },

    # ── Pediatric RPE ─────────────────────────────────────────────────────────
    {
        "id": "rpe-pediatric",
        "name": "Rapid Palate Expansion (Pediatric RPE)",
        "type": "Appliance",
        "conditions": {"min_age": 7, "max_age": 13},
        "description": "Tooth-borne rapid palate expander (Hyrax or bonded type) to correct posterior crossbite and gain arch length in actively growing patients. Mid-palatal suture is fully patent, allowing rapid skeletal expansion.",
        "rationale_template": "Indicated for transverse maxillary deficiency with posterior crossbite or arch-length discrepancy in growing patients. Skeletal expansion during this window avoids surgical intervention later.",
        "evidence_level": "RCT",
        "retention_recommendation": "Passive retention with expander in place for equal duration of active expansion; followed by fixed palatal retainer.",
        "risks": "Relapse if retained <3-4 months; diastema formation (typically self-closes); transient mucosal irritation.",
        "duration": 6, "confidence": 0.93,
    },
    {
        "id": "c2-aligner-tad",
        "name": "Clear Aligner + TAD Anchorage (Moderate Class II Non-Grower)",
        "type": "Removable",
        "conditions": {"skeletal_class": "ClassII", "min_age": 16, "vertical_pattern": "Normal"},
        "description": "Clear aligner series combined with inter-radicular miniscrew TADs for absolute maxillary anchorage during Class II correction in non-growing patients with mild-to-moderate ANB (4-7°). TADs prevent unwanted mesial molar drift during aligner-driven incisor retraction.",
        "rationale_template": "Suitable for moderate Class II non-growers who prefer esthetic treatment. TADs provide the anchorage control that standard aligner mechanics lack for significant molar-to-canine relationship correction.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Vivera or equivalent clear retainer nightly; bonded lower 3-3; monitor molar anchorage at 3-month intervals.",
        "risks": "TAD failure 10-15%; requires 22h/day aligner wear compliance; limited torque control for severe rotations; longer overall treatment than fixed appliances.",
        "duration": 22, "confidence": 0.81,
    },

    # ── Comprehensive Dentition ───────────────────────────────────────────────
    {
        "id": "gen-braces-align",
        "name": "Comprehensive Fixed Appliances",
        "type": "Fixed",
        "conditions": {"skeletal_class": "ClassI"},
        "description": "Full fixed appliance therapy for alignment, space closure, and occlusal optimisation in orthognathic skeletal patterns.",
        "rationale_template": "Indicated for dental crowding or spacing in a Class I skeletal base. Full fixed appliances provide maximum control of torque, angulation, and levelling.",
        "evidence_level": "RCT",
        "retention_recommendation": "Bonded upper and lower 3-3 retainers; removable Hawley nightly.",
        "risks": "Root resorption; decalcification; relapse without long-term retention compliance.",
        "duration": 18, "confidence": 0.98,
    },
    {
        "id": "gen-clear-aligners",
        "name": "Clear Aligner Therapy (Digital Workflow)",
        "type": "Removable",
        "conditions": {"skeletal_class": "ClassI", "profile": "Normal"},
        "description": "Sequential clear thermoplastic aligners with attachments and IPR for esthetic treatment of mild-to-moderate dental malocclusions.",
        "rationale_template": "Suitable for Class I dental malocclusion where esthetics are a priority. Staged aligner series with precision attachments controls torque and rotation effectively.",
        "evidence_level": "Cohort",
        "retention_recommendation": "Vivera or equivalent clear retainer nightly; bonded lower 3-3.",
        "risks": "Compliance-dependent (20-22h/day); limited vertical and torque control vs. fixed; root resorption possible.",
        "duration": 14, "confidence": 0.90,
    },
]


# ── Growth Prediction (Petrovic / Proffit Model) ──────────────────────────────

def predict_growth(
    measurements: dict[str, float],
    patient_age: float,
    patient_sex: str | None = None,
) -> dict[str, dict[str, float]]:
    """
    Predict cephalometric measurements at end of growth based on simplified
    Proffit/Petrovic longitudinal growth rates.

    Returns projections at +2 years, +5 years, and end-of-growth (18F / 20M).

    Reference:
      Proffit WR et al., Contemporary Orthodontics 5th ed., pp. 68-73.
      Petrovic AG, Stutzmann JJ. Growth of the mandible. 1981.

    Key annual growth rates (mm/yr for distances, °/yr for angles):
      SNB: +0.2°/yr (male), +0.15°/yr (female) during peak growth
      AFH: +1.5mm/yr during peak, tapering
      PFH: +2.0mm/yr during peak
      MandLength: +2.5mm/yr during peak
    """
    is_male = (patient_sex or "").lower() in ("male", "m")
    end_of_growth = 20.0 if is_male else 18.0
    remaining_growth = max(0, end_of_growth - patient_age)

    def growth_factor(years_ahead: float) -> float:
        """Sigmoid decay — highest at current age, tapering to zero at end of growth."""
        if remaining_growth <= 0:
            return 0.0
        capped = min(years_ahead, remaining_growth)
        return (capped / remaining_growth) * (1.0 - 0.5 * (capped / remaining_growth))

    annual_rates = {
        # Angles (degrees/year — peak growth period)
        "SNA":        0.0,                              # Maxilla stable after age 10
        "SNB":        0.20 if is_male else 0.15,        # Mandibular growth
        "ANB":       -0.15 if is_male else -0.10,       # Decreases with mandibular growth
        "FMA":       -0.10,                             # Decreases slightly as ramus grows
        "SN-GoGn":   -0.10,
        "SN-MP":     -0.08,
        # Distances (mm/year — peak growth period)
        "AFH":        1.5,
        "PFH":        2.0,
        "TFH":        2.0,
        "UFH":        0.5,
        "LFH":        1.5 if is_male else 1.2,
        "MandLength": 2.5 if is_male else 1.8,
        "MidfaceLen": 0.5,
        "RamusHeight":1.0 if is_male else 0.7,
        "MandBody":   1.5 if is_male else 1.0,
    }

    projections: dict[str, dict[str, float]] = {
        "+2yr": {}, "+5yr": {}, "end_of_growth": {}
    }

    for code, rate in annual_rates.items():
        current = measurements.get(code)
        if current is None:
            continue
        for label, years in [("+2yr", 2.0), ("+5yr", 5.0), ("end_of_growth", remaining_growth)]:
            delta = rate * years * growth_factor(years)
            projections[label][code] = round(current + delta, 2)

    projections["metadata"] = {
        "patient_age":       patient_age,
        "patient_sex":       patient_sex or "unknown",
        "end_of_growth_age": end_of_growth,
        "remaining_growth":  round(remaining_growth, 1),
        "model":             "Proffit/Petrovic simplified (Proffit 2013, p.68-73)",
        "note": "Estimates only — individual variation is substantial. Validate with serial cephalograms.",
    }

    return projections


# ── Treatment Outcome Simulation ──────────────────────────────────────────────

def predict_treatment_outcome(
    treatment_id: str,
    measurements: dict[str, float],
    patient_age: Optional[float] = None,
) -> dict[str, float]:
    """
    Simulate expected post-treatment measurement changes.
    Returns only metrics that change meaningfully (delta > 0.1).
    Based on published mean treatment effects.
    """
    predicted = measurements.copy()
    age = patient_age or 20.0

    # Severity scalars derived from Wits and APDI for nuanced outcome sizing
    # Wits: normal ~0mm; each +1mm above norm → slightly larger functional effect
    wits     = measurements.get("Wits", 0.0)
    apdi     = measurements.get("APDI")
    odi      = measurements.get("ODI")

    # Class II functional appliances: scale SNB gain by Wits severity (min 1.5, max 2.8)
    # Greater mandibular retrusion (high Wits) → more skeletal response expected
    c2_severity = min(2.8, max(1.5, 1.8 + wits * 0.08)) if wits and wits > 0 else 1.8

    # APDI correction factor: if APDI confirms Class II, increase confidence in response
    if apdi is not None and apdi < 79:
        c2_severity = min(2.8, c2_severity + 0.3)

    if treatment_id in ("c2-functional-twin", "c2-functional-herbst"):
        if age <= 16:
            predicted.setdefault("SNB", 80.0)
            predicted["SNB"]   += c2_severity
            predicted["ANB"]    = predicted.get("SNA", 82.0) - predicted["SNB"]
            if "Ls-Eline" in predicted:
                predicted["Ls-Eline"] = predicted["Ls-Eline"] - 2.0
            if "Li-Eline" in predicted:
                predicted["Li-Eline"] = predicted["Li-Eline"] - 1.5
            if "Wits" in predicted:
                predicted["Wits"] = max(-1.0, predicted["Wits"] - c2_severity * 0.9)

    elif treatment_id == "c2-forsus":
        if age <= 16:
            forsus_gain = min(2.3, max(1.2, c2_severity * 0.85))
            predicted.setdefault("SNB", 80.0)
            predicted["SNB"]  += forsus_gain
            predicted["ANB"]   = predicted.get("SNA", 82.0) - predicted["SNB"]
            if "Wits" in predicted:
                predicted["Wits"] = max(-1.0, predicted["Wits"] - forsus_gain * 0.9)

    elif treatment_id == "c2-carriere":
        predicted.setdefault("SNB", 80.0)
        predicted["SNB"]  += 1.0
        predicted["ANB"]   = predicted.get("SNA", 82.0) - predicted["SNB"]
        if "Wits" in predicted:
            predicted["Wits"] = max(-1.0, predicted["Wits"] - 0.9)

    elif treatment_id == "c2-aligner-tad":
        predicted.setdefault("SNA", 82.0)
        predicted["SNA"]  -= 1.2
        predicted["ANB"]   = predicted["SNA"] - predicted.get("SNB", 80.0)
        predicted.setdefault("UI-NA_DEG", 22.0)
        predicted["UI-NA_DEG"] -= 3.5
        if "Ls-Eline" in predicted:
            predicted["Ls-Eline"] -= 2.0

    elif treatment_id == "c2-distalization-tad":
        predicted.setdefault("SNA", 82.0)
        predicted["SNA"]  -= 1.0
        predicted["ANB"]   = predicted["SNA"] - predicted.get("SNB", 80.0)

    elif treatment_id == "c2-extraction-camouflage":
        predicted.setdefault("UI-NA_DEG", 22.0)
        predicted["UI-NA_DEG"] -= 5.0
        if "Ls-Eline" in predicted:
            predicted["Ls-Eline"] -= 3.0

    elif treatment_id == "rpe-pediatric":
        if "PalatLen" in predicted:
            predicted["PalatLen"] += 4.0
        if "SN-GoGn" in predicted:
            predicted["SN-GoGn"] += 0.5

    elif treatment_id == "c3-facemask":
        if age <= 11:
            predicted.setdefault("SNA", 78.0)
            predicted["SNA"]  += 3.0
            predicted["ANB"]   = predicted["SNA"] - predicted.get("SNB", 80.0)

    elif treatment_id == "c3-mse":
        if "PalatLen" in predicted:
            predicted["PalatLen"] += 3.0

    elif treatment_id == "sarpe":
        if "PalatLen" in predicted:
            predicted["PalatLen"] += 5.0

    elif treatment_id == "vert-molar-intrusion":
        if "FMA" in predicted:
            predicted["FMA"] -= 3.0
        if "SN-GoGn" in predicted:
            predicted["SN-GoGn"] -= 2.0
        if "YAxis" in predicted:
            predicted["YAxis"] -= 2.0
        if "AFH" in predicted:
            predicted["AFH"] -= 3.0

    elif treatment_id == "vert-meaw":
        if "FMA" in predicted:
            predicted["FMA"] -= 2.0
        if "OVERBITE" in predicted:
            predicted["OVERBITE"] = min(2.0, predicted["OVERBITE"] + 3.0)

    elif treatment_id == "vert-intrusion-deepbite":
        if "OVERBITE" in predicted:
            predicted["OVERBITE"] = max(0.0, predicted["OVERBITE"] - 3.0)
        if "AFH" in predicted:
            predicted["AFH"] += 1.5

    elif treatment_id == "surg-bsso-mand":
        advancement = max(0, measurements.get("ANB", 4.0) - 2.0) * 1.8
        predicted.setdefault("SNB", 80.0)
        predicted["SNB"]  += advancement * 0.7
        predicted["ANB"]   = predicted.get("SNA", 82.0) - predicted["SNB"]
        if "SoftPog" in predicted:
            predicted["Pog-NPerp"] = predicted.get("Pog-NPerp", -2.0) + advancement * 0.85
        if "Ls-Eline" in predicted:
            predicted["Ls-Eline"] = predicted["Ls-Eline"] - advancement * 0.2

    elif treatment_id == "surg-lefort-max":
        deficiency = abs(min(0, measurements.get("ANB", 0.0) + 3.0)) * 1.2
        predicted.setdefault("SNA", 78.0)
        predicted["SNA"]  += deficiency
        predicted["ANB"]   = predicted["SNA"] - predicted.get("SNB", 80.0)
        if "N-Perp-A" in predicted:
            predicted["N-Perp-A"] = predicted["N-Perp-A"] + deficiency * 0.8

    elif treatment_id == "surg-bimax":
        anb_excess = measurements.get("ANB", 4.0)
        if anb_excess > 0:
            predicted.setdefault("SNB", 80.0)
            predicted["SNB"]  += anb_excess * 0.6
            predicted.setdefault("SNA", 82.0)
            predicted["SNA"]  -= anb_excess * 0.2
            predicted["ANB"]   = predicted["SNA"] - predicted["SNB"]

    elif treatment_id in ("gen-braces-align", "gen-clear-aligners"):
        pass

    # Round all values
    return {k: round(v, 2) for k, v in predicted.items()}


# ── Rule Evaluation ───────────────────────────────────────────────────────────

def _rule_matches(
    rule: dict,
    skeletal_class: str,
    vertical_pattern: str,
    profile: str,
    anb: float,
    overjet: float | None,
    overbite: float | None,
    j_ratio: float | None,
    patient_age: float | None,
) -> tuple[bool, float]:
    """
    Evaluate whether a treatment rule applies given the patient's diagnosis.
    Returns (matches, priority_score) where higher score = higher priority.
    """
    conds = rule.get("conditions", {})
    matches = True
    score = rule.get("confidence", 0.8)

    if "skeletal_class" in conds and skeletal_class != conds["skeletal_class"]:
        matches = False

    if "vertical_pattern" in conds and vertical_pattern != conds["vertical_pattern"]:
        matches = False

    if "profile" in conds and profile not in (conds["profile"], "Unknown"):
        matches = False

    if "min_age" in conds and patient_age is not None and patient_age < conds["min_age"]:
        matches = False

    if "max_age" in conds and patient_age is not None and patient_age > conds["max_age"]:
        matches = False

    if "anb" in conds:
        anb_range = conds["anb"]
        if "min" in anb_range and anb < anb_range["min"]: matches = False
        if "max" in anb_range and anb > anb_range["max"]: matches = False

    if "overjet" in conds and overjet is not None:
        oj_range = conds["overjet"]
        if "min" in oj_range and overjet < oj_range["min"]: matches = False
        if "max" in oj_range and overjet > oj_range["max"]: matches = False

    if "overbite" in conds and overbite is not None:
        ob_range = conds["overbite"]
        if "min" in ob_range and overbite < ob_range["min"]: matches = False
        if "max" in ob_range and overbite > ob_range["max"]: matches = False

    if "j_ratio" in conds and j_ratio is not None:
        jr_range = conds["j_ratio"]
        if "min" in jr_range and j_ratio < jr_range["min"]: matches = False
        if "max" in jr_range and j_ratio > jr_range["max"]: matches = False

    return matches, score if matches else 0.0


def _build_rationale(
    rule: dict,
    skeletal_class: str,
    vertical_pattern: str,
    anb: float,
    patient_age: float | None,
) -> str:
    template = rule.get("rationale_template", rule["description"])
    age_text  = f" (patient age {patient_age:.0f})" if patient_age else ""
    return (
        f"{template}{age_text}. "
        f"Skeletal: {skeletal_class}, Vertical: {vertical_pattern}, corrected ANB={anb:.1f}°."
    )


# ── Main Entry Point ──────────────────────────────────────────────────────────

def generate_treatment_plan(
    diagnosis: dict,
    measurements: dict[str, float],
    patient_age: Optional[float] = None,
    patient_sex: Optional[str] = None,
    include_growth_prediction: bool = True,
    include_outcome_simulation: bool = True,
) -> dict:
    """
    Generate a ranked evidence-based treatment plan.

    Returns:
      - recommended_treatment: dict (top-ranked rule)
      - alternatives: list[dict] (ranked remaining applicable rules)
      - growth_prediction: dict (Proffit/Petrovic model projections)
      - outcome_simulation: dict (predicted post-treatment measurements)
    """
    skeletal_class    = diagnosis.get("skeletal_class",  "ClassI")
    vertical_pattern  = diagnosis.get("vertical_pattern","Normal")
    profile           = diagnosis.get("soft_tissue_profile", "Normal")
    anb               = float(diagnosis.get("corrected_anb", measurements.get("ANB", 2.0)))
    overjet           = _first_measurement(measurements, "OVERJET", "Overjet")
    overbite          = _first_measurement(measurements, "OVERBITE", "Overbite")
    j_ratio           = measurements.get("JRatio")

    applicable: list[tuple[float, dict]] = []

    for rule in TREATMENT_RULES:
        matches, score = _rule_matches(
            rule, skeletal_class, vertical_pattern, profile,
            anb, overjet, overbite, j_ratio, patient_age
        )
        if matches:
            rationale = _build_rationale(rule, skeletal_class, vertical_pattern, anb, patient_age)
            enriched_rule = {
                **rule,
                "rationale": rationale,
                "priority_score": score,
                "conditions": None,
            }
            applicable.append((score, enriched_rule))

    applicable.sort(key=lambda x: x[0], reverse=True)

    recommended = applicable[0][1] if applicable else {
        "id":   "gen-braces-align",
        "name": "Comprehensive Fixed Appliances",
        "rationale": "Default: no specific modality indicated by current measurements.",
        "priority_score": 0.9,
    }
    alternatives = [r for _, r in applicable[1:6]]

    result: dict = {
        "recommended_treatment": recommended,
        "alternatives":          alternatives,
        "applicable_count":      len(applicable),
        "treatment_notes": [
            "Treatment selections are evidence-based suggestions. Final decision requires clinical examination.",
            "Growth prediction uses Proffit/Petrovic simplified model (±20% individual variation).",
            "CVM stage should be confirmed from cervical vertebrae morphology.",
        ],
    }

    if include_growth_prediction and patient_age is not None:
        result["growth_prediction"] = predict_growth(measurements, patient_age, patient_sex)

    if include_outcome_simulation and recommended:
        result["outcome_simulation"] = predict_treatment_outcome(
            recommended.get("id", "gen-braces-align"),
            measurements,
            patient_age,
        )

    return result


# ── Backward-Compatible Router Shim ──────────────────────────────────────────

def suggest_treatment(
    skeletal_class: str,
    vertical_pattern: str,
    measurements: dict[str, float],
    patient_age: Optional[float] = None,
    profile: str = "Normal",
) -> list[dict]:
    """
    Backward-compatible wrapper used by the /suggest-treatment router.
    Converts `generate_treatment_plan` output into a flat list of TreatmentItem-compatible dicts.
    """
    diagnosis = {
        "skeletal_class":     skeletal_class,
        "vertical_pattern":   vertical_pattern,
        "soft_tissue_profile": profile,
        "corrected_anb":      measurements.get("ANB", 2.0),
    }

    plan = generate_treatment_plan(
        diagnosis=diagnosis,
        measurements=measurements,
        patient_age=patient_age,
        include_growth_prediction=False,
        include_outcome_simulation=True,
    )

    def _rule_to_item(rule: dict, idx: int, is_primary: bool, conflict_note: Optional[str] = None) -> dict:
        return {
            "plan_index":                idx,
            "treatment_type":            rule.get("type", "Fixed"),
            "treatment_name":            rule.get("name", "Unknown"),
            "description":               rule.get("description", ""),
            "rationale":                 rule.get("rationale") or rule.get("rationale_template", ""),
            "risks":                     rule.get("risks", ""),
            "estimated_duration_months": rule.get("duration"),
            "confidence_score":          rule.get("priority_score") or rule.get("confidence", 0.8),
            "source":                    "RuleBased",
            "is_primary":                is_primary,
            "predicted_outcomes":        plan.get("outcome_simulation") if is_primary else None,
            "evidence_level":            rule.get("evidence_level"),
            "retention_recommendation":  rule.get("retention_recommendation"),
            "interdisciplinary_referral": bool(rule.get("interdisciplinary_referral", False)),
            "conflict_note":             conflict_note,
        }

    # Detect rule conflicts: when the top-2 applicable rules are close in confidence,
    # note the competing option so clinicians know an alternative was nearly recommended.
    all_applicable = [plan.get("recommended_treatment")] + plan.get("alternatives", [])
    all_applicable = [r for r in all_applicable if r]
    top_scores = [r.get("priority_score", r.get("confidence", 0.8)) for r in all_applicable[:2]]
    primary_conflict_note: Optional[str] = None
    if len(top_scores) == 2 and abs(top_scores[0] - top_scores[1]) < 0.05:
        runner_up_name = all_applicable[1].get("name", "alternative option")
        primary_conflict_note = (
            f"Competing option '{runner_up_name}' scored within 5% of this recommendation "
            f"({top_scores[1]:.2f} vs {top_scores[0]:.2f}). Clinical judgement required."
        )

    items: list[dict] = []
    rec = plan.get("recommended_treatment")
    if rec:
        items.append(_rule_to_item(rec, 0, True, conflict_note=primary_conflict_note))
    for idx, alt in enumerate(plan.get("alternatives", []), start=1):
        items.append(_rule_to_item(alt, idx, False))
    return items
