"""
overlay_engine.py
=================
Generates cephalometric image overlays matching the PointNix reference style:

  Output 1 – X-ray + full anatomical tracing + Steiner lines (green anatomy, purple analysis)
  Output 2 – X-ray + measurement value annotations (colored by deviation)
  Output 3 – Wiggle chart (deviation‐from‐norm polygon, white background)
  Output 4 – Pure tracing on white background + measurement annotations
  Output 5 – Measurement table with Wiggle deviation bars

Libraries used: Pillow (PIL), NumPy, io — zero extra dependencies beyond what is
already in requirements.txt.
"""

from __future__ import annotations

import io
import math
import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw, ImageFont

# Set matplotlib to non-interactive mode
import matplotlib
matplotlib.use('Agg')

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
#  Colour palette (matches PointNix reference)
# ─────────────────────────────────────────────
C_GREEN   = (5, 150, 105)            # #059669 (Normal severity)
C_ORANGE  = (234, 88, 12)            # #ea580c (Increased severity)
C_RED     = (220, 38, 38)            # #dc2626 (Decreased/Severe severity)
C_BLUE    = (37, 99, 235)            # #2563eb (ANB reference)

ANAT_COLOR = (22, 163, 74)           # #16a34a (Clinical Green for Anatomy/Profile)
SKELETAL_COLOR = (147, 51, 234)      # #9333ea (Purple for Steiner lines)
DENTAL_COLOR = (75, 85, 99)          # #4b5563 (Slate for Teeth)
C_TRACING = (0, 0, 0)                # #000000 (Black for Pure Tracing Anatomy)

C_WHITE   = (255, 255, 255)
C_BLACK   = (0,   0,   0)
C_GRID    = (5, 150, 105)            # #059669 (Green for Wiggle grid)

