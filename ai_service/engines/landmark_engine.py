import math
import logging
import io
import torch
import numpy as np
from PIL import Image
from typing import Dict, Optional

from torchvision import transforms

from schemas.schemas import LandmarkPoint
from engines.net import UNet
from engines.func import argsoftmax, get_heatmap_stats

logger = logging.getLogger(__name__)

_model = None
_device = None
_coord_maps: Optional[tuple[torch.Tensor, torch.Tensor]] = None

H, W = 800, 640


def _reset_coord_maps() -> None:
    global _coord_maps
    _coord_maps = None


def _get_coord_maps() -> tuple[torch.Tensor, torch.Tensor]:
    """Lazily build (y_map, x_map) on the active inference device."""
    global _coord_maps, _device
    if _coord_maps is not None and _coord_maps[0].device == torch.device(_device):
        return _coord_maps
    y_grid, x_grid = np.mgrid[0:H:1, 0:W:1]
    y_map = torch.tensor(y_grid.flatten(), dtype=torch.float32, device=_device).unsqueeze(1)
    x_map = torch.tensor(x_grid.flatten(), dtype=torch.float32, device=_device).unsqueeze(1)
    _coord_maps = (y_map, x_map)
    return _coord_maps


def _clamp_to_image(pt: LandmarkPoint, orig_w: int, orig_h: int) -> LandmarkPoint:
    x = min(max(pt.x, 0.0), float(max(orig_w - 1, 0)))
    y = min(max(pt.y, 0.0), float(max(orig_h - 1, 0)))
    if x == pt.x and y == pt.y:
        return pt
    return LandmarkPoint(x=x, y=y, confidence=pt.confidence)


pre_trans = transforms.Compose([
    transforms.Resize((H, W)),
    transforms.ToTensor(),
    transforms.Normalize((0.5,), (0.5,)),
])

# Full list of 38 landmarks predicted by the model (positional — order must match weights).
LANDMARK_NAMES = [
    "S", "N", "Or", "Po", "A", "B", "Pog", "Co", "Gn", "Go",
    "L1", "U1", "13", "Li", "Sn", "SoftPog", "17", "ANS", "19", "20",
    "U1_c", "L1_c", "23", "24", "25", "Prn", "27", "28", "29", "30",
    "Sm", "SoftGn", "Gn2", "GLA", "SoftN", "36", "u6", "L6",
]

# Map: upper-cased raw predicted name → canonical landmark key used in the rest of the system.
# Rules:
#   - "U1" → "U1"  (keep; the measurement engine uses "U1" and "U1_c")
#   - "L1" → "L1"  (keep; the measurement engine uses "L1" and "L1_c")
#   - "LI" is NOT in LANDMARK_NAMES, so this map will not incorrectly alias soft-tissue "Li".
_NAME_MAP: Dict[str, str] = {
    "POINTA":   "A",
    "POINTB":   "B",
    "U1_C":     "U1_c",
    "L1_C":     "L1_c",
    "PRN":      "Prn",
    "SM":       "Sm",
    "GLA":      "GLA",
    "SOFTN":    "SoftN",
    "SOFTPOG":  "SoftPog",
    "SOFTGN":   "SoftGn",
    "GN2":      "Gn2",
    "LI":       "Li",      # soft-tissue labrale inferius — only reached if model predicts "LI"
    "SN":       "Sn",
    "CO":       "Co",
    "OR":       "Or",
    "PO":       "Po",
    "POG":      "Pog",
    "GN":       "Gn",
    "GO":       "Go",
    "ANS":      "ANS",
    "U6":       "U6",
    "L6":       "L6",
}

# Anatomical distance norms for adults (mm).  key = "LandmarkA:LandmarkB" lexicographic.
_ANATOMICAL_RANGES_MM: Dict[str, tuple[float, float]] = {
    "N:S":     (63.0,  80.0),
    "Go:S":    (65.0,  90.0),
    "Gn:Go":   (55.0,  82.0),
    "ANS:PNS": (45.0,  58.0),
    "Me:N":    (105.0, 140.0),
    "Or:Po":   (40.0,  70.0),
}


