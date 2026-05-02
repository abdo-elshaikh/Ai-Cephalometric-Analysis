"""
overlay_engine.py  (v2 — advanced)
===================================
Generates cephalometric image overlays matching the PointNix reference style.

Outputs
-------
  1  xray_tracing      – X-ray + full anatomical tracing + Steiner lines
  2  xray_measurements – X-ray + color-coded measurement annotations
  3  wiggle_chart      – Björk–Skieller deviation polygon (white background)
  4  tracing_only      – Pure anatomical tracing on white background
  5  measurement_table – Measurement table with deviation bars
  6  ceph_report       – A4 single-page clinical report (tracing + wiggle + table)

v2 improvements
---------------
  • Confidence-aware landmark dots (green ≥ 0.80, yellow ≥ 0.60, red < 0.60)
  • Abbreviated landmark labels for all key anatomical points on tracings
  • Fixed mini-wiggle compositing (stale-draw-handle bug resolved)
  • Matplotlib wiggle chart — consistent quality across full-page and embedded views
  • Measurement table — alternating zebra rows, status icons (✓ / ↑ / ↓), column borders
  • Measurement table summary footer (total / normal / abnormal counts)
  • New ceph_report overlay combining all clinical views on a single canvas
  • Improved font discovery (DejaVuSans / Ubuntu / FreeSans / built-in fallback)
  • JPEG output quality raised from 92 → 95
"""

from __future__ import annotations

import io
import math
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Tuple
import numpy as np
import scipy.interpolate as interpolate
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from PIL import Image, ImageDraw, ImageFont
import cv2

matplotlib.use("Agg")

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
#  Colour palette
# ─────────────────────────────────────────────
C_GREEN   = (5,   150, 105)
C_ORANGE  = (234,  88,  12)
C_RED     = (220,  38,  38)
C_BLUE    = ( 37,  99, 235)

ANAT_COLOR      = (200, 200, 200)
SKELETAL_COLOR  = C_RED
DENTAL_COLOR    = C_BLUE
C_TRACING       = (  0,   0,   0)
SOFT_TISSUE_TRACE = C_GREEN

def _apply_clahe_to_pil(img: Image.Image) -> Image.Image:
    """Enhance X-ray visibility using CLAHE so landmarks pop."""
    cv_img = np.array(img)
    if len(cv_img.shape) == 3:
        gray = cv2.cvtColor(cv_img, cv2.COLOR_RGB2GRAY)
    else:
        gray = cv_img
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced_rgb = cv2.cvtColor(enhanced, cv2.COLOR_GRAY2RGB)
    return Image.fromarray(enhanced_rgb)

C_WHITE = (255, 255, 255)
C_BLACK = (  0,   0,   0)
C_GRID  = (  5, 150, 105)

# Confidence thresholds for landmark colour coding
_CONF_HIGH   = 0.80   # green
_CONF_MEDIUM = 0.60   # yellow

# Status → colour
STATUS_COLOR = {
    "Normal":    C_GREEN,
    "Increased": C_ORANGE,
    "Decreased": C_RED,
    "Severe":    C_RED,
}

# Status icons (safe ASCII/unicode)
STATUS_ICON = {
    "Normal":    "✓",
    "Increased": "↑",
    "Decreased": "↓",
    "Severe":    "⚠",
}

# Abbreviated landmark labels (used on tracing views)
# Map canonical short key -> human readable abbreviation
_LM_ABBR: dict[str, str] = {
    "S":    "S",
    "N":    "N",
    "A":    "A",
    "B":    "B",
    "Me":   "Me",
    "Gn":   "Gn",
    "Pog":  "Pog",
    "Ba":   "Ba",
    "Ar":   "Ar",
    "Po":   "Po",
    "Or":   "Or",
    "ANS":  "ANS",
    "PNS":  "PNS",
    "Go":   "Go",
    "U1":   "UI",
    "L1":   "LI",
    "U1_c": "UIA",
    "L1_c": "LIA",
    "U6":   "U6",
    "L6":   "L6",
    "SoftN": "N'",
    "Prn":   "Pn",
    "Sn":    "Sn",
    "Ls":    "Ls",
    "Li":    "Li",
    "SoftPog": "Pog'",
    "SoftGn":  "Me'",
}


# ─────────────────────────────────────────────
#  Data containers
# ─────────────────────────────────────────────
@dataclass
class LandmarkPoint:
    x: float
    y: float
    name: str = ""
    confidence: float = 1.0


@dataclass
class MeasurementItem:
    code: str
    name: str
    value: float
    unit: str
    normal_value: float
    std_deviation: float
    difference: float
    group_name: str  = ""
    status: str      = "Normal"


@dataclass
class OverlayRequest:
    """Single DTO that drives all overlay renders."""
    image_bytes: bytes
    landmarks: dict[str, LandmarkPoint]
    measurements: list[MeasurementItem] = field(default_factory=list)
    patient_label: str = ""
    date_label: str = ""
    scale_bar_mm: Optional[float] = 40.0
    pixel_spacing_mm: Optional[float] = None
    analysis_method: Optional[str] = "Steiner"


# ─────────────────────────────────────────────
#  Font helpers
# ─────────────────────────────────────────────
def _try_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"  if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"         if bold else
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"   if bold else
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "C:/Windows/Fonts/arialbd.ttf"                          if bold else
        "C:/Windows/Fonts/arial.ttf",
        "arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


# ─────────────────────────────────────────────
#  Coordinate helpers
# ─────────────────────────────────────────────
def _scale(pt: LandmarkPoint, sx: float, sy: float) -> tuple[float, float]:
    return pt.x * sx, pt.y * sy


def _lm(lms: dict[str, LandmarkPoint], *keys: str) -> Optional[LandmarkPoint]:
    for key in keys:
        if key in lms:
            return lms[key]
    return None


# ─────────────────────────────────────────────
#  Colour helpers
# ─────────────────────────────────────────────
def _msr_color(msr: MeasurementItem) -> tuple[int, int, int]:
    if msr.status in STATUS_COLOR:
        return STATUS_COLOR[msr.status]
    sd  = msr.std_deviation or 1.0
    dev = abs(msr.difference) / sd
    if dev < 1.0:
        return C_GREEN
    if dev < 2.0:
        return C_ORANGE
    return C_RED


def _msr_color_ref(msr: MeasurementItem, prefer: tuple) -> tuple:
    if msr.status in STATUS_COLOR and msr.status != "Normal":
        return STATUS_COLOR[msr.status]
    return prefer


def _conf_color(confidence: float) -> tuple[int, int, int]:
    if confidence >= _CONF_HIGH:
        return C_GREEN
    if confidence >= _CONF_MEDIUM:
        return (234, 179, 8)   # yellow-500
    return C_RED


# ─────────────────────────────────────────────
#  Drawing helpers
# ─────────────────────────────────────────────
def _arrowhead(draw: ImageDraw.ImageDraw, tip, tail,
               color, width: int = 2, head_len: int = 10):
    dx, dy = tip[0] - tail[0], tip[1] - tail[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    w = head_len * 0.4
    p1 = (tip[0] - ux * head_len + px * w, tip[1] - uy * head_len + py * w)
    p2 = (tip[0] - ux * head_len - px * w, tip[1] - uy * head_len - py * w)
    draw.polygon([tip, p1, p2], fill=color)


def _cubic_bezier_pts(p0, p1, p2, p3, steps=12):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        w0, w1, w2, w3 = u**3, 3*u**2*t, 3*u*t**2, t**3
        pts.append((w0*p0[0]+w1*p1[0]+w2*p2[0]+w3*p3[0],
                    w0*p0[1]+w1*p1[1]+w2*p2[1]+w3*p3[1]))
    return pts


def _cardinal_spline(draw, pts, fill, width=2, tension=0.4, steps=15):
    if len(pts) < 2:
        return
    if len(pts) == 2:
        draw.line(pts, fill=fill, width=width)
        return
    curve = []
    ext = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i-1], ext[i], ext[i+1], ext[i+2]
        for t in range(steps):
            s = t / steps
            s2, s3 = s*s, s*s*s
            b1, b2 = 2*s3-3*s2+1, -2*s3+3*s2
            b3, b4 = s3-2*s2+s,    s3-s2
            t1x = tension*(p2[0]-p0[0]); t1y = tension*(p2[1]-p0[1])
            t2x = tension*(p3[0]-p1[0]); t2y = tension*(p3[1]-p1[1])
            curve.append((b1*p1[0]+b2*p2[0]+b3*t1x+b4*t2x,
                           b1*p1[1]+b2*p2[1]+b3*t1y+b4*t2y))
    curve.append(pts[-1])
    draw.line(curve, fill=fill, width=width, joint="curve")


