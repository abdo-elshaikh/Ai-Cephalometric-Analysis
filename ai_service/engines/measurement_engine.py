"""
Measurement Engine — Pure functions for computing cephalometric angles & distances
from landmark (x, y) pixel coordinates.

Coordinate system note
----------------------
Images use a top-left origin with Y increasing *downward*.  Several clinical
measurements have sign conventions defined in the opposite sense, so each
factory documents whether the returned value is signed or unsigned.
"""
import math
import logging
from typing import Optional, Callable, Dict, List, Any

from utils.norms_util import norms_provider

logger = logging.getLogger(__name__)


# ── Low-level geometry ───────────────────────────────────────────────────────

def euclidean_distance(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Pixel distance between two points."""
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


def angle_between(
    vertex: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
) -> float:
    """
    Unsigned angle (°) at *vertex* formed by the rays vertex→p1 and vertex→p2.
    Returns 0.0 when either ray has zero length.
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


def line_to_line_angle(
    a1: tuple[float, float], a2: tuple[float, float],
    b1: tuple[float, float], b2: tuple[float, float],
) -> float:
    """Acute angle (°) between two line segments a1→a2 and b1→b2. Range [0–90]."""
    v1 = (a2[0] - a1[0], a2[1] - a1[1])
    v2 = (b2[0] - b1[0], b2[1] - b1[1])
    dot = abs(v1[0] * v2[0] + v1[1] * v2[1])
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    cos_a = max(0.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_a))


def signed_perpendicular_distance(
    pt: tuple[float, float],
    l1: tuple[float, float],
    l2: tuple[float, float],
) -> float:
    """
    Signed perpendicular distance from *pt* to the infinite line through l1→l2.

    Sign convention (matches cephalometric literature):
      Positive  → *pt* is to the LEFT of the directed line l1→l2.
      Negative  → *pt* is to the RIGHT.

    For the N-perpendicular (N→inferior), positive = anterior to the line,
    which is the standard clinical positive direction.
    """
    x0, y0 = pt
    x1, y1 = l1
    x2, y2 = l2
    # Cross product of (l2-l1) × (pt-l1); sign encodes side.
    cross = (x2 - x1) * (y0 - y1) - (y2 - y1) * (x0 - x1)
    denom = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    if denom == 0:
        return euclidean_distance(pt, l1)
    return cross / denom


def perpendicular_distance(
    pt: tuple[float, float],
    l1: tuple[float, float],
    l2: tuple[float, float],
) -> float:
    """Unsigned perpendicular distance from *pt* to the infinite line through l1–l2."""
    return abs(signed_perpendicular_distance(pt, l1, l2))


def pixels_to_mm(pixels: float, pixel_spacing: Optional[float]) -> Optional[float]:
    """Convert a pixel distance to millimetres using calibrated mm/px spacing."""
    if pixel_spacing is None:
        return None
    return pixels * pixel_spacing


# ── Measurement status ────────────────────────────────────────────────────────

def classify_status(value: float, normal_min: float, normal_max: float) -> str:
    if value < normal_min:
        return "Decreased"
    if value > normal_max:
        return "Increased"
    return "Normal"


def compute_deviation(value: float, normal_min: float, normal_max: float) -> float:
    midpoint = (normal_min + normal_max) / 2
    return round(value - midpoint, 4)


# ── Measurement calculation factories ────────────────────────────────────────

CalcFunc = Callable[[dict[str, tuple[float, float]], Optional[float]], Optional[float]]


def _angle(l1: str, vertex: str, l2: str) -> CalcFunc:
    """Factory: unsigned angle at *vertex* between rays to l1 and l2."""
    return lambda lms, ps: angle_between(lms[vertex], lms[l1], lms[l2])


def _line_angle(l1a: str, l1b: str, l2a: str, l2b: str) -> CalcFunc:
    """Factory: acute angle between two line segments."""
    return lambda lms, ps: line_to_line_angle(lms[l1a], lms[l1b], lms[l2a], lms[l2b])


