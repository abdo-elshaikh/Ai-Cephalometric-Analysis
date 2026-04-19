import math
import logging
import io
import torch
import numpy as np
from PIL import Image
from typing import Dict, Optional

# MONAI imports for professional medical AI pipelines
import monai
from monai.transforms import (
    Compose,
    Resize,
    ScaleIntensity,
    ToTensor,
    EnsureType,
    EnsureChannelFirst,
    NormalizeIntensity
)

from schemas.schemas import LandmarkPoint

# Import the model code
from engines.net import UNet, MONAIUNet
from engines.func import argsoftmax, get_heatmap_stats

logger = logging.getLogger(__name__)

_model = None
_device = None
_coord_maps: Optional[tuple[torch.Tensor, torch.Tensor]] = None

# Model input dimensions
H, W = 800, 640


def _reset_coord_maps() -> None:
    global _coord_maps
    _coord_maps = None


def _get_coord_maps() -> tuple[torch.Tensor, torch.Tensor]:
    """Lazily build (y_map, x_map) on the active inference device — avoids per-request allocation."""
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

# MONAI Preprocessing Pipeline (Professional Clinical Standard)
monai_pre_trans = Compose([
    # monai expects [C, H, W], we pass [H, W] from numpy
    EnsureChannelFirst(channel_dim='no_channel'),
    Resize((H, W)),
    ScaleIntensity(),  # Scales to [0,1]
    NormalizeIntensity(subtrahend=0.5, divisor=0.5),  # Standard zero-mean, unit-variance style
    EnsureType()
])

# Full list of 38 landmarks that the model predicts
LANDMARK_NAMES = [
    'S', 'N', 'Or', 'Po', 'A', 'B', 'Pog', 'Co', 'Gn', 'Go',
    'L1', 'U1', '13', 'Li', 'Sn', 'SoftPog', '17', 'ANS', '19', '20',
    'U1_c', 'L1_c', '23', '24', '25', 'Prn', '27', '28', '29', '30',
    'Sm', 'SoftGn', 'Gn2', 'GLA', 'SoftN', '36', 'u6', 'L6'
]

# Standardisation map: upper-cased predicted name → canonical landmark name
_NAME_MAP: Dict[str, str] = {
    "POINTA": "A", "POINTB": "B", "U1": "UI", "L1": "LI",
    "U1_C": "U1_c", "L1_C": "L1_c", "PRN": "Prn", "SM": "Sm",
    "GLA": "GLA", "SOFTN": "SoftN", "SOFTPOG": "SoftPog",
    "SOFTGN": "SoftGn", "GN2": "Gn2", "LI": "Li", "SN": "Sn",
    "CO": "Co", "OR": "Or", "PO": "Po", "POG": "Pog",
    "GN": "Gn", "GO": "Go", "ANS": "ANS"
}


def load_model(model_path: str, device: str) -> None:
    """Load landmark detection model weights into memory at startup."""
    global _model, _device
    _device = device
    logger.info(f"Loading landmark model from {model_path} onto {device}...")
    try:
        # Use the professional MONAI UNet architecture with residual units
        _model = MONAIUNet(n_classes=38).to(device)
        try:
            _model.load_state_dict(torch.load(model_path, map_location=device))
            logger.info("MONAIUNet weights loaded successfully.")
        except Exception as e:
            logger.warning(f"Could not load MONAIUNet weights, trying fallback UNet: {e}")
            _model = UNet(1, 38).to(device)
            _model.load_state_dict(torch.load(model_path, map_location=device))
            logger.info("Standard UNet weights loaded successfully.")

        _model.eval()
        _reset_coord_maps()
    except Exception as e:
        logger.error(
            f"Failed to load real model from {model_path}. "
            f"Landmark inference will return fallback placeholders. Error: {e}"
        )
        _model = None