def _scipy_spline(draw: ImageDraw.ImageDraw, pts: List[Tuple[float, float]],
                  fill: Tuple[int, int, int, int], width: int = 2, steps: int = 50):
    """Anatomically accurate spline using scipy.interpolate.splprep."""
    if len(pts) < 2:
        return
    if len(pts) == 2:
        draw.line(pts, fill=fill, width=width)
        return

    # Clean duplicates which cause splprep to crash
    clean_pts = []
    for p in pts:
        if not clean_pts or math.hypot(p[0]-clean_pts[-1][0], p[1]-clean_pts[-1][1]) > 0.5:
            clean_pts.append(p)
    
    if len(clean_pts) < 3:
        draw.line(clean_pts, fill=fill, width=width)
        return

    try:
        x, y = zip(*clean_pts)
        tck, u = interpolate.splprep([x, y], s=0, k=min(3, len(clean_pts)-1))
        u_new = np.linspace(0, 1, steps)
        out = interpolate.splev(u_new, tck)
        curve = list(zip(out[0], out[1]))
        draw.line(curve, fill=fill, width=width, joint="curve")
    except Exception as e:
        logger.debug(f"Spline failed: {e}. Falling back to cardinal.")
        _cardinal_spline(draw, clean_pts, fill=fill, width=width)


def _draw_label_with_bg(draw: ImageDraw.ImageDraw, text: str,
                         pos: tuple, color: tuple,
                         font: ImageFont.ImageFont, pad: int = 4):
    """Text with a semi-opaque dark background box for legibility."""
    bbox = draw.textbbox(pos, text, font=font)
    r = [bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad]
    draw.rectangle(r, fill=(0, 0, 0, 160))
    draw.text(pos, text, font=font, fill=color)


# alias for backward compat with internal callers
_draw_label_with_box = _draw_label_with_bg


def _to_jpeg(img: Image.Image, quality: int = 95) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality, optimize=True)
    buf.seek(0)
    return buf.read()


# ─────────────────────────────────────────────
#  Scale bar
# ─────────────────────────────────────────────
def _draw_scale_bar(draw, canvas_w, canvas_h, req, sx, font, bg_dark=True):
    bar_mm = req.scale_bar_mm or 40.0
    pix_mm = req.pixel_spacing_mm
    if pix_mm is None:
        return
    bar_px = int(bar_mm / pix_mm * sx)
    bx, by = 20, 95
    col    = C_WHITE if bg_dark else C_BLACK
    draw.line([(bx, by), (bx+bar_px, by)], fill=col, width=3)
    draw.line([(bx, by-5), (bx, by+5)], fill=col, width=2)
    draw.line([(bx+bar_px, by-5), (bx+bar_px, by+5)], fill=col, width=2)
    draw.text((bx+bar_px+10, by-14), f"{int(bar_mm)}mm", font=font, fill=col)


# ─────────────────────────────────────────────
#  Watermark
# ─────────────────────────────────────────────
def _draw_clinical_watermark(draw, canvas_w, canvas_h):
    font_m = _try_font(24, bold=True)
    font_s = _try_font(20)
    txt_m, txt_s = "CEPHALOMETRIC AI", "Clinical Decision Support System"
    bm = draw.textbbox((0, 0), txt_m, font=font_m)
    bs = draw.textbbox((0, 0), txt_s, font=font_s)
    mg = 20
    xm = canvas_w - (bm[2]-bm[0]) - mg
    ym = canvas_h - (bm[3]-bm[1]) - mg - 26
    xs = canvas_w - (bs[2]-bs[0]) - mg
    ys = canvas_h - (bs[3]-bs[1]) - mg
    draw.text((xm, ym), txt_m, font=font_m, fill=(150, 150, 150, 150))
    draw.text((xs, ys), txt_s, font=font_s, fill=(150, 150, 150, 120))


# ─────────────────────────────────────────────
#  Confidence-aware landmark dots  (v2)
# ─────────────────────────────────────────────
_KEY_LMS = {
    "S", "N", "A", "B", "Me", "Po", "Or", "Ba", "Ar", "Go",
    "Pog", "ANS", "PNS",
}


# ─────────────────────────────────────────────
#  Angle arc annotation  (v3 — Dolphin-level)
# ─────────────────────────────────────────────
def _draw_angle_arc(
    overlay: Image.Image,
    vertex: tuple[float, float],
    ray1_end: tuple[float, float],
    ray2_end: tuple[float, float],
    label: str,
    color: tuple[int, int, int],
    radius: float = 50.0,
    line_width: int = 2,
    font: Optional[ImageFont.ImageFont] = None,
):
    import math
    vx, vy = vertex
    ax, ay = ray1_end
    bx, by = ray2_end

    a1 = math.atan2(ay - vy, ax - vx)
    a2 = math.atan2(by - vy, bx - vx)

    diff = a2 - a1
    while diff > math.pi:   diff -= 2 * math.pi
    while diff < -math.pi:  diff += 2 * math.pi

    BAx, BAy = ax - vx, ay - vy
    BCx, BCy = bx - vx, by - vy
    mag_ba = math.hypot(BAx, BAy)
    mag_bc = math.hypot(BCx, BCy)
    if mag_ba < 1e-6 or mag_bc < 1e-6:
        return
    cos_val = max(-1.0, min(1.0, (BAx*BCx + BAy*BCy) / (mag_ba * mag_bc)))
    angle_deg = math.degrees(math.acos(cos_val))

    arc_layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    arc_draw  = ImageDraw.Draw(arc_layer)

    alpha = 200
    c_rgba = (*color, alpha)

    def _dashed_line(x0, y0, x1, y1, dash_on=10, dash_off=6, width=1):
        dist = math.hypot(x1-x0, y1-y0)
        if dist < 1: return
        ux, uy = (x1-x0)/dist, (y1-y0)/dist
        pos = 0.0
        drawing = True
        while pos < dist:
            nxt = min(pos + (dash_on if drawing else dash_off), dist)
            if drawing:
                arc_draw.line([
                    (x0 + ux*pos, y0 + uy*pos),
                    (x0 + ux*nxt, y0 + uy*nxt),
                ], fill=(*color, 130), width=width)
            pos = nxt
            drawing = not drawing

    _dashed_line(vx + math.cos(a1)*radius, vy + math.sin(a1)*radius,
                 vx + math.cos(a1)*min(math.hypot(ax-vx, ay-vy), radius*3),
                 vy + math.sin(a1)*min(math.hypot(ax-vx, ay-vy), radius*3),
                 width=line_width)
    _dashed_line(vx + math.cos(a2)*radius, vy + math.sin(a2)*radius,
                 vx + math.cos(a2)*min(math.hypot(bx-vx, by-vy), radius*3),
                 vy + math.sin(a2)*min(math.hypot(bx-vx, by-vy), radius*3),
                 width=line_width)

    bbox = [vx - radius, vy - radius, vx + radius, vy + radius]
    start_deg = math.degrees(a1)
    end_deg   = math.degrees(a2)
    if diff < 0:
        start_deg, end_deg = end_deg, start_deg
    arc_draw.arc(bbox, start=start_deg, end=end_deg, fill=c_rgba, width=line_width + 1)

    amid = a1 + diff / 2
    lx = vx + (radius + 18) * math.cos(amid)
    ly = vy + (radius + 18) * math.sin(amid)
    if font is None:
        font = _try_font(18, bold=True)
    label_txt = f"{label} {angle_deg:.1f}°"
    bbox_txt = arc_draw.textbbox((lx, ly), label_txt, font=font)
    pad = 4
    arc_draw.rectangle(
        [bbox_txt[0]-pad, bbox_txt[1]-pad, bbox_txt[2]+pad, bbox_txt[3]+pad],
        fill=(0, 0, 0, 180)
    )
    arc_draw.text((lx, ly), label_txt, font=font, fill=(*color, 240))

    if overlay.mode != "RGBA":
        overlay_rgba = overlay.convert("RGBA")
        overlay_rgba.alpha_composite(arc_layer)
        result = overlay_rgba.convert("RGB")
        overlay.paste(result)
    else:
        overlay.alpha_composite(arc_layer)