def _dist_mm(a: LandmarkPoint, b: LandmarkPoint, px_per_mm: float) -> float:
    return math.hypot(a.x - b.x, a.y - b.y) / px_per_mm


def _update_confidence(lm: LandmarkPoint, factor: float) -> LandmarkPoint:
    """Return a new LandmarkPoint with scaled confidence (works with immutable models)."""
    return LandmarkPoint(x=lm.x, y=lm.y, confidence=round(lm.confidence * factor, 4))


def load_model(model_path: str, device: str) -> None:
    """Load landmark detection model weights into memory at startup."""
    global _model, _device
    _device = device
    _reset_coord_maps()
    logger.info(f"Loading landmark model from {model_path} onto {device}...")
    
    try:
        _model = UNet(1, 38).to(device)
        _model.load_state_dict(torch.load(model_path, map_location=device))
        logger.info("Standard UNet weights loaded successfully.")
        _model.eval()
    except Exception as e:
        logger.error(
            f"Failed to load model from {model_path}. "
            f"Landmark inference will return fallback placeholders. Error: {e}"
        )
        _model = None


class ScientificRefiner:
    """
    Applies cephalometric anatomical rules to refine raw AI predictions.

    All mutations go through _update_confidence() so that immutable Pydantic
    LandmarkPoint models are handled correctly.
    """

    @staticmethod
    def refine(
        landmarks: Dict[str, LandmarkPoint],
        orig_w: int,
        orig_h: int,
        pixel_spacing_mm: Optional[float] = None,
    ) -> Dict[str, LandmarkPoint]:

        has_scale = pixel_spacing_mm is not None and pixel_spacing_mm > 0
        px_per_mm: float = (1.0 / pixel_spacing_mm) if has_scale else 0.0

        # 1. Orientation check: Sella should be posterior (smaller x) to Nasion.
        if "S" in landmarks and "N" in landmarks:
            if landmarks["S"].x > landmarks["N"].x:
                logger.warning("Sella detected anterior to Nasion — possible orientation issue.")

        # 2. Frankfort Horizontal stability.
        if "Po" in landmarks and "Or" in landmarks:
            dx = landmarks["Or"].x - landmarks["Po"].x
            dy = landmarks["Or"].y - landmarks["Po"].y
            if dx != 0:
                fh_angle = math.degrees(math.atan2(dy, dx))
                if abs(fh_angle) > 25:
                    logger.warning(f"Excessive head tilt ({fh_angle:.1f}°). Lowering global confidence.")
                    landmarks = {
                        k: _update_confidence(lm, 0.90)
                        for k, lm in landmarks.items()
                    }

                if has_scale:
                    fh_mm = _dist_mm(landmarks["Po"], landmarks["Or"], px_per_mm)
                    lo, hi = _ANATOMICAL_RANGES_MM["Or:Po"]
                    if not (lo <= fh_mm <= hi):
                        logger.warning(f"FH length {fh_mm:.1f} mm outside [{lo}–{hi} mm].")
                        for k in ("Po", "Or"):
                            landmarks[k] = _update_confidence(landmarks[k], 0.80)

        # 3. Cranial base S–N validation.
        if has_scale and "S" in landmarks and "N" in landmarks:
            sn_mm = _dist_mm(landmarks["S"], landmarks["N"], px_per_mm)
            lo, hi = _ANATOMICAL_RANGES_MM["N:S"]
            factor = 1.05 if lo <= sn_mm <= hi else 0.82
            action = "boosted" if factor > 1 else "penalised"
            for k in ("S", "N"):
                landmarks[k] = LandmarkPoint(
                    x=landmarks[k].x,
                    y=landmarks[k].y,
                    confidence=min(1.0, round(landmarks[k].confidence * factor, 4)),
                )
            logger.debug(f"S–N {sn_mm:.1f} mm (norm [{lo}–{hi}]) — confidence {action}.")

        # 4. Anterior facial height N–Me.
        if has_scale and "N" in landmarks and "Me" in landmarks:
            afh_mm = _dist_mm(landmarks["N"], landmarks["Me"], px_per_mm)
            lo, hi = _ANATOMICAL_RANGES_MM["Me:N"]
            if not (lo <= afh_mm <= hi):
                logger.warning(f"Anterior facial height {afh_mm:.1f} mm outside [{lo}–{hi} mm].")

        # 5. Mandibular body Go–Gn.
        if has_scale and "Go" in landmarks and "Gn" in landmarks:
            mand_mm = _dist_mm(landmarks["Go"], landmarks["Gn"], px_per_mm)
            lo, hi = _ANATOMICAL_RANGES_MM["Gn:Go"]
            if lo <= mand_mm <= hi:
                for k in ("Go", "Gn"):
                    landmarks[k] = LandmarkPoint(
                        x=landmarks[k].x,
                        y=landmarks[k].y,
                        confidence=min(1.0, round(landmarks[k].confidence * 1.04, 4)),
                    )

        # 6. Derive Menton (Me) when missing or low-confidence.
        if "Gn" in landmarks and "Go" in landmarks:
            me_missing = "Me" not in landmarks or landmarks["Me"].confidence < 0.8
            if me_missing:
                gn, go = landmarks["Gn"], landmarks["Go"]
                dx = gn.x - go.x
                dy = gn.y - go.y
                length = math.hypot(dx, dy) or 1.0
                ux, uy = dx / length, dy / length
                if has_scale:
                    offset_px = 6.0 * px_per_mm
                    landmarks["Me"] = LandmarkPoint(
                        x=gn.x + ux * offset_px * 0.3,
                        y=gn.y + uy * offset_px,
                        confidence=0.87,
                    )
                else:
                    mand_len_px = length
                    landmarks["Me"] = LandmarkPoint(
                        x=gn.x - mand_len_px * 0.05,
                        y=gn.y + mand_len_px * 0.12,
                        confidence=0.82,
                    )

        # 7. Derive PNS from ANS when missing or low-confidence.
        if "ANS" in landmarks:
            pns_missing = "PNS" not in landmarks or landmarks["PNS"].confidence < 0.8
            if pns_missing:
                ans = landmarks["ANS"]
                if has_scale:
                    palate_px = 50.0 * px_per_mm
                    landmarks["PNS"] = LandmarkPoint(
                        x=ans.x - palate_px,
                        y=ans.y + 2.0 * px_per_mm,
                        confidence=0.83,
                    )
                else:
                    landmarks["PNS"] = LandmarkPoint(
                        x=ans.x - orig_w * 0.12,
                        y=ans.y + orig_h * 0.015,
                        confidence=0.80,
                    )

        # 8. Palatal plane ANS–PNS validation.
        if has_scale and "ANS" in landmarks and "PNS" in landmarks:
            pal_mm = _dist_mm(landmarks["ANS"], landmarks["PNS"], px_per_mm)
            lo, hi = _ANATOMICAL_RANGES_MM["ANS:PNS"]
            if lo <= pal_mm <= hi:
                for k in ("ANS", "PNS"):
                    landmarks[k] = LandmarkPoint(
                        x=landmarks[k].x,
                        y=landmarks[k].y,
                        confidence=min(1.0, round(landmarks[k].confidence * 1.03, 4)),
                    )
            else:
                logger.warning(f"Palatal plane {pal_mm:.1f} mm outside [{lo}–{hi} mm].")

        return landmarks


