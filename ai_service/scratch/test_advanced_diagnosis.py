import sys
import os

# Add the project root to sys.path
# Since I'm in d:\Ai_Ceph_Project\Ai Cephalometric Analysis, I'll add the ai_service folder
sys.path.append(os.path.join(os.getcwd(), 'ai_service'))

from engines.diagnosis_engine import classify_diagnosis

# Mock measurements for a Class II High Angle case
measurements = {
    "SNA": 85.0,
    "SNB": 78.0,
    "ANB": 7.0,
    "FMA": 32.0,
    "SN-PP": 12.0,  # Rotated
    "FH-AB": 70.0,  # Low (Class II tendency)
    "PP-FH": 2.0,
    "AB-MP": 60.0,  # Low (Open tendency)
    "PP-MP": 30.0,  # High
    "H-Angle": 15.0, # Protrusive
}

result = classify_diagnosis(measurements, age=10)

print("--- Diagnosis Result ---")
print(f"Skeletal Class: {result['skeletal_class']} ({result['skeletal_type']})")
print(f"Corrected ANB: {result['corrected_anb']}")
print(f"APDI: {result['apdi_classification']}")
print(f"ODI: {result['odi_classification']}")
print(f"Soft Tissue: {result['soft_tissue_profile']}")
print(f"Summary: {result['summary']}")
print(f"Warnings: {result['warnings']}")