def _draw_landmark_crosshair(
    overlay: Image.Image,
    x: float, y: float,
    color: tuple[int, int, int],
    confidence: float = 1.0,
    selected: bool = False,
    arm: int = 14,
    gap: int = 5,
    line_width: int = 2,
    label: str = "",
    font: Optional[ImageFont.ImageFont] = None,
):
    layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    d     = ImageDraw.Draw(layer)
    col   = (*color, 230)
    lw    = line_width + (1 if selected else 0)
    arm_  = arm + (4 if selected else 0)
    gap_  = gap

    if confidence < 0.60:
        for r in [arm_+10, arm_+16]:
            d.ellipse([x-r, y-r, x+r, y+r],
                      outline=(*C_RED, 60), width=1)

    if selected:
        d.ellipse([x-arm_-6, y-arm_-6, x+arm_+6, y+arm_+6],
                  outline=(*color, 100), width=1)

    d.line([(x-arm_, y), (x-gap_, y)], fill=col, width=lw)
    d.line([(x+gap_, y), (x+arm_, y)], fill=col, width=lw)
    d.line([(x, y-arm_), (x, y-gap_)], fill=col, width=lw)
    d.line([(x, y+gap_), (x, y+arm_)], fill=col, width=lw)

    r_dot = 3 if selected else 2
    d.ellipse([x-r_dot, y-r_dot, x+r_dot, y+r_dot], fill=col)

    if confidence > 0:
        r_arc = arm_ - 4
        sweep = confidence * 360
        d.arc([x-r_arc, y-r_arc, x+r_arc, y+r_arc],
              start=-90, end=-90+sweep,
              fill=(*color, 160), width=2)

    if label and font:
        tx, ty = x + arm_ + 4, y - 12
        bb = d.textbbox((tx, ty), label, font=font)
        pad = 3
        d.rectangle([bb[0]-pad, bb[1]-pad, bb[2]+pad, bb[3]+pad],
                    fill=(0, 0, 0, 200))
        d.rectangle([bb[0]-pad, bb[1]-pad, bb[0]-pad+3, bb[3]+pad],
                    fill=(*color, 220))
        d.text((tx, ty), label, font=font, fill=col)

    if overlay.mode != "RGBA":
        ov_rgba = overlay.convert("RGBA")
        ov_rgba.alpha_composite(layer)
        overlay.paste(ov_rgba.convert("RGB"))
    else:
        overlay.alpha_composite(layer)


def _draw_landmark_dots(
    overlay: Image.Image,
    lms: dict[str, LandmarkPoint],
    sx: float, sy: float,
    key_set: Optional[set] = None
):
    """
    Draw landmark dots colour-coded by confidence using Dolphin-style crosshairs.
    """
    for name, lm in lms.items():
        if key_set and name not in key_set:
            continue
        px, py = _scale(lm, sx, sy)
        is_key = name in _KEY_LMS
        col    = _conf_color(lm.confidence)
        
        if is_key:
            _draw_landmark_crosshair(
                overlay, px, py,
                color=col,
                confidence=lm.confidence,
                selected=False,
                arm=12, gap=4,
            )
        else:
            d = ImageDraw.Draw(overlay)
            r = 4
            d.ellipse([px-r, py-r, px+r, py+r], fill=(*col, 220), outline=(0,0,0,180))


# ─────────────────────────────────────────────
#  Landmark abbreviation labels  (v2 — new)
# ─────────────────────────────────────────────
def _draw_landmark_labels(draw: ImageDraw.ImageDraw,
                           lms: dict[str, LandmarkPoint],
                           sx: float, sy: float,
                           font_size: int = 20,
                           dark_bg: bool = True):
    """
    Draw abbreviated landmark names next to the dot for all key landmarks.
    Label colour matches confidence level.
    """
    font = _try_font(font_size, bold=True)
    for name, abbr in _LM_ABBR.items():
        lm = lms.get(name)
        if lm is None:
            continue
        px, py  = _scale(lm, sx, sy)
        col     = (*_conf_color(lm.confidence), 255)
        txt_col = col if not dark_bg else (255, 255, 255, 255)
        # Offset label up-right of the dot
        lx, ly  = px + 9, py - 18
        bbox    = draw.textbbox((lx, ly), abbr, font=font)
        draw.rectangle([bbox[0]-2, bbox[1]-2, bbox[2]+2, bbox[3]+2],
                       fill=(0, 0, 0, 140))
        draw.text((lx, ly), abbr, font=font, fill=txt_col)


# ─────────────────────────────────────────────
#  Steiner / McNamara / Tweed analysis lines
# ─────────────────────────────────────────────
def _draw_steiner_lines(draw, lms, sx, sy, alpha=200):
    PUR = (*SKELETAL_COLOR, alpha)
    W   = 2

    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    def pline(*names, color=PUR, width=W):
        pts = [pt(n) for n in names if pt(n) is not None]
        for i in range(len(pts)-1):
            draw.line([pts[i], pts[i+1]], fill=color, width=width)

    sella  = pt("S")
    nasion = pt("N")
    ptA    = pt("A")
    ptB    = pt("B")
    menton = pt("Me")
    go_p   = pt("Go")
    ar_p   = pt("Ar")
    pog    = pt("Pog")
    por    = pt("Po")
    orb    = pt("Or")
    ui_tip = pt("U1")
    li_tip = pt("L1")
    molar  = pt("U6")

    # SN extended
    if sella and nasion:
        dx, dy = nasion[0]-sella[0], nasion[1]-sella[1]
        ln = math.hypot(dx, dy) or 1
        draw.line([
            (sella[0]-dx/ln*40,   sella[1]-dy/ln*40),
            (nasion[0]+dx/ln*450, nasion[1]+dy/ln*450),
        ], fill=PUR, width=W)

    pline("N", "A")
    pline("N", "B")
    pline("N", "Pog")

    # FH plane
    if por and orb:
        dx, dy = orb[0]-por[0], orb[1]-por[1]
        ln = math.hypot(dx, dy) or 1
        draw.line([
            (por[0]-dx/ln*40,  por[1]-dy/ln*40),
            (orb[0]+dx/ln*450, orb[1]+dy/ln*450),
        ], fill=PUR, width=W)

    # Mandibular plane extended
    if go_p and menton:
        dx, dy = menton[0]-go_p[0], menton[1]-go_p[1]
        ln = math.hypot(dx, dy) or 1
        draw.line([go_p, (menton[0]+dx/ln*220, menton[1]+dy/ln*220)],
                  fill=PUR, width=W)

    pline("Ar", "Go")
    pline("S", "Me")

    # Draw Dolphin-style angle arcs on the main overlay image
    # Note: _draw_steiner_lines receives 'draw' which is an ImageDraw attached to 'img'
    # We must assume the caller can pass the actual 'img' to draw arcs.
    # To avoid changing the signature everywhere, we extract the image from the draw object.
    overlay_img = getattr(draw, 'im', None) # PIL internal, or we can just try to pass the img
    if hasattr(draw, '_image'):
        overlay_img = draw._image
    
    if overlay_img and sella and nasion and ptA and ptB:
        font = _try_font(20, bold=True)
        # SNA
        _draw_angle_arc(overlay_img, nasion, sella, ptA, "SNA", SKELETAL_COLOR, radius=55, font=font)
        # SNB
        _draw_angle_arc(overlay_img, nasion, sella, ptB, "SNB", SKELETAL_COLOR, radius=75, font=font)
        # ANB
        _draw_angle_arc(overlay_img, nasion, ptA, ptB, "ANB", (234, 88, 12), radius=35, font=font)

    # Occlusal plane
    if ui_tip and li_tip:
        mid = ((ui_tip[0]+li_tip[0])/2, (ui_tip[1]+li_tip[1])/2)
        if molar:
            draw.line([mid, molar], fill=PUR, width=W)

    if go_p and pog:
        draw.line([go_p, pog], fill=PUR, width=W)

    # Holdaway H-Angle reference
    nb = pt("N"), pt("B")
    hl = pt("SoftPog"), pt("Ls")
    if nb[0] and nb[1]:
        draw.line([nb[0], nb[1]], fill=(*C_BLUE, 150), width=1)
    if hl[0] and hl[1]:
        draw.line([hl[0], hl[1]], fill=(*C_BLUE, 200), width=2)


def _draw_mcnamara_lines(draw, lms, sx, sy):
    BLUE = (37, 99, 235, 200)
    W    = 2

    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    po, orb_p, n = pt("Po"), pt("Or"), pt("N")
    a, gn, co    = pt("A"), pt("Gn"), pt("Ar")

    if po and orb_p and n:
        dx, dy = orb_p[0]-po[0], orb_p[1]-po[1]
        ln     = math.hypot(dx, dy) or 1
        draw.line([po, (po[0]+dx/ln*500, po[1]+dy/ln*500)], fill=BLUE, width=W)
        vx, vy = -dy, dx
        lv     = math.hypot(vx, vy) or 1
        draw.line([n, (n[0]+vx/lv*400, n[1]+vy/lv*400)], fill=BLUE, width=W)

    if co:
        if a:  draw.line([co, a],  fill=BLUE, width=W)
        if gn: draw.line([co, gn], fill=BLUE, width=W)


