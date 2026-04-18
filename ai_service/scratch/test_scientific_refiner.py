import sys
import os
from typing import Dict
from PIL import Image
import io

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.dirname(__file__) + "/../"))

from engines.landmark_engine import ScientificRefiner
from schemas.schemas import LandmarkPoint

def test_refiner():
    print("Testing ScientificRefiner...")
    
    # 1. Mock landmarks that violate anatomical rules
    # Sella is predicted in front of Nasion (Swapped)
    mock_lms = {
        "S": LandmarkPoint(x=500, y=200, confidence=0.9),
        "N": LandmarkPoint(x=400, y=200, confidence=0.9),
        "Po": LandmarkPoint(x=100, y=300, confidence=0.9),
        "Or": LandmarkPoint(x=400, y=350, confidence=0.9), # Tilted FH
        "Go": LandmarkPoint(x=200, y=600, confidence=0.9),
        "Gn": LandmarkPoint(x=600, y=700, confidence=0.9),
        "ANS": LandmarkPoint(x=600, y=400, confidence=0.9),
    }
    
    refined = ScientificRefiner.refine(mock_lms, 1000, 1000)
    
    # Check if Menton was derived
    if "Me" in refined:
        print(f"Me derived: ({refined['Me'].x:.1f}, {refined['Me'].y:.1f})")
    else:
        print("FAILED: Me not derived")
        
    # Check if PNS was derived
    if "PNS" in refined:
        print(f"PNS derived: ({refined['PNS'].x:.1f}, {refined['PNS'].y:.1f})")
    else:
        print("FAILED: PNS not derived")
        
    # Check tilt warning logic (indirectly via confidence drop)
    print(f"Confidence after tilt check: {refined['S'].confidence:.4f}")
    
    print("Refinement Test Completed.")

if __name__ == "__main__":
    test_refiner()
