from pydantic import BaseModel
from typing import Optional


# ── Landmark schemas ────────────────────────────────────────────────────────

class LandmarkPoint(BaseModel):
    x: float
    y: float
    confidence: Optional[float] = 1.0


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


class MeasurementItem(BaseModel):
    code: str
    name: str
    measurement_type: str      # Angle | Distance | Ratio
    value: float
    unit: str                  # Degrees | Millimeters
    normal_min: float
    normal_max: float
    status: str                # Normal | Increased | Decreased
    deviation: Optional[float] = None
    landmark_refs: list[str]


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
    session_id: str
    skeletal_class: str          # ClassI | ClassII | ClassIII
    skeletal_type: str           # Definitive | Borderline
    corrected_anb: float
    apdi_classification: Optional[str] = None
    odi_classification: Optional[str] = None
    vertical_pattern: str        # LowAngle | Normal | HighAngle
    maxillary_position: str
    mandibular_position: str
    upper_incisor_inclination: str
    lower_incisor_inclination: str
    soft_tissue_profile: str     # Normal | Protrusive | Retrusive | Unknown
    overjet_mm: Optional[float] = None
    overjet_classification: Optional[str] = None
    overbite_mm: Optional[float] = None
    overbite_classification: Optional[str] = None
    confidence_score: float
    summary: str
    warnings: list[str] = []
    clinical_notes: list[str] = []


# ── Treatment schemas ───────────────────────────────────────────────────────

class TreatmentRequest(BaseModel):
    session_id: str
    skeletal_class: str
    vertical_pattern: str
    measurements: dict[str, float]
    patient_age: Optional[float] = None


class TreatmentItem(BaseModel):
    plan_index: int
    treatment_type: str
    treatment_name: str
    description: str
    rationale: Optional[str] = None
    risks: Optional[str] = None
    estimated_duration_months: Optional[int] = None
    confidence_score: float
    source: str                  # RuleBased | ML | LLM | Hybrid
    is_primary: bool


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