def _draw_tweed_lines(draw, lms, sx, sy):
    ORANGE = (234, 88, 12, 200)
    W      = 2

    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    go, me = pt("Go"), pt("Me")
    li, lir = pt("L1"), pt("L1_c")

    if go and me:
        draw.line([go, me], fill=ORANGE, width=W)
    if li and lir:
        dx, dy = li[0]-lir[0], li[1]-lir[1]
        ln     = math.hypot(dx, dy) or 1
        draw.line([(li[0]+dx/ln*100, li[1]+dy/ln*100),
                    (lir[0]-dx/ln*100, lir[1]-dy/ln*100)],
                  fill=ORANGE, width=W)


# ─────────────────────────────────────────────
#  Soft-tissue profile
# ─────────────────────────────────────────────
def _draw_soft_tissue(draw, lms, sx, sy, alpha=200, color=None):
    if color is None:
        SOFT = (*SOFT_TISSUE_TRACE, alpha)
    elif len(color) == 3:
        SOFT = (*color, alpha)
    else:
        SOFT = color

    def pt(name):
        lm = _lm(lms, name)
        return _scale(lm, sx, sy) if lm else None

    # Orange dashed facial profile line (Rickett's E-Plane)
    pron, spog = pt("Prn"), pt("SoftPog")
    if pron and spog:
        # Extend the line slightly
        dx, dy = spog[0] - pron[0], spog[1] - pron[1]
        p1 = (pron[0] - dx*0.1, pron[1] - dy*0.1)
        p2 = (spog[0] + dx*0.2, spog[1] + dy*0.2)
        draw.line([p1, p2], fill=(234, 88, 12, 180), width=1)

    # Full anatomical soft tissue spline
    soft_chain = ["SoftN", "GLA", "Prn", "Sn", "Ls", "Li", "SoftPog", "SoftGn"]
    pts = [pt(n) for n in soft_chain if pt(n)]
    if len(pts) >= 3:
        _scipy_spline(draw, pts, fill=SOFT, width=3)
    elif len(pts) == 2:
        draw.line(pts, fill=SOFT, width=3)


# ─────────────────────────────────────────────
#  Incisor / molar silhouettes
# ─────────────────────────────────────────────
def _draw_incisor_upper(draw, apex, tip, lms, sx, sy, color=None):
    if color is None: color = (*DENTAL_COLOR, 230)
    if apex is None or tip is None:
        return
    dx, dy = apex[0]-tip[0], apex[1]-tip[1]
    length = math.hypot(dx, dy)
    if length < 5:
        return
    ux, uy = dx/length, dy/length
    px, py = -uy, ux
    cl = length * 0.45
    rl = length - cl
    cw_lab = length * 0.35
    cw_lin = length * 0.32
    rw_n   = length * 0.18

    ie_l = (tip[0]-px*cw_lab*0.4, tip[1]-py*cw_lab*0.4)
    ie_r = (tip[0]+px*cw_lab*0.4, tip[1]+py*cw_lab*0.4)
    cej_l = (tip[0]+ux*cl-px*rw_n, tip[1]+uy*cl-py*rw_n)
    cej_r = (tip[0]+ux*cl+px*rw_n, tip[1]+uy*cl+py*rw_n)

    pts = [ie_l]
    # Crown Labial
    pts += _cubic_bezier_pts(ie_l, (ie_l[0]+ux*cl*0.3-px*cw_lab*0.4, ie_l[1]+uy*cl*0.3-py*cw_lab*0.4),
                             (cej_l[0]-ux*cl*0.2-px*rw_n*0.1, cej_l[1]-uy*cl*0.2-py*rw_n*0.1), cej_l, steps=10)
    # Root
    pts += _cubic_bezier_pts(cej_l, (cej_l[0]+ux*rl*0.4, cej_l[1]+uy*rl*0.4), apex, apex, steps=12)
    pts += _cubic_bezier_pts(apex, apex, (cej_r[0]+ux*rl*0.4, cej_r[1]+uy*rl*0.4), cej_r, steps=12)
    # Crown Lingual (with cingulum)
    mid_cing = (cej_r[0]-ux*cl*0.4+px*cw_lin*0.3, cej_r[1]-uy*cl*0.4+py*cw_lin*0.3)
    pts += _cubic_bezier_pts(cej_r, (cej_r[0]-ux*cl*0.2+px*cw_lin*0.5, cej_r[1]-uy*cl*0.2+py*cw_lin*0.5),
                             mid_cing, mid_cing, steps=6)
    pts += _cubic_bezier_pts(mid_cing, (ie_r[0]+ux*cl*0.2, ie_r[1]+uy*cl*0.2), ie_r, ie_r, steps=10)
    
    draw.polygon(pts, outline=color, fill=(*color[:3], 20))


def _draw_incisor_lower(draw, apex, tip, lms, sx, sy, color=None):
    if color is None: color = (*DENTAL_COLOR, 230)
    if apex is None or tip is None:
        return
    dx, dy = apex[0]-tip[0], apex[1]-tip[1]
    length = math.hypot(dx, dy)
    if length < 5:
        return
    ux, uy = dx/length, dy/length
    px, py = -uy, ux
    cw = length * 0.28
    cl = length * 0.40
    pts = [
        (tip[0]-px*cw*0.5, tip[1]-py*cw*0.5),
        (tip[0]+px*cw*0.5, tip[1]+py*cw*0.5),
        (tip[0]+ux*cl+px*cw*0.4, tip[1]+uy*cl+py*cw*0.4),
        apex,
        (tip[0]+ux*cl-px*cw*0.4, tip[1]+uy*cl-py*cw*0.4),
    ]
    draw.polygon(pts, outline=color, fill=None)


def _draw_molar(draw, lms, sx, sy, which="upper", color=None):
    if color is None: color = (*DENTAL_COLOR, 230)
    if which == "upper":
        cusp = _lm(lms, "Cusp of upper first molar", "Second point on upper molar")
    else:
        cusp = _lm(lms, "Cusp of lower first molar", "Second point on lower molar")
    if cusp is None:
        return
    x, y   = _scale(cusp, sx, sy)
    w, h   = 32, 24
    dv     = -1 if which == "upper" else 1
    pts    = [(x-w/2, y)]
    pts   += _cubic_bezier_pts((x-w/2,y),(x-w/3,y+4*dv),(x-w/6,y+4*dv),(x,y), steps=5)
    pts   += _cubic_bezier_pts((x,y),(x+w/6,y+4*dv),(x+w/3,y+4*dv),(x+w/2,y), steps=5)
    pts   += [(x+w/2,y+h*dv),(x+w/6,y+(h+12)*dv),(x,y+(h+15)*dv),(x-w/6,y+(h+12)*dv),(x-w/2,y+h*dv)]
    draw.polygon(pts, outline=color, fill=(*color[:3], 15))


def _draw_pharynx(draw, lms, sx, sy, scale_mm, font):
    """Visualize pharyngeal airway and annotate widths."""
    def pt(name):
        lm = _lm(lms, name)
        return _scale(lm, sx, sy) if lm else None

    pns, ba = pt("Posterior Nasal Spine"), pt("Basion")
    if pns and ba:
        # Upper Pharynx approximation
        mid_ph = ((pns[0] + ba[0])/2, (pns[1] + ba[1])/2)
        # Assuming we have pharyngeal wall landmarks or calculating distance
        # For visualization, we'll draw a shaded area if points are available
        # If not, we just show the measurement if it exists
        pass

    # Draw airway limits if we have specific landmarks (usually 37/38 in some models)
    u_ph_wall = pt("36") # Approximation
    if pns and u_ph_wall:
        draw.line([pns, u_ph_wall], fill=(6, 182, 212, 180), width=2)
        dist_px = math.hypot(pns[0]-u_ph_wall[0], pns[1]-u_ph_wall[1])
        if scale_mm:
            dist_mm = dist_px * scale_mm / sx
            draw.text(((pns[0]+u_ph_wall[0])/2 + 5, (pns[1]+u_ph_wall[1])/2), 
                      f"{dist_mm:.2f}mm", font=font, fill=(6, 182, 212))