# Status → colour mapping used in annotation overlays
STATUS_COLOR = {
    "Normal":    C_GREEN,
    "Increased": C_ORANGE,
    "Decreased": C_RED,
    "Severe":    C_RED,
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
    unit: str                    # "°" | "mm"
    normal_value: float
    std_deviation: float
    difference: float
    group_name: str = ""
    status: str = "Normal"       # Normal | Increased | Decreased | Severe


@dataclass
class OverlayRequest:
    """
    Single DTO that drives *all* overlay renders.
    All coordinate values are in the image's pixel space.
    """
    image_bytes: bytes                                   # original JPEG/PNG bytes
    landmarks: dict[str, LandmarkPoint]                  # name → point
    measurements: list[MeasurementItem] = field(default_factory=list)
    patient_label: str = ""
    date_label: str = ""
    scale_bar_mm: Optional[float] = 40.0                 # length of reference scale bar in mm
    pixel_spacing_mm: Optional[float] = None             # mm per pixel
    analysis_method: Optional[str] = "Steiner"          # Steiner | McNamara | Tweed | Full


# ─────────────────────────────────────────────
#  Font helpers
# ─────────────────────────────────────────────
def _try_font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """
    Try a series of common font paths; fall back to PIL built-in.
    """
    candidates = [
        "arial.ttf", "Arial.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


# ─────────────────────────────────────────────
#  Helper: scale coordinates to canvas
# ─────────────────────────────────────────────
def _scale(pt: LandmarkPoint, sx: float, sy: float) -> tuple[float, float]:
    return pt.x * sx, pt.y * sy


# ─────────────────────────────────────────────
#  Helper: measurement status colour
# ─────────────────────────────────────────────
def _msr_color(msr: MeasurementItem) -> tuple[int, int, int]:
    if msr.status in STATUS_COLOR and msr.status != "Normal":
        return STATUS_COLOR[msr.status]
    elif msr.status == "Normal":
        return C_GREEN

    # Fallback if status not provided
    diff = msr.difference
    sd   = msr.std_deviation if msr.std_deviation else 1.0
    deviations = abs(diff) / sd
    if deviations < 1.0:
        return C_GREEN
    if deviations < 2.0:
        return C_ORANGE
    return C_RED


# ─────────────────────────────────────────────
#  Helper: draw a double-headed or single arrow
# ─────────────────────────────────────────────
def _arrowhead(draw: ImageDraw.ImageDraw, tip: tuple, tail: tuple,
               color: tuple, width: int = 2, head_len: int = 10):
    """Draw a small arrowhead at `tip` pointing away from `tail`."""
    dx = tip[0] - tail[0]
    dy = tip[1] - tail[1]
    length = math.hypot(dx, dy)
    if length == 0:
        return
    ux, uy = dx / length, dy / length
    # two wing points
    px, py = -uy, ux
    w = head_len * 0.4
    p1 = (tip[0] - ux * head_len + px * w,
          tip[1] - uy * head_len + py * w)
    p2 = (tip[0] - ux * head_len - px * w,
          tip[1] - uy * head_len - py * w)
    draw.polygon([tip, p1, p2], fill=color)


# ─────────────────────────────────────────────
#  Helpers: Splines and Curves
# ─────────────────────────────────────────────
def _cubic_bezier_pts(p0, p1, p2, p3, steps=12):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        w0, w1, w2, w3 = u**3, 3 * u**2 * t, 3 * u * t**2, t**3
        x = w0*p0[0] + w1*p1[0] + w2*p2[0] + w3*p3[0]
        y = w0*p0[1] + w1*p1[1] + w2*p2[1] + w3*p3[1]
        pts.append((x, y))
    return pts

def _cardinal_spline(draw: ImageDraw.ImageDraw, pts: list[tuple[float, float]], fill: tuple, width: int = 2, tension: float = 0.4, steps: int = 15):
    if len(pts) < 2:
        return
    if len(pts) == 2:
        draw.line(pts, fill=fill, width=width)
        return

    curve_points = []
    extended_pts = [pts[0]] + pts + [pts[-1]]
    
    for i in range(1, len(extended_pts) - 2):
        p0, p1, p2, p3 = extended_pts[i - 1], extended_pts[i], extended_pts[i + 1], extended_pts[i + 2]

        for t in range(steps):
            s = t / steps
            s2, s3 = s * s, s * s * s

            b1 = 2*s3 - 3*s2 + 1
            b2 = -2*s3 + 3*s2
            b3 = s3 - 2*s2 + s
            b4 = s3 - s2

            t1x = tension * (p2[0] - p0[0])
            t1y = tension * (p2[1] - p0[1])
            t2x = tension * (p3[0] - p1[0])
            t2y = tension * (p3[1] - p1[1])

            x = b1*p1[0] + b2*p2[0] + b3*t1x + b4*t2x
            y = b1*p1[1] + b2*p2[1] + b3*t1y + b4*t2y
            curve_points.append((x, y))

    curve_points.append(pts[-1])
    draw.line(curve_points, fill=fill, width=width, joint="curve")


def _draw_label_with_box(draw: ImageDraw.ImageDraw, text: str, pos: tuple, color: tuple, font: ImageFont.ImageFont):
    """Draw text with a semi-transparent background rectangle for legibility."""
    bbox = draw.textbbox(pos, text, font=font)
    pad = 4
    rect = [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad]
    # Draw background box (black with 60% opacity)
    draw.rectangle(rect, fill=(0, 0, 0, 150))
    # Draw text
    draw.text(pos, text, font=font, fill=color)


def _render_wiggle_to_image(measurements: list[MeasurementItem], width: int, height: int, dpi: int = 100, show_labels: bool = False) -> Image.Image:
    """
    Renders a professional Björk-Skieller wiggle chart using matplotlib.
    Returns a PIL Image with transparency.
    """
    if not measurements:
        return Image.new("RGBA", (width, height), (0, 0, 0, 0))

    # Calculate figure size based on pixel dimensions and DPI
    fig_w, fig_h = width / dpi, height / dpi
    fig, ax = plt.subplots(figsize=(fig_w, fig_h), dpi=dpi)
    fig.patch.set_alpha(0.0)  # Transparent figure background
    ax.patch.set_alpha(0.0)   # Transparent axis background

    # Extract data
    names = [m.code for m in measurements]
    # Normalize differences to sigma units (-3 to +3)
    sigmas = []
    for m in measurements:
        sd = m.std_deviation if m.std_deviation else 2.0
        val = m.difference / sd
        sigmas.append(max(-3.5, min(3.5, val)))

    y_pos = np.arange(len(measurements))

    # Grid and Axes
    ax.set_xlim(-4, 4)
    ax.set_ylim(-0.5, len(measurements) - 0.5)
    ax.set_xticks([-3, -2, -1, 0, 1, 2, 3])
    
    # Grid styling
    ax.grid(True, axis='x', color='#059669', linestyle='-', alpha=0.3, linewidth=1)
    ax.axvline(0, color='#059669', linewidth=1.5, alpha=0.6)  # Median line
    
    # Plot wiggle line
    ax.plot(sigmas, y_pos, color='#dc2626', linewidth=2.5, marker='o', markersize=6, markerfacecolor='#dc2626', markeredgecolor='white')
    
    # Add arrowheads for extreme deviations
    for i, s in enumerate(sigmas):
        if abs(s) >= 3.4:
            direction = 1 if s > 0 else -1
            ax.annotate('', xy=(s, i), xytext=(s - direction*0.5, i),
                        arrowprops=dict(arrowstyle='->', color='#dc2626', lw=2))

    # Labels
    if show_labels:
        ax.set_yticks(y_pos)
        ax.set_yticklabels(names, fontsize=9, color='#16a34a', fontweight='bold')
        ax.set_xticklabels(['-3σ', '-2σ', '-σ', 'm', 'σ', '2σ', '3σ'], fontsize=8, color='#059669')
    else:
        ax.set_yticks([])
        ax.set_xticks([-3, -2, -1, 0, 1, 2, 3])
        ax.set_xticklabels([])

    ax.invert_yaxis()
    
    # Remove spines for a clean "floating" look
    for spine in ax.spines.values():
        spine.set_visible(False)

    plt.tight_layout()

    # Convert to PIL Image
    buf = io.BytesIO()
    plt.savefig(buf, format='png', transparent=True, bbox_inches='tight', pad_inches=0.05)
    plt.close(fig)
    buf.seek(0)
    return Image.open(buf).convert("RGBA").resize((width, height), Image.LANCZOS)


def _draw_mini_wiggle_chart(draw: ImageDraw.ImageDraw, measurements: list[MeasurementItem], rect: tuple, canvas: Image.Image):
    """
    Embeds a small wiggle chart (Björk-Skieller style) within a larger image.
    rect = (x1, y1, x2, y2)
    """
    if not measurements:
        return
        
    x1, y1, x2, y2 = rect
    w, h = x2 - x1, y2 - y1
    
    # Background: Glassmorphism effect (semi-transparent white)
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d_ov = ImageDraw.Draw(overlay)
    d_ov.rectangle(rect, fill=(255, 255, 255, 140), outline=(5, 150, 105, 180), width=1)
    canvas.alpha_composite(overlay)
    
    # Render and paste matplotlib chart
    chart_img = _render_wiggle_to_image(measurements, w - 10, h - 10, show_labels=False)
    canvas.paste(chart_img, (x1 + 5, y1 + 5), chart_img)


# ─────────────────────────────────────────────
#  Helper: get landmark safely
# ─────────────────────────────────────────────
def _lm(lms: dict[str, LandmarkPoint], *keys: str) -> Optional[LandmarkPoint]:
    for key in keys:
        if key in lms:
            return lms[key]
    return None


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 1 – X-ray with full tracing + analysis lines
# ════════════════════════════════════════════════════════════════════════════
def render_xray_with_tracing(req: OverlayRequest,
                              canvas_w: int = 1600,
                              canvas_h: int = 1280) -> bytes:
    """
    Renders the X-ray with:
      • Anatomical tracing (black lines – skull outline, dental forms, ramus)
      • Soft-tissue profile (dark red spline-like polyline)
      • Steiner analysis skeleton lines (purple)
      • Patient label watermark (bottom-left)
    """
    base_img = Image.open(io.BytesIO(req.image_bytes)).convert("RGB")
    orig_w, orig_h = base_img.size
    base_img = base_img.resize((canvas_w, canvas_h), Image.LANCZOS)

    sx = canvas_w / orig_w
    sy = canvas_h / orig_h

    # Alpha-blend tracing layer on top
    overlay = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)

    lms = req.landmarks

    def pt(name: str, *aliases) -> Optional[tuple[float, float]]:
        lm = _lm(lms, name, *aliases)
        if lm is None:
            return None
        return _scale(lm, sx, sy)

    # ── Multi-Analysis Tracing (Steiner, McNamara, Tweed) ──────────────────
    method = (req.analysis_method or "Full").lower()
    
    if method in ["steiner", "full"]:
        _draw_steiner_lines(draw, lms, sx, sy)
    if method in ["mcnamara", "full"]:
        _draw_mcnamara_lines(draw, lms, sx, sy)
    if method in ["tweed", "full"]:
        _draw_tweed_lines(draw, lms, sx, sy)
    
    # ── Anatomical Tracing ──────────────────────────────────────────────────
    _draw_anatomical_outlines(draw, lms, sx, sy)
    _draw_soft_tissue(draw, lms, sx, sy)
    
    # ── Landmark dots ────────────────────────────────────────────────────────
    _draw_landmark_dots(draw, lms, sx, sy)

    # ── Composite ────────────────────────────────────────────────────────────
    result = Image.alpha_composite(base_img.convert("RGBA"), overlay)

    # Patient label + Watermark
    draw_final = ImageDraw.Draw(result)
    font_sm = _try_font(24)
    draw_final.text((12, canvas_h-36), "AI Tracing Engine", font=font_sm, fill=C_WHITE)
    _draw_clinical_watermark(draw_final, canvas_w, canvas_h)

    return _to_jpeg(result)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 2 – X-ray with measurement value annotations
# ════════════════════════════════════════════════════════════════════════════
def render_xray_with_measurements(req: OverlayRequest,
                                   canvas_w: int = 1600,
                                   canvas_h: int = 1280) -> bytes:
    """
    X-ray background + Steiner lines + colored measurement labels
    (matching reference image 2: SNA 82.69° in green, SNB 75.43° in orange,
     ANB 7.26° in blue, FMA in orange, etc.)
    """
    base_img = Image.open(io.BytesIO(req.image_bytes)).convert("RGB")
    orig_w, orig_h = base_img.size
    base_img = base_img.resize((canvas_w, canvas_h), Image.LANCZOS)

    sx = canvas_w / orig_w
    sy = canvas_h / orig_h

    overlay = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)
    lms = req.landmarks

    def pt(name: str) -> Optional[tuple[float, float]]:
        lm = _lm(lms, name)
        if lm is None:
            return None
        return _scale(lm, sx, sy)

    # Draw Steiner skeleton (same as output 1 purple lines)
    _draw_steiner_lines(draw, lms, sx, sy)
    # Soft tissue
    _draw_soft_tissue(draw, lms, sx, sy)

    # ── Measurement annotations ───────────────────────────────────────────────
    font_val = _try_font(32, bold=True)
    font_unit = _try_font(24)

    msr_map = {m.code: m for m in req.measurements}

    # Colour assignment per reference image 2:
    REF_COLORS = {
        "SNA":        C_GREEN,
        "ANB":        C_BLUE,
        "SNB":        C_ORANGE,
        "SN_MP":      C_ORANGE,
        "FMA":        C_ORANGE,
        "UI_SN":      C_GREEN,
        "UI_NA_MM":   C_GREEN,
        "LI_NB_MM":   C_RED,
        "LI_MP":      C_RED,
        "OVERJET":    C_GREEN,
        "OVERBITE":   C_GREEN,
        "LS_ELINE":   C_ORANGE,
        "LI_ELINE":   C_RED,
    }

    # Position labels near relevant anatomical points
    sella  = pt("Sella Turcica")
    nasion = pt("Nasion")
    ptA    = pt("Point A")
    ptB    = pt("Point B")
    menton = pt("Menton")
    go_pt  = pt("Constructed Gonion (tangent)")
    orb    = pt("Orbitale")
    por    = pt("Porion")
    pns_pt = pt("Posterior Nasal Spine")
    ls_pt  = pt("Labrale Superior")
    li_pt  = pt("Labrale Inferior")
    soft_pog = pt("Point Soft Pogonion")
    pron   = pt("Pronasale")

    def label_at(pos, code: str, default_val: Optional[float] = None,
                 offset=(0, 0), unit_str: Optional[str] = None):
        if pos is None:
            return
        m = msr_map.get(code)
        val = m.value if m else default_val
        if val is None:
            return
        
        # Color logic
        color = REF_COLORS.get(code, C_GREEN)
        if m:
            color = _msr_color(m)
            if code in REF_COLORS:
                color = _msr_color_ref(m, REF_COLORS[code])
        
        ut = unit_str or (m.unit if m else "°")
        # Format: Code: Value Unit (1 decimal)
        txt = f"{code}: {val:.1f}{ut}"
        
        # Draw with box
        x, y = int(pos[0] + offset[0] * sx), int(pos[1] + offset[1] * sy)
        _draw_label_with_box(draw, txt, (x, y), (*color, 255), font_val)

    # SNA, SNB, ANB cluster near Nasion
    if nasion:
        for code, off in [("SNA", (-120, -140)), ("SNB", (-120, -100)), ("ANB", (-120, -60))]:
            label_at(nasion, code, offset=off)

    # Upper incisor / SN
    ui_tip = pt("Incisal edge of upper incisor")
    if ui_tip:
        label_at(ui_tip, "UI_SN", offset=(-280, -60))
        label_at(ui_tip, "UI_NA_MM", offset=(40, -80))

    # SN-MP (near Go)
    if go_pt:
        label_at(go_pt, "SN_MP", offset=(-180, 20))
    # FMA near Por/Or
    if por:
        label_at(por, "FMA", offset=(-180, 60))

    # Lower incisor
    li_tip = pt("Incisal edge of lower incisor")
    if li_tip:
        label_at(li_tip, "LI_NB_MM", offset=(30, 60))
        label_at(li_tip, "LI_MP",    offset=(30, 100))

    # E-line distances
    if soft_pog:
        label_at(soft_pog, "LS_ELINE", offset=(20, -60))
        label_at(soft_pog, "LI_ELINE", offset=(20, -20))

    # ── Embedded Wiggle Chart ────────────────────────────────────────────────
    chart_rect = (canvas_w - 280, 20, canvas_w - 20, 320)
    # We composite early so the chart can be drawn on the final background
    result = Image.alpha_composite(base_img.convert("RGBA"), overlay)
    _draw_mini_wiggle_chart(draw, req.measurements, chart_rect, result)

    # Scale bar
    draw_final = ImageDraw.Draw(result)
    _draw_scale_bar(draw_final, canvas_w, canvas_h, req, sx, font_val)

    # Patient info header + Watermark
    if req.patient_label:
        draw_final.text((20, 20), req.patient_label, font=font_hdr, fill=(255, 255, 255, 220))
    if req.date_label:
        draw_final.text((20, 56), req.date_label,    font=font_hdr, fill=(255, 255, 255, 200))
    
    _draw_clinical_watermark(draw_final, canvas_w, canvas_h)

    return _to_jpeg(result)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 3 – Wiggle chart (deviation polygon, white background)