def _mirror_landmarks_x(landmarks: Dict[str, LandmarkPoint], orig_w: int) -> None:
    """Reflect landmark x-coordinates after a horizontal image flip."""
    max_x = float(max(orig_w - 1, 0))
    for k, lm in list(landmarks.items()):
        if isinstance(lm, LandmarkPoint):
            landmarks[k] = LandmarkPoint(x=max_x - lm.x, y=lm.y, confidence=lm.confidence)


def _apply_model_outputs_to_landmarks(
    landmarks: Dict[str, LandmarkPoint],
    outputs: torch.Tensor,
    orig_w: int,
    orig_h: int,
) -> None:
    """Decode heatmaps → canonical landmark entries (in-place)."""
    y_map, x_map = _get_coord_maps()
    scale_y = orig_h / H
    scale_x = orig_w / W
    # outputs shape: [batch=1, n_classes=38, H, W]
    heatmaps = outputs[0]  # [38, H, W]
    flat = heatmaps.view(38, H * W)   # explicit shape for clarity
    with torch.no_grad():
        pred_y = argsoftmax(flat, y_map, beta=1e-3)
        pred_x = argsoftmax(flat, x_map, beta=1e-3)
        pred = torch.cat([pred_y, pred_x], dim=1).detach().cpu().numpy()
        max_logits, _, _ = get_heatmap_stats(outputs)

    for i, name in enumerate(LANDMARK_NAMES):
        raw_upper = str(name).strip().upper()
        canonical = _NAME_MAP.get(raw_upper, name)   # fall back to original (preserving case)
        conf = round(
            float(torch.sigmoid(torch.clamp(max_logits[i], -24.0, 24.0)).item()),
            4,
        )
        landmarks[canonical] = _clamp_to_image(
            LandmarkPoint(
                x=float(pred[i][1] * scale_x),
                y=float(pred[i][0] * scale_y),
                confidence=conf,
            ),
            orig_w,
            orig_h,
        )


