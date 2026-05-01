import pytest

from engines.diagnosis_engine import classify_diagnosis
from engines.measurement_engine import compute_all_measurements
from engines.treatment_engine import suggest_treatment


def test_diagnosis_uses_existing_overjet_overbite_codes():
    result = classify_diagnosis(
        {
            "SNA": 82.0,
            "SNB": 80.0,
            "ANB": 2.0,
            "FMA": 25.0,
            "UI-NA_DEG": 22.0,
            "LI-NB_DEG": 25.0,
            "OVERJET": 4.0,
            "OVERBITE": -1.0,
        }
    )

    assert result["overjet_mm"] == 4.0
    assert result["overjet_classification"] == "Increased"
    assert result["overbite_mm"] == -1.0
    assert result["overbite_classification"] == "OpenBite"


def test_treatment_rules_use_existing_overbite_code():
    plans = suggest_treatment(
        skeletal_class="ClassI",
        vertical_pattern="LowAngle",
        measurements={"OVERBITE": 5.0},
    )

    names = {plan["treatment_name"] for plan in plans}
    assert "Anterior Intrusion (Utility Arches)" in names


def test_measurement_quality_flags_fallback_landmarks():
    results = compute_all_measurements(
        landmarks={"U1": (10.0, 8.0), "L1": (7.0, 10.0)},
        pixel_spacing=1.0,
        landmark_provenance={"U1": "detected", "L1": "fallback"},
    )

    overjet = next(item for item in results if item["code"] == "OVERJET")
    overbite = next(item for item in results if item["code"] == "OVERBITE")

    assert overjet["value"] == pytest.approx(3.0)
    assert overjet["quality_status"] == "manual_review_required"
    assert overjet["landmark_provenance"] == {"U1": "detected", "L1": "fallback"}
    assert any("Fallback landmark" in reason for reason in overjet["review_reasons"])

    assert overbite["value"] == pytest.approx(2.0)
    assert overbite["quality_status"] == "manual_review_required"