def _dist_to_line_signed(pt: str, l1: str, l2: str) -> CalcFunc:
    """
    Factory: signed perpendicular distance (mm) from *pt* to the directed line l1→l2.
    Positive = left of l1→l2; negative = right.
    """
    return lambda lms, ps: (
        signed_perpendicular_distance(lms[pt], lms[l1], lms[l2]) * ps if ps else None
    )


def _dist_pts(p1: str, p2: str) -> CalcFunc:
    """Factory: Euclidean distance (mm) between two landmarks."""
    return lambda lms, ps: (
        euclidean_distance(lms[p1], lms[p2]) * ps if ps else None
    )


def _n_perp_dist(pt: str) -> CalcFunc:
    """
    Factory: signed distance (mm) from *pt* to the N-Perpendicular.

    The N-Perpendicular is a line through Nasion (N) drawn perpendicular to
    the Frankfort Horizontal (Po→Or).  Positive = anterior to the line.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not ps:
            return None
        # Frankfort direction vector
        po, orb = lms["Po"], lms["Or"]
        fh_dx = orb[0] - po[0]
        fh_dy = orb[1] - po[1]
        # N-Perp direction is perpendicular to FH, pointing inferiorly (↓)
        # Rotate FH vector 90° clockwise: (dx, dy) → (dy, -dx)
        perp_dx, perp_dy = fh_dy, -fh_dx
        n_pt = lms["N"]
        n_pt2 = (n_pt[0] + perp_dx, n_pt[1] + perp_dy)
        # Positive = anterior to N-Perp (left of N→inferior direction)
        return signed_perpendicular_distance(lms[pt], n_pt, n_pt2) * ps
    return calc


def _anb_angle() -> CalcFunc:
    """
    Factory: ANB angle (°).

    Computed as the signed angle from the N→A ray to the N→B ray at vertex N.
    Positive when A is more anterior than B (Class I / II pattern).
    Uses the cross-product sign to determine direction.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        nx, ny = lms["N"]
        ax, ay = lms["A"]
        bx, by = lms["B"]
        # Vectors from N
        na = (ax - nx, ay - ny)
        nb = (bx - nx, by - ny)
        mag_a = math.sqrt(na[0] ** 2 + na[1] ** 2)
        mag_b = math.sqrt(nb[0] ** 2 + nb[1] ** 2)
        if mag_a == 0 or mag_b == 0:
            return 0.0
        dot = na[0] * nb[0] + na[1] * nb[1]
        cos_a = max(-1.0, min(1.0, dot / (mag_a * mag_b)))
        magnitude = math.degrees(math.acos(cos_a))
        # Cross product z-component: positive when A is more anterior than B
        # (in image coords, Y↓, so we negate to match clinical sign)
        cross_z = na[0] * nb[1] - na[1] * nb[0]
        return magnitude if cross_z >= 0 else -magnitude
    return calc


def _wits_appraisal() -> CalcFunc:
    """
    Factory: Wits appraisal (mm).

    Projects points A and B perpendicularly onto the functional occlusal plane
    (midpoint of UI/LI to midpoint of U6/L6) and returns the signed distance
    AO − BO.  Positive = A is anterior to B on the occlusal plane (Class II).
    Negative = A is posterior to B (Class III).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not ps:
            return None
        # Functional occlusal plane: incisal midpoint → molar midpoint
        p_inc = ((lms["U1"][0] + lms["L1"][0]) / 2, (lms["U1"][1] + lms["L1"][1]) / 2)
        p_mol = ((lms["U6"][0] + lms["L6"][0]) / 2, (lms["U6"][1] + lms["L6"][1]) / 2)
        vx = p_mol[0] - p_inc[0]
        vy = p_mol[1] - p_inc[1]
        mag_sq = vx * vx + vy * vy
        if mag_sq == 0:
            return 0.0
        # Scalar projections of A and B onto the occlusal plane vector
        a_proj = ((lms["A"][0] - p_inc[0]) * vx + (lms["A"][1] - p_inc[1]) * vy) / mag_sq
        b_proj = ((lms["B"][0] - p_inc[0]) * vx + (lms["B"][1] - p_inc[1]) * vy) / mag_sq
        occ_len = math.sqrt(mag_sq)
        # AO - BO in mm (positive = A more anterior = Class II tendency)
        return (a_proj - b_proj) * occ_len * ps
    return calc


def _overjet() -> CalcFunc:
    """
    Factory: Overjet (mm) — horizontal distance UI tip ahead of LI tip.
    Positive = normal/Class II (UI anterior to LI).
    Negative = reverse overjet / Class III.

    In image coordinates (Y↓, X→right for a right-facing profile):
    UI.x > LI.x means UI is more to the right = more anterior.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not ps:
            return None
        return (lms["U1"][0] - lms["L1"][0]) * ps
    return calc