def _is_expected_orientation(landmarks: Dict[str, LandmarkPoint]) -> bool:
    """True when S is posterior to N (smaller x), if both are available."""
    if "S" not in landmarks or "N" not in landmarks:
        return True
    return landmarks["S"].x <= landmarks["N"].x


def _merge_landmarks(
    primary: Dict[str, LandmarkPoint],
    secondary: Dict[str, LandmarkPoint],
    orig_w: int,
    orig_h: int,
) -> Dict[str, LandmarkPoint]:
    """
    Confidence-weighted fusion of two landmark predictions.

    This acts as lightweight test-time augmentation and improves stability of
    uncertain points without requiring model retraining.
    """
    merged: Dict[str, LandmarkPoint] = {}
    for key in set(primary.keys()) | set(secondary.keys()):
        p1 = primary.get(key)
        p2 = secondary.get(key)
        if p1 is None and p2 is not None:
            merged[key] = _clamp_to_image(p2, orig_w, orig_h)
            continue
        if p2 is None and p1 is not None:
            merged[key] = _clamp_to_image(p1, orig_w, orig_h)
            continue
        if p1 is None or p2 is None:
            continue

        c1 = max(float(p1.confidence or 0.5), 0.05)
        c2 = max(float(p2.confidence or 0.5), 0.05)
        total = c1 + c2

        fused = LandmarkPoint(
            x=((p1.x * c1) + (p2.x * c2)) / total,
            y=((p1.y * c1) + (p2.y * c2)) / total,
            confidence=min(1.0, round(max(c1, c2) * 0.99, 4)),
        )
        merged[key] = _clamp_to_image(fused, orig_w, orig_h)
    return merged


