"""
Measurement Engine — CephAI v2

Expanded from ~40 to 85+ measurements covering:
  Steiner, Tweed, McNamara, Jarabak, Björk, Ricketts (partial), Down's,
  Holdaway, Harvold, Soft-tissue (Burstone), Airway, CVM proxies,
  Bolton proxy, Dental (overjet/overbite/interincisal/Z-angle).

Coordinate system: top-left origin, Y increases downward.
All angles are in degrees; distances require pixel_spacing calibration (mm).
"""

import math
import logging
from typing import Optional, Callable, Dict, List, Any

from utils.norms_util import norms_provider

logger = logging.getLogger(__name__)


# ── Low-Level Geometry ────────────────────────────────────────────────────────

def euclidean_distance(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


def angle_between(
    vertex: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
) -> float:
    """Unsigned angle (°) at vertex between rays vertex→p1 and vertex→p2."""
    v1 = (p1[0] - vertex[0], p1[1] - vertex[1])
    v2 = (p2[0] - vertex[0], p2[1] - vertex[1])
    dot  = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return math.degrees(math.acos(max(-1.0, min(1.0, dot / (mag1 * mag2)))))


def line_to_line_angle(
    a1: tuple[float, float], a2: tuple[float, float],
    b1: tuple[float, float], b2: tuple[float, float],
) -> float:
    """Acute angle (°) between two directed line segments. Range [0–90]."""
    v1 = (a2[0] - a1[0], a2[1] - a1[1])
    v2 = (b2[0] - b1[0], b2[1] - b1[1])
    dot  = abs(v1[0] * v2[0] + v1[1] * v2[1])
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return math.degrees(math.acos(max(0.0, min(1.0, dot / (mag1 * mag2)))))


def signed_angle_line_to_ref(
    line_p1: tuple[float, float], line_p2: tuple[float, float],
    ref_p1: tuple[float, float], ref_p2: tuple[float, float],
) -> float:
    """
    Signed angle (°) of line p1→p2 relative to reference p1→p2 (FH, SN, etc).
    Positive = line tilts clockwise relative to reference (Y-down coords).
    """
    v_line = (line_p2[0] - line_p1[0], line_p2[1] - line_p1[1])
    v_ref  = (ref_p2[0]  - ref_p1[0],  ref_p2[1]  - ref_p1[1])
    dot  = v_line[0] * v_ref[0] + v_line[1] * v_ref[1]
    cross = v_line[0] * v_ref[1] - v_line[1] * v_ref[0]
    mag_l = math.sqrt(v_line[0] ** 2 + v_line[1] ** 2)
    mag_r = math.sqrt(v_ref[0]  ** 2 + v_ref[1]  ** 2)
    if mag_l == 0 or mag_r == 0:
        return 0.0
    angle = math.degrees(math.acos(max(-1.0, min(1.0, dot / (mag_l * mag_r)))))
    return angle if cross >= 0 else -angle


def signed_perpendicular_distance(
    pt: tuple[float, float],
    l1: tuple[float, float],
    l2: tuple[float, float],
) -> float:
    """
    Signed perpendicular distance from pt to the infinite line l1→l2.
    Positive = pt is to the LEFT of the directed line l1→l2.
    """
    x0, y0 = pt; x1, y1 = l1; x2, y2 = l2
    cross = (x2 - x1) * (y0 - y1) - (y2 - y1) * (x0 - x1)
    denom = math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    return (cross / denom) if denom else euclidean_distance(pt, l1)


def perpendicular_distance(
    pt: tuple[float, float],
    l1: tuple[float, float],
    l2: tuple[float, float],
) -> float:
    return abs(signed_perpendicular_distance(pt, l1, l2))


def pixels_to_mm(pixels: float, pixel_spacing: Optional[float]) -> Optional[float]:
    return pixels * pixel_spacing if pixel_spacing else None


def project_onto_line(
    pt: tuple[float, float],
    l1: tuple[float, float],
    l2: tuple[float, float],
) -> tuple[float, float]:
    """Orthogonal projection of pt onto the line l1→l2."""
    dx, dy = l2[0] - l1[0], l2[1] - l1[1]
    t = ((pt[0] - l1[0]) * dx + (pt[1] - l1[1]) * dy) / (dx * dx + dy * dy + 1e-12)
    return (l1[0] + t * dx, l1[1] + t * dy)


# ── Measurement Status ────────────────────────────────────────────────────────

def classify_status(value: float, normal_min: float, normal_max: float) -> str:
    if value < normal_min: return "Decreased"
    if value > normal_max: return "Increased"
    return "Normal"


def compute_deviation(value: float, normal_min: float, normal_max: float) -> float:
    return round(value - (normal_min + normal_max) / 2, 4)


def _quality_for_refs(
    refs: list[str],
    landmark_provenance: Optional[dict[str, str]] = None,
) -> tuple[str, list[str], dict[str, str] | None]:
    if not landmark_provenance:
        return "clinically_usable", [], None
    used = {ref: landmark_provenance.get(ref, "unknown") for ref in refs}
    fallback_refs = [r for r, s in used.items() if s == "fallback"]
    derived_refs  = [r for r, s in used.items() if s == "derived"]
    unknown_refs  = [r for r, s in used.items() if s == "unknown"]
    reasons: list[str] = []
    if fallback_refs: reasons.append(f"Fallback landmark(s): {', '.join(fallback_refs)}")
    if derived_refs:  reasons.append(f"Derived landmark(s): {', '.join(derived_refs)}")
    if unknown_refs:  reasons.append(f"Unknown provenance: {', '.join(unknown_refs)}")
    if fallback_refs: return "manual_review_required", reasons, used
    if derived_refs or unknown_refs: return "provisional", reasons, used
    return "clinically_usable", [], used


def _lookup_norm_range(
    item: dict,
    age: Optional[float] = None,
    sex: Optional[str] = None,
) -> Optional[tuple[float, float]]:
    for candidate in [item["code"], item["name"]] + item.get("norm_keys", []):
        r = norms_provider.get_norm_range(candidate, age, sex)
        if r:
            return r
    return None


# ── Calculation Factories ─────────────────────────────────────────────────────

CalcFunc = Callable[[dict[str, tuple[float, float]], Optional[float]], Optional[float]]


def _angle(l1: str, vertex: str, l2: str) -> CalcFunc:
    return lambda lms, ps: angle_between(lms[vertex], lms[l1], lms[l2])


def _line_angle(l1a: str, l1b: str, l2a: str, l2b: str) -> CalcFunc:
    return lambda lms, ps: line_to_line_angle(lms[l1a], lms[l1b], lms[l2a], lms[l2b])


def _signed_line_angle(la1: str, la2: str, lb1: str, lb2: str) -> CalcFunc:
    """Signed angle of line a relative to line b."""
    return lambda lms, ps: signed_angle_line_to_ref(lms[la1], lms[la2], lms[lb1], lms[lb2])


def _dist_to_line_signed(pt: str, l1: str, l2: str) -> CalcFunc:
    return lambda lms, ps: (
        signed_perpendicular_distance(lms[pt], lms[l1], lms[l2]) * ps if ps else None
    )


def _dist_pts(p1: str, p2: str) -> CalcFunc:
    return lambda lms, ps: (
        euclidean_distance(lms[p1], lms[p2]) * ps if ps else None
    )


def _ratio(num_p1: str, num_p2: str, den_p1: str, den_p2: str) -> CalcFunc:
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        num = euclidean_distance(lms[num_p1], lms[num_p2])
        den = euclidean_distance(lms[den_p1], lms[den_p2])
        if den < 1e-6:
            logger.warning(f"Zero denominator in {num_p1}-{num_p2} ratio calculation.")
            return None
        return (num / den * 100)
    return calc


def _n_perp_dist(pt: str) -> CalcFunc:
    """Signed mm distance from pt to the N-Perpendicular (perpendicular to FH through N)."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not ps: return None
        po, orb = lms["Po"], lms["Or"]
        fh_dx, fh_dy = orb[0] - po[0], orb[1] - po[1]
        perp_dx, perp_dy = fh_dy, -fh_dx   # 90° clockwise
        n_pt = lms["N"]
        return signed_perpendicular_distance(lms[pt], n_pt, (n_pt[0] + perp_dx, n_pt[1] + perp_dy)) * ps
    return calc


def _anb_angle() -> CalcFunc:
    """Signed ANB angle. Positive when A is anterior to B (Class I/II)."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        nx, ny = lms["N"]; ax, ay = lms["A"]; bx, by = lms["B"]
        na = (ax - nx, ay - ny); nb = (bx - nx, by - ny)
        mag_a = math.sqrt(na[0] ** 2 + na[1] ** 2)
        mag_b = math.sqrt(nb[0] ** 2 + nb[1] ** 2)
        if mag_a == 0 or mag_b == 0: return 0.0
        cos_a = max(-1.0, min(1.0, (na[0]*nb[0] + na[1]*nb[1]) / (mag_a * mag_b)))
        mag = math.degrees(math.acos(cos_a))
        cross_z = na[0] * nb[1] - na[1] * nb[0]
        return mag if cross_z >= 0 else -mag
    return calc


def _wits_appraisal() -> CalcFunc:
    """Wits: project A and B onto functional occlusal plane → AO − BO (mm)."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not ps: return None
        p_inc = ((lms["U1"][0]+lms["L1"][0])/2, (lms["U1"][1]+lms["L1"][1])/2)
        p_mol = ((lms["U6"][0]+lms["L6"][0])/2, (lms["U6"][1]+lms["L6"][1])/2)
        vx, vy = p_mol[0]-p_inc[0], p_mol[1]-p_inc[1]
        mag_sq = vx*vx + vy*vy
        if mag_sq == 0: return 0.0
        a_proj = ((lms["A"][0]-p_inc[0])*vx + (lms["A"][1]-p_inc[1])*vy) / mag_sq
        b_proj = ((lms["B"][0]-p_inc[0])*vx + (lms["B"][1]-p_inc[1])*vy) / mag_sq
        return (a_proj - b_proj) * math.sqrt(mag_sq) * ps
    return calc


def _overjet() -> CalcFunc:
    """Overjet (mm): horizontal U1 tip ahead of L1 tip. Positive = Class II."""
    return lambda lms, ps: (lms["U1"][0] - lms["L1"][0]) * ps if ps else None


def _overbite() -> CalcFunc:
    """Overbite (mm): vertical UI over LI. Positive = normal cover."""
    return lambda lms, ps: (lms["L1"][1] - lms["U1"][1]) * ps if ps else None


def _interincisal_angle() -> CalcFunc:
    """
    Down's interincisal angle: angle between upper and lower incisor long axes.
    Normal ~130° (range 110-150°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["U1", "U1_c", "L1", "L1_c"]):
            return None
        return angle_between(
            ((lms["U1"][0]+lms["L1"][0])/2, (lms["U1"][1]+lms["L1"][1])/2),
            lms["U1_c"], lms["L1_c"]
        )
    return calc


def _facial_angle() -> CalcFunc:
    """
    Down's facial angle: FH to N-Pog line.
    In clinical convention: angle at which N-Pog meets FH. Normal ~87.8°.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["N", "Pog", "Po", "Or"]):
            return None
        fh_angle = math.degrees(math.atan2(lms["Or"][1]-lms["Po"][1], lms["Or"][0]-lms["Po"][0]))
        np_angle = math.degrees(math.atan2(lms["Pog"][1]-lms["N"][1], lms["Pog"][0]-lms["N"][0]))
        return 180.0 - abs(fh_angle - np_angle)
    return calc


def _convexity_angle() -> CalcFunc:
    """
    Down's angle of convexity: N-A-Pog angle.
    Positive = convex (Class II), negative = concave (Class III). Normal ~0°.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["N", "A", "Pog"]):
            return None
        na  = (lms["N"][0]-lms["A"][0],   lms["N"][1]-lms["A"][1])
        pog = (lms["Pog"][0]-lms["A"][0], lms["Pog"][1]-lms["A"][1])
        mag_na  = math.sqrt(na[0]**2  + na[1]**2)
        mag_pog = math.sqrt(pog[0]**2 + pog[1]**2)
        if mag_na == 0 or mag_pog == 0: return 0.0
        dot = na[0]*pog[0] + na[1]*pog[1]
        mag = math.degrees(math.acos(max(-1.0, min(1.0, dot/(mag_na*mag_pog)))))
        cross = na[0]*pog[1] - na[1]*pog[0]
        return -mag if cross > 0 else mag
    return calc