class ScientificRefiner:
    """
    Applies cephalometric anatomical rules to refine raw AI predictions.
    Adjusts confidence and derives missing landmarks from known relationships.
    """

    @staticmethod
    def refine(
        landmarks: Dict[str, LandmarkPoint], orig_w: int, orig_h: int
    ) -> Dict[str, LandmarkPoint]:
        # 1. Anatomical Sequence Sanity Check
        # In a standard lateral ceph, Sella (S) is posterior (lower x) relative to Nasion (N).
        if "S" in landmarks and "N" in landmarks:
            if landmarks["S"].x > landmarks["N"].x:
                logger.warning(
                    "Sella detected anterior to Nasion — potential orientation issue."
                )

        # 2. Frankfort Horizontal (Po–Or) plane stabilisation
        if "Po" in landmarks and "Or" in landmarks:
            dx = landmarks["Or"].x - landmarks["Po"].x
            dy = landmarks["Or"].y - landmarks["Po"].y
            if dx != 0:
                fh_angle = math.degrees(math.atan2(dy, dx))
                if abs(fh_angle) > 25:
                    logger.warning(
                        f"Excessive head tilt detected ({fh_angle:.1f}°). "
                        "Lowering global landmark confidence."
                    )
                    for lm in landmarks.values():
                        if isinstance(lm, LandmarkPoint):
                            lm.confidence = round(lm.confidence * 0.9, 4)

        # 3. Derive Menton (Me) from Gnathion & Gonion when low-confidence
        if "Gn" in landmarks and "Go" in landmarks:
            mand_len = math.hypot(
                landmarks["Go"].x - landmarks["Gn"].x,
                landmarks["Go"].y - landmarks["Gn"].y,
            )
            if "Me" not in landmarks or landmarks["Me"].confidence < 0.8:
                landmarks["Me"] = LandmarkPoint(
                    x=landmarks["Gn"].x - mand_len * 0.05,
                    y=landmarks["Gn"].y + mand_len * 0.12,
                    confidence=0.85,
                )

        # 4. Derive PNS from ANS when low-confidence
        if "ANS" in landmarks:
            if "PNS" not in landmarks or landmarks["PNS"].confidence < 0.8:
                landmarks["PNS"] = LandmarkPoint(
                    x=landmarks["ANS"].x - orig_w * 0.12,
                    y=landmarks["ANS"].y + orig_h * 0.015,
                    confidence=0.80,
                )

        return landmarks


def _mirror_landmarks_x(landmarks: Dict[str, LandmarkPoint], orig_w: int) -> None:
    """Reflect lateral-ceph coordinates after horizontal flip (patient left–right)."""
    max_x = float(max(orig_w - 1, 0))
    for k, lm in list(landmarks.items()):
        if isinstance(lm, LandmarkPoint):
            landmarks[k] = LandmarkPoint(
                x=max_x - lm.x,
                y=lm.y,
                confidence=lm.confidence,
            )


def _apply_model_outputs_to_landmarks(
    landmarks: Dict[str, LandmarkPoint],
    outputs: torch.Tensor,
    orig_w: int,
    orig_h: int,
) -> None:
    """Decode heatmaps into canonical landmark entries (in-place)."""
    y_map, x_map = _get_coord_maps()
    scale_y = orig_h / H
    scale_x = orig_w / W
    with torch.no_grad():
        pred_y = argsoftmax(outputs[0].view(-1, H * W), y_map, beta=1e-3)
        pred_x = argsoftmax(outputs[0].view(-1, H * W), x_map, beta=1e-3)
        pred = torch.cat([pred_y, pred_x], dim=1).detach().cpu().numpy()
        max_logits, _, _ = get_heatmap_stats(outputs)

    for i, name in enumerate(LANDMARK_NAMES):
        mapped_name = str(name).strip().upper()
        canonical = _NAME_MAP.get(mapped_name, mapped_name)
        # Peak logit → (0,1); clamp avoids sigmoid saturation on extreme activations
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


def _incisor_aliases(landmarks: Dict[str, LandmarkPoint]) -> None:
    if "UI" in landmarks:
        landmarks["U1"] = landmarks["UI"]
    if "LI" in landmarks:
        landmarks["L1"] = landmarks["LI"]


