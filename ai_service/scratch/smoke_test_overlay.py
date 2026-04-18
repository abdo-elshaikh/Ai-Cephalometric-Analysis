"""
smoke_test_overlay.py
~~~~~~~~~~~~~~~~~~~~~
End-to-end smoke test for the overlay engine using the Yasmin reference pack.
Generates all 5 outputs and saves them to disk for visual inspection.
"""

import sys, os, json, io
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from PIL import Image

PACK  = r"d:\Ai_Ceph_Project\Ai Cephalometric Analysis\Yasmin_Walid_Abdallah_(11Y,_Female)-pack"
JSON2 = os.path.join(PACK, "Yasmin_Walid_Abdallah_(11Y,_Female)_-2.json")
JSON1 = os.path.join(PACK, "Yasmin_Walid_Abdallah_(11Y,_Female)_-1.json")
XRAY  = os.path.join(PACK, "Yasmin_Walid_Abdallah_(11Y,_Female)_Tracing_on_X-ray_image-1.jpg")

with open(JSON2) as f:
    j2 = json.load(f)
with open(JSON1) as f:
    j1 = json.load(f)
with open(XRAY, "rb") as f:
    image_bytes = f.read()

from engines.overlay_engine import LandmarkPoint, MeasurementItem, OverlayRequest, render_all

# Build landmark map (primary named + GUID-keyed for alias resolution)
PRIMARY_NAMES = {
    "Sella Turcica", "Nasion", "Point A", "Point B", "Menton", "Porion", "Orbitale",
    "Incisal edge of upper incisor", "Apex of upper incisor",
    "Incisal edge of lower incisor", "Apex of lower incisor",
    "Pronasale", "Point Soft Pogonion", "Labrale Superior", "Labrale Inferior",
    "tGo-abo", "ML-tangent-abo", "aboRamalTangent",
    "Upper incisor apex", "Upper incisor tip", "Lower incisor tip", "Lower incisor apex",
    "First point on upper molar", "Second point on upper molar",
    "First point on lower molar", "Second point on lower molar",
    "PB", "PD", "PE", "PF", "PG", "PA", "PC",
    "Articulare", "Pogonion", "Anterior Nasal Spine", "Posterior Nasal Spine",
    "Soft Nasion", "Point Soft A", "Point Soft Gnathion", "Point Soft Menton",
    "Point Soft B", "Glabella", "Upper Stomion", "Lower Stomion", "Throat", "Subnasale",
    "Cusp of upper first molar", "Apex of upper first molar",
    "Cusp of lower first molar", "Apex of lower first molar",
    "upGl'", "upN'", "upPn'", "upSn'", "upSLS'", "upLs'", "upUppSt'",
    "loTh'", "loMe'", "loGn'", "loPg'", "loILS'", "loLi'", "loLowSt'",
    "Constructed Gonion (tangent)", "Gonion",
    "Zy Orbit Ridge", "R3", "End Ramus", "Orbit first point", "Orbit second point",
    "Basion", "Sphenoid first point", "Sphenoid second point", "P0", "I1", "First molar",
}

lms_clean = {}
for coord in j2["coordinates"]:
    name = coord["name"]
    if name in PRIMARY_NAMES and name not in lms_clean:
        lms_clean[name] = LandmarkPoint(x=float(coord["x"]), y=float(coord["y"]), name=name)
    lms_clean[coord["guid"]] = LandmarkPoint(
        x=float(coord["x"]), y=float(coord["y"]), name=name)

# Build measurements
CODE_MAP = {
    "Angle SNA": "SNA", "Angle SNB": "SNB", "ANB": "ANB",
    "SN-MP-abo": "SN_MP", "FMA-abo": "FMA",
    "+1i/NA": "UI_NA_MM", "+1/SN": "UI_SN",
    "-1i/NB": "LI_NB_MM", "-1/MP-abo": "LI_MP",
    "Overjet": "OVERJET", "Overbite": "OVERBITE",
    "Ls/E-line": "LS_ELINE", "Li'/E-line": "LI_ELINE",
}
msrs = []
for m in j1["measurements"]:
    code = CODE_MAP.get(m["name"], m["name"].upper().replace(" ", "_").replace("/", "_"))
    msrs.append(MeasurementItem(
        code=code,
        name=m["name"],
        value=float(m["value"]),
        unit=m["unit"],
        normal_value=float(m["normalValue"]),
        std_deviation=float(m["stdDeviation"]),
        difference=float(m["difference"]),
        group_name=m["groupName"],
    ))

req = OverlayRequest(
    image_bytes=image_bytes,
    landmarks=lms_clean,
    measurements=msrs,
    patient_label="Yasmin Walid Abdallah (11Y, Female)",
    date_label="4/12/2026",
    scale_bar_mm=40.0,
    pixel_spacing_mm=0.1,
)

print("Rendering overlays...")
results = render_all(req)

OUT_DIR = os.path.join(PACK, "smoke_test_output")
os.makedirs(OUT_DIR, exist_ok=True)

for key, jpeg_bytes in results.items():
    out_path = os.path.join(OUT_DIR, f"{key}.jpg")
    with open(out_path, "wb") as f:
        f.write(jpeg_bytes)
    im = Image.open(io.BytesIO(jpeg_bytes))
    print(f"  OK {key:25s}  {im.size[0]}x{im.size[1]}  ({len(jpeg_bytes)//1024} KB)")

print("All overlays saved to: " + OUT_DIR)
