from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Any


# ── Landmark schemas ────────────────────────────────────────────────────────

class LandmarkPoint(BaseModel):
    x: float
    y: float
    confidence: Optional[float] = 1.0
    provenance: Optional[str] = "detected"  # detected | derived | fallback | manual
    derived_from: Optional[list[str]] = None
    expected_error_mm: Optional[float] = None


class LandmarkDetectionRequest(BaseModel):
    session_id: str
    image_base64: str          # base64-encoded preprocessed image
    pixel_spacing_mm: Optional[float] = None


class LandmarkDetectionResponse(BaseModel):
    session_id: str
    model_version: str
    landmarks: dict[str, LandmarkPoint]
    inference_ms: int


# ── Measurement schemas ─────────────────────────────────────────────────────

class MeasurementRequest(BaseModel):
    session_id: str
    landmarks: dict[str, LandmarkPoint]
    pixel_spacing_mm: Optional[float] = None
    patient_age: Optional[float] = None
    patient_sex: Optional[str] = None
    population: Optional[str] = None
    dentition_stage: Optional[str] = None
    is_cbct_derived: Optional[bool] = False


class MeasurementItem(BaseModel):
    code: str
    name: str
    category: Optional[str] = None
    measurement_type: str      # Angle | Distance | Ratio
    value: float
    unit: str                  # Degrees | Millimeters
    normal_min: float
    normal_max: float
    status: str                # Normal | Increased | Decreased
    deviation: Optional[float] = None
    landmark_refs: list[str]
    quality_status: Optional[str] = "clinically_usable"
    review_reasons: list[str] = Field(default_factory=list)
    landmark_provenance: Optional[dict[str, str]] = None


class MeasurementResponse(BaseModel):
    session_id: str
    measurements: list[MeasurementItem]


# ── Diagnosis schemas ───────────────────────────────────────────────────────

class DiagnosisRequest(BaseModel):
    session_id: str
    measurements: dict[str, float]   # code -> value
    patient_sex: Optional[str] = None
    patient_age: Optional[float] = None


class DiagnosisResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    session_id: str
    skeletal_class: str          # ClassI | ClassII | ClassIII
    skeletal_type: str           # Definitive | Borderline | Conflicting
    corrected_anb: float
    apdi_classification: Optional[str] = None
    odi_classification: Optional[str] = None
    vertical_pattern: str        # LowAngle | Normal | HighAngle
    maxillary_position: str
    mandibular_position: str
    upper_incisor_inclination: str
    lower_incisor_inclination: str
    soft_tissue_profile: str     # Normal | Protrusive | Retrusive | Unknown
    facial_convexity: Optional[str] = None
    overjet_mm: Optional[float] = None
    overjet_classification: Optional[str] = None
    overbite_mm: Optional[float] = None
    overbite_classification: Optional[str] = None
    bolton_discrepancy: Optional[dict[str, Any]] = None
    cvm_staging: Optional[dict[str, Any]] = None
    airway_assessment: Optional[dict[str, Any]] = None
    airway_risk_score: Optional[float] = None      # 0–10 numeric risk score
    skeletal_consensus: Optional[dict[str, Any]] = None   # Multi-metric AP consensus
    dental_skeletal_differential: Optional[dict[str, Any]] = None
    skeletal_differential: Optional[dict[str, float]] = None
    confidence_score: float
    summary: str
    warnings: list[str] = Field(default_factory=list)
    clinical_notes: list[str] = Field(default_factory=list)
    ai_disclaimer: Optional[str] = None           # Mandatory clinical disclaimer


# ── Treatment schemas ───────────────────────────────────────────────────────

class TreatmentRequest(BaseModel):
    session_id: str
    skeletal_class: str
    vertical_pattern: str
    measurements: dict[str, float]
    patient_age: Optional[float] = None
    image_base64: Optional[str] = None


class TreatmentItem(BaseModel):
    plan_index: int
    treatment_type: str
    treatment_name: str
    description: str
    rationale: Optional[str] = None
    risks: Optional[str] = None
    estimated_duration_months: Optional[int] = None
    confidence_score: float
    source: str                              # RuleBased | ML | LLM | Hybrid
    is_primary: bool
    predicted_outcomes: Optional[dict[str, float]] = None
    evidence_level: Optional[str] = None    # RCT | Cohort | Expert
    retention_recommendation: Optional[str] = None


class XAIDecisionStep(BaseModel):
    step: int
    factor: str
    evidence: str
    impact: str


class XAIRequest(BaseModel):
    session_id: str
    skeletal_class: str
    skeletal_probabilities: dict[str, float]
    vertical_pattern: str
    measurements: dict[str, float]
    treatment_name: str
    predicted_outcomes: dict[str, float]
    uncertainty_landmarks: Optional[list[str]] = None


class XAIResponse(BaseModel):
    session_id: str
    decision_chain: list[XAIDecisionStep]
    key_drivers: list[str]
    uncertainty_factors: list[str]
    clinical_confidence: str
    alternative_interpretation: str


class TreatmentResponse(BaseModel):
    session_id: str
    treatments: list[TreatmentItem]


# ── Overlay / Image generation schemas ─────────────────────────────────────

class OverlayMeasurementItem(BaseModel):
    """A single measurement for overlay rendering."""
    code: str
    name: str
    value: float
    unit: str                    # "°" | "mm"
    normal_value: float
    std_deviation: float
    difference: float
    group_name: Optional[str] = "General"
    status: Optional[str] = "Normal"


class OverlayRequest(BaseModel):
    """
    Request body for the /ai/generate-overlays endpoint.
    Accepts the base64 X-ray image, landmark map, and optional measurements.
    """
    session_id: str
    image_base64: str
    landmarks: dict[str, LandmarkPoint]          # name → {x, y}
    measurements: list[OverlayMeasurementItem] = []
    patient_label: Optional[str] = None
    date_label: Optional[str] = None
    scale_bar_mm: Optional[float] = 40.0
    pixel_spacing_mm: Optional[float] = None
    analysis_method: Optional[str] = "Steiner"      # Steiner | McNamara | Tweed | Full (PointNix pack uses Steiner)
    # Which outputs to generate (default: all)
    outputs: list[str] = [
        "xray_tracing",
        "xray_measurements",
        "wiggle_chart",
        "tracing_only",
        "measurement_table",
        "ceph_report",
    ]


class OverlayImageItem(BaseModel):
    """A single rendered image entry."""
    key: str          # e.g. 'xray_tracing'
    label: str        # human-readable label
    image_base64: str # JPEG bytes, base64-encoded
    width: int
    height: int


class OverlayResponse(BaseModel):
    session_id: str
    images: list[OverlayImageItem]
    render_ms: int
