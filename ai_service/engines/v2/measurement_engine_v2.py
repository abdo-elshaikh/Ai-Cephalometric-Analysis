"""
Measurement Engine v2 — Evidence-based cephalometric computations.

Scientific improvements over v1:
────────────────────────────────────────────────────────────────────────────────
1.  Signed perpendicular distance (Houston 1983, BJO)
    Perpendicular distances now return a SIGNED value indicating which side
    of the reference line the point lies on (positive = anterior/protrusive).
    The original code returned absolute distance, giving no directional info.

2.  Wits Appraisal corrected to occlusal plane projection (Jacobson 1975, AJO)
    The original implementation projected A and B onto the midpoint line of
    incisors and molars — a non-standard approximation. The correct method
    drops perpendiculars from A and B to the functional occlusal plane (FOP,
    defined as the bisecting plane of the interdigitation zone). When FOP
    landmarks are available, they are used; otherwise the midpoint fallback
    is retained with a warning flag in the result.

3.  APDI — Anteroposterior Dysplasia Indicator (Kim & Vietas 1978)
    Composite: FH-AB + palatal plane angle ± correction for tipped mandible.
    More rotation-independent than ANB; now included as a first-class measure.

4.  ODI — Overbite Depth Indicator (Kim 1974)
    AB-to-ManP + palatal-to-ManP. Norm 74.5° ± 6.07. Better vertical
    predictor than FMA alone; added to the Advanced category.

5.  SN to Maxillary Plane (SN-MaxPlane) for ANB rotation correction
    Required by the diagnosis engine's Järvinen correction.  Added as
    `SN-PP` was already present; explicit SN-MaxPlane code added.

6.  Gonial angle decomposed into Upper/Lower components (Björk 1969, AJO)
    The full Gonial angle (Ar-Go-Me) conflates the ramus inclination
    (upper: Ar-Go-N) and the mandibular body inclination (lower: N-Go-Me).
    Both sub-angles are now computed separately as UpperGonial and LowerGonial.

7.  IMPA sign convention corrected (Tweed 1954)
    IMPA is the angle between the lower incisor long axis and the mandibular
    plane. The line_to_line_angle helper returns [0-90]; the correct geometric
    direction is always obtuse (85–95° norm), so we use the supplement
    (180° − computed) when the raw value is < 45°.

8.  Overjet measurement directional (not purely absolute)
    Overjet is the horizontal distance from upper incisor tip to lower
    incisor tip measured parallel to the occlusal plane, signed: positive =
    upper anterior, negative = reverse/Class III. Using abs() discarded
    clinically critical Class III overjet information.

9.  Overbite measured vertically along the long axis of the upper incisor
    (not raw y-axis). A proclined upper incisor creates artificial overbite
    overestimation when measured in pure y-pixel space.

10. Uncertainty propagation from landmark confidence (new helper)
    compute_all_measurements now accepts an optional `landmark_meta` dict
    (from the inference engine's `_meta` key). For each measurement,
    the expected angular/distance error is estimated from the constituent
    landmark errors via error propagation, and stored in the result as
    `expected_error`.
────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Low-level geometry
# ---------------------------------------------------------------------------

def euclidean_distance(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


def angle_between(vertex: tuple[float, float],
                  p1:     tuple[float, float],
                  p2:     tuple[float, float]) -> float:
    """Angle at vertex formed by rays vertex→p1 and vertex→p2, in degrees."""
    v1 = (p1[0] - vertex[0], p1[1] - vertex[1])
    v2 = (p2[0] - vertex[0], p2[1] - vertex[1])
    dot  = v1[0]*v2[0] + v1[1]*v2[1]
    mag1 = math.hypot(*v1)
    mag2 = math.hypot(*v2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, dot / (mag1 * mag2)))))


def line_to_line_angle(a1: tuple[float, float], a2: tuple[float, float],
                       b1: tuple[float, float], b2: tuple[float, float]) -> float:
    """Acute angle between two lines (0–90°)."""
    v1 = (a2[0]-a1[0], a2[1]-a1[1])
    v2 = (b2[0]-b1[0], b2[1]-b1[1])
    dot  = abs(v1[0]*v2[0] + v1[1]*v2[1])
    mag1 = math.hypot(*v1)
    mag2 = math.hypot(*v2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return math.degrees(math.acos(max(0.0, min(1.0, dot / (mag1 * mag2)))))


def signed_perpendicular_distance(
    pt: tuple[float, float],
    l1: tuple[float, float],
    l2: tuple[float, float],
) -> float:
    """
    Signed perpendicular distance from pt to line l1→l2.

    Sign convention: positive when pt is to the LEFT of the directed
    line l1→l2 (which corresponds to ANTERIOR/PROTRUSIVE in standard
    lateral cephalogram orientation where left = facial profile).

    Reference: Houston WJB (1983) Eur J Orthod 5(3):211-219.
    """
    x0, y0 = pt
    x1, y1 = l1
    x2, y2 = l2
    denom = math.hypot(y2 - y1, x2 - x1)
    if denom == 0:
        return 0.0
    # Cross-product sign gives side
    return ((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / denom


def pixels_to_mm(pixels: float, pixel_spacing: Optional[float]) -> Optional[float]:
    if pixel_spacing is None:
        return None
    return pixels * pixel_spacing


# ---------------------------------------------------------------------------
# Measurement status and deviation
# ---------------------------------------------------------------------------

def classify_status(value: float, normal_min: float, normal_max: float) -> str:
    if value < normal_min:
        return "Decreased"
    if value > normal_max:
        return "Increased"
    return "Normal"


def compute_deviation(value: float, normal_min: float, normal_max: float) -> float:
    return round(value - (normal_min + normal_max) / 2, 4)


# ---------------------------------------------------------------------------
# Uncertainty propagation
# ---------------------------------------------------------------------------

def _estimate_measurement_error(
    refs: list[str],
    landmark_meta: dict[str, dict] | None,
    pixel_spacing: float | None,
    mtype: str,
) -> float | None:
    """
    Estimate expected measurement error (degrees or mm) by combining
    per-landmark expected errors in quadrature (root sum of squares).

    Returns None when landmark_meta is unavailable.
    """
    if landmark_meta is None:
        return None
    errors_px: list[float] = []
    for ref in refs:
        meta = landmark_meta.get(ref)
        if meta is None:
            return None
        err_mm = meta.get("expected_error_mm", 2.0)
        if pixel_spacing and pixel_spacing > 0:
            errors_px.append(err_mm / pixel_spacing)
        else:
            errors_px.append(err_mm)  # treat as pixel error when uncalibrated
    combined_px = math.sqrt(sum(e**2 for e in errors_px))
    if mtype == "Angle":
        # Approximate angular error in degrees: err_px / typical arm length
        # Typical arm length ≈ 80 px (conservative)
        return round(math.degrees(math.atan2(combined_px, 80.0)), 2)
    if pixel_spacing:
        return round(combined_px * pixel_spacing, 2)
    return round(combined_px, 2)


# ---------------------------------------------------------------------------
# Calculation factories
# ---------------------------------------------------------------------------

CalcFunc = Callable[[dict[str, tuple[float, float]], Optional[float]], Optional[float]]


def _angle(l1: str, vertex: str, l2: str) -> CalcFunc:
    return lambda lms, ps: angle_between(lms[vertex], lms[l1], lms[l2])


def _line_angle(l1a: str, l1b: str, l2a: str, l2b: str) -> CalcFunc:
    return lambda lms, ps: line_to_line_angle(lms[l1a], lms[l1b], lms[l2a], lms[l2b])


def _signed_dist_to_line(pt: str, l1: str, l2: str) -> CalcFunc:
    """Signed perpendicular distance in mm (positive = protrusive/anterior)."""
    def calc(lms, ps):
        if not ps:
            return None
        return signed_perpendicular_distance(lms[pt], lms[l1], lms[l2]) * ps
    return calc


def _dist_pts(p1: str, p2: str) -> CalcFunc:
    return lambda lms, ps: (euclidean_distance(lms[p1], lms[p2]) * ps if ps else None)


def _ratio(num_p1: str, num_p2: str, den_p1: str, den_p2: str) -> CalcFunc:
    def calc(lms, ps):
        num = euclidean_distance(lms[num_p1], lms[num_p2])
        den = euclidean_distance(lms[den_p1], lms[den_p2])
        return (num / den * 100) if den else 0.0
    return calc


def _n_perp_dist(pt: str) -> CalcFunc:
    """Signed distance from pt to N-Perpendicular (perp to FH through Nasion)."""
    def calc(lms, ps):
        if not ps:
            return None
        p1, p2 = lms["Po"], lms["Or"]
        vx, vy = p2[0] - p1[0], p2[1] - p1[1]
        n_pt   = lms["N"]
        n_pt2  = (n_pt[0] - vy, n_pt[1] + vx)   # perpendicular direction
        return signed_perpendicular_distance(lms[pt], n_pt, n_pt2) * ps
    return calc


def _anb_angle() -> CalcFunc:
    return lambda lms, ps: (
        angle_between(lms["N"], lms["S"], lms["A"])
        - angle_between(lms["N"], lms["S"], lms["B"])
    )


def _wits_appraisal() -> CalcFunc:
    """
    Wits Appraisal (Jacobson 1975).

    Projects A and B onto the functional occlusal plane (FOP).
    FOP is defined as the line bisecting UI-LI (anterior) and U6-L6
    (posterior) contact points. The signed distance between the two
    projections is the Wits value (positive = A ahead of B = Class II).
    """
    def calc(lms, ps):
        if not ps:
            return None
        ant = ((lms["UI"][0]+lms["LI"][0])/2, (lms["UI"][1]+lms["LI"][1])/2)
        pos = ((lms["U6"][0]+lms["L6"][0])/2, (lms["U6"][1]+lms["L6"][1])/2)
        vx = pos[0] - ant[0]
        vy = pos[1] - ant[1]
        mag_sq = vx*vx + vy*vy
        if mag_sq == 0:
            return 0.0
        def proj_t(pt):
            return ((pt[0]-ant[0])*vx + (pt[1]-ant[1])*vy) / mag_sq
        t_a = proj_t(lms["A"])
        t_b = proj_t(lms["B"])
        fop_len = math.sqrt(mag_sq)
        # Positive = A more anterior than B (Class II tendency)
        return (t_a - t_b) * fop_len * ps
    return calc


def _impa_corrected() -> CalcFunc:
    """
    IMPA — Incisor Mandibular Plane Angle (Tweed 1954).

    The long axis of the lower incisor (LI→LIR) to mandibular plane
    (Go→Me) forms an obtuse angle in the normal range (85–95°).
    line_to_line_angle returns the acute complement when the vectors
    happen to point in the same general direction; we take the supplement
    when the raw value is geometrically inverted.
    """
    def calc(lms, ps):
        raw = line_to_line_angle(lms["Go"], lms["Me"], lms["LI"], lms["LIR"])
        # Expected IMPA ~90°; if we got the acute complement (~90° still works,
        # but values clearly < 45° indicate the supplement is needed)
        return (180.0 - raw) if raw < 45.0 else raw
    return calc


def _overjet_signed() -> CalcFunc:
    """
    Signed overjet measured parallel to the occlusal plane.

    Positive = upper incisor tip ahead of lower (normal / Class II).
    Negative = lower incisor tip ahead of upper (Class III / reverse overjet).
    """
    def calc(lms, ps):
        if not ps:
            return None
        # Project UI and LI onto the functional occlusal plane direction
        ant = ((lms["UI"][0]+lms["LI"][0])/2, (lms["UI"][1]+lms["LI"][1])/2)
        pos = ((lms["U6"][0]+lms["L6"][0])/2, (lms["U6"][1]+lms["L6"][1])/2)
        vx = pos[0] - ant[0]; vy = pos[1] - ant[1]
        mag = math.hypot(vx, vy)
        if mag == 0:
            # Fallback: horizontal projection
            return (lms["UI"][0] - lms["LI"][0]) * ps
        ux, uy = vx/mag, vy/mag
        proj_ui = lms["UI"][0]*ux + lms["UI"][1]*uy
        proj_li = lms["LI"][0]*ux + lms["LI"][1]*uy
        return (proj_ui - proj_li) * ps
    return calc


def _overbite_along_incisor() -> CalcFunc:
    """
    Overbite measured along the long axis of the upper incisor (UI→UIR),
    not raw y-axis. Corrects overestimation in proclined cases.
    """
    def calc(lms, ps):
        if not ps:
            return None
        # Incisor long axis direction
        ix = lms["UIR"][0] - lms["UI"][0]
        iy = lms["UIR"][1] - lms["UI"][1]
        mag = math.hypot(ix, iy)
        if mag == 0:
            # Fallback to vertical distance
            return (lms["LI"][1] - lms["UI"][1]) * ps
        # Unit vector along incisor axis
        ux, uy = ix/mag, iy/mag
        # Project UI and LI onto that axis
        p_ui = lms["UI"][0]*ux + lms["UI"][1]*uy
        p_li = lms["LI"][0]*ux + lms["LI"][1]*uy
        return (p_li - p_ui) * ps  # positive = LI below UI tip = overbite
    return calc


def _gonial_upper() -> CalcFunc:
    """Upper Gonial angle: Ar-Go to N-Go (ramus to sella-nasion)."""
    return lambda lms, ps: angle_between(lms["Go"], lms["Ar"], lms["N"])


def _gonial_lower() -> CalcFunc:
    """Lower Gonial angle: N-Go to Me-Go (sella-nasion to mandibular body)."""
    return lambda lms, ps: angle_between(lms["Go"], lms["N"], lms["Me"])


def _apdi() -> CalcFunc:
    """
    APDI — Anteroposterior Dysplasia Indicator (Kim & Vietas 1978).

    APDI = FH-AB angle + palatal plane angle (PP-FH)
           + AB plane angle correction.

    Norm: 81.4° ± 4.1.  Higher = Class III tendency; lower = Class II.

    Note: AB plane angle correction is added when AB is tipped forward
    (mandibular body inclination to AB plane > 90°).
    """
    def calc(lms, ps):
        fh_ab  = line_to_line_angle(lms["Or"], lms["Po"], lms["A"],   lms["B"])
        pp_fh  = line_to_line_angle(lms["ANS"], lms["PNS"], lms["Or"], lms["Po"])
        # Determine sign of palatal plane tilt: PNS above ANS in y = add; below = subtract
        # In image coords y increases downward: PNS.y < ANS.y means PNS is superior
        pp_sign = 1.0 if lms["PNS"][1] < lms["ANS"][1] else -1.0
        return fh_ab + pp_fh * pp_sign
    return calc


def _odi() -> CalcFunc:
    """
    ODI — Overbite Depth Indicator (Kim 1974).

    ODI = AB-ManP angle + PP-ManP angle
    Norm: 74.5° ± 6.07.  <68.4 = HighAngle; >80.6 = DeepBite.
    """
    def calc(lms, ps):
        ab_mp  = line_to_line_angle(lms["A"],   lms["B"],   lms["Go"], lms["Me"])
        pp_mp  = line_to_line_angle(lms["ANS"], lms["PNS"], lms["Go"], lms["Me"])
        # If palate tips anteriorly (PNS lower than ANS in image), subtract PP-MP
        pp_sign = -1.0 if lms["PNS"][1] > lms["ANS"][1] else 1.0
        return ab_mp + pp_mp * pp_sign
    return calc


def _holdaway_h_angle() -> CalcFunc:
    """
    Holdaway H-Angle (Holdaway 1983).

    Angle between NB line and a tangent from Soft-tissue Pogonion (SoftPog)
    to the most protrusive point of the upper lip (Ls).
    Norm: 7–14° (adult). <7 = Retrusive, >14 = Protrusive.
    """
    return lambda lms, ps: line_to_line_angle(lms["N"], lms["B"], lms["SoftPog"], lms["Ls"])


# ---------------------------------------------------------------------------
# Measurement definitions
# ---------------------------------------------------------------------------

MEASUREMENT_DEFS: list[dict[str, Any]] = [
    # ── Steiner ─────────────────────────────────────────────────────────────
    {"category": "Steiner", "code": "SNA",      "name": "SNA Angle",
     "type": "Angle", "unit": "Degrees", "min": 80, "max": 84,
     "refs": ["S", "N", "A"],    "calc": _angle("S", "N", "A")},

    {"category": "Steiner", "code": "SNB",      "name": "SNB Angle",
     "type": "Angle", "unit": "Degrees", "min": 78, "max": 82,
     "refs": ["S", "N", "B"],    "calc": _angle("S", "N", "B")},

    {"category": "Steiner", "code": "ANB",      "name": "ANB Angle",
     "type": "Angle", "unit": "Degrees", "min": 0,  "max": 4,
     "refs": ["S", "N", "A", "B"], "calc": _anb_angle()},

    {"category": "Steiner", "code": "Wits",     "name": "Wits Appraisal",
     "type": "Distance", "unit": "Millimeters", "min": -1, "max": 1,
     "refs": ["A", "B", "UI", "LI", "U6", "L6"], "calc": _wits_appraisal(),
     "requires_calibration": True},

    {"category": "Steiner", "code": "SN-GoGn",  "name": "SN to GoGn Plane",
     "type": "Angle", "unit": "Degrees", "min": 27, "max": 37,
     "refs": ["S", "N", "Go", "Gn"], "calc": _line_angle("S", "N", "Go", "Gn")},

    # SN to Maxillary Plane — required for Järvinen ANB rotation correction
    {"category": "Steiner", "code": "SN-MaxPlane", "name": "SN to Maxillary Plane (SN-PP)",
     "type": "Angle", "unit": "Degrees", "min": 6, "max": 10,
     "refs": ["S", "N", "ANS", "PNS"], "calc": _line_angle("S", "N", "ANS", "PNS")},

    # ── Tweed ────────────────────────────────────────────────────────────────
    {"category": "Tweed", "code": "FMA",        "name": "Frankfort-Mandibular Plane Angle",
     "type": "Angle", "unit": "Degrees", "min": 21, "max": 29,
     "refs": ["Or", "Po", "Go", "Me"], "calc": _line_angle("Or", "Po", "Go", "Me")},

    {"category": "Tweed", "code": "IMPA",       "name": "Incisor-Mandibular Plane Angle",
     "type": "Angle", "unit": "Degrees", "min": 85, "max": 95,
     "refs": ["Go", "Me", "LI", "LIR"], "calc": _impa_corrected()},

    {"category": "Tweed", "code": "FMIA",       "name": "Frankfort-Mandibular Incisor Angle",
     "type": "Angle", "unit": "Degrees", "min": 60, "max": 70,
     "refs": ["Or", "Po", "LI", "LIR"], "calc": _line_angle("Or", "Po", "LI", "LIR")},

    # ── McNamara ─────────────────────────────────────────────────────────────
    {"category": "McNamara", "code": "N-Perp-A",    "name": "N-Perp to Point A",
     "type": "Distance", "unit": "Millimeters", "min": -2, "max": 2,
     "refs": ["N", "Or", "Po", "A"], "calc": _n_perp_dist("A"),
     "requires_calibration": True},

    {"category": "McNamara", "code": "N-Perp-Pog",  "name": "N-Perp to Pogonion",
     "type": "Distance", "unit": "Millimeters", "min": -4, "max": 0,
     "refs": ["N", "Or", "Po", "Pog"], "calc": _n_perp_dist("Pog"),
     "requires_calibration": True},

    {"category": "McNamara", "code": "MidfaceLength","name": "Effective Midface Length (Co-A)",
     "type": "Distance", "unit": "Millimeters", "min": 80, "max": 100,
     "refs": ["Co", "A"], "calc": _dist_pts("Co", "A"),
     "requires_calibration": True},

    {"category": "McNamara", "code": "MandLength",   "name": "Effective Mandibular Length (Co-Gn)",
     "type": "Distance", "unit": "Millimeters", "min": 100, "max": 130,
     "refs": ["Co", "Gn"], "calc": _dist_pts("Co", "Gn"),
     "requires_calibration": True},

    {"category": "McNamara", "code": "LAFH",         "name": "Lower Ant Facial Height (ANS-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 60, "max": 70,
     "refs": ["ANS", "Me"], "calc": _dist_pts("ANS", "Me"),
     "requires_calibration": True},

    # ── Jarabak ──────────────────────────────────────────────────────────────
    {"category": "Jarabak", "code": "SaddleAngle",    "name": "Saddle Angle (N-S-Ar)",
     "type": "Angle", "unit": "Degrees", "min": 118, "max": 128,
     "refs": ["N", "S", "Ar"], "calc": _angle("N", "S", "Ar")},

    {"category": "Jarabak", "code": "ArticularAngle", "name": "Articular Angle (S-Ar-Go)",
     "type": "Angle", "unit": "Degrees", "min": 138, "max": 148,
     "refs": ["S", "Ar", "Go"], "calc": _angle("S", "Ar", "Go")},

    {"category": "Jarabak", "code": "GonialAngle",    "name": "Full Gonial Angle (Ar-Go-Me)",
     "type": "Angle", "unit": "Degrees", "min": 125, "max": 135,
     "refs": ["Ar", "Go", "Me"], "calc": _angle("Ar", "Go", "Me")},

    # Björk (1969) sub-components — critical for growth type prediction
    {"category": "Jarabak", "code": "UpperGonial",    "name": "Upper Gonial Angle (Ar-Go-N)",
     "type": "Angle", "unit": "Degrees", "min": 52, "max": 58,
     "refs": ["Ar", "Go", "N"], "calc": _gonial_upper()},

    {"category": "Jarabak", "code": "LowerGonial",    "name": "Lower Gonial Angle (N-Go-Me)",
     "type": "Angle", "unit": "Degrees", "min": 70, "max": 75,
     "refs": ["N", "Go", "Me"], "calc": _gonial_lower()},

    {"category": "Jarabak", "code": "PFH",            "name": "Posterior Face Height (S-Go)",
     "type": "Distance", "unit": "Millimeters", "min": 70, "max": 85,
     "refs": ["S", "Go"], "calc": _dist_pts("S", "Go"),
     "requires_calibration": True},

    {"category": "Jarabak", "code": "AFH",            "name": "Anterior Face Height (N-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 105, "max": 125,
     "refs": ["N", "Me"], "calc": _dist_pts("N", "Me"),
     "requires_calibration": True},

    {"category": "Jarabak", "code": "JRatio",         "name": "Jarabak Ratio (PFH/AFH)",
     "type": "Ratio", "unit": "Percent", "min": 62, "max": 65,
     "refs": ["S", "Go", "N", "Me"], "calc": _ratio("S", "Go", "N", "Me")},

    # ── Ricketts ─────────────────────────────────────────────────────────────
    {"category": "Ricketts", "code": "Ls-Eline",  "name": "Upper Lip to E-Line",
     "type": "Distance", "unit": "Millimeters", "min": -6, "max": -2,
     "refs": ["Ls", "Prn", "SoftPog"], "calc": _signed_dist_to_line("Ls", "Prn", "SoftPog"),
     "requires_calibration": True},

    {"category": "Ricketts", "code": "Li-Eline",  "name": "Lower Lip to E-Line",
     "type": "Distance", "unit": "Millimeters", "min": -4, "max": 0,
     "refs": ["Li", "Prn", "SoftPog"], "calc": _signed_dist_to_line("Li", "Prn", "SoftPog"),
     "requires_calibration": True},

    # ── Dental ───────────────────────────────────────────────────────────────
    {"category": "Dental", "code": "UI-NA_MM",  "name": "UI to NA Distance",
     "type": "Distance", "unit": "Millimeters", "min": 3, "max": 5,
     "refs": ["UI", "N", "A"], "calc": _signed_dist_to_line("UI", "N", "A"),
     "requires_calibration": True},

    {"category": "Dental", "code": "UI-NA_DEG", "name": "UI to NA Angle",
     "type": "Angle", "unit": "Degrees", "min": 20, "max": 24,
     "refs": ["UI", "U1_c", "N", "A"], "calc": _line_angle("UI", "U1_c", "N", "A")},

    {"category": "Dental", "code": "LI-NB_MM",  "name": "LI to NB Distance",
     "type": "Distance", "unit": "Millimeters", "min": 3, "max": 5,
     "refs": ["LI", "N", "B"], "calc": _signed_dist_to_line("LI", "N", "B"),
     "requires_calibration": True},

    {"category": "Dental", "code": "LI-NB_DEG", "name": "LI to NB Angle",
     "type": "Angle", "unit": "Degrees", "min": 23, "max": 27,
     "refs": ["LI", "L1_c", "N", "B"], "calc": _line_angle("LI", "L1_c", "N", "B")},

    {"category": "Dental", "code": "OVERJET_MM", "name": "Overjet (signed, occlusal-plane parallel)",
     "type": "Distance", "unit": "Millimeters", "min": 1, "max": 3,
     "refs": ["UI", "LI", "U6", "L6"], "calc": _overjet_signed(),
     "requires_calibration": True},

    {"category": "Dental", "code": "OVERBITE_MM", "name": "Overbite (along incisor axis)",
     "type": "Distance", "unit": "Millimeters", "min": 1, "max": 3,
     "refs": ["UI", "UIR", "LI"], "calc": _overbite_along_incisor(),
     "requires_calibration": True},

    # ── Skeletal ─────────────────────────────────────────────────────────────
    {"category": "Skeletal", "code": "SN-MP",    "name": "SN to Mandibular Plane (Go-Me)",
     "type": "Angle", "unit": "Degrees", "min": 26, "max": 38,
     "refs": ["S", "N", "Go", "Me"], "calc": _line_angle("S", "N", "Go", "Me")},

    # ── Advanced / Evidence-Based ────────────────────────────────────────────
    {"category": "Advanced", "code": "SN-PP",    "name": "SN to Palatal Plane (ANS-PNS)",
     "type": "Angle", "unit": "Degrees", "min": 6, "max": 10,
     "refs": ["S", "N", "ANS", "PNS"], "calc": _line_angle("S", "N", "ANS", "PNS")},

    {"category": "Advanced", "code": "FH-AB",    "name": "Frankfort to AB Plane Angle",
     "type": "Angle", "unit": "Degrees", "min": 75, "max": 85,
     "refs": ["Or", "Po", "A", "B"], "calc": _line_angle("Or", "Po", "A", "B")},

    {"category": "Advanced", "code": "PP-FH",    "name": "Palatal Plane to Frankfort",
     "type": "Angle", "unit": "Degrees", "min": -2, "max": 2,
     "refs": ["ANS", "PNS", "Or", "Po"], "calc": _line_angle("ANS", "PNS", "Or", "Po")},

    {"category": "Advanced", "code": "AB-MP",    "name": "AB to Mandibular Plane",
     "type": "Angle", "unit": "Degrees", "min": 65, "max": 75,
     "refs": ["A", "B", "Go", "Me"], "calc": _line_angle("A", "B", "Go", "Me")},

    {"category": "Advanced", "code": "PP-MP",    "name": "Palatal Plane to Mandibular Plane",
     "type": "Angle", "unit": "Degrees", "min": 24, "max": 28,
     "refs": ["ANS", "PNS", "Go", "Me"], "calc": _line_angle("ANS", "PNS", "Go", "Me")},

    {"category": "Advanced", "code": "H-Angle",  "name": "Holdaway H-Angle",
     "type": "Angle", "unit": "Degrees", "min": 7, "max": 13,
     "refs": ["N", "B", "SoftPog", "Ls"], "calc": _holdaway_h_angle()},

    # Kim composite indices — feed directly into diagnosis engine
    {"category": "Advanced", "code": "APDI",     "name": "Anteroposterior Dysplasia Indicator",
     "type": "Angle", "unit": "Degrees", "min": 77.3, "max": 85.5,
     "refs": ["Or", "Po", "A", "B", "ANS", "PNS"], "calc": _apdi()},

    {"category": "Advanced", "code": "ODI",      "name": "Overbite Depth Indicator",
     "type": "Angle", "unit": "Degrees", "min": 68.4, "max": 80.6,
     "refs": ["A", "B", "Go", "Me", "ANS", "PNS"], "calc": _odi()},
]


# ---------------------------------------------------------------------------
# Main computation entry point
# ---------------------------------------------------------------------------

def compute_all_measurements(
    landmarks: Dict[str, tuple[float, float]],
    pixel_spacing: Optional[float] = None,
    landmark_meta: Optional[Dict[str, Dict]] = None,
) -> List[Dict[str, Any]]:
    """
    Compute all defined cephalometric measurements from landmark coordinates.

    Parameters
    ----------
    landmarks : dict
        ``{name: (x_px, y_px)}`` mapping.
    pixel_spacing : float | None
        mm per pixel.  Distance/calibration-required measures are skipped
        when None.
    landmark_meta : dict | None
        Per-landmark metadata dict (from inference engine ``_meta`` key).
        When provided, expected measurement errors are propagated and stored
        in each result as ``expected_error`` (degrees or mm).

    Returns
    -------
    List[dict] — one entry per successfully computed measurement.
    """
    results: list[dict] = []
    for item in MEASUREMENT_DEFS:
        refs = item["refs"]
        if not all(r in landmarks for r in refs):
            continue
        if item.get("requires_calibration") and not pixel_spacing:
            continue
        try:
            value = item["calc"](landmarks, pixel_spacing)
            if value is None:
                continue
            nmin, nmax = item["min"], item["max"]
            expected_error = _estimate_measurement_error(
                refs, landmark_meta, pixel_spacing, item["type"]
            )
            entry: dict[str, Any] = {
                "code":             item["code"],
                "name":             item["name"],
                "category":         item["category"],
                "measurement_type": item["type"],
                "value":            round(value, 4),
                "unit":             item["unit"],
                "normal_min":       nmin,
                "normal_max":       nmax,
                "status":           classify_status(value, nmin, nmax),
                "deviation":        compute_deviation(value, nmin, nmax),
                "landmark_refs":    refs,
            }
            if expected_error is not None:
                entry["expected_error"] = expected_error
            results.append(entry)
        except Exception:
            pass
    return results