def _overbite() -> CalcFunc:
    """
    Factory: Overbite (mm) — vertical overlap of UI over LI.
    Positive = normal (UI above LI, i.e. UI.y < LI.y in image coords since Y↓).
    Negative = open bite.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not ps:
            return None
        # UI.y < LI.y in a normal bite (UI is higher on the image → smaller y)
        return (lms["L1"][1] - lms["U1"][1]) * ps
    return calc


def _ratio(num_p1: str, num_p2: str, den_p1: str, den_p2: str) -> CalcFunc:
    """Factory: ratio of two Euclidean distances, expressed as a percentage."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        for k in [num_p1, num_p2, den_p1, den_p2]:
            if k not in lms:
                return None
        num = euclidean_distance(lms[num_p1], lms[num_p2])
        den = euclidean_distance(lms[den_p1], lms[den_p2])
        if den == 0:
            return 0.0
        return (num / den) * 100
    return calc


# ── Measurement definitions ───────────────────────────────────────────────────
# Landmark key names must match those produced by infer.py.
# Incisor landmarks: "U1" / "U1_c" (root apex), "L1" / "L1_c".

MEASUREMENT_DEFS: list[dict] = [
    # ── Steiner Analysis ──────────────────────────────────────────────────────
    {"category": "Steiner", "code": "SNA",       "name": "SNA Angle",                         "type": "Angle",    "unit": "Degrees",     "min": 80,  "max": 84,  "refs": ["S", "N", "A"],                       "calc": _angle("S", "N", "A")},
    {"category": "Steiner", "code": "SNB",       "name": "SNB Angle",                         "type": "Angle",    "unit": "Degrees",     "min": 78,  "max": 82,  "refs": ["S", "N", "B"],                       "calc": _angle("S", "N", "B")},
    {"category": "Steiner", "code": "ANB",       "name": "ANB Angle",                         "type": "Angle",    "unit": "Degrees",     "min": 0,   "max": 4,   "refs": ["S", "N", "A", "B"],                  "calc": _anb_angle()},
    {"category": "Steiner", "code": "Wits",      "name": "Wits Appraisal",                    "type": "Distance", "unit": "Millimeters", "min": -1,  "max": 1,   "refs": ["A", "B", "U1", "L1", "U6", "L6"],   "calc": _wits_appraisal(),            "requires_calibration": True},
    {"category": "Steiner", "code": "SN-GoGn",   "name": "SN to GoGn Plane",                  "type": "Angle",    "unit": "Degrees",     "min": 27,  "max": 37,  "refs": ["S", "N", "Go", "Gn"],                "calc": _line_angle("S", "N", "Go", "Gn")},

    # ── Tweed Analysis ───────────────────────────────────────────────────────
    {"category": "Tweed",   "code": "FMA",       "name": "Frankfort-Mandibular Plane Angle",  "type": "Angle",    "unit": "Degrees",     "min": 21,  "max": 29,  "refs": ["Or", "Po", "Go", "Me"],              "calc": _line_angle("Or", "Po", "Go", "Me")},
    {"category": "Tweed",   "code": "IMPA",      "name": "Incisor-Mandibular Plane Angle",    "type": "Angle",    "unit": "Degrees",     "min": 85,  "max": 95,  "refs": ["Go", "Me", "L1", "L1_c"],            "calc": _line_angle("Go", "Me", "L1", "L1_c")},
    {"category": "Tweed",   "code": "FMIA",      "name": "Frankfort-Mandibular Incisor Angle","type": "Angle",    "unit": "Degrees",     "min": 60,  "max": 70,  "refs": ["Or", "Po", "L1", "L1_c"],            "calc": _line_angle("Or", "Po", "L1", "L1_c")},

    # ── McNamara Analysis ────────────────────────────────────────────────────
    # N-Perp distances: positive = anterior to the N-perpendicular (normal for adults).
    {"category": "McNamara","code": "N-Perp-A",   "name": "N-Perp to Point A",                "type": "Distance", "unit": "Millimeters", "min": -2,  "max": 2,   "refs": ["N", "Or", "Po", "A"],                "calc": _n_perp_dist("A"),            "requires_calibration": True},
    {"category": "McNamara","code": "N-Perp-Pog", "name": "N-Perp to Pogonion",               "type": "Distance", "unit": "Millimeters", "min": -4,  "max": 0,   "refs": ["N", "Or", "Po", "Pog"],              "calc": _n_perp_dist("Pog"),          "requires_calibration": True},
    {"category": "McNamara","code": "MidfaceLen",  "name": "Effective Midface Length (Co-A)",  "type": "Distance", "unit": "Millimeters", "min": 80,  "max": 100, "refs": ["Co", "A"],                           "calc": _dist_pts("Co", "A"),         "requires_calibration": True},
    {"category": "McNamara","code": "MandLength",  "name": "Effective Mandibular Length (Co-Gn)","type":"Distance","unit": "Millimeters", "min": 100, "max": 130, "refs": ["Co", "Gn"],                          "calc": _dist_pts("Co", "Gn"),        "requires_calibration": True},
    {"category": "McNamara","code": "LAFH",        "name": "Lower Ant Facial Height (ANS-Me)", "type": "Distance", "unit": "Millimeters", "min": 60,  "max": 70,  "refs": ["ANS", "Me"],                         "calc": _dist_pts("ANS", "Me"),       "requires_calibration": True},

    # ── Jarabak Analysis ─────────────────────────────────────────────────────
    {"category": "Jarabak", "code": "SaddleAngle",   "name": "Saddle Angle (N-S-Ar)",          "type": "Angle",    "unit": "Degrees",     "min": 118, "max": 128, "refs": ["N", "S", "Ar"],                     "calc": _angle("N", "S", "Ar")},
    {"category": "Jarabak", "code": "ArticularAngle","name": "Articular Angle (S-Ar-Go)",       "type": "Angle",    "unit": "Degrees",     "min": 138, "max": 148, "refs": ["S", "Ar", "Go"],                    "calc": _angle("S", "Ar", "Go")},
    {"category": "Jarabak", "code": "GonialAngle",   "name": "Gonial Angle (Ar-Go-Me)",         "type": "Angle",    "unit": "Degrees",     "min": 125, "max": 135, "refs": ["Ar", "Go", "Me"],                   "calc": _angle("Ar", "Go", "Me")},
    {"category": "Jarabak", "code": "PFH",           "name": "Posterior Face Height (S-Go)",    "type": "Distance", "unit": "Millimeters", "min": 70,  "max": 85,  "refs": ["S", "Go"],                          "calc": _dist_pts("S", "Go"),         "requires_calibration": True},
    {"category": "Jarabak", "code": "AFH",           "name": "Anterior Face Height (N-Me)",     "type": "Distance", "unit": "Millimeters", "min": 105, "max": 125, "refs": ["N", "Me"],                          "calc": _dist_pts("N", "Me"),         "requires_calibration": True},
    {"category": "Jarabak", "code": "JRatio",        "name": "Jarabak Ratio (PFH/AFH)",         "type": "Ratio",    "unit": "Percent",     "min": 62,  "max": 65,  "refs": ["S", "Go", "N", "Me"],              "calc": _ratio("S", "Go", "N", "Me")},
    {"category": "Jarabak", "code": "BJORK_SUM",    "name": "Björk Sum of Angles",             "type": "Angle",    "unit": "Degrees",     "min": 392, "max": 400, "refs": ["N", "S", "Ar", "Go", "Me"],         "calc": lambda lms, ps: angle_between(lms["S"], lms["N"], lms["Ar"]) + angle_between(lms["Ar"], lms["S"], lms["Go"]) + angle_between(lms["Go"], lms["Ar"], lms["Me"])},

    # ── Ricketts Facial Analysis ──────────────────────────────────────────────
    # E-line: directed Prn→SoftPog; negative = lip behind E-line (normal).
    {"category": "Ricketts","code": "Ls-Eline",  "name": "Upper Lip to E-Line",               "type": "Distance", "unit": "Millimeters", "min": -6,  "max": -2,  "refs": ["Ls", "Prn", "SoftPog"],              "calc": _dist_to_line_signed("Ls", "Prn", "SoftPog"),  "requires_calibration": True},
    {"category": "Ricketts","code": "Li-Eline",  "name": "Lower Lip to E-Line",               "type": "Distance", "unit": "Millimeters", "min": -4,  "max": 0,   "refs": ["Li", "Prn", "SoftPog"],              "calc": _dist_to_line_signed("Li", "Prn", "SoftPog"),  "requires_calibration": True},

    # ── Dental ───────────────────────────────────────────────────────────────
    # UI-NA: directed N→A line; positive = UI anterior to NA line.
    {"category": "Dental",  "code": "UI-NA_MM",  "name": "UI to NA Distance",                 "type": "Distance", "unit": "Millimeters", "min": 3,   "max": 5,   "refs": ["U1", "N", "A"],                      "calc": _dist_to_line_signed("U1", "N", "A"),          "requires_calibration": True},
    {"category": "Dental",  "code": "UI-NA_DEG", "name": "UI to NA Angle",                    "type": "Angle",    "unit": "Degrees",     "min": 20,  "max": 24,  "refs": ["U1", "U1_c", "N", "A"],              "calc": _line_angle("U1", "U1_c", "N", "A")},
    {"category": "Dental",  "code": "LI-NB_MM",  "name": "LI to NB Distance",                 "type": "Distance", "unit": "Millimeters", "min": 3,   "max": 5,   "refs": ["L1", "N", "B"],                      "calc": _dist_to_line_signed("L1", "N", "B"),          "requires_calibration": True},
    {"category": "Dental",  "code": "LI-NB_DEG", "name": "LI to NB Angle",                    "type": "Angle",    "unit": "Degrees",     "min": 23,  "max": 27,  "refs": ["L1", "L1_c", "N", "B"],              "calc": _line_angle("L1", "L1_c", "N", "B")},
    {"category": "Skeletal","code": "SN-MP",      "name": "SN to Mandibular Plane (Go-Me)",    "type": "Angle",    "unit": "Degrees",     "min": 26,  "max": 38,  "refs": ["S", "N", "Go", "Me"],                "calc": _line_angle("S", "N", "Go", "Me")},
    {"category": "Dental",  "code": "OVERJET",    "name": "Overjet",                           "type": "Distance", "unit": "Millimeters", "min": 1,   "max": 3,   "refs": ["U1", "L1"],                          "calc": _overjet(),                                    "requires_calibration": True},
    {"category": "Dental",  "code": "OVERBITE",   "name": "Overbite",                          "type": "Distance", "unit": "Millimeters", "min": 1,   "max": 3,   "refs": ["U1", "L1"],                          "calc": _overbite(),                                   "requires_calibration": True},

    # ── Advanced / Evidence-Based ─────────────────────────────────────────────
    {"category": "Advanced","code": "SN-PP",      "name": "SN to Palatal Plane (ANS-PNS)",     "type": "Angle",    "unit": "Degrees",     "min": 6,   "max": 10,  "refs": ["S", "N", "ANS", "PNS"],              "calc": _line_angle("S", "N", "ANS", "PNS")},
    {"category": "Advanced","code": "FH-AB",      "name": "Frankfort to AB Angle",             "type": "Angle",    "unit": "Degrees",     "min": 75,  "max": 85,  "refs": ["Or", "Po", "A", "B"],                "calc": _line_angle("Or", "Po", "A", "B")},
    {"category": "Advanced","code": "PP-FH",      "name": "Palatal Plane to Frankfort",        "type": "Angle",    "unit": "Degrees",     "min": -2,  "max": 2,   "refs": ["ANS", "PNS", "Or", "Po"],            "calc": _line_angle("ANS", "PNS", "Or", "Po")},
    {"category": "Advanced","code": "AB-MP",      "name": "AB to Mandibular Plane",            "type": "Angle",    "unit": "Degrees",     "min": 65,  "max": 75,  "refs": ["A", "B", "Go", "Me"],                "calc": _line_angle("A", "B", "Go", "Me")},
    {"category": "Advanced","code": "PP-MP",      "name": "Palatal Plane to Mandibular Plane", "type": "Angle",    "unit": "Degrees",     "min": 24,  "max": 28,  "refs": ["ANS", "PNS", "Go", "Me"],            "calc": _line_angle("ANS", "PNS", "Go", "Me")},
    {"category": "Advanced","code": "H-Angle",    "name": "Holdaway H-Angle",                  "type": "Angle",    "unit": "Degrees",     "min": 7,   "max": 13,  "refs": ["N", "B", "SoftPog", "Ls"],          "calc": _line_angle("N", "B", "SoftPog", "Ls")},

    # ── Airway Analysis ───────────────────────────────────────────────────────
    {"category": "Advanced","code": "UPPER_AIRWAY","name": "Upper Pharyngeal Airway",         "type": "Distance", "unit": "Millimeters", "min": 8,   "max": 18,  "refs": ["PNS", "36"],                         "calc": _dist_pts("PNS", "36"),       "requires_calibration": True},
    
    # ── Refined Skeletal ──────────────────────────────────────────────────────
    {"category": "McNamara","code": "A-NPerp",    "name": "Point A to N-Perpendicular",        "type": "Distance", "unit": "Millimeters", "min": -2,  "max": 2,   "refs": ["A", "N", "Po", "Or"],                "calc": _n_perp_dist("A"),            "requires_calibration": True},
    {"category": "McNamara","code": "Pog-NPerp",  "name": "Pog to N-Perpendicular",            "type": "Distance", "unit": "Millimeters", "min": -4,  "max": 0,   "refs": ["Pog", "N", "Po", "Or"],              "calc": _n_perp_dist("Pog"),          "requires_calibration": True},
]