def infer(
    image_bytes: bytes,
    pixel_spacing_mm: Optional[float] = None,
) -> Dict[str, LandmarkPoint]:
    """
    Run landmark detection on a raw image.

    Parameters
    ----------
    image_bytes : bytes
        Raw image data (JPEG / PNG / DICOM-derived PNG).
    pixel_spacing_mm : float | None
        Calibrated mm-per-pixel scale.  When provided, the ScientificRefiner
        uses real-world millimetre distances to validate and improve landmark
        positions.  When None, pixel-fraction heuristics are used as fallback.

    Returns
    -------
    Dict[str, LandmarkPoint]
        Always returns a landmark dict — falls back to anatomically-positioned
        placeholders when the model is unavailable or inference fails.
    """
    global _model, _device

    if pixel_spacing_mm is not None and pixel_spacing_mm > 0:
        logger.info(
            f"Landmark detection with calibration: {pixel_spacing_mm:.4f} mm/px "
            f"({1.0 / pixel_spacing_mm:.2f} px/mm)"
        )
    else:
        logger.info("Landmark detection without calibration (pixel-fraction heuristics).")

    # Parse image once; reuse for both fallback sizing and inference.
    try:
        img_pil = Image.open(io.BytesIO(image_bytes)).convert("L")
        orig_W, orig_H = img_pil.size
        img_np = np.array(img_pil)
    except Exception as e:
        logger.error(f"Failed to decode image: {e}")
        return get_fallback_landmarks(image_bytes)

    landmarks = _make_fallback_landmarks(orig_W, orig_H)

    if _model is None:
        logger.warning("Model not loaded. Returning fallback placeholders.")
        return landmarks

    try:
        def run_forward(gray: np.ndarray) -> torch.Tensor:
            # Convert numpy to PIL for torchvision transforms
            pil_img = Image.fromarray(gray)
            t = pre_trans(pil_img).unsqueeze(0).to(_device)
            with torch.no_grad():
                return _model(t)

        # Pass A: direct inference
        outputs = run_forward(img_np)
        base_landmarks = _make_fallback_landmarks(orig_W, orig_H)
        _apply_model_outputs_to_landmarks(base_landmarks, outputs, orig_W, orig_H)

        base_ok = _is_expected_orientation(base_landmarks)
        # Mirrored inference improves robustness, but on CPU it doubles latency.
        # The default deployment path uses CPU, so keep the faster single pass there.
        if str(_device).startswith("cuda"):
            flipped = np.ascontiguousarray(np.fliplr(img_np))
            outputs_m = run_forward(flipped)
            mirrored_landmarks = _make_fallback_landmarks(orig_W, orig_H)
            _apply_model_outputs_to_landmarks(mirrored_landmarks, outputs_m, orig_W, orig_H)
            _mirror_landmarks_x(mirrored_landmarks, orig_W)

            mirror_ok = _is_expected_orientation(mirrored_landmarks)

            if not base_ok and mirror_ok:
                logger.info("S–N orientation mismatch in base pass; selecting mirrored pass.")
                landmarks = mirrored_landmarks
            elif base_ok and mirror_ok:
                landmarks = _merge_landmarks(base_landmarks, mirrored_landmarks, orig_W, orig_H)
            else:
                landmarks = base_landmarks
        else:
            landmarks = base_landmarks

        landmarks = ScientificRefiner.refine(
            landmarks, orig_W, orig_H, pixel_spacing_mm=pixel_spacing_mm
        )
        return landmarks

    except Exception as e:
        logger.error(f"Inference failed — returning fallback landmarks: {e}", exc_info=True)
        return landmarks


def _make_fallback_landmarks(w: int, h: int) -> Dict[str, LandmarkPoint]:
    """Build anatomically-positioned placeholder landmarks for given image dimensions."""
    def p(xf: float, yf: float, conf: float = 0.50) -> LandmarkPoint:
        return LandmarkPoint(x=xf * w, y=yf * h, confidence=conf)

    return {
        "S":       p(0.55, 0.30),
        "N":       p(0.75, 0.28),
        "Or":      p(0.70, 0.38),
        "Po":      p(0.50, 0.38),
        "A":       p(0.72, 0.52),
        "B":       p(0.70, 0.65),
        "Pog":     p(0.70, 0.70),
        "Gn":      p(0.68, 0.72),
        "Me":      p(0.65, 0.75),
        "Go":      p(0.50, 0.70),
        "ANS":     p(0.72, 0.48),
        "PNS":     p(0.60, 0.50),
        "U1":      p(0.70, 0.58),
        "U1_c":    p(0.70, 0.52),
        "L1":      p(0.68, 0.60),
        "L1_c":    p(0.68, 0.65),
        "GLA":     p(0.80, 0.20),
        "SoftN":   p(0.78, 0.28),
        "Prn":     p(0.85, 0.45),
        "Sn":      p(0.78, 0.50),
        "Ls":      p(0.79, 0.54),
        "Li":      p(0.77, 0.62),
        "SoftPog": p(0.75, 0.71),
        "SoftGn":  p(0.73, 0.75),
        "Co":      p(0.50, 0.42),
        "U6":      p(0.65, 0.54),
        "L6":      p(0.64, 0.60),
        "Ar":      p(0.50, 0.45),
        "Ba":      p(0.45, 0.48),
        "Pt":      p(0.58, 0.40),
        "Sm":      p(0.74, 0.68),
        "Gn2":     p(0.67, 0.73),
    }


def get_fallback_landmarks(image_bytes: bytes) -> Dict[str, LandmarkPoint]:
    """Public API: return fallback landmarks scaled to the given image."""
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.size
    except Exception:
        w, h = 800, 600
    return _make_fallback_landmarks(w, h)