def _draw_anatomical_outlines(draw, lms, sx, sy, req=None, color=ANAT_COLOR):
    COL = (*color, 230)
    spacing = req.pixel_spacing_mm if req else None

    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    s, n, ba, orb = pt("Sella Turcica"), pt("Nasion"), pt("Basion"), pt("Orbitale")
    if s and n:   draw.line([s, n],   fill=COL, width=2)
    if s and ba:  draw.line([s, ba],  fill=COL, width=2)
    if n and orb: draw.line([n, orb], fill=COL, width=2)

    ans, pns = pt("Anterior Nasal Spine"), pt("Posterior Nasal Spine")
    if ans and pns:
        draw.line([ans, pns], fill=COL, width=2)

    mand_chain = ["Ar", "Po", "Go", "Me", "Gn", "Pog"]
    mpts = [pt(nm) for nm in mand_chain if pt(nm)]
    if len(mpts) >= 3:
        _scipy_spline(draw, mpts, fill=COL, width=3)
    elif len(mpts) == 2:
        draw.line(mpts, fill=COL, width=3)

    # Skull Base spline
    base_chain = ["Ba", "S", "N"]
    bpts = [pt(nm) for nm in base_chain if pt(nm)]
    if len(bpts) >= 3:
        _scipy_spline(draw, bpts, fill=COL, width=3)

    ui_a, ui_t = pt("Apex of upper incisor"), pt("Incisal edge of upper incisor")
    if ui_a and ui_t:
        _draw_incisor_upper(draw, ui_a, ui_t, lms, sx, sy, color=COL)
    li_a, li_t = pt("Apex of lower incisor"), pt("Incisal edge of lower incisor")
    if li_a and li_t:
        _draw_incisor_lower(draw, li_a, li_t, lms, sx, sy, color=COL)
    _draw_molar(draw, lms, sx, sy, "upper", color=COL)
    _draw_molar(draw, lms, sx, sy, "lower", color=COL)
    
    # Pharynx
    _draw_pharynx(draw, lms, sx, sy, scale_mm=spacing, font=_try_font(18))


def _draw_reference_planes(draw, lms, sx, sy, alpha=180):
    """Draw and label critical reference planes."""
    REF = (59, 130, 246, alpha) # Blue-500
    font = _try_font(18, bold=True)
    
    def pt(name):
        lm = _lm(lms, name)
        return _scale(lm, sx, sy) if lm else None

    # Frankfort Horizontal (Po-Or)
    po, orb = pt("Po"), pt("Or")
    if po and orb:
        dx, dy = orb[0]-po[0], orb[1]-po[1]
        ln = math.hypot(dx, dy) or 1
        p1 = (po[0] - dx*0.2, po[1] - dy*0.2)
        p2 = (orb[0] + dx*0.8, orb[1] + dy*0.8)
        draw.line([p1, p2], fill=REF, width=2)
        draw.text((p1[0]-60, p1[1]-10), "FH", font=font, fill=REF)

    # Mandibular Plane (Go-Me)
    go, me = pt("Go"), pt("Me")
    if go and me:
        dx, dy = me[0]-go[0], me[1]-go[1]
        ln = math.hypot(dx, dy) or 1
        p1 = (go[0] - dx*0.1, go[1] - dy*0.1)
        p2 = (me[0] + dx*0.4, me[1] + dy*0.4)
        draw.line([p1, p2], fill=REF, width=2)
        draw.text((p2[0]+10, p2[1]), "MP", font=font, fill=REF)


# ─────────────────────────────────────────────
#  Wiggle chart helpers  (matplotlib-powered)
# ─────────────────────────────────────────────
def _wiggle_display_name(m: MeasurementItem) -> str:
    return m.name.strip() if m.name and m.name.strip() else m.code or "?"


def _render_wiggle_matplotlib(
    measurements: list[MeasurementItem],
    width_px: int,
    height_px: int,
    patient_label: str = "",
    date_label: str = "",
    dpi: int = 150,
    show_group_bands: bool = True,
    show_value_triplet: bool = True,
) -> Image.Image:
    """
    Render a full Björk–Skieller wiggle chart using matplotlib.

    Features (v2):
      • Coloured group-band background stripes
      • σ column headers with clinical labels
      • Redline + circular markers, arrowheads for extreme deviations
      • Value triplet column: σ | patient value | norm
      • Compact, professional typography
    """
    if not measurements:
        return Image.new("RGB", (width_px, height_px), C_WHITE)

    n         = len(measurements)
    fig_w     = width_px  / dpi
    fig_h     = height_px / dpi
    fig, ax   = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)
    fig.patch.set_facecolor("white")
    ax.set_facecolor("white")

    # ── Group colour bands ──────────────────────────────────────────────────
    GROUP_PALETTE = [
        "#f0fdf4",   # light green
        "#eff6ff",   # light blue
        "#fff7ed",   # light amber
        "#fdf4ff",   # light purple
        "#f0f9ff",   # sky
    ]
    if show_group_bands:
        current_group = None
        group_idx     = -1
        group_ranges: list[tuple[int, int, str]] = []
        band_start    = 0
        for i, m in enumerate(measurements):
            g = m.group_name or "General"
            if g != current_group:
                if current_group is not None:
                    group_ranges.append((band_start, i-1, current_group))
                current_group = g
                group_idx    += 1
                band_start    = i
        group_ranges.append((band_start, n-1, current_group or "General"))

        for (g_start, g_end, g_name), palette_color in zip(
            group_ranges, GROUP_PALETTE * 4
        ):
            ax.axhspan(g_start - 0.5, g_end + 0.5,
                       facecolor=palette_color, alpha=0.6, zorder=0)
            ax.text(-3.95, (g_start + g_end) / 2, g_name,
                    fontsize=6.5, color="#6b7280", va="center",
                    fontstyle="italic", zorder=1)

    # ── σ values and data ───────────────────────────────────────────────────
    sigmas   = []
    y_pos    = np.arange(n)
    colors   = []
    for m in measurements:
        sd    = m.std_deviation or 1.0
        sig   = m.difference / sd
        sigmas.append(max(-3.5, min(3.5, sig)))
        colors.append(
            "#059669" if m.status == "Normal"
            else "#ea580c" if m.status == "Increased"
            else "#dc2626"
        )

    # ── Grid ────────────────────────────────────────────────────────────────
    ax.set_xlim(-4.2, 4.8)
    ax.set_ylim(-0.5, n - 0.5)
    ax.set_xticks([-3, -2, -1, 0, 1, 2, 3])
    ax.set_xticklabels(["-3σ", "-2σ", "-σ", "m", "+σ", "+2σ", "+3σ"],
                        fontsize=8, color="#059669")
    for sv in [-3, -2, -1, 0, 1, 2, 3]:
        lw  = 1.5 if sv == 0 else 0.6
        ls  = "-" if sv == 0 else "--"
        alp = 0.5 if sv == 0 else 0.25
        ax.axvline(sv, color="#059669", linewidth=lw, linestyle=ls, alpha=alp, zorder=1)

    # ── Red polyline ────────────────────────────────────────────────────────
    ax.plot(sigmas, y_pos, color="#dc2626", linewidth=2.2,
            zorder=3, solid_capstyle="round", solid_joinstyle="round")

    # ── Markers ─────────────────────────────────────────────────────────────
    for i, (sig, col) in enumerate(zip(sigmas, colors)):
        ax.plot(sig, i, "o", markersize=7, color=col,
                markeredgecolor="white", markeredgewidth=1.0, zorder=4)
        if abs(sig) >= 3.3:
            direction = 1 if sig > 0 else -1
            ax.annotate("", xy=(sig + direction*0.3, i),
                         xytext=(sig, i),
                         arrowprops=dict(arrowstyle="->", color=col, lw=1.5))

    # ── Row labels ──────────────────────────────────────────────────────────
    ax.set_yticks(y_pos)
    ax.set_yticklabels([_wiggle_display_name(m) for m in measurements],
                        fontsize=8.5, color="#059669", fontweight="bold")
    ax.invert_yaxis()

    # ── Value triplet panel ──────────────────────────────────────────────────
    if show_value_triplet:
        for i, m in enumerate(measurements):
            sd    = m.std_deviation or 1.0
            sig_i = int(round(max(-3.0, min(3.0, m.difference / sd))))
            txt   = f"{sig_i:+d}  {m.value:.1f}  {m.normal_value:.1f}"
            icon  = STATUS_ICON.get(m.status, "")
            col   = colors[i]
            ax.text(3.65, i, f"{icon} {txt}", fontsize=7.5, va="center",
                    color=col, fontweight="bold", zorder=4)

    # ── Column header ────────────────────────────────────────────────────────
    ax.text(0, -0.85, "Standard Deviation from Norm",
            fontsize=9, color="#059669", ha="center", fontweight="bold")

    # ── Patient / date header ─────────────────────────────────────────────────
    title_parts = ["Björk–Skieller Wiggle Analysis"]
    if patient_label:
        title_parts.append(f"Patient: {patient_label}")
    if date_label:
        title_parts.append(f"Date: {date_label}")
    ax.set_title("\n".join(title_parts), fontsize=10, color="#059669",
                 fontweight="bold", pad=8)

    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(axis="both", which="both", length=0)

    plt.tight_layout(pad=0.6)

    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor="white", edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf).convert("RGB").resize((width_px, height_px), Image.LANCZOS)