def _y_axis() -> CalcFunc:
    """
    Down's Y-axis angle: S-Gn to FH. Normal ~59.4° (range 53-66°).
    Increases with vertical growth.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["S", "Gn", "Po", "Or"]):
            return None
        return line_to_line_angle(lms["S"], lms["Gn"], lms["Po"], lms["Or"])
    return calc


def _occ_plane_angle() -> CalcFunc:
    """
    Cant of occlusal plane to FH (Down's). Normal ~9.3° (range 1.5–14°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        keys = ["U1", "L1", "U6", "L6", "Po", "Or"]
        if not all(k in lms for k in keys): return None
        occ_ant = ((lms["U1"][0]+lms["L1"][0])/2, (lms["U1"][1]+lms["L1"][1])/2)
        occ_pos = ((lms["U6"][0]+lms["L6"][0])/2, (lms["U6"][1]+lms["L6"][1])/2)
        return line_to_line_angle(occ_ant, occ_pos, lms["Po"], lms["Or"])
    return calc


def _lower_incisor_to_op() -> CalcFunc:
    """Lower incisor to occlusal plane (Down's). Normal ~14.5°."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        keys = ["L1", "L1_c", "U1", "L1_occ", "U6", "L6"]
        if not all(k in lms for k in ["L1", "L1_c", "U1", "U6", "L6"]): return None
        occ_ant = ((lms["U1"][0]+lms["L1"][0])/2, (lms["U1"][1]+lms["L1"][1])/2)
        occ_pos = ((lms["U6"][0]+lms["L6"][0])/2, (lms["U6"][1]+lms["L6"][1])/2)
        return line_to_line_angle(lms["L1"], lms["L1_c"], occ_ant, occ_pos)
    return calc


def _upper_incisor_to_fh() -> CalcFunc:
    """Upper incisor long axis to FH (Down's). Normal ~59°."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["U1", "U1_c", "Po", "Or"]): return None
        return line_to_line_angle(lms["U1"], lms["U1_c"], lms["Po"], lms["Or"])
    return calc


def _z_angle() -> CalcFunc:
    """
    Down's Z-angle: FH to the line Ls-SoftPog. Normal ~78.5° (range 67-83°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Ls", "SoftPog", "Po", "Or"]): return None
        return line_to_line_angle(lms["Ls"], lms["SoftPog"], lms["Po"], lms["Or"])
    return calc


def _nasolabial_angle() -> CalcFunc:
    """
    Cm-Sn-Ls nasolabial angle. Normal ~110° (range 95-120°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Cm", "Sn", "Ls"]): return None
        return angle_between(lms["Sn"], lms["Cm"], lms["Ls"])
    return calc


def _lip_length(superior: str, inferior: str) -> CalcFunc:
    """Vertical distance between two soft tissue points (mm)."""
    return lambda lms, ps: (
        abs(lms[inferior][1] - lms[superior][1]) * ps if ps else None
    )


def _interlabial_gap() -> CalcFunc:
    """Stms to Stmi vertical gap (mm). 0=competent, >3mm=incompetent."""
    return lambda lms, ps: (
        abs(lms["Stmi"][1] - lms["Stms"][1]) * ps if ps else None
    )


def _facial_convexity_angle() -> CalcFunc:
    """
    GLA-Sn-SoftPog (soft tissue facial convexity). Normal ~12° (range 5-20°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["GLA", "Sn", "SoftPog"]): return None
        return angle_between(lms["Sn"], lms["GLA"], lms["SoftPog"])
    return calc


def _a_to_n_pog_mm() -> CalcFunc:
    """
    Ricketts convexity: perpendicular distance from A to N-Pog line (mm).
    Positive = A is anterior to N-Pog. Normal ~2mm (range 0-4mm).
    """
    return lambda lms, ps: (
        signed_perpendicular_distance(lms["A"], lms["N"], lms["Pog"]) * ps if ps else None
    )


def _lpt_to_n_pog_mm(pt: str) -> CalcFunc:
    """Perpendicular distance from pt to N-Pog line (mm)."""
    return lambda lms, ps: (
        signed_perpendicular_distance(lms[pt], lms["N"], lms["Pog"]) * ps if ps else None
    )


def _facial_axis() -> CalcFunc:
    """
    Ricketts facial axis: Ba-N to Pt-Gn angle. Normal ~90° (range 86-94°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Ba", "N", "Pt", "Gn"]): return None
        return angle_between(
            _line_intersection(lms["Ba"], lms["N"], lms["Pt"], lms["Gn"]),
            lms["N"], lms["Gn"]
        )
    return calc


def _line_intersection(
    p1: tuple, p2: tuple, p3: tuple, p4: tuple
) -> tuple[float, float]:
    """Intersection of lines p1-p2 and p3-p4 (used for facial axis)."""
    x1, y1 = p1; x2, y2 = p2; x3, y3 = p3; x4, y4 = p4
    denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
    if abs(denom) < 1e-8: return ((x1+x3)/2, (y1+y3)/2)
    t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom
    return (x1 + t*(x2-x1), y1 + t*(y2-y1))


def _lower_facial_height_angle() -> CalcFunc:
    """
    Ricketts lower facial height angle: Xi to ANS-Pog angle. Normal ~47° (range 42-52°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Xi", "ANS", "PM"]): return None
        return angle_between(lms["Xi"], lms["ANS"], lms["PM"])
    return calc


def _mandibular_arc() -> CalcFunc:
    """
    Ricketts mandibular arc: DC-Xi to Xi-PM angle. Normal ~26° (range 22-30°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["DC", "Xi", "PM"]): return None
        return angle_between(lms["Xi"], lms["DC"], lms["PM"])
    return calc


def _mp_h_distance() -> CalcFunc:
    """
    Mandibular plane to Hyoid distance (mm). Normal 10-15mm; >15mm → OSA risk.
    Reference: Riley RW et al. Sleep 1983; Pracharktam N et al. AJO 1994.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Go", "Me", "Hy"]) or not ps: return None
        return perpendicular_distance(lms["Hy"], lms["Go"], lms["Me"]) * ps
    return calc


def _pnw_width() -> CalcFunc:
    """Posterior nasopharyngeal airway width at PNS level (mm)."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["PNS", "PNW"]) or not ps: return None
        return euclidean_distance(lms["PNS"], lms["PNW"]) * ps
    return calc


def _ppw_dist() -> CalcFunc:
    """Posterior pharyngeal wall distance at tongue base (mm)."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["PPW", "B"]) or not ps: return None
        return euclidean_distance(lms["B"], lms["PPW"]) * ps
    return calc


def _cv3_concavity() -> CalcFunc:
    """
    CV3 inferior border concavity depth ratio (%).
    = (posterior_body_height - anterior_body_height) / anterior_body_height × 100
    CVM staging proxy: >15% signals pubertal growth (CS3-CS4).
    Reference: Baccetti T et al. Angle Orthod 2002;72:316-323.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Cv3a", "Cv3ai", "Cv3pi"]): return None
        ant_h = abs(lms["Cv3ai"][1] - lms["Cv3a"][1])
        post_h = abs(lms["Cv3pi"][1] - lms["Cv3a"][1])
        if ant_h == 0: return None
        return ((post_h - ant_h) / ant_h) * 100.0
    return calc


def _cv4_concavity() -> CalcFunc:
    """CV4 inferior border concavity depth ratio (%). Same method as CV3."""
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["Cv4a", "Cv4ai", "Cv4pi"]): return None
        ant_h = abs(lms["Cv4ai"][1] - lms["Cv4a"][1])
        post_h = abs(lms["Cv4pi"][1] - lms["Cv4a"][1])
        if ant_h == 0: return None
        return ((post_h - ant_h) / ant_h) * 100.0
    return calc


def _nsba_angle() -> CalcFunc:
    """
    Cranial base flexure: N-S-Ba angle. Normal ~130° (range 125-138°).
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["N", "S", "Ba"]): return None
        return angle_between(lms["S"], lms["N"], lms["Ba"])
    return calc


def _soft_tissue_facial_angle() -> CalcFunc:
    """
    Soft tissue facial angle: FH to GLA-SoftPog line. Normal ~91°.
    """
    def calc(lms: dict, ps: Optional[float]) -> Optional[float]:
        if not all(k in lms for k in ["GLA", "SoftPog", "Po", "Or"]): return None
        return line_to_line_angle(lms["GLA"], lms["SoftPog"], lms["Po"], lms["Or"])
    return calc


# ── Measurement Definitions ───────────────────────────────────────────────────

MEASUREMENT_DEFS: list[dict] = [

    # ══════════════════════════════════════════════════════════════════════════
    # STEINER ANALYSIS
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Steiner", "code": "SNA",      "name": "SNA Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 80,  "max": 84,
     "refs": ["S", "N", "A"],                   "calc": _angle("S", "N", "A")},

    {"category": "Steiner", "code": "SNB",      "name": "SNB Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 78,  "max": 82,
     "refs": ["S", "N", "B"],                   "calc": _angle("S", "N", "B")},

    {"category": "Steiner", "code": "ANB",      "name": "ANB Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 0,   "max": 4,
     "refs": ["S", "N", "A", "B"],              "calc": _anb_angle()},

    {"category": "Steiner", "code": "Wits",     "name": "Wits Appraisal",
     "type": "Distance", "unit": "Millimeters", "min": -1,  "max": 1,
     "refs": ["A", "B", "U1", "L1", "U6", "L6"],"calc": _wits_appraisal(),
     "requires_calibration": True},

    {"category": "Steiner", "code": "SN-GoGn",  "name": "SN to GoGn Plane",
     "type": "Angle",    "unit": "Degrees",     "min": 27,  "max": 37,
     "refs": ["S", "N", "Go", "Gn"],            "calc": _line_angle("S", "N", "Go", "Gn")},

    # ══════════════════════════════════════════════════════════════════════════
    # TWEED ANALYSIS
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Tweed",   "code": "FMA",      "name": "Frankfort-Mandibular Plane Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 21,  "max": 29,
     "refs": ["Or", "Po", "Go", "Me"],          "calc": _line_angle("Or", "Po", "Go", "Me")},

    {"category": "Tweed",   "code": "IMPA",     "name": "Incisor-Mandibular Plane Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 85,  "max": 95,
     "refs": ["Go", "Me", "L1", "L1_c"],        "calc": _line_angle("Go", "Me", "L1", "L1_c")},

    {"category": "Tweed",   "code": "FMIA",     "name": "Frankfort-Mandibular Incisor Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 60,  "max": 70,
     "refs": ["Or", "Po", "L1", "L1_c"],        "calc": _line_angle("Or", "Po", "L1", "L1_c")},

    # ══════════════════════════════════════════════════════════════════════════
    # McNAMARA ANALYSIS
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "McNamara","code": "N-Perp-A",  "name": "N-Perpendicular to Point A",
     "type": "Distance", "unit": "Millimeters", "min": -2,  "max": 2,
     "refs": ["N", "Or", "Po", "A"],            "calc": _n_perp_dist("A"),
     "requires_calibration": True},

    {"category": "McNamara","code": "N-Perp-Pog","name": "N-Perpendicular to Pogonion",
     "type": "Distance", "unit": "Millimeters", "min": -4,  "max": 0,
     "refs": ["N", "Or", "Po", "Pog"],          "calc": _n_perp_dist("Pog"),
     "requires_calibration": True},

    {"category": "McNamara","code": "MidfaceLen","name": "Effective Midface Length (Co-A)",
     "type": "Distance", "unit": "Millimeters", "min": 80,  "max": 100,
     "refs": ["Co", "A"],                       "calc": _dist_pts("Co", "A"),
     "requires_calibration": True},

    {"category": "McNamara","code": "MandLength","name": "Effective Mandibular Length (Co-Gn)",
     "type": "Distance", "unit": "Millimeters", "min": 100, "max": 130,
     "refs": ["Co", "Gn"],                      "calc": _dist_pts("Co", "Gn"),
     "requires_calibration": True},

    {"category": "McNamara","code": "LAFH",      "name": "Lower Anterior Facial Height (ANS-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 60,  "max": 70,
     "refs": ["ANS", "Me"],                     "calc": _dist_pts("ANS", "Me"),
     "requires_calibration": True},

    {"category": "McNamara","code": "A-NPerp",   "name": "Point A to N-Perpendicular",
     "type": "Distance", "unit": "Millimeters", "min": -2,  "max": 2,
     "refs": ["A", "N", "Po", "Or"],            "calc": _n_perp_dist("A"),
     "requires_calibration": True},

    {"category": "McNamara","code": "Pog-NPerp", "name": "Pogonion to N-Perpendicular",
     "type": "Distance", "unit": "Millimeters", "min": -4,  "max": 0,
     "refs": ["Pog", "N", "Po", "Or"],          "calc": _n_perp_dist("Pog"),
     "requires_calibration": True},

    # ══════════════════════════════════════════════════════════════════════════
    # JARABAK / BJÖRK
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Jarabak", "code": "SaddleAngle",   "name": "Saddle Angle (N-S-Ar)",
     "type": "Angle",    "unit": "Degrees",     "min": 118, "max": 128,
     "refs": ["N", "S", "Ar"],                  "calc": _angle("N", "S", "Ar")},

    {"category": "Jarabak", "code": "ArticularAngle","name": "Articular Angle (S-Ar-Go)",
     "type": "Angle",    "unit": "Degrees",     "min": 138, "max": 148,
     "refs": ["S", "Ar", "Go"],                 "calc": _angle("S", "Ar", "Go")},

    {"category": "Jarabak", "code": "GonialAngle",   "name": "Gonial Angle (Ar-Go-Me)",
     "type": "Angle",    "unit": "Degrees",     "min": 125, "max": 135,
     "refs": ["Ar", "Go", "Me"],                "calc": _angle("Ar", "Go", "Me")},

    {"category": "Jarabak", "code": "PFH",           "name": "Posterior Face Height (S-Go)",
     "type": "Distance", "unit": "Millimeters", "min": 70,  "max": 85,
     "refs": ["S", "Go"],                       "calc": _dist_pts("S", "Go"),
     "requires_calibration": True},

    {"category": "Jarabak", "code": "AFH",           "name": "Anterior Face Height (N-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 105, "max": 125,
     "refs": ["N", "Me"],                       "calc": _dist_pts("N", "Me"),
     "requires_calibration": True},

    {"category": "Jarabak", "code": "JRatio",        "name": "Jarabak Ratio (PFH/AFH)",
     "type": "Ratio",    "unit": "Percent",     "min": 62,  "max": 65,
     "refs": ["S", "Go", "N", "Me"],            "calc": _ratio("S", "Go", "N", "Me")},

    {"category": "Jarabak", "code": "BJORK_SUM",     "name": "Björk Sum of Angles",
     "type": "Angle",    "unit": "Degrees",     "min": 392, "max": 400,
     "refs": ["N", "S", "Ar", "Go", "Me"],
     "calc": lambda lms, ps: (
         angle_between(lms["S"], lms["N"], lms["Ar"]) +
         angle_between(lms["Ar"], lms["S"], lms["Go"]) +
         angle_between(lms["Go"], lms["Ar"], lms["Me"])
     )},

    # ══════════════════════════════════════════════════════════════════════════
    # RICKETTS SOFT TISSUE (E-LINE)
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Ricketts","code": "Ls-Eline",  "name": "Upper Lip to E-Line",
     "type": "Distance", "unit": "Millimeters", "min": -6,  "max": -2,
     "refs": ["Ls", "Prn", "SoftPog"],
     "calc": _dist_to_line_signed("Ls", "Prn", "SoftPog"), "requires_calibration": True},

    {"category": "Ricketts","code": "Li-Eline",  "name": "Lower Lip to E-Line",
     "type": "Distance", "unit": "Millimeters", "min": -4,  "max": 0,
     "refs": ["Li", "Prn", "SoftPog"],
     "calc": _dist_to_line_signed("Li", "Prn", "SoftPog"), "requires_calibration": True},

    # ══════════════════════════════════════════════════════════════════════════
    # RICKETTS SKELETAL / STRUCTURAL
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Ricketts","code": "Ricketts-Convexity",  "name": "Facial Convexity — A to N-Pog (mm)",
     "type": "Distance", "unit": "Millimeters", "min": 0,   "max": 4,
     "refs": ["A", "N", "Pog"],                 "calc": _a_to_n_pog_mm(),
     "requires_calibration": True},

    {"category": "Ricketts","code": "UI-APog",    "name": "Upper Incisor to A-Pog (mm)",
     "type": "Distance", "unit": "Millimeters", "min": 1,   "max": 5,
     "refs": ["U1", "A", "Pog"],
     "calc": _lpt_to_n_pog_mm("U1"), "requires_calibration": True},

    {"category": "Ricketts","code": "LI-APog",    "name": "Lower Incisor to A-Pog (mm)",
     "type": "Distance", "unit": "Millimeters", "min": -1,  "max": 3,
     "refs": ["L1", "A", "Pog"],
     "calc": lambda lms, ps: (
         signed_perpendicular_distance(lms["L1"], lms["A"], lms["Pog"]) * ps if ps else None
     ), "requires_calibration": True},

    {"category": "Ricketts","code": "FacialAxis",  "name": "Facial Axis (Ba-N to Pt-Gn)",
     "type": "Angle",    "unit": "Degrees",     "min": 86,  "max": 94,
     "refs": ["Ba", "N", "Pt", "Gn"],           "calc": _facial_axis()},

    {"category": "Ricketts","code": "LFH-Angle",   "name": "Lower Facial Height Angle (Xi-ANS-PM)",
     "type": "Angle",    "unit": "Degrees",     "min": 42,  "max": 52,
     "refs": ["Xi", "ANS", "PM"],               "calc": _lower_facial_height_angle()},

    {"category": "Ricketts","code": "MandArc",     "name": "Mandibular Arc (DC-Xi to Xi-PM)",
     "type": "Angle",    "unit": "Degrees",     "min": 22,  "max": 30,
     "refs": ["DC", "Xi", "PM"],                "calc": _mandibular_arc()},

    # ══════════════════════════════════════════════════════════════════════════
    # DOWN'S ANALYSIS
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Downs",   "code": "FacialAngle", "name": "Facial Angle (FH to N-Pog)",
     "type": "Angle",    "unit": "Degrees",     "min": 82,  "max": 95,
     "refs": ["N", "Pog", "Po", "Or"],          "calc": _facial_angle()},

    {"category": "Downs",   "code": "Convexity",   "name": "Angle of Convexity (N-A-Pog)",
     "type": "Angle",    "unit": "Degrees",     "min": -5,  "max": 5,
     "refs": ["N", "A", "Pog"],                 "calc": _convexity_angle()},

    {"category": "Downs",   "code": "AB-NPog",     "name": "AB Plane to N-Pog",
     "type": "Angle",    "unit": "Degrees",     "min": -9,  "max": -1,
     "refs": ["A", "B", "N", "Pog"],
     "calc": lambda lms, ps: line_to_line_angle(lms["A"], lms["B"], lms["N"], lms["Pog"])},

    {"category": "Downs",   "code": "MandPlane",   "name": "Mandibular Plane to FH (Down's)",
     "type": "Angle",    "unit": "Degrees",     "min": 17,  "max": 28,
     "refs": ["Go", "Me", "Po", "Or"],
     "calc": lambda lms, ps: line_to_line_angle(lms["Go"], lms["Me"], lms["Po"], lms["Or"])},

    {"category": "Downs",   "code": "YAxis",       "name": "Y-Axis (S-Gn to FH)",
     "type": "Angle",    "unit": "Degrees",     "min": 53,  "max": 66,
     "refs": ["S", "Gn", "Po", "Or"],           "calc": _y_axis()},

    {"category": "Downs",   "code": "OccPlane",    "name": "Occlusal Plane to FH",
     "type": "Angle",    "unit": "Degrees",     "min": 1,   "max": 14,
     "refs": ["U1", "L1", "U6", "L6", "Po", "Or"], "calc": _occ_plane_angle()},

    {"category": "Downs",   "code": "Interincisal","name": "Interincisal Angle (U1-L1)",
     "type": "Angle",    "unit": "Degrees",     "min": 110, "max": 150,
     "refs": ["U1", "U1_c", "L1", "L1_c"],      "calc": _interincisal_angle()},

    {"category": "Downs",   "code": "L1-OcclPlane","name": "Lower Incisor to Occlusal Plane",
     "type": "Angle",    "unit": "Degrees",     "min": 10,  "max": 20,
     "refs": ["L1", "L1_c", "U1", "U6", "L6"],  "calc": _lower_incisor_to_op()},

    {"category": "Downs",   "code": "U1-FH",       "name": "Upper Incisor to FH (Down's)",
     "type": "Angle",    "unit": "Degrees",     "min": 54,  "max": 66,
     "refs": ["U1", "U1_c", "Po", "Or"],        "calc": _upper_incisor_to_fh()},

    {"category": "Downs",   "code": "ZAngle",      "name": "Z-Angle (FH to Ls-SoftPog)",
     "type": "Angle",    "unit": "Degrees",     "min": 67,  "max": 83,
     "refs": ["Ls", "SoftPog", "Po", "Or"],     "calc": _z_angle()},

    # ══════════════════════════════════════════════════════════════════════════
    # DENTAL
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Dental",  "code": "UI-NA_MM",    "name": "UI to NA Distance",
     "type": "Distance", "unit": "Millimeters", "min": 3,   "max": 5,
     "refs": ["U1", "N", "A"],
     "calc": _dist_to_line_signed("U1", "N", "A"),
     "requires_calibration": True, "norm_keys": ["UI to NA (mm)"]},

    {"category": "Dental",  "code": "UI-NA_DEG",   "name": "UI to NA Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 20,  "max": 24,
     "refs": ["U1", "U1_c", "N", "A"],
     "calc": _line_angle("U1", "U1_c", "N", "A"), "norm_keys": ["UI to NA (deg)"]},

    {"category": "Dental",  "code": "LI-NB_MM",    "name": "LI to NB Distance",
     "type": "Distance", "unit": "Millimeters", "min": 3,   "max": 5,
     "refs": ["L1", "N", "B"],
     "calc": _dist_to_line_signed("L1", "N", "B"),
     "requires_calibration": True, "norm_keys": ["LI to NB (mm)"]},

    {"category": "Dental",  "code": "LI-NB_DEG",   "name": "LI to NB Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 23,  "max": 27,
     "refs": ["L1", "L1_c", "N", "B"],
     "calc": _line_angle("L1", "L1_c", "N", "B"), "norm_keys": ["LI to NB (deg)"]},

    {"category": "Dental",  "code": "OVERJET",      "name": "Overjet",
     "type": "Distance", "unit": "Millimeters", "min": 1,   "max": 3,
     "refs": ["U1", "L1"],
     "calc": _overjet(), "requires_calibration": True},

    {"category": "Dental",  "code": "OVERBITE",     "name": "Overbite",
     "type": "Distance", "unit": "Millimeters", "min": 1,   "max": 3,
     "refs": ["U1", "L1"],
     "calc": _overbite(), "requires_calibration": True},

    # ══════════════════════════════════════════════════════════════════════════
    # SKELETAL (ADVANCED)
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Skeletal","code": "SN-MP",       "name": "SN to Mandibular Plane (Go-Me)",
     "type": "Angle",    "unit": "Degrees",     "min": 26,  "max": 38,
     "refs": ["S", "N", "Go", "Me"],
     "calc": _line_angle("S", "N", "Go", "Me")},

    {"category": "Advanced","code": "SN-PP",       "name": "SN to Palatal Plane (ANS-PNS)",
     "type": "Angle",    "unit": "Degrees",     "min": 6,   "max": 10,
     "refs": ["S", "N", "ANS", "PNS"],
     "calc": _signed_line_angle("ANS", "PNS", "S", "N")},

    {"category": "Advanced","code": "FH-AB",       "name": "Frankfort to AB Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 75,  "max": 85,
     "refs": ["Or", "Po", "A", "B"],
     "calc": _line_angle("Or", "Po", "A", "B")},

    {"category": "Advanced","code": "PP-FH",       "name": "Palatal Plane to Frankfort",
     "type": "Angle",    "unit": "Degrees",     "min": -2,  "max": 2,
     "refs": ["ANS", "PNS", "Or", "Po"],
     "calc": _line_angle("ANS", "PNS", "Or", "Po")},

    {"category": "Advanced","code": "AB-MP",       "name": "AB to Mandibular Plane",
     "type": "Angle",    "unit": "Degrees",     "min": 65,  "max": 75,
     "refs": ["A", "B", "Go", "Me"],
     "calc": _line_angle("A", "B", "Go", "Me")},

    {"category": "Advanced","code": "PP-MP",       "name": "Palatal to Mandibular Plane",
     "type": "Angle",    "unit": "Degrees",     "min": 24,  "max": 28,
     "refs": ["ANS", "PNS", "Go", "Me"],
     "calc": _line_angle("ANS", "PNS", "Go", "Me")},

    {"category": "Advanced","code": "H-Angle",     "name": "Holdaway H-Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 7,   "max": 13,
     "refs": ["N", "B", "SoftPog", "Ls"],
     "calc": _line_angle("N", "B", "SoftPog", "Ls")},

    {"category": "Advanced","code": "Pog-NB_MM",  "name": "Pogonion to NB Line (Holdaway)",
     "type": "Distance", "unit": "Millimeters", "min": 0,   "max": 4,
     "refs": ["Pog", "N", "B"],
     "calc": lambda lms, ps: (
         signed_perpendicular_distance(lms["Pog"], lms["N"], lms["B"]) * ps if ps else None
     ), "requires_calibration": True},

    {"category": "Advanced","code": "ST-ChinThick","name": "Soft Tissue Chin Thickness (Pog-SoftPog)",
     "type": "Distance", "unit": "Millimeters", "min": 10,  "max": 18,
     "refs": ["Pog", "SoftPog"],
     "calc": _dist_pts("Pog", "SoftPog"),
     "requires_calibration": True},

    {"category": "Advanced","code": "NSBa",        "name": "Cranial Base Flexure (N-S-Ba)",
     "type": "Angle",    "unit": "Degrees",     "min": 125, "max": 138,
     "refs": ["N", "S", "Ba"],                  "calc": _nsba_angle()},

    # ── KIM'S COMPOSITE INDICES (standalone) ─────────────────────────────────
    # APDI = FH-AB + PP-FH  (norm 81.4 ± 3.5°; Kim 1978 AJO-DO)
    # ODI  = AB-MP + PP-MP  (norm 74.5 ± 4.0°; Kim 1974 AJO-DO)
    {"category": "Advanced","code": "APDI",        "name": "Anteroposterior Dysplasia Indicator (Kim)",
     "type": "Angle",    "unit": "Degrees",     "min": 77.9,"max": 84.9,
     "refs": ["Or", "Po", "A", "B", "ANS", "PNS"],
     "calc": lambda lms, ps: (
         line_to_line_angle(lms["Or"], lms["Po"], lms["A"], lms["B"]) +
         signed_angle_line_to_ref(lms["ANS"], lms["PNS"], lms["Or"], lms["Po"])
     ) if all(k in lms for k in ["Or", "Po", "A", "B", "ANS", "PNS"]) else None},

    {"category": "Advanced","code": "ODI",         "name": "Overbite Depth Indicator (Kim)",
     "type": "Angle",    "unit": "Degrees",     "min": 70.5,"max": 78.5,
     "refs": ["A", "B", "Go", "Me", "ANS", "PNS"],
     "calc": lambda lms, ps: (
         line_to_line_angle(lms["A"], lms["B"], lms["Go"], lms["Me"]) +
         line_to_line_angle(lms["ANS"], lms["PNS"], lms["Go"], lms["Me"])
     ) if all(k in lms for k in ["A", "B", "Go", "Me", "ANS", "PNS"]) else None},

    # ══════════════════════════════════════════════════════════════════════════
    # HARVOLD VERTICAL PROPORTIONS
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Harvold", "code": "UFH",         "name": "Upper Facial Height (N-ANS)",
     "type": "Distance", "unit": "Millimeters", "min": 45,  "max": 55,
     "refs": ["N", "ANS"],                      "calc": _dist_pts("N", "ANS"),
     "requires_calibration": True},

    {"category": "Harvold", "code": "LFH",         "name": "Lower Facial Height (ANS-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 60,  "max": 70,
     "refs": ["ANS", "Me"],                     "calc": _dist_pts("ANS", "Me"),
     "requires_calibration": True},

    {"category": "Harvold", "code": "TFH",         "name": "Total Facial Height (N-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 105, "max": 125,
     "refs": ["N", "Me"],                       "calc": _dist_pts("N", "Me"),
     "requires_calibration": True},

    {"category": "Harvold", "code": "LFH-TFH",     "name": "LFH/TFH Ratio (Harvold Index)",
     "type": "Ratio",    "unit": "Percent",     "min": 53,  "max": 58,
     "refs": ["N", "ANS", "Me"],                "calc": _ratio("ANS", "Me", "N", "Me")},

    # ══════════════════════════════════════════════════════════════════════════
    # SOFT TISSUE (BURSTONE / ADDITIONAL)
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "SoftTissue","code": "NasolabialAngle","name": "Nasolabial Angle (Cm-Sn-Ls)",
     "type": "Angle",    "unit": "Degrees",     "min": 95,  "max": 120,
     "refs": ["Cm", "Sn", "Ls"],                "calc": _nasolabial_angle()},

    {"category": "SoftTissue","code": "UpperLipLength","name": "Upper Lip Length (Sn-Stms)",
     "type": "Distance", "unit": "Millimeters", "min": 18,  "max": 24,
     "refs": ["Sn", "Stms"],                    "calc": _lip_length("Sn", "Stms"),
     "requires_calibration": True},

    {"category": "SoftTissue","code": "LowerLipLength","name": "Lower Lip Length (Stmi-Sm)",
     "type": "Distance", "unit": "Millimeters", "min": 13,  "max": 18,
     "refs": ["Stmi", "Sm"],                    "calc": _lip_length("Stmi", "Sm"),
     "requires_calibration": True},

    {"category": "SoftTissue","code": "InterlabialGap","name": "Interlabial Gap (Stms-Stmi)",
     "type": "Distance", "unit": "Millimeters", "min": 0,   "max": 3,
     "refs": ["Stms", "Stmi"],                  "calc": _interlabial_gap(),
     "requires_calibration": True},

    {"category": "SoftTissue","code": "FacialConvexity","name": "Soft Tissue Facial Convexity (GLA-Sn-SoftPog)",
     "type": "Angle",    "unit": "Degrees",     "min": 5,   "max": 20,
     "refs": ["GLA", "Sn", "SoftPog"],          "calc": _facial_convexity_angle()},

    {"category": "SoftTissue","code": "STFacialAngle","name": "Soft Tissue Facial Angle",
     "type": "Angle",    "unit": "Degrees",     "min": 86,  "max": 96,
     "refs": ["GLA", "SoftPog", "Po", "Or"],    "calc": _soft_tissue_facial_angle()},

    # ══════════════════════════════════════════════════════════════════════════
    # AIRWAY ASSESSMENT
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Airway",  "code": "MP-H",        "name": "Mandibular Plane to Hyoid Distance",
     "type": "Distance", "unit": "Millimeters", "min": 10,  "max": 15,
     "refs": ["Go", "Me", "Hy"],                "calc": _mp_h_distance(),
     "requires_calibration": True},

    {"category": "Airway",  "code": "PNW_Width",   "name": "Posterior Nasopharyngeal Airway Width",
     "type": "Distance", "unit": "Millimeters", "min": 8,   "max": 25,
     "refs": ["PNS", "PNW"],                    "calc": _pnw_width(),
     "requires_calibration": True},

    {"category": "Airway",  "code": "PPW_Dist",    "name": "Posterior Pharyngeal Wall Distance",
     "type": "Distance", "unit": "Millimeters", "min": 5,   "max": 15,
     "refs": ["PPW", "B"],                      "calc": _ppw_dist(),
     "requires_calibration": True},

    # ══════════════════════════════════════════════════════════════════════════
    # CVM STAGING PROXIES
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "CVM",     "code": "CV3_Concavity","name": "CV3 Inferior Border Concavity (%)",
     "type": "Ratio",    "unit": "Percent",     "min": 0,   "max": 10,
     "refs": ["Cv3a", "Cv3ai", "Cv3pi"],        "calc": _cv3_concavity()},

    {"category": "CVM",     "code": "CV4_Concavity","name": "CV4 Inferior Border Concavity (%)",
     "type": "Ratio",    "unit": "Percent",     "min": 0,   "max": 10,
     "refs": ["Cv4a", "Cv4ai", "Cv4pi"],        "calc": _cv4_concavity()},

    # ══════════════════════════════════════════════════════════════════════════
    # SKELETAL LENGTHS
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Skeletal","code": "SN_Length",   "name": "S-N Length (Cranial Base)",
     "type": "Distance", "unit": "Millimeters", "min": 63,  "max": 80,
     "refs": ["S", "N"],                        "calc": _dist_pts("S", "N"),
     "requires_calibration": True},

    {"category": "Skeletal","code": "RamusHeight", "name": "Ramus Height (Ar-Go)",
     "type": "Distance", "unit": "Millimeters", "min": 40,  "max": 60,
     "refs": ["Ar", "Go"],                      "calc": _dist_pts("Ar", "Go"),
     "requires_calibration": True},

    {"category": "Skeletal","code": "MandBody",    "name": "Mandibular Body Length (Go-Me)",
     "type": "Distance", "unit": "Millimeters", "min": 65,  "max": 85,
     "refs": ["Go", "Me"],                      "calc": _dist_pts("Go", "Me"),
     "requires_calibration": True},

    {"category": "Skeletal","code": "PalatLen",    "name": "Palatal Length (ANS-PNS)",
     "type": "Distance", "unit": "Millimeters", "min": 45,  "max": 58,
     "refs": ["ANS", "PNS"],                    "calc": _dist_pts("ANS", "PNS"),
     "requires_calibration": True},

    # ══════════════════════════════════════════════════════════════════════════
    # BOLTON PROXY (approximated from incisal distances; note: true Bolton
    # requires study model tooth widths — flag as provisional)
    # ══════════════════════════════════════════════════════════════════════════
    {"category": "Bolton",  "code": "BoltonAnt",   "name": "Bolton Anterior Ratio (proxy)",
     "type": "Ratio",    "unit": "Percent",     "min": 73.9,"max": 80.5,
     "refs": ["U1", "U3", "L1", "L3"],
     "calc": lambda lms, ps: (
         euclidean_distance(lms["L1"], lms["L3"]) /
         max(euclidean_distance(lms["U1"], lms["U3"]), 1e-8) * 100
     ) if all(k in lms for k in ["U1", "U3", "L1", "L3"]) else None},

    {"category": "Bolton",  "code": "BoltonTotal", "name": "Bolton Total Ratio (proxy)",
     "type": "Ratio",    "unit": "Percent",     "min": 87.5,"max": 95.1,
     "refs": ["U1", "U6", "L1", "L6"],
     "calc": lambda lms, ps: (
         euclidean_distance(lms["L1"], lms["L6"]) /
         max(euclidean_distance(lms["U1"], lms["U6"]), 1e-8) * 100
     ) if all(k in lms for k in ["U1", "U6", "L1", "L6"]) else None},
]


# ── Measurement Uncertainty Propagation & Main Computation ───────────────────

def propagate_measurement_uncertainty(
    item: dict,
    landmarks: Dict[str, tuple[float, float]],
    pixel_spacing: Optional[float],
    landmark_uncertainties: dict[str, float],
    epsilon_px: float = 1.0,
) -> Optional[float]:
    """
    First-order Taylor expansion (linear error propagation) for cephalometric
    measurements.

    For a measurement M that is a function of landmark positions
    M(x_1, y_1, ..., x_n, y_n), the propagated 1-sigma uncertainty is:

        σ_M = sqrt( Σ_i [ (∂M/∂x_i)² · σ_xi² + (∂M/∂y_i)² · σ_yi² ] )

    All partial derivatives are evaluated numerically via central finite
    differences with step ε_px = 1 pixel:

        ∂M/∂x_i ≈ [ M(x_i + ε) − M(x_i − ε) ] / (2ε)

    Per-landmark positional uncertainty σ_i (in mm from conformal prediction)
    is converted to pixels using pixel_spacing before differentiation; the
    final σ_M is returned in the measurement's native unit (mm or degrees).

    Only landmarks that directly appear in the measurement formula are
    differentiated. Landmarks not in `landmark_uncertainties` use a
    conservative default of 2.0 mm.

    Returns:
        σ_M (float) in native units, or None if propagation is not possible.

    References:
        Bevington PR & Robinson DK (2003). Data Reduction and Error Analysis
        for the Physical Sciences, 3rd ed. McGraw-Hill. Ch. 3 (error propagation).

        Shahidi S et al. (2013). Validity of cephalometric measurements on
        a low-cost CBCT system. Dentomaxillofac Radiol 42(1):20120295.
        (Landmark localization error → measurement error in clinical context.)
    """
    calc = item.get("calc")
    if calc is None:
        return None

    refs = [r for r in item.get("refs", []) if r in landmarks]
    if not refs:
        return None

    variance = 0.0

    for name in refs:
        sigma_mm = landmark_uncertainties.get(name, 2.0)
        sigma_px = (sigma_mm / pixel_spacing) if (pixel_spacing and pixel_spacing > 0) else epsilon_px

        cx, cy = landmarks[name]

        # ∂M/∂x — central difference
        try:
            vx_p = calc({**landmarks, name: (cx + epsilon_px, cy)}, pixel_spacing)
            vx_m = calc({**landmarks, name: (cx - epsilon_px, cy)}, pixel_spacing)
            if vx_p is not None and vx_m is not None:
                dM_dx = (vx_p - vx_m) / (2.0 * epsilon_px)
                variance += (dM_dx * sigma_px) ** 2
        except Exception:
            pass

        # ∂M/∂y — central difference
        try:
            vy_p = calc({**landmarks, name: (cx, cy + epsilon_px)}, pixel_spacing)
            vy_m = calc({**landmarks, name: (cx, cy - epsilon_px)}, pixel_spacing)
            if vy_p is not None and vy_m is not None:
                dM_dy = (vy_p - vy_m) / (2.0 * epsilon_px)
                variance += (dM_dy * sigma_px) ** 2
        except Exception:
            pass

    return round(math.sqrt(variance), 3) if variance > 0 else None


def compute_all_measurements(
    landmarks: Dict[str, tuple[float, float]],
    pixel_spacing: Optional[float] = None,
    age: Optional[float] = None,
    sex: Optional[str] = None,
    population: Optional[str] = None,
    dentition_stage: Optional[str] = None,
    landmark_provenance: Optional[dict[str, str]] = None,
    is_cbct_derived: Optional[bool] = False,
    landmark_uncertainties: Optional[dict[str, float]] = None,
) -> List[Dict[str, Any]]:
    """
    Compute all applicable cephalometric measurements.

    Skips measurements with absent landmarks or missing calibration.

    If `landmark_uncertainties` (landmark_code → expected_error_mm) is
    provided, each measurement result will include a `measurement_uncertainty`
    field (1-sigma, in native units) computed by first-order Taylor expansion
    error propagation, plus a `ci_95` tuple (value ± 1.96 · σ_M).
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

            dynamic_range = _lookup_norm_range(item, age, sex)
            if dynamic_range:
                nmin, nmax = dynamic_range

            if population:
                po = norms_provider.get_population_offset(item["code"], population)
                nmin += po[0]; nmax += po[1]

            if is_cbct_derived and item.get("type") == "Distance":
                cbct_scale = 1.08
                nmin = round(nmin * cbct_scale, 2)
                nmax = round(nmax * cbct_scale, 2)

            quality_status, review_reasons, used_provenance = _quality_for_refs(
                item["refs"], landmark_provenance
            )

            # ── Uncertainty propagation ──────────────────────────────────────
            uncertainty: Optional[float] = None
            ci_95: Optional[tuple[float, float]] = None
            if landmark_uncertainties:
                uncertainty = propagate_measurement_uncertainty(
                    item, landmarks, pixel_spacing, landmark_uncertainties,
                )
                if uncertainty is not None:
                    half = round(1.96 * uncertainty, 3)
                    ci_95 = (round(value - half, 3), round(value + half, 3))

            row: Dict[str, Any] = {
                "code":                    item["code"],
                "name":                    item["name"],
                "category":                item["category"],
                "measurement_type":        item["type"],
                "value":                   round(value, 4),
                "unit":                    item["unit"],
                "normal_min":              nmin,
                "normal_max":              nmax,
                "status":                  classify_status(value, nmin, nmax),
                "deviation":               compute_deviation(value, nmin, nmax),
                "landmark_refs":           item["refs"],
                "quality_status":          quality_status,
                "review_reasons":          review_reasons,
                "landmark_provenance":     used_provenance,
                "measurement_uncertainty": uncertainty,
                "ci_95":                   list(ci_95) if ci_95 else None,
            }
            results.append(row)

        except Exception as e:
            logger.warning(f"Measurement '{item['code']}' skipped: {e}")

    return results