# ════════════════════════════════════════════════════════════════════════════
def render_wiggle_chart(req: OverlayRequest,
                        canvas_w: int = 1200,
                        canvas_h: int = 1600) -> bytes:
    """
    A professional "wiggle" polygon chart showing each measurement's deviation.
    """
    # Create white background
    img = Image.new("RGB", (canvas_w, canvas_h), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Title
    font_title = _try_font(48, bold=True)
    draw.text((canvas_w // 2 - 250, 40), "Björk-Skieller Wiggle Analysis", font=font_title, fill=(5, 150, 105))

    # Patient details
    font_sm = _try_font(28)
    if req.patient_label:
        draw.text((60, 120), f"Patient: {req.patient_label}", font=font_sm, fill=(0, 0, 0))
    if req.date_label:
        draw.text((60, 160), f"Date: {req.date_label}", font=font_sm, fill=(100, 100, 100))

    # Render main chart using matplotlib helper
    # Leave space for headers and labels on the sides
    chart_w, chart_h = canvas_w - 400, canvas_h - 300
    chart_img = _render_wiggle_to_image(req.measurements, chart_w, chart_h, show_labels=True)
    
    # Paste the chart (centered horizontally)
    img.paste(chart_img, (320, 220), chart_img)

    # Add Norm range labels manually on the left for extra precision
    y_start = 245
    row_h = (chart_h - 40) / max(len(req.measurements), 1)
    for i, m in enumerate(req.measurements):
        y = y_start + i * row_h
        norm_txt = f"{m.normal_value:.1f} ± {m.std_deviation:.1f}"
        draw.text((40, y), norm_txt, font=font_sm, fill=(5, 150, 105))

    return _to_jpeg(img)


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 4 – Pure tracing on white background + measurements
# ════════════════════════════════════════════════════════════════════════════
def render_tracing_only(req: OverlayRequest,
                        canvas_w: int = 1600,
                        canvas_h: int = 1280) -> bytes:
    """
    White background with:
      • Anatomical tracing (black lines)
      • Soft-tissue profile (dark red)
      • Steiner analysis lines (purple)
      • Measurement value annotations
      • Patient header + scale bar
    Matches reference images 3 & 4.
    """
    orig_img = Image.open(io.BytesIO(req.image_bytes)).convert("RGB")
    orig_w, orig_h = orig_img.size

    sx = canvas_w / orig_w
    sy = canvas_h / orig_h

    img  = Image.new("RGBA", (canvas_w, canvas_h), (255, 255, 255, 255))
    draw = ImageDraw.Draw(img)

    lms = req.landmarks

    def pt(name: str, *aliases) -> Optional[tuple[float, float]]:
        lm = _lm(lms, name, *aliases)
        if lm is None:
            return None
        return _scale(lm, sx, sy)

    # ── Multi-Analysis Tracing (Steiner, McNamara, Tweed) ──────────────────
    method = (req.analysis_method or "Full").lower()

    if method in ["steiner", "full"]:
        _draw_steiner_lines(draw, lms, sx, sy, alpha=255)
    if method in ["mcnamara", "full"]:
        _draw_mcnamara_lines(draw, lms, sx, sy)
    if method in ["tweed", "full"]:
        _draw_tweed_lines(draw, lms, sx, sy)
    
    # ── Anatomical Tracing (Black) ──────────────────────────────────────────
    _draw_anatomical_outlines(draw, lms, sx, sy, color=(0, 0, 0))
    _draw_soft_tissue(draw, lms, sx, sy, alpha=255, color=(0, 0, 0, 255))

    # ── Measurement labels ────────────────────────────────────────────────────
    font_val = _try_font(28, bold=True)
    msr_map  = {m.code: m for m in req.measurements}

    REF_POSITIONS: list[tuple[str, str, tuple[int, int]]] = [
        ("SNA",      "Nasion",       (-130, -150)),
        ("SNB",      "Nasion",       (-130, -110)),
        ("ANB",      "Nasion",       (-130, -70)),
        ("UI_SN",    "Incisal edge of upper incisor", (-280, -60)),
        ("SN_MP",    "Constructed Gonion (tangent)",  (-200, 20)),
        ("FMA",      "Constructed Gonion (tangent)",  (-200, 60)),
        ("LI_NB_MM", "Incisal edge of lower incisor", (30, 60)),
        ("LI_MP",    "Incisal edge of lower incisor", (30, 100)),
    ]

    for code, anchor_name, offset in REF_POSITIONS:
        anchor_lm = _lm(lms, anchor_name)
        if anchor_lm is None:
            continue
        ax, ay = _scale(anchor_lm, sx, sy)
        m = msr_map.get(code)
        if m is None:
            continue
        
        # Color coded by status
        color = _msr_color(m)
        
        # Format: Code: Value Unit (e.g. SNA: 82.5)
        txt = f"{code}: {m.value:.1f}{m.unit}"
        
        # Position with offset
        pos = (int(ax + offset[0] * sx), int(ay + offset[1] * sy))
        
        # Draw with background box
        _draw_label_with_box(draw, txt, pos, (*color, 255), font_val)

    # ── Embedded Wiggle Chart ────────────────────────────────────────────────
    # Top-right corner
    chart_rect = (canvas_w - 280, 20, canvas_w - 20, 320)
    _draw_mini_wiggle_chart(draw, req.measurements, chart_rect, img)

    # ── Patient header ────────────────────────────────────────────────────────
    font_hdr = _try_font(30)
    if req.patient_label:
        draw.text((20, 20), req.patient_label, font=font_hdr, fill=C_BLACK)
    if req.date_label:
        draw.text((20, 56), req.date_label,    font=font_hdr, fill=C_BLACK)

    # Scale bar + Watermark
    _draw_scale_bar(draw, canvas_w, canvas_h, req, sx, font_hdr, bg_dark=False)
    _draw_clinical_watermark(draw, canvas_w, canvas_h)

    return _to_jpeg(img.convert("RGB"))


# ════════════════════════════════════════════════════════════════════════════
#  OUTPUT 5 – Measurement table with Wiggle bars
# ════════════════════════════════════════════════════════════════════════════
def render_measurement_table(req: OverlayRequest,
                              canvas_w: int = 1100,
                              canvas_h_per_row: int = 52) -> bytes:
    """
    A tabular view matching reference image 5:
     Columns: Name | Unit | Value | Normal | Difference | Wiggle
    """
    measurements = req.measurements
    # Group measurements
    groups: dict[str, list] = {}
    for m in measurements:
        groups.setdefault(m.group_name or "General", []).append(m)

    # Calculate total height
    total_rows = len(measurements) + len(groups)  # group headers
    canvas_h = int((total_rows + 5) * canvas_h_per_row) + 80

    img  = Image.new("RGB", (canvas_w, canvas_h), C_WHITE)
    draw = ImageDraw.Draw(img)

    font_hdr  = _try_font(34, bold=True)
    font_grp  = _try_font(34, bold=True)
    font_row  = _try_font(30)
    font_val  = _try_font(30, bold=True)

    # Column layout
    COL_NAME  = (0,   350)
    COL_UNIT  = (355, 415)
    COL_VAL   = (420, 510)
    COL_NORM  = (515, 610)
    COL_DIFF  = (615, 720)
    COL_WIG   = (725, canvas_w-20)

    # Header row
    y = 20
    headers = [("Name", COL_NAME[0]),   ("Unit", COL_UNIT[0]),
               ("Value", COL_VAL[0]),   ("Normal", COL_NORM[0]),
               ("Difference", COL_DIFF[0]), ("Wiggle", COL_WIG[0])]
    for txt, x in headers:
        draw.text((x, y), txt, font=font_hdr, fill=C_BLACK)
    y += canvas_h_per_row

    wiggle_pts: dict[str, list[tuple[float, float]]] = {}
    row_ys: list[int] = []
    row_msrs: list[MeasurementItem] = []

    for group_name, group_msrs in groups.items():
        # Group header
        draw.text((canvas_w//2 - 150, y), group_name,
                  font=font_grp, fill=C_GREEN)
        y += canvas_h_per_row

        for msr in group_msrs:
            color = _msr_color(msr)
            mid_y = y + canvas_h_per_row // 2 - 6

            # Name
            draw.text((COL_NAME[0], y), msr.name, font=font_row, fill=C_BLACK)
            # Unit
            draw.text((COL_UNIT[0], y), f"[{msr.unit}]", font=font_row, fill=C_BLACK)
            # Value (colored)
            draw.text((COL_VAL[0], y), f"{msr.value:.1f}", font=font_val, fill=color)
            # Normal
            draw.text((COL_NORM[0], y), f"{msr.normal_value:.1f}", font=font_row, fill=C_BLACK)
            # Difference (colored)
            sign = "+" if msr.difference > 0 else ""
            draw.text((COL_DIFF[0], y), f"{sign}{msr.difference:.1f}",
                      font=font_val, fill=color)

            # Wiggle bar: small colored tick marks like reference image 5
            _draw_wiggle_bar(draw, msr, mid_y,
                             COL_WIG[0], COL_WIG[1])

            row_ys.append(mid_y)
            row_msrs.append(msr)

            y += canvas_h_per_row

    # Draw connecting wiggle polyline on the right panel
    if row_ys:
        WIG_CX = COL_WIG[0] + (COL_WIG[1]-COL_WIG[0]) // 2
        WIG_W  = COL_WIG[1] - COL_WIG[0]
        pts = []
        for ri, (ry, msr) in enumerate(zip(row_ys, row_msrs)):
            sd = msr.std_deviation or 1.0
            dev = msr.difference / sd
            dev = max(-3.0, min(3.0, dev))
            wx = WIG_CX + dev * (WIG_W/2/3)
            pts.append((int(wx), int(ry)))

        for i in range(len(pts)-1):
            draw.line([pts[i], pts[i+1]], fill=C_RED, width=4)
        for (px, py), msr in zip(pts, row_msrs):
            sd = msr.std_deviation or 1.0
            dev = abs(msr.difference / sd)
            if dev >= 2.8:
                _arrowhead(draw, (px, py), (WIG_CX, py), C_RED, head_len=16)
            else:
                r = 8
                draw.ellipse([px-r, py-r, px+r, py+r], fill=C_RED)

    return _to_jpeg(img)


# ════════════════════════════════════════════════════════════════════════════
#  Convenience: render ALL outputs at once
# ════════════════════════════════════════════════════════════════════════════
def render_all(req: OverlayRequest) -> dict[str, bytes]:
    """
    Returns a dict with keys:
      'xray_tracing'       – Output 1
      'xray_measurements'  – Output 2
      'wiggle_chart'       – Output 3
      'tracing_only'       – Output 4
      'measurement_table'  – Output 5
    Each value is JPEG bytes.
    """
    results: dict[str, bytes] = {}
    try:
        results["xray_tracing"] = render_xray_with_tracing(req)
    except Exception as e:
        logger.warning(f"render_xray_with_tracing failed: {e}")

    try:
        results["xray_measurements"] = render_xray_with_measurements(req)
    except Exception as e:
        logger.warning(f"render_xray_with_measurements failed: {e}")

    try:
        results["wiggle_chart"] = render_wiggle_chart(req)
    except Exception as e:
        logger.warning(f"render_wiggle_chart failed: {e}")

    try:
        results["tracing_only"] = render_tracing_only(req)
    except Exception as e:
        logger.warning(f"render_tracing_only failed: {e}")

    try:
        results["measurement_table"] = render_measurement_table(req)
    except Exception as e:
        logger.warning(f"render_measurement_table failed: {e}")

    return results


# ════════════════════════════════════════════════════════════════════════════
#  Private helpers
# ════════════════════════════════════════════════════════════════════════════

def _draw_landmark_dots(draw: ImageDraw.ImageDraw,
                         lms: dict[str, LandmarkPoint],
                         sx: float, sy: float,
                         key_set: Optional[set] = None):
    """Small dot for each landmark (key clinical ones slightly larger)."""
    KEY_LMS = {
        "Sella Turcica", "Nasion", "Point A", "Point B", "Menton",
        "Porion", "Orbitale", "Basion", "Articulare", "Gonion",
        "Pogonion", "Anterior Nasal Spine", "Posterior Nasal Spine"
    }
    for name, lm in lms.items():
        if key_set and name not in key_set:
            continue
        px, py = _scale(lm, sx, sy)
        r = 5 if name in KEY_LMS else 3
        col = (0, 255, 0, 200) if name in KEY_LMS else (200, 200, 0, 180)
        draw.ellipse([px-r, py-r, px+r, py+r], fill=col, outline=(0, 0, 0, 180))


def _draw_steiner_lines(draw: ImageDraw.ImageDraw,
                         lms: dict[str, LandmarkPoint],
                         sx: float, sy: float,
                         alpha: int = 200):
    """Draw the standard Steiner/Tweed analysis skeleton lines in purple."""
    PUR = (*SKELETAL_COLOR, alpha)
    W   = 2

    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        if lm is None:
            return None
        return _scale(lm, sx, sy)

    def pline(*names, color=PUR, width=W):
        pts = [pt(n) for n in names if pt(n) is not None]
        for i in range(len(pts)-1):
            draw.line([pts[i], pts[i+1]], fill=color, width=width)

    sella  = pt("Sella Turcica")
    nasion = pt("Nasion")
    ptA    = pt("Point A")
    ptB    = pt("Point B")
    menton = pt("Menton")
    go_p   = pt("Constructed Gonion (tangent)", "tGo-abo")
    ar_p   = pt("Articulare")
    pog    = pt("Pogonion")
    por    = pt("Porion")
    orb    = pt("Orbitale")
    ui_tip = pt("Incisal edge of upper incisor", "Upper incisor tip")
    li_tip = pt("Incisal edge of lower incisor", "Lower incisor tip")
    molar  = pt("Cusp of upper first molar", "Second point on upper molar")

    # SN extended
    if sella and nasion:
        dx, dy = nasion[0]-sella[0], nasion[1]-sella[1]
        ln = math.hypot(dx, dy) or 1
        draw.line([
            (sella[0]-dx/ln*40,  sella[1]-dy/ln*40),
            (nasion[0]+dx/ln*450, nasion[1]+dy/ln*450)
        ], fill=PUR, width=W)

    pline("Nasion", "Point A")
    pline("Nasion", "Point B")
    pline("Nasion", "Pogonion")

    # FH plane
    if por and orb:
        dx, dy = orb[0]-por[0], orb[1]-por[1]
        ln = math.hypot(dx, dy) or 1
        draw.line([
            (por[0]-dx/ln*40, por[1]-dy/ln*40),
            (orb[0]+dx/ln*450, orb[1]+dy/ln*450)
        ], fill=PUR, width=W)

    # Mandibular plane extended
    if go_p and menton:
        dx, dy = menton[0]-go_p[0], menton[1]-go_p[1]
        ln = math.hypot(dx, dy) or 1
        draw.line([go_p, (menton[0]+dx/ln*220, menton[1]+dy/ln*220)],
                  fill=PUR, width=W)

    pline("Articulare", "Constructed Gonion (tangent)", "tGo-abo")
    pline("Sella Turcica", "Menton")

    # Occlusal plane
    if ui_tip and li_tip:
        mid = ((ui_tip[0]+li_tip[0])/2, (ui_tip[1]+li_tip[1])/2)
        if molar:
            draw.line([mid, molar], fill=PUR, width=W)

    # Y-axis (Go–Gn)
    if go_p and pog:
        draw.line([go_p, pog], fill=PUR, width=W)

    # Holdaway H-Angle Line (Nasion-B line vs SoftPog-Ls line)
    nb = pt("Nasion"), pt("Point B")
    h_line = pt("Point Soft Pogonion"), pt("Labrale Superior")
    if nb[0] and nb[1]:
        draw.line([nb[0], nb[1]], fill=(*C_BLUE, 150), width=1)
    if h_line[0] and h_line[1]:
        draw.line([h_line[0], h_line[1]], fill=(*C_BLUE, 200), width=2)


def _draw_mcnamara_lines(draw: ImageDraw.ImageDraw,
                         lms: dict[str, LandmarkPoint],
                         sx: float, sy: float):
    """
    Renders the McNamara Analysis frame:
      - Frankfort Horizontal (Po-Or)
      - Nasion Perpendicular (Perp to FH through N)
      - Skeletal base lines (Co-A, Co-Gn)
    """
    BLUE = (37, 99, 235, 200) # #2563eb
    W = 2
    
    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    po, orb, n, a, gn, co = pt("Po"), pt("Or"), pt("N"), pt("A"), pt("Gn"), pt("Co")
    
    if po and orb and n:
        # FH Line extended
        dx, dy = orb[0]-po[0], orb[1]-po[1]
        ln = math.hypot(dx, dy) or 1
        fh_end = (po[0] + dx/ln*500, po[1] + dy/ln*500)
        draw.line([po, fh_end], fill=BLUE, width=W)
        
        # N-Perpendicular
        # Perpendicular to (dx, dy) is (-dy, dx)
        vx, vy = -dy, dx
        ln_v = math.hypot(vx, vy) or 1
        n_perp_end = (n[0] + vx/ln_v*400, n[1] + vy/ln_v*400)
        draw.line([n, n_perp_end], fill=BLUE, width=W, linestyle="--") # dashed if possible, but Pillow doesn't support easily, so solid for now

    if co:
        if a: draw.line([co, a], fill=BLUE, width=W)
        if gn: draw.line([co, gn], fill=BLUE, width=W)


def _draw_tweed_lines(draw: ImageDraw.ImageDraw,
                      lms: dict[str, LandmarkPoint],
                      sx: float, sy: float):
    """
    Renders the Tweed Triangle:
      - FMA (Frankfort-Mandibular Plane Angle)
      - IMPA (Incisor-Mandibular Plane Angle)
      - FMIA (Frankfort-Mandibular Incisor Angle)
    """
    ORANGE = (234, 88, 12, 200) # #ea580c
    W = 2
    
    def pt(name, *aliases):
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    po, orb, go, me, li, lir = pt("Po"), pt("Or"), pt("Go"), pt("Me"), pt("LI"), pt("LIR")
    
    # 1. Mandibular Plane (Go-Me)
    if go and me:
        draw.line([go, me], fill=ORANGE, width=W)
        
    # 2. Lower Incisor Axis (LI-LIR)
    if li and lir:
        # Extend the axis
        dx, dy = li[0]-lir[0], li[1]-lir[1]
        ln = math.hypot(dx, dy) or 1
        top = (li[0] + dx/ln*100, li[1] + dy/ln*100)
        bot = (lir[0] - dx/ln*100, lir[1] - dy/ln*100)
        draw.line([top, bot], fill=ORANGE, width=W)


def _draw_soft_tissue(draw: ImageDraw.ImageDraw,
                       lms: dict[str, LandmarkPoint],
                       sx: float, sy: float,
                       alpha: int = 200,
                       color: tuple = None):
    """
    Render the soft-tissue profile using segmented splines for 
    high anatomical fidelity (nose, lips, chin, throat).
    """
    SOFT = color if color else (*ANAT_COLOR, alpha)

    def pt(name):
        lm = _lm(lms, name)
        return _scale(lm, sx, sy) if lm else None

    # 1. Forehead to Nose Tip
    upper_face = ["upGl'", "upN'", "upPn'"]
    # 2. Subnasale to Upper Lip
    upper_lip  = ["upSn'", "upSLS'", "upLs'", "upUppSt'"]
    # 3. Lower Lip to Chin
    lower_lip  = ["loLowSt'", "loLi'", "loILS'", "loPg'"]
    # 4. Chin to Throat
    throat     = ["loPg'", "loGn'", "loMe'", "loTh'"]

    for segment, tension in [(upper_face, 0.3), (upper_lip, 0.4), (lower_lip, 0.4), (throat, 0.3)]:
        pts = [pt(n) for n in segment if pt(n) is not None]
        if len(pts) >= 2:
            _cardinal_spline(draw, pts, fill=SOFT, width=2, tension=tension, steps=12)

    # Ricketts E-Line (Pronasale to Soft Pogonion)
    pron     = pt("Pronasale")
    soft_pog = pt("Point Soft Pogonion")
    if pron and soft_pog:
        # Draw with low opacity to not obscure landmarks
        draw.line([pron, soft_pog], fill=(*SOFT[:3], 100), width=1)


def _draw_clinical_watermark(draw: ImageDraw.ImageDraw, 
                             canvas_w: int, canvas_h: int):
    """Adds a professional watermark with service branding."""
    font_sub = _try_font(20)
    font_main = _try_font(24, bold=True)
    
    # Bottom right
    margin = 20
    text_main = "CEPHALOMETRIC AI"
    text_sub = "Clinical Decision Support System"
    
    bbox_main = draw.textbbox((0, 0), text_main, font=font_main)
    bbox_sub = draw.textbbox((0, 0), text_sub, font=font_sub)
    
    x_main = canvas_w - (bbox_main[2] - bbox_main[0]) - margin
    y_main = canvas_h - (bbox_main[3] - bbox_main[1]) - margin - 25
    
    x_sub = canvas_w - (bbox_sub[2] - bbox_sub[0]) - margin
    y_sub = canvas_h - (bbox_sub[3] - bbox_sub[1]) - margin
    
    draw.text((x_main, y_main), text_main, font=font_main, fill=(150, 150, 150, 150))
    draw.text((x_sub, y_sub), text_sub, font=font_sub, fill=(150, 150, 150, 120))


def _draw_anatomical_outlines(draw: ImageDraw.ImageDraw,
                              lms: dict[str, LandmarkPoint],
                              sx: float, sy: float,
                              color: tuple = ANAT_COLOR):
    """Renders basic skull, maxilla, and mandibular outlines."""
    COL = (*color, 230)
    def pt(name: str, *aliases) -> Optional[tuple[float, float]]:
        lm = _lm(lms, name, *aliases)
        return _scale(lm, sx, sy) if lm else None

    # Skull / Cranial Base
    s, n, ba, orb = pt("Sella Turcica"), pt("Nasion"), pt("Basion"), pt("Orbitale")
    if s and n: draw.line([s, n], fill=COL, width=2)
    if s and ba: draw.line([s, ba], fill=COL, width=2)
    if n and orb: draw.line([n, orb], fill=COL, width=2)

    # Maxilla
    ans, pns = pt("Anterior Nasal Spine"), pt("Posterior Nasal Spine")
    if ans and pns: draw.line([ans, pns], fill=COL, width=2)

    # Mandible (Spline)
    mand_chain = ["Articulare", "P0", "Constructed Gonion (tangent)", "Menton", "Gnathion", "Pogonion"]
    mand_pts = [pt(n) for n in mand_chain if pt(n) is not None]
    if len(mand_pts) >= 2:
        _cardinal_spline(draw, mand_pts, fill=COL, width=2, tension=0.4)

    # Teeth silhouettes
    ui_a, ui_t = pt("Apex of upper incisor"), pt("Incisal edge of upper incisor")
    if ui_a and ui_t: _draw_incisor_upper(draw, ui_a, ui_t, lms, sx, sy, color=COL)
    
    li_a, li_t = pt("Apex of lower incisor"), pt("Incisal edge of lower incisor")
    if li_a and li_t: _draw_incisor_lower(draw, li_a, li_t, lms, sx, sy, color=COL)
    
    _draw_molar(draw, lms, sx, sy, "upper", color=COL)
    _draw_molar(draw, lms, sx, sy, "lower", color=COL)


def _draw_incisor_upper(draw: ImageDraw.ImageDraw,
                         apex, tip,
                         lms, sx, sy,
                         color=(22, 163, 74, 230)):
    """
    Advanced anatomical upper incisor silhouette.
    Captures the incisal edge, labial/lingual curvatures, and root taper.
    """
    if apex is None or tip is None:
        return
    dx, dy  = apex[0]-tip[0], apex[1]-tip[1]
    length  = math.hypot(dx, dy)
    if length < 5:
        return
    ux, uy  = dx/length, dy/length  # unit vector along long axis
    px, py  = -uy, ux               # perpendicular vector
    
    # Anatomical proportions
    crown_len = length * 0.45
    root_len  = length - crown_len
    cw_labial = length * 0.35  # labial width
    cw_lingual = length * 0.32 # lingual width (cingulum area)
    rw_neck    = length * 0.18 # width at CEJ
    
    pts = []
    # 1. Incisal Edge (slightly rounded)
    ie_left  = (tip[0] - px * cw_labial * 0.4, tip[1] - py * cw_labial * 0.4)
    ie_right = (tip[0] + px * cw_labial * 0.4, tip[1] + py * cw_labial * 0.4)
    pts.append(ie_left)
    
    # 2. Labial surface (smooth convex curve)
    cej_labial = (tip[0] + ux * crown_len - px * rw_neck, tip[1] + uy * crown_len - py * rw_neck)
    pts.extend(_cubic_bezier_pts(
        ie_left,
        (ie_left[0] + ux * crown_len * 0.4 - px * cw_labial * 0.2, ie_left[1] + uy * crown_len * 0.4 - py * cw_labial * 0.2),
        (cej_labial[0] - ux * crown_len * 0.2, cej_labial[1] - uy * crown_len * 0.2),
        cej_labial, steps=8
    ))
    
    # 3. Root (labial side)
    pts.extend(_cubic_bezier_pts(
        cej_labial,
        (cej_labial[0] + ux * root_len * 0.5, cej_labial[1] + uy * root_len * 0.5),
        apex, apex, steps=8
    ))
    
    # 4. Root (lingual side)
    cej_lingual = (tip[0] + ux * crown_len + px * rw_neck, tip[1] + uy * crown_len + py * rw_neck)
    pts.extend(_cubic_bezier_pts(
        apex, apex,
        (cej_lingual[0] + ux * root_len * 0.5, cej_lingual[1] + uy * root_len * 0.5),
        cej_lingual, steps=8
    ))
    
    # 5. Lingual surface (Cingulum curve)
    pts.extend(_cubic_bezier_pts(
        cej_lingual,
        (cej_lingual[0] - ux * crown_len * 0.3 + px * cw_lingual * 0.1, cej_lingual[1] - uy * crown_len * 0.3 + py * cw_lingual * 0.1),
        (ie_right[0] + ux * crown_len * 0.1, ie_right[1] + uy * crown_len * 0.1),
        ie_right, steps=10
    ))
    
    draw.polygon(pts, outline=color, fill=None)


def _draw_incisor_lower(draw: ImageDraw.ImageDraw,
                         apex, tip,
                         lms, sx, sy,
                         color=(22, 163, 174, 230)):
    """Lower incisor is typically more slender and symmetric."""
    if apex is None or tip is None:
        return
    dx, dy  = apex[0]-tip[0], apex[1]-tip[1]
    length  = math.hypot(dx, dy)
    if length < 5:
        return
    ux, uy  = dx/length, dy/length
    px, py  = -uy, ux
    
    # Proportions
    cw = length * 0.28
    cl = length * 0.40
    
    pts = []
    # Incisal edge
    pts.append((tip[0] - px*cw*0.5, tip[1] - py*cw*0.5))
    pts.append((tip[0] + px*cw*0.5, tip[1] + py*cw*0.5))
    # Crown to neck
    pts.append((tip[0] + ux*cl + px*cw*0.4, tip[1] + uy*cl + py*cw*0.4))
    # Root
    pts.append(apex)
    pts.append((tip[0] + ux*cl - px*cw*0.4, tip[1] + uy*cl - py*cw*0.4))
    
    draw.polygon(pts, outline=color, fill=None)


def _draw_molar(draw: ImageDraw.ImageDraw,
                lms: dict[str, LandmarkPoint],
                sx, sy,
                which: str = "upper",
                color=(22, 163, 74, 230)):
    """
    Renders an anatomical molar silhouette with cusps and bifurcation hints.
    """
    if which == "upper":
        cusp = _lm(lms, "Cusp of upper first molar", "Second point on upper molar")
        apex = _lm(lms, "Apex of upper first molar", "First point on upper molar")
    else:
        cusp = _lm(lms, "Cusp of lower first molar", "Second point on lower molar")
        apex = _lm(lms, "Apex of lower first molar", "First point on lower molar")

    if cusp is None:
        return

    pt_cusp = _scale(cusp, sx, sy)
    w = 32
    h = 24
    dir_v = -1 if which == "upper" else 1
    x, y = pt_cusp[0], pt_cusp[1]
    
    pts = []
    # Mesial Cusp
    pts.append((x - w/2, y))
    pts.extend(_cubic_bezier_pts((x-w/2, y), (x-w/3, y + 4*dir_v), (x-w/6, y + 4*dir_v), (x, y), steps=5))
    # Distal Cusp
    pts.extend(_cubic_bezier_pts((x, y), (x+w/6, y + 4*dir_v), (x+w/3, y + 4*dir_v), (x+w/2, y), steps=5))
    
    # Crown sides and root bifurcation hint (Anatomical taper)
    pts.append((x + w/2, y + h*dir_v))
    # bifurcation apex
    pts.append((x + w/6, y + (h+12)*dir_v))
    pts.append((x, y + (h+15)*dir_v)) 
    pts.append((x - w/6, y + (h+12)*dir_v))
    pts.append((x - w/2, y + h*dir_v))
    
    draw.polygon(pts, outline=color, fill=None)


def _draw_scale_bar(draw: ImageDraw.ImageDraw,
                    canvas_w: int, canvas_h: int,
                    req: OverlayRequest, sx: float,
                    font, bg_dark: bool = True):
    """Draw a reference scale bar in the top-left area (matching reference image 2)."""
    bar_mm  = req.scale_bar_mm or 40.0
    pix_mm  = req.pixel_spacing_mm
    if pix_mm is None:
        return

    bar_px  = int(bar_mm / pix_mm * sx)
    bar_x   = 20
    bar_y   = 95
    color   = C_WHITE if bg_dark else C_BLACK

    # Bar line
    draw.line([(bar_x, bar_y), (bar_x+bar_px, bar_y)], fill=color, width=3)
    # End ticks
    draw.line([(bar_x, bar_y-5), (bar_x, bar_y+5)],         fill=color, width=2)
    draw.line([(bar_x+bar_px, bar_y-5), (bar_x+bar_px, bar_y+5)], fill=color, width=2)
    # Label
    draw.text((bar_x+bar_px+10, bar_y-14), f"{int(bar_mm)}mm", font=font, fill=color)


def _draw_wiggle_bar(draw: ImageDraw.ImageDraw,
                     msr: MeasurementItem,
                     mid_y: int,
                     x_start: int, x_end: int):
    """
    Draw the ±σ tick-mark bar for a measurement row.
    Colored ticks representing ±2σ, ±1σ, centre.
    Matching reference image 5.
    """
    color = _msr_color(msr)
    bar_w = x_end - x_start
    cx    = x_start + bar_w // 2

    # Draw 7 ticks at -3σ,-2σ,-1σ,0,+1σ,+2σ,+3σ
    tick_step = bar_w / 6
    tick_h    = 10
    for i in range(7):
        tx = int(x_start + i * tick_step)
        th = tick_h if i in (0, 3, 6) else tick_h-4
        draw.line([(tx, mid_y-th), (tx, mid_y+th)], fill=color, width=2)

    # Horizontal bar line
    draw.line([(x_start, mid_y), (x_end, mid_y)], fill=color, width=1)


def _msr_color_ref(msr: MeasurementItem,
                   prefer: tuple[int, int, int]) -> tuple[int, int, int]:
    """
    Use reference preferred colour for normal values,
    switch to orange/red for abnormal.
    """
    if msr.status in STATUS_COLOR and msr.status != "Normal":
        return STATUS_COLOR[msr.status]
    return prefer


def _to_jpeg(img: Image.Image, quality: int = 92) -> bytes:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    return buf.read()