def _embed_wiggle(canvas: Image.Image, measurements: list[MeasurementItem],
                  rect: tuple[int, int, int, int]) -> Image.Image:
    """
    Render a mini wiggle chart and alpha-paste it into `canvas` at `rect`.
    Returns a new Image (does not mutate the original canvas draw handle).
    """
    if not measurements:
        return canvas

    x1, y1, x2, y2 = rect
    w, h = x2-x1, y2-y1
    chart = _render_wiggle_matplotlib(measurements, w, h, dpi=96,
                                       show_group_bands=False,
                                       show_value_triplet=False)
    # Semi-transparent background panel
    panel = Image.new("RGBA", (w+8, h+8), (255, 255, 255, 200))
    result = canvas.copy().convert("RGBA")
    result.alpha_composite(panel, (x1-4, y1-4))
    result.paste(chart.convert("RGBA"), (x1, y1),
                 mask=chart.convert("RGBA").split()[3])
    return result.convert("RGB")


# ─────────────────────────────────────────────
#  Wiggle deviation bar (table column)
# ─────────────────────────────────────────────
def _draw_wiggle_bar(draw, msr, mid_y, x_start, x_end):
    color    = _msr_color(msr)
    bar_w    = x_end - x_start
    tick_step = bar_w / 6
    tick_h   = 10
    for i in range(7):
        tx = int(x_start + i * tick_step)
        th = tick_h if i in (0, 3, 6) else tick_h - 4
        draw.line([(tx, mid_y-th), (tx, mid_y+th)], fill=color, width=2)
    draw.line([(x_start, mid_y), (x_end, mid_y)], fill=color, width=1)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 1 – X-ray with full tracing + analysis lines
# ════════════════════════════════════════════════════════════════════════════
def render_xray_with_tracing(req: OverlayRequest,
                              canvas_w: int = 1600,
                              canvas_h: int = 1280) -> bytes:
    """
    X-ray + anatomical tracing (green) + Steiner skeleton (purple)
    + confidence-aware landmark dots + abbreviated landmark labels.
    """
    base_img = Image.open(io.BytesIO(req.image_bytes)).convert("RGB")
    
    # 1. Apply CLAHE Pre-processing to boost X-ray visibility
    base_img = _apply_clahe_to_pil(base_img)
    
    orig_w, orig_h = base_img.size
    base_img = base_img.resize((canvas_w, canvas_h), Image.LANCZOS)
    sx, sy   = canvas_w / orig_w, canvas_h / orig_h

    overlay = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)
    lms     = req.landmarks

    method = (req.analysis_method or "Full").lower()
    if method in ("steiner", "full"):
        _draw_steiner_lines(draw, lms, sx, sy)
    if method in ("mcnamara", "full"):
        _draw_mcnamara_lines(draw, lms, sx, sy)
    if method in ("tweed", "full"):
        _draw_tweed_lines(draw, lms, sx, sy)

    _draw_anatomical_outlines(draw, lms, sx, sy, req=req)
    _draw_reference_planes(draw, lms, sx, sy)
    _draw_soft_tissue(draw, lms, sx, sy)
    _draw_landmark_dots(overlay, lms, sx, sy)
    _draw_landmark_labels(draw, lms, sx, sy, font_size=18, dark_bg=True)

    result = Image.alpha_composite(base_img.convert("RGBA"), overlay).convert("RGB")

    # Embed mini wiggle chart (top-right)
    if req.measurements:
        result = _embed_wiggle(result, req.measurements,
                               (canvas_w-290, 20, canvas_w-20, 320))

    draw_f = ImageDraw.Draw(result)
    font_sm = _try_font(24)
    if req.patient_label:
        draw_f.text((20, 20), req.patient_label, font=font_sm, fill=C_WHITE)
    if req.date_label:
        draw_f.text((20, 52), req.date_label, font=font_sm, fill=(220, 220, 220))

    # Legend — analysis line colours
    _draw_line_legend(draw_f, result.width, result.height, method)
    _draw_scale_bar(draw_f, canvas_w, canvas_h, req, sx, font_sm, bg_dark=True)
    _draw_clinical_watermark(draw_f, canvas_w, canvas_h)

    return _to_jpeg(result)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 2 – X-ray with measurement value annotations
# ════════════════════════════════════════════════════════════════════════════
def render_xray_with_measurements(req: OverlayRequest,
                                   canvas_w: int = 1600,
                                   canvas_h: int = 1280) -> bytes:
    """
    X-ray + anatomical tracing + color-coded measurement labels.
    """
    base_img = Image.open(io.BytesIO(req.image_bytes)).convert("RGB")
    base_img = _apply_clahe_to_pil(base_img)
    orig_w, orig_h = base_img.size
    base_img = base_img.resize((canvas_w, canvas_h), Image.LANCZOS)
    sx, sy   = canvas_w / orig_w, canvas_h / orig_h

    overlay = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)
    lms     = req.landmarks

    _draw_anatomical_outlines(draw, lms, sx, sy, req=req, color=C_BLACK)
    _draw_steiner_lines(draw, lms, sx, sy)
    _draw_soft_tissue(draw, lms, sx, sy, alpha=230, color=(*SOFT_TISSUE_TRACE, 230))
    _draw_landmark_dots(overlay, lms, sx, sy)
    _draw_landmark_labels(draw, lms, sx, sy, font_size=16, dark_bg=True)

    # Measurement annotations
    font_val = _try_font(30, bold=True)
    font_hdr = _try_font(28)
    msr_map  = {m.code: m for m in req.measurements}

    REF_COLORS = {
        "SNA": C_GREEN, "ANB": C_BLUE, "SNB": C_ORANGE,
        "SN_MP": C_ORANGE, "FMA": C_ORANGE,
        "UI_SN": C_GREEN, "UI_NA_MM": C_GREEN,
        "LI_NB_MM": C_RED, "LI_MP": C_RED,
        "OVERJET": C_GREEN, "OVERBITE": C_GREEN,
        "LS_ELINE": C_ORANGE, "LI_ELINE": C_RED,
    }

    def pt(name):
        lm = _lm(lms, name)
        return _scale(lm, sx, sy) if lm else None

    def label_at(pos, code, offset=(0, 0), unit_str=None):
        if pos is None:
            return
        m   = msr_map.get(code)
        val = m.value if m else None
        if val is None:
            return
        col = _msr_color_ref(m, REF_COLORS.get(code, C_GREEN)) if m else C_GREEN
        ut  = unit_str or (m.unit if m else "°")
        txt = f"{code}: {val:.1f}{ut}"
        x   = int(pos[0] + offset[0] * sx)
        y   = int(pos[1] + offset[1] * sy)
        _draw_label_with_bg(draw, txt, (x, y), (*col, 255), font_val)

    nasion = pt("Nasion")
    go_pt  = pt("Constructed Gonion (tangent)")
    por    = pt("Porion")
    soft_pog = pt("Point Soft Pogonion")

    if nasion:
        for code, off in [("SNA",(-120,-140)),("SNB",(-120,-100)),("ANB",(-120,-60))]:
            label_at(nasion, code, offset=off)

    ui_tip = pt("Incisal edge of upper incisor")
    if ui_tip:
        label_at(ui_tip, "UI_SN",   offset=(-280,-60))
        label_at(ui_tip, "UI_NA_MM",offset=(40,-80))

    if go_pt:
        label_at(go_pt, "SN_MP", offset=(-180, 20))
    if por:
        label_at(por, "FMA", offset=(-180, 60))

    li_tip = pt("Incisal edge of lower incisor")
    if li_tip:
        label_at(li_tip, "LI_NB_MM", offset=(30, 60))
        label_at(li_tip, "LI_MP",    offset=(30,100))

    if soft_pog:
        label_at(soft_pog, "LS_ELINE", offset=(20,-60))
        label_at(soft_pog, "LI_ELINE", offset=(20,-20))

    result = Image.alpha_composite(base_img.convert("RGBA"), overlay).convert("RGB")

    # Embed mini wiggle chart — fixed: uses _embed_wiggle not stale draw handle
    if req.measurements:
        result = _embed_wiggle(result, req.measurements,
                               (canvas_w-290, 20, canvas_w-20, 320))

    draw_f = ImageDraw.Draw(result)
    if req.patient_label:
        draw_f.text((20, 20), req.patient_label, font=font_hdr, fill=C_WHITE)
    if req.date_label:
        draw_f.text((20, 54), req.date_label, font=font_hdr, fill=(220, 220, 220))

    _draw_scale_bar(draw_f, canvas_w, canvas_h, req, sx, font_hdr, bg_dark=True)
    _draw_clinical_watermark(draw_f, canvas_w, canvas_h)

    return _to_jpeg(result)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 3 – Standalone wiggle chart (Björk–Skieller style)
# ════════════════════════════════════════════════════════════════════════════
def render_wiggle_chart(req: OverlayRequest,
                        canvas_w: int = 1200,
                        canvas_h: int = 1600) -> bytes:
    """
    Full-page Björk–Skieller deviation chart (matplotlib-powered, v2):
      • Group-coloured background bands
      • Value triplet column (σ / patient value / norm)
      • Arrowheads for extreme (> 3σ) deviations
    """
    img = _render_wiggle_matplotlib(
        req.measurements, canvas_w, canvas_h,
        patient_label=req.patient_label or "",
        date_label=req.date_label or "",
        dpi=150,
        show_group_bands=True,
        show_value_triplet=True,
    )
    return _to_jpeg(img)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 4 – Pure anatomical tracing on white background