def compute_all_measurements(
    landmarks: Dict[str, tuple[float, float]],
    pixel_spacing: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """
    Compute all applicable cephalometric measurements for the given landmark set.

    Skips any measurement whose required landmarks are absent, or that requires
    pixel-spacing calibration when none is provided.
    """
    results: List[Dict[str, Any]] = []

    for item in MEASUREMENT_DEFS:
        if not all(ref in landmarks for ref in item["refs"]):
            continue
        if item.get("requires_calibration") and not pixel_spacing:
            continue

        try:
            value = item["calc"](landmarks, pixel_spacing)
            if value is None:
                continue

            nmin = item["min"]
            nmax = item["max"]

            dynamic_range = norms_provider.get_norm_range(item["code"])
            if not dynamic_range:
                dynamic_range = norms_provider.get_norm_range(item["name"])
            if dynamic_range:
                nmin, nmax = dynamic_range

            status = classify_status(value, nmin, nmax)
            dev = compute_deviation(value, nmin, nmax)

            results.append({
                "code":             item["code"],
                "name":             item["name"],
                "category":         item["category"],
                "measurement_type": item["type"],
                "value":            round(value, 4),
                "unit":             item["unit"],
                "normal_min":       nmin,
                "normal_max":       nmax,
                "status":           status,
                "deviation":        dev,
                "landmark_refs":    item["refs"],
            })
        except Exception as e:
            logger.warning(
                f"Measurement '{item['code']}' skipped due to calculation error: {e}"
            )

    return results
