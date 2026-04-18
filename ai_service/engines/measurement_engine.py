"""
Measurement Engine — Pure functions for computing cephalometric angles & distances
from landmark (x, y) pixel coordinates.
"""
import math
from typing import Optional, Callable, Dict, List, Any


# ── Low-level geometry ───────────────────────────────────────────────────────

def euclidean_distance(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Pixel distance between two points."""
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


def angle_between(vertex: tuple[float, float],
                  p1: tuple[float, float],
                  p2: tuple[float, float]) -> float:
    """
    Angle at `vertex` formed by rays vertex→p1 and vertex→p2, in degrees.
    """
    v1 = (p1[0] - vertex[0], p1[1] - vertex[1])
    v2 = (p2[0] - vertex[0], p2[1] - vertex[1])
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    cos_angle = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_angle))


def line_to_line_angle(a1: tuple[float, float], a2: tuple[float, float],
                        b1: tuple[float, float], b2: tuple[float, float]) -> float:
    """Angle between two lines (a1→a2 and b1→b2) in degrees [0–90]."""
    v1 = (a2[0] - a1[0], a2[1] - a1[1])
    v2 = (b2[0] - b1[0], b2[1] - b1[1])
    dot = abs(v1[0] * v2[0] + v1[1] * v2[1])
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    cos_a = max(0.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_a))


def perpendicular_distance(pt: tuple[float, float], l1: tuple[float, float], l2: tuple[float, float]) -> float:
    """True perpendicular distance from point pt to line l1-l2."""
    x0, y0 = pt
    x1, y1 = l1
    x2, y2 = l2
    
    denominator = math.sqrt((y2 - y1)**2 + (x2 - x1)**2)
    if denominator == 0:
        return euclidean_distance(pt, l1)
    
    numerator = abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1)
    return numerator / denominator


def pixels_to_mm(pixels: float, pixel_spacing: Optional[float]) -> Optional[float]:
    """Convert pixel distance to mm using calibrated spacing."""
    if pixel_spacing is None:
        return None
    return pixels * pixel_spacing


# ── Measurement status ────────────────────────────────────────────────────────

def classify_status(value: float, normal_min: float, normal_max: float) -> str:
    if value < normal_min:
        return "Decreased"
    elif value > normal_max:
        return "Increased"
    return "Normal"


def compute_deviation(value: float, normal_min: float, normal_max: float) -> float:
    midpoint = (normal_min + normal_max) / 2
    return round(value - midpoint, 4)


# ── Measurement definitions ───────────────────────────────────────────────────

# Type for calculation function: func(landmarks, pixel_spacing) -> value
CalcFunc = Callable[[dict[str, tuple[float, float]], Optional[float]], Optional[float]]

def _angle(l1: str, vertex: str, l2: str) -> CalcFunc:
    """Angle vertex is middle argument."""
    return lambda lms, ps: angle_between(lms[vertex], lms[l1], lms[l2])

def _line_angle(l1a: str, l1b: str, l2a: str, l2b: str) -> CalcFunc:
    return lambda lms, ps: line_to_line_angle(lms[l1a], lms[l1b], lms[l2a], lms[l2b])

def _dist_to_line(pt: str, l1: str, l2: str) -> CalcFunc:
    return lambda lms, ps: (
        perpendicular_distance(lms[pt], lms[l1], lms[l2]) * ps
        if ps else None
    )

def _dist_pts(p1: str, p2: str) -> CalcFunc:
    return lambda lms, ps: (
        euclidean_distance(lms[p1], lms[p2]) * ps
        if ps else None
    )

def _n_perp_dist(pt: str) -> CalcFunc:
    """Distance from point to N-Perpendicular (Perp to Frankfort through Nasion)."""
    def calc(lms, ps):
        if not ps: return None
        # Frankfort: Po to Or
        p1, p2 = lms["Po"], lms["Or"]
        vx, vy = p2[0] - p1[0], p2[1] - p1[1]
        nx, ny = -vy, vx  # Perpendicular vector
        n_pt = lms["N"]
        n_pt2 = (n_pt[0] + nx, n_pt[1] + ny)
        return perpendicular_distance(lms[pt], n_pt, n_pt2) * ps
    return calc

def _anb_angle() -> CalcFunc:
    return lambda lms, ps: angle_between(lms["N"], lms["S"], lms["A"]) - angle_between(lms["N"], lms["S"], lms["B"])

def _wits_appraisal() -> CalcFunc:
    def calc(lms, ps):
        if not ps: return None
        p1 = ((lms["UI"][0] + lms["LI"][0])/2, (lms["UI"][1] + lms["LI"][1])/2)
        p2 = ((lms["U6"][0] + lms["L6"][0])/2, (lms["U6"][1] + lms["L6"][1])/2)
        vx, vy = p1[0] - p2[0], p1[1] - p2[1]
        mag_sq = vx*vx + vy*vy
        if mag_sq == 0: return 0.0
        ax, ay = lms["A"][0] - p2[0], lms["A"][1] - p2[1]
        a_proj_t = (ax*vx + ay*vy) / mag_sq
        bx, by = lms["B"][0] - p2[0], lms["B"][1] - p2[1]
        b_proj_t = (bx*vx + by*vy) / mag_sq
        return (a_proj_t - b_proj_t) * math.sqrt(mag_sq) * ps
    return calc

def _horizontal_dist(p1: str, p2: str) -> CalcFunc:
    """Horizontal distance (x-axis) across points."""
    return lambda lms, ps: (
        abs(lms[p1][0] - lms[p2][0]) * ps
        if ps else None
    )

def _vertical_dist(p1: str, p2: str) -> CalcFunc:
    """Vertical distance (y-axis) across points."""
    return lambda lms, ps: (
        (lms[p1][1] - lms[p2][1]) * ps
        if ps else None
    )

def _ratio(num_p1: str, num_p2: str, den_p1: str, den_p2: str) -> CalcFunc:
    def calc(lms, ps):
        if num_p1 not in lms or num_p2 not in lms or den_p1 not in lms or den_p2 not in lms:
            return None
        num = euclidean_distance(lms[num_p1], lms[num_p2])
        den = euclidean_distance(lms[den_p1], lms[den_p2])
        if den == 0: return 0.0
        return (num / den) * 100
    return calc

MEASUREMENT_DEFS = [
    # Steiner Analysis
    { "category": "Steiner", "code": "SNA", "name": "SNA Angle", "type": "Angle", "unit": "Degrees", "min": 80, "max": 84, "refs": ["S", "N", "A"], "calc": _angle("S", "N", "A") },
    { "category": "Steiner", "code": "SNB", "name": "SNB Angle", "type": "Angle", "unit": "Degrees", "min": 78, "max": 82, "refs": ["S", "N", "B"], "calc": _angle("S", "N", "B") },
    { "category": "Steiner", "code": "ANB", "name": "ANB Angle", "type": "Angle", "unit": "Degrees", "min": 0, "max": 4, "refs": ["S", "N", "A", "B"], "calc": _anb_angle() },
    { "category": "Steiner", "code": "Wits", "name": "Wits Appraisal", "type": "Distance", "unit": "Millimeters", "min": -1, "max": 1, "refs": ["A", "B", "UI", "LI", "U6", "L6"], "calc": _wits_appraisal(), "requires_calibration": True },
    { "category": "Steiner", "code": "SN-GoGn", "name": "SN to GoGn Plane", "type": "Angle", "unit": "Degrees", "min": 27, "max": 37, "refs": ["S", "N", "Go", "Gn"], "calc": _line_angle("S", "N", "Go", "Gn") },
    
    # Tweed Analysis
    { "category": "Tweed", "code": "FMA", "name": "Frankfort-Mandibular Plane Angle", "type": "Angle", "unit": "Degrees", "min": 21, "max": 29, "refs": ["Or", "Po", "Go", "Me"], "calc": _line_angle("Or", "Po", "Go", "Me") },
    { "category": "Tweed", "code": "IMPA", "name": "Incisor-Mandibular Plane Angle", "type": "Angle", "unit": "Degrees", "min": 85, "max": 95, "refs": ["Go", "Me", "LI", "LIR"], "calc": _line_angle("Go", "Me", "LI", "LIR") },
    { "category": "Tweed", "code": "FMIA", "name": "Frankfort-Mandibular Incisor Angle", "type": "Angle", "unit": "Degrees", "min": 60, "max": 70, "refs": ["Or", "Po", "LI", "LIR"], "calc": _line_angle("Or", "Po", "LI", "LIR") },
 
    # McNamara Analysis
    { "category": "McNamara", "code": "N-Perp-A", "name": "N-Perp to Point A", "type": "Distance", "unit": "Millimeters", "min": -2, "max": 2, "refs": ["N", "Or", "Po", "A"], "calc": _n_perp_dist("A"), "requires_calibration": True },
    { "category": "McNamara", "code": "N-Perp-Pog", "name": "N-Perp to Pogonion", "type": "Distance", "unit": "Millimeters", "min": -4, "max": 0, "refs": ["N", "Or", "Po", "Pog"], "calc": _n_perp_dist("Pog"), "requires_calibration": True },
    { "category": "McNamara", "code": "MidfaceLength", "name": "Effective Midface Length (Co-A)", "type": "Distance", "unit": "Millimeters", "min": 80, "max": 100, "refs": ["Co", "A"], "calc": _dist_pts("Co", "A"), "requires_calibration": True },
    { "category": "McNamara", "code": "MandLength", "name": "Effective Mandibular Length (Co-Gn)", "type": "Distance", "unit": "Millimeters", "min": 100, "max": 130, "refs": ["Co", "Gn"], "calc": _dist_pts("Co", "Gn"), "requires_calibration": True },
    { "category": "McNamara", "code": "LAFH", "name": "Lower Ant Facial Height (ANS-Me)", "type": "Distance", "unit": "Millimeters", "min": 60, "max": 70, "refs": ["ANS", "Me"], "calc": _dist_pts("ANS", "Me"), "requires_calibration": True },
 
    # Jarabak Analysis
    { "category": "Jarabak", "code": "SaddleAngle", "name": "Saddle Angle (N-S-Ar)", "type": "Angle", "unit": "Degrees", "min": 118, "max": 128, "refs": ["N", "S", "Ar"], "calc": _angle("N", "S", "Ar") },
    { "category": "Jarabak", "code": "ArticularAngle", "name": "Articular Angle (S-Ar-Go)", "type": "Angle", "unit": "Degrees", "min": 138, "max": 148, "refs": ["S", "Ar", "Go"], "calc": _angle("S", "Ar", "Go") },
    { "category": "Jarabak", "code": "GonialAngle", "name": "Gonial Angle (Ar-Go-Me)", "type": "Angle", "unit": "Degrees", "min": 125, "max": 135, "refs": ["Ar", "Go", "Me"], "calc": _angle("Ar", "Go", "Me") },
    { "category": "Jarabak", "code": "PFH", "name": "Posterior Face Height (S-Go)", "type": "Distance", "unit": "Millimeters", "min": 70, "max": 85, "refs": ["S", "Go"], "calc": _dist_pts("S", "Go"), "requires_calibration": True },
    { "category": "Jarabak", "code": "AFH", "name": "Anterior Face Height (N-Me)", "type": "Distance", "unit": "Millimeters", "min": 105, "max": 125, "refs": ["N", "Me"], "calc": _dist_pts("N", "Me"), "requires_calibration": True },
    { "category": "Jarabak", "code": "JRatio", "name": "Jarabak Ratio (PFH/AFH)", "type": "Ratio", "unit": "Percent", "min": 62, "max": 65, "refs": ["S", "Go", "N", "Me"], "calc": _ratio("S", "Go", "N", "Me") },

    # Ricketts (Facial Analysis)
    { "category": "Ricketts", "code": "Ls-Eline", "name": "Upper Lip to E-Line", "type": "Distance", "unit": "Millimeters", "min": -6, "max": -2, "refs": ["Ls", "Prn", "SoftPog"], "calc": _dist_to_line("Ls", "Prn", "SoftPog"), "requires_calibration": True },
    { "category": "Ricketts", "code": "Li-Eline", "name": "Lower Lip to E-Line", "type": "Distance", "unit": "Millimeters", "min": -4, "max": 0, "refs": ["Li", "Prn", "SoftPog"], "calc": _dist_to_line("Li", "Prn", "SoftPog"), "requires_calibration": True },

    # Expanded Dental/Skeletal
    { "category": "Dental", "code": "UI-NA_MM", "name": "UI to NA Distance", "type": "Distance", "unit": "Millimeters", "min": 3, "max": 5, "refs": ["UI", "N", "A"], "calc": _dist_to_line("UI", "N", "A"), "requires_calibration": True },
    { "category": "Dental", "code": "UI-NA_DEG", "name": "UI to NA Angle", "type": "Angle", "unit": "Degrees", "min": 20, "max": 24, "refs": ["UI", "U1_c", "N", "A"], "calc": _line_angle("UI", "U1_c", "N", "A") },
    { "category": "Dental", "code": "LI-NB_MM", "name": "LI to NB Distance", "type": "Distance", "unit": "Millimeters", "min": 3, "max": 5, "refs": ["LI", "N", "B"], "calc": _dist_to_line("LI", "N", "B"), "requires_calibration": True },
    { "category": "Dental", "code": "LI-NB_DEG", "name": "LI to NB Angle", "type": "Angle", "unit": "Degrees", "min": 23, "max": 27, "refs": ["LI", "L1_c", "N", "B"], "calc": _line_angle("LI", "L1_c", "N", "B") },
    { "category": "Skeletal", "code": "SN-MP", "name": "SN to Mandibular Plane (Go-Me)", "type": "Angle", "unit": "Degrees", "min": 26, "max": 38, "refs": ["S", "N", "Go", "Me"], "calc": _line_angle("S", "N", "Go", "Me") },
    { "category": "Dental", "code": "OVERJET_MM", "name": "Overjet", "type": "Distance", "unit": "Millimeters", "min": 1, "max": 3, "refs": ["UI", "LI"], "calc": _horizontal_dist("UI", "LI"), "requires_calibration": True },
    { "category": "Dental", "code": "OVERBITE_MM", "name": "Overbite", "type": "Distance", "unit": "Millimeters", "min": 1, "max": 3, "refs": ["UI", "LI"], "calc": _vertical_dist("LI", "UI"), "requires_calibration": True },
    
    # Advanced / Evidence-Based (New)
    { "category": "Advanced", "code": "SN-PP", "name": "SN to Palatal Plane (ANS-PNS)", "type": "Angle", "unit": "Degrees", "min": 6, "max": 10, "refs": ["S", "N", "ANS", "PNS"], "calc": _line_angle("S", "N", "ANS", "PNS") },
    { "category": "Advanced", "code": "FH-AB", "name": "Frankfort to AB Angle", "type": "Angle", "unit": "Degrees", "min": 75, "max": 85, "refs": ["Or", "Po", "A", "B"], "calc": _line_angle("Or", "Po", "A", "B") },
    { "category": "Advanced", "code": "PP-FH", "name": "Palatal Plane to Frankfort", "type": "Angle", "unit": "Degrees", "min": -2, "max": 2, "refs": ["ANS", "PNS", "Or", "Po"], "calc": _line_angle("ANS", "PNS", "Or", "Po") },
    { "category": "Advanced", "code": "AB-MP", "name": "AB to Mandibular Plane", "type": "Angle", "unit": "Degrees", "min": 65, "max": 75, "refs": ["A", "B", "Go", "Me"], "calc": _line_angle("A", "B", "Go", "Me") },
    { "category": "Advanced", "code": "PP-MP", "name": "Palatal Plane to Mandibular Plane", "type": "Angle", "unit": "Degrees", "min": 24, "max": 28, "refs": ["ANS", "PNS", "Go", "Me"], "calc": _line_angle("ANS", "PNS", "Go", "Me") },
    { "category": "Advanced", "code": "H-Angle", "name": "Holdaway H-Angle", "type": "Angle", "unit": "Degrees", "min": 7, "max": 13, "refs": ["N", "B", "SoftPog", "Ls"], "calc": _line_angle("N", "B", "SoftPog", "Ls") }
]

from utils.norms_util import norms_provider

def compute_all_measurements(
    landmarks: Dict[str, tuple[float, float]],
    pixel_spacing: Optional[float] = None
) -> List[Dict[str, Any]]:
    results = []
    for item in MEASUREMENT_DEFS:
        if not all(ref in landmarks for ref in item["refs"]):
            continue
        if item.get("requires_calibration") and not pixel_spacing:
            continue
        try:
            value = item["calc"](landmarks, pixel_spacing)
            if value is not None:
                nmin = item["min"]
                nmax = item["max"]
                
                # Fetch dynamically from analysis_norms.json if available
                dynamic_range = norms_provider.get_norm_range(item["code"])
                if not dynamic_range:
                    # Fallback to searching by full name
                    dynamic_range = norms_provider.get_norm_range(item["name"])
                if dynamic_range:
                    nmin, nmax = dynamic_range[0], dynamic_range[1]

                status = classify_status(value, nmin, nmax)
                dev = compute_deviation(value, nmin, nmax)
                results.append({
                    "code": item["code"],
                    "name": item["name"],
                    "category": item["category"],
                    "measurement_type": item["type"],
                    "value": round(value, 4),
                    "unit": item["unit"],
                    "normal_min": nmin,
                    "normal_max": nmax,
                    "status": status,
                    "deviation": dev,
                    "landmark_refs": item["refs"]
                })
        except Exception:
            pass
    return results