# ════════════════════════════════════════════════════════════════════════════
def render_tracing_only(req: OverlayRequest,
                        canvas_w: int = 1600,
                        canvas_h: int = 1280) -> bytes:
    """
    White canvas with:
      • Anatomical outlines (black)
      • Soft-tissue profile (dark red)
      • Analysis lines (purple)
      • Confidence-aware landmark dots + labels
      • Color-coded measurement annotations
    """
    orig_img = Image.open(io.BytesIO(req.image_bytes)).convert("RGB")
    orig_img = _apply_clahe_to_pil(orig_img)
    orig_w, orig_h = orig_img.size
    sx, sy = canvas_w / orig_w, canvas_h / orig_h

    img  = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)
    lms  = req.landmarks

    method = (req.analysis_method or "Full").lower()
    if method in ("steiner", "full"):
        _draw_steiner_lines(draw, lms, sx, sy, alpha=255)
    if method in ("mcnamara", "full"):
        _draw_mcnamara_lines(draw, lms, sx, sy)
    if method in ("tweed", "full"):
        _draw_tweed_lines(draw, lms, sx, sy)

    _draw_anatomical_outlines(draw, lms, sx, sy, req=req, color=C_BLACK)
    _draw_reference_planes(draw, lms, sx, sy)
    _draw_soft_tissue(draw, lms, sx, sy, alpha=255, color=(*SOFT_TISSUE_TRACE, 255))
    _draw_landmark_dots(img, lms, sx, sy)
    _draw_landmark_labels(draw, lms, sx, sy, font_size=18, dark_bg=False)

    # Measurement labels
    font_val = _try_font(26, bold=True)
    msr_map  = {m.code: m for m in req.measurements}
    POSITIONS = [
        ("SNA",      "Nasion",                          (-130,-150)),
        ("SNB",      "Nasion",                          (-130,-110)),
        ("ANB",      "Nasion",                          (-130, -70)),
        ("UI_SN",    "Incisal edge of upper incisor",   (-280, -60)),
        ("SN_MP",    "Constructed Gonion (tangent)",    (-200,  20)),
        ("FMA",      "Constructed Gonion (tangent)",    (-200,  60)),
        ("LI_NB_MM", "Incisal edge of lower incisor",   ( 30,  60)),
        ("LI_MP",    "Incisal edge of lower incisor",   ( 30, 100)),
    ]
    for code, anchor_name, offset in POSITIONS:
        anch = _lm(lms, anchor_name)
        m    = msr_map.get(code)
        if anch is None or m is None:
            continue
        ax_, ay_ = _scale(anch, sx, sy)
        col      = _msr_color(m)
        pos      = (int(ax_+offset[0]*sx), int(ay_+offset[1]*sy))
        _draw_label_with_bg(draw, f"{code}: {m.value:.1f}{m.unit}", pos,
                            (*col, 255), font_val, pad=3)

    result = img.convert("RGB")

    # Embedded mini wiggle (top-right)
    if req.measurements:
        result = _embed_wiggle(result, req.measurements,
                               (canvas_w-290, 20, canvas_w-20, 320))

    draw_f  = ImageDraw.Draw(result)
    font_hdr = _try_font(28)
    if req.patient_label:
        draw_f.text((20, 20), req.patient_label, font=font_hdr, fill=C_BLACK)
    if req.date_label:
        draw_f.text((20, 54), req.date_label, font=font_hdr, fill=(80, 80, 80))

    _draw_line_legend(draw_f, canvas_w, canvas_h, method, dark_bg=False)
    _draw_scale_bar(draw_f, canvas_w, canvas_h, req, sx, font_hdr, bg_dark=False)
    _draw_clinical_watermark(draw_f, canvas_w, canvas_h)

    return _to_jpeg(result)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 5 – Measurement table
