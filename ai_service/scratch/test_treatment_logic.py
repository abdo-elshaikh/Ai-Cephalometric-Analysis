import sys
import os
from unittest.mock import MagicMock

# Add current dir to path
sys.path.append(os.path.abspath('.'))

# Mock settings
from config.settings import settings
settings.openai_api_key = "" # No AI for pure logic test

from engines.treatment_engine import suggest_treatment

def test_class2_logic():
    print("Testing Class II logic...")
    # Growing patient, Class II, Normal Vertical
    res = suggest_treatment(
        skeletal_class="ClassII",
        vertical_pattern="Normal",
        measurements={"ANB": 5.0, "OVERJET_MM": 5.0},
        patient_age=12.0
    )
    print(f"Top suggested: {res[0]['treatment_name']} (Score: {res[0]['confidence_score']})")
    assert "Twin Block" in res[0]['treatment_name']
    
def test_surgery_logic():
    print("\nTesting Surgery logic...")
    # Adult patient, severe Class III
    res = suggest_treatment(
        skeletal_class="ClassIII",
        vertical_pattern="Normal",
        measurements={"ANB": -4.0},
        patient_age=25.0
    )
    print(f"Top suggested: {res[0]['treatment_name']} (Score: {res[0]['confidence_score']})")
    assert "Le Fort" in res[0]['treatment_name']

if __name__ == "__main__":
    try:
        test_class2_logic()
        test_surgery_logic()
        print("\nAll logic tests passed!")
    except Exception as e:
        print(f"\nTest failed: {e}")
        sys.exit(1)