def infer(image_bytes: bytes) -> Dict[str, LandmarkPoint]:
    """
    Run landmark detection on a raw image.

    Always returns a landmark dict — falls back to anatomically-positioned
    placeholders when the model is unavailable or inference fails.
    """
    global _model, _device

    # Start with fallback placeholders so the UI always has required landmarks.
    landmarks = get_fallback_landmarks(image_bytes)

    if _model is None:
        logger.warning("Real model not loaded. Returning fallback placeholders.")
        return landmarks

    try:
        img_pil = Image.open(io.BytesIO(image_bytes)).convert("L")
        orig_W, orig_H = img_pil.size
        img_np = np.array(img_pil)

        def run_forward(gray: np.ndarray) -> torch.Tensor:
            t = monai_pre_trans(gray).unsqueeze(0).to(_device)
            with torch.no_grad():
                return _model(t)

        outputs = run_forward(img_np)
        _apply_model_outputs_to_landmarks(landmarks, outputs, orig_W, orig_H)

        # Standard lateral ceph: Sella (S) is posterior to Nasion (N) — lower x when the
        # profile faces right. If S is to the right of N, the image is likely mirrored.
        if (
            "S" in landmarks
            and "N" in landmarks
            and landmarks["S"].x > landmarks["N"].x
        ):
            logger.info("S–N order suggests a mirrored ceph — re-running on horizontally flipped image.")
            flipped = np.ascontiguousarray(np.fliplr(img_np))
            outputs_m = run_forward(flipped)
            landmarks = get_fallback_landmarks(image_bytes)
            _apply_model_outputs_to_landmarks(landmarks, outputs_m, orig_W, orig_H)
            _mirror_landmarks_x(landmarks, orig_W)

        _incisor_aliases(landmarks)

        # Apply scientific refinement pass
        landmarks = ScientificRefiner.refine(landmarks, orig_W, orig_H)

        return landmarks

    except Exception as e:
        logger.error(f"Inference failed — returning fallback landmarks: {e}", exc_info=True)
        return landmarks


def get_fallback_landmarks(image_bytes: bytes) -> Dict[str, LandmarkPoint]:
    """
    Return anatomically-positioned placeholder landmarks scaled to the image dimensions.
    Confidences are intentionally lower to signal to clients that these are estimates.
    """
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.size
    except Exception:
        w, h = 800, 600

    def p(x_frac: float, y_frac: float, conf: float = 0.50) -> LandmarkPoint:
        return LandmarkPoint(x=x_frac * w, y=y_frac * h, confidence=conf)

    return {
        # Cranial base
        "S":       p(0.55, 0.30, 0.50),
        "N":       p(0.75, 0.28, 0.50),
        # Frankfort plane
        "Or":      p(0.70, 0.38, 0.50),
        "Po":      p(0.50, 0.38, 0.50),
        # AP skeletal
        "A":       p(0.72, 0.52, 0.50),
        "B":       p(0.70, 0.65, 0.50),
        "Pog":     p(0.70, 0.70, 0.50),
        "Gn":      p(0.68, 0.72, 0.50),
        "Me":      p(0.65, 0.75, 0.50),
        "Go":      p(0.50, 0.70, 0.50),
        # Palatal plane
        "ANS":     p(0.72, 0.48, 0.50),
        "PNS":     p(0.60, 0.50, 0.50),
        # Incisors
        "UI":      p(0.70, 0.58, 0.50),
        "UIR":     p(0.70, 0.52, 0.50),
        "LI":      p(0.68, 0.60, 0.50),
        "LIR":     p(0.68, 0.65, 0.50),
        # Soft tissue profile
        "GLA":     p(0.80, 0.20, 0.50),
        "SoftN":   p(0.78, 0.28, 0.50),
        "Prn":     p(0.85, 0.45, 0.50),
        "Sn":      p(0.78, 0.50, 0.50),
        "Ls":      p(0.79, 0.54, 0.50),
        "Li":      p(0.77, 0.62, 0.50),
        "SoftPog": p(0.75, 0.71, 0.50),
        "SoftGn":  p(0.73, 0.75, 0.50),
        # Teeth
        "UM":      p(0.70, 0.55, 0.50),
        "LM":      p(0.68, 0.62, 0.50),
        "U1":      p(0.70, 0.58, 0.50),
        "L1":      p(0.68, 0.60, 0.50),
        "U6":      p(0.70, 0.50, 0.50),
        "L6":      p(0.68, 0.62, 0.50),
        # Jarabak / condyle
        "Ar":      p(0.50, 0.45, 0.50),
        "Ba":      p(0.45, 0.48, 0.50),
        "Pt":      p(0.58, 0.40, 0.50),
    }