# ════════════════════════════════════════════════════════════════════════════
def render_measurement_table(req: OverlayRequest,
                              canvas_w: int = 1200,
                              row_h: int = 50) -> bytes:
    """
    Professional tabular measurement summary (v2):
      • Group headers with coloured background bands
      • Alternating zebra row tinting
      • Status icons (✓ / ↑ / ↓ / ⚠)
      • Column separators
      • Summary footer: total / normal / abnormal counts
    """
    measurements = req.measurements
    groups: dict[str, list[MeasurementItem]] = {}
    for m in measurements:
        groups.setdefault(m.group_name or "General", []).append(m)

    total_rows  = len(measurements) + len(groups)
    HEADER_ROWS = 2       # title + column headers
    FOOTER_ROWS = 3
    canvas_h    = (total_rows + HEADER_ROWS + FOOTER_ROWS + 1) * row_h + 40

    img  = Image.new("RGB", (canvas_w, canvas_h), C_WHITE)
    draw = ImageDraw.Draw(img)

    font_title = _try_font(36, bold=True)
    font_grp   = _try_font(28, bold=True)
    font_hdr   = _try_font(26, bold=True)
    font_row   = _try_font(24)
    font_val   = _try_font(24, bold=True)
    font_icon  = _try_font(22)

    # Column layout
    COL_ICON  = (10,   36)
    COL_NAME  = (40,  380)
    COL_UNIT  = (384, 444)
    COL_VAL   = (448, 540)
    COL_NORM  = (544, 638)
    COL_DIFF  = (642, 738)
    COL_WIG   = (742, canvas_w-10)

    GROUP_BAND_COLORS = [
        (240, 253, 244),   # light green
        (239, 246, 255),   # light blue
        (255, 247, 237),   # light amber
        (253, 244, 255),   # light purple
    ]

    # Title
    y = 12
    draw.text((canvas_w//2 - 260, y),
              "Cephalometric Analysis — Measurement Report",
              font=font_title, fill=(*C_GREEN, 255))
    y += row_h + 6

    # Column headers
    draw.rectangle([0, y-4, canvas_w, y+row_h], fill=(240, 240, 240))
    for txt, col_range in [
        ("", COL_ICON), ("Measurement Name", COL_NAME),
        ("Unit", COL_UNIT), ("Value", COL_VAL),
        ("Norm", COL_NORM), ("Diff", COL_DIFF), ("Deviation", COL_WIG),
    ]:
        draw.text((col_range[0], y+6), txt, font=font_hdr, fill=C_BLACK)
    # Vertical column separators
    for cx in [COL_UNIT[0]-4, COL_VAL[0]-4, COL_NORM[0]-4,
               COL_DIFF[0]-4, COL_WIG[0]-4]:
        draw.line([(cx, y-4), (cx, y+row_h)], fill=(180, 180, 180), width=1)
    y += row_h

    normal_count   = 0
    abnormal_count = 0

    for g_idx, (group_name, group_msrs) in enumerate(groups.items()):
        # Group header bar
        band_col = GROUP_BAND_COLORS[g_idx % len(GROUP_BAND_COLORS)]
        draw.rectangle([0, y, canvas_w, y+row_h-2], fill=(*band_col,))
        draw.text((canvas_w//2 - 120, y+6), group_name,
                  font=font_grp, fill=(*C_GREEN,))
        y += row_h

        for row_idx, msr in enumerate(group_msrs):
            # Zebra row
            if row_idx % 2 == 0:
                draw.rectangle([0, y, canvas_w, y+row_h-1],
                               fill=(252, 252, 252))

            mid_y   = y + row_h // 2 - 6
            color   = _msr_color(msr)
            icon    = STATUS_ICON.get(msr.status, "?")
            is_norm = msr.status == "Normal"
            if is_norm:
                normal_count   += 1
            else:
                abnormal_count += 1

            # Status icon
            draw.text((COL_ICON[0], y+8), icon, font=font_icon, fill=color)
            # Name
            name_txt = msr.name[:32] if len(msr.name) > 32 else msr.name
            draw.text((COL_NAME[0], y+8), name_txt, font=font_row, fill=C_BLACK)
            # Unit
            draw.text((COL_UNIT[0], y+8), f"[{msr.unit}]", font=font_row, fill=(100,100,100))
            # Value (colour-coded)
            draw.text((COL_VAL[0], y+8), f"{msr.value:.1f}", font=font_val, fill=color)
            # Normal
            draw.text((COL_NORM[0], y+8), f"{msr.normal_value:.1f}", font=font_row, fill=C_BLACK)
            # Difference
            sign = "+" if msr.difference > 0 else ""
            draw.text((COL_DIFF[0], y+8), f"{sign}{msr.difference:.1f}",
                      font=font_val, fill=color)
            # Wiggle deviation bar
            _draw_wiggle_bar(draw, msr, mid_y + 10, COL_WIG[0], COL_WIG[1])

            # Column separators
            for cx in [COL_UNIT[0]-4, COL_VAL[0]-4, COL_NORM[0]-4,
                       COL_DIFF[0]-4, COL_WIG[0]-4]:
                draw.line([(cx, y), (cx, y+row_h-1)],
                          fill=(210, 210, 210), width=1)
            # Row bottom border
            draw.line([(0, y+row_h-1), (canvas_w, y+row_h-1)],
                      fill=(220, 220, 220), width=1)
            y += row_h

    # Wiggle polyline across all rows (right-panel connecting dots)
    row_ys    = []
    row_msrs  = []
    y_scan    = (HEADER_ROWS) * row_h + 12
    for group_name, group_msrs in groups.items():
        y_scan += row_h   # group header
        for msr in group_msrs:
            row_ys.append(y_scan + row_h // 2)
            row_msrs.append(msr)
            y_scan += row_h

    WIG_CX = COL_WIG[0] + (COL_WIG[1]-COL_WIG[0]) // 2
    WIG_W  = COL_WIG[1] - COL_WIG[0]
    if row_ys:
        pts = []
        for ry, msr in zip(row_ys, row_msrs):
            sd  = msr.std_deviation or 1.0
            dev = max(-3.0, min(3.0, msr.difference / sd))
            pts.append((int(WIG_CX + dev*(WIG_W/2/3)), int(ry)))
        for i in range(len(pts)-1):
            draw.line([pts[i], pts[i+1]], fill=C_RED, width=3)
        for (px, py), msr in zip(pts, row_msrs):
            sd  = msr.std_deviation or 1.0
            dev = abs(msr.difference / sd)
            if dev >= 2.8:
                _arrowhead(draw, (px, py), (WIG_CX, py), C_RED, head_len=14)
            else:
                r = 7
                draw.ellipse([px-r, py-r, px+r, py+r], fill=C_RED,
                             outline=C_WHITE, width=1)

    # Footer summary
    y += 20
    draw.line([(20, y), (canvas_w-20, y)], fill=(200, 200, 200), width=2)
    y += 14
    total = normal_count + abnormal_count
    font_footer = _try_font(26)
    summary = (
        f"Total measurements: {total}   |   "
        f"Normal: {normal_count} ({int(normal_count/total*100) if total else 0}%)   |   "
        f"Abnormal: {abnormal_count} ({int(abnormal_count/total*100) if total else 0}%)"
    )
    draw.text((20, y), summary, font=font_footer, fill=(80, 80, 80))
    y += row_h

    # Legend
    for txt, col in [("✓ Normal", C_GREEN),("↑ Increased",C_ORANGE),("↓ Decreased",C_RED)]:
        draw.text((20, y), txt, font=font_footer, fill=col)
        y += row_h - 10

    if req.patient_label:
        draw.text((canvas_w-420, canvas_h-36),
                  f"Patient: {req.patient_label}", font=font_footer, fill=(120,120,120))

    return _to_jpeg(img)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 6 – A4 Clinical Report (new in v2)
# ════════════════════════════════════════════════════════════════════════════
def render_ceph_report(req: OverlayRequest,
                       canvas_w: int = 2480,
                       canvas_h: int = 3508) -> bytes:
    """
    A4-portrait clinical summary page at 300 dpi combining:
      • Clinical header (patient / date / analysis method)
      • Left panel: anatomical tracing thumbnail
      • Right panel: Björk–Skieller wiggle chart
      • Bottom panel: measurement table (abbreviated)

    All sub-renders are scaled to fit their panel, then composited.
    """
    report = Image.new("RGB", (canvas_w, canvas_h), C_WHITE)
    draw   = ImageDraw.Draw(report)

    # ── Header ────────────────────────────────────────────────────────────────
    header_h = 200
    draw.rectangle([0, 0, canvas_w, header_h], fill=(22, 163, 74))
    font_h1  = _try_font(64, bold=True)
    font_h2  = _try_font(36)
    draw.text((60, 28),  "Cephalometric Analysis Report", font=font_h1, fill=C_WHITE)
    draw.text((60, 110), f"Patient: {req.patient_label or 'N/A'}  |  "
                          f"Date: {req.date_label or 'N/A'}  |  "
                          f"Analysis: {req.analysis_method or 'Steiner'}",
              font=font_h2, fill=(220, 255, 220))

    # ── Sub-render dimensions ─────────────────────────────────────────────────
    panel_top  = header_h + 40
    mid_h      = 1400
    tracing_w  = int(canvas_w * 0.55)
    wiggle_w   = canvas_w - tracing_w - 40
    table_top  = panel_top + mid_h + 40

    # ── Panel 1: Tracing thumbnail ────────────────────────────────────────────
    tracing_bytes = render_tracing_only(req, canvas_w=tracing_w, canvas_h=mid_h)
    tracing_img   = Image.open(io.BytesIO(tracing_bytes)).convert("RGB")
    report.paste(tracing_img, (20, panel_top))

    # ── Panel 2: Wiggle chart ─────────────────────────────────────────────────
    wiggle_bytes  = render_wiggle_chart(req, canvas_w=wiggle_w, canvas_h=mid_h)
    wiggle_img    = Image.open(io.BytesIO(wiggle_bytes)).convert("RGB")
    report.paste(wiggle_img, (tracing_w + 20, panel_top))

    # ── Divider ───────────────────────────────────────────────────────────────
    draw.line([(20, table_top-20), (canvas_w-20, table_top-20)],
              fill=(200, 200, 200), width=3)

    # ── Panel 3: Measurement table ────────────────────────────────────────────
    table_h_avail = canvas_h - table_top - 60
    table_bytes   = render_measurement_table(req, canvas_w=canvas_w, row_h=44)
    table_img     = Image.open(io.BytesIO(table_bytes)).convert("RGB")
    tw, th        = table_img.size
    scale_factor  = min(canvas_w / tw, table_h_avail / th)
    new_tw        = int(tw * scale_factor)
    new_th        = int(th * scale_factor)
    table_img     = table_img.resize((new_tw, new_th), Image.LANCZOS)
    report.paste(table_img, ((canvas_w - new_tw)//2, table_top))

    # ── Footer ────────────────────────────────────────────────────────────────
    font_f = _try_font(28)
    draw.text((60, canvas_h-52),
              "Generated by CephAnalysis AI Service  |  For clinical use only.",
              font=font_f, fill=(160, 160, 160))

    return _to_jpeg(report)


# ════════════════════════════════════════════════════════════════════════════
#  Convenience: render ALL outputs at once
# ════════════════════════════════════════════════════════════════════════════
def render_all(req: OverlayRequest) -> dict[str, bytes]:
    results: dict[str, bytes] = {}
    for key, fn in [
        ("xray_tracing",      render_xray_with_tracing),
        ("xray_measurements", render_xray_with_measurements),
        ("wiggle_chart",      render_wiggle_chart),
        ("tracing_only",      render_tracing_only),
        ("measurement_table", render_measurement_table),
        ("ceph_report",       render_ceph_report),
    ]:
        try:
            results[key] = fn(req)
        except Exception as e:
            logger.warning(f"render_all: {key} failed: {e}")
    return results


# ─────────────────────────────────────────────
#  Line-colour legend helper  (v2 — new)
# ─────────────────────────────────────────────
def _draw_line_legend(draw, canvas_w, canvas_h,
                       method: str, dark_bg: bool = True):
    """
    Draw a small legend box listing tracing-line colour meanings.
    Positioned in the bottom-left corner.
    """
    items = [("Anatomy", (*ANAT_COLOR,))]
    if method in ("steiner", "full"):
        items.append(("Steiner Analysis", SKELETAL_COLOR))
    if method in ("mcnamara", "full"):
        items.append(("McNamara Analysis", C_BLUE))
    if method in ("tweed", "full"):
        items.append(("Tweed Triangle", C_ORANGE))
    items.append(("Soft Tissue",      SOFT_TISSUE_TRACE))

    font   = _try_font(18)
    line_h = 26
    box_h  = len(items) * line_h + 16
    box_w  = 260
    bx     = 16
    by     = canvas_h - box_h - 46

    # Background
    bg_fill = (0, 0, 0, 140) if dark_bg else (255, 255, 255, 200)
    draw.rectangle([bx, by, bx+box_w, by+box_h], fill=bg_fill, outline=(80,80,80,200), width=1)

    for i, (label, col) in enumerate(items):
        ly = by + 8 + i * line_h
        draw.rectangle([bx+8, ly+6, bx+30, ly+18], fill=(*col, 255))
        txt_col = C_WHITE if dark_bg else C_BLACK
        draw.text((bx+38, ly+2), label, font=font, fill=txt_col)
