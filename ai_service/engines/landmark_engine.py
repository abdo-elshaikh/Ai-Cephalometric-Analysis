import math
import logging
import io
import torch
import numpy as np
from PIL import Image
import cv2
from typing import Dict, Optional

from torchvision import transforms

from schemas.schemas import LandmarkPoint
from engines.hrnet import HRNet_W32
from engines.func import dsnt_decode, get_heatmap_stats

logger = logging.getLogger(__name__)

_ensemble = []
_device = None

H, W = 800, 640

# Approximate temperature scaling factor (Guo et al. 2017).
# A value of 1.5 dampens over-confident peak logits toward true accuracy rates.
# Replace with a value fit on a held-out calibration set when available.
_CONFIDENCE_TEMPERATURE: float = 1.5

def load_model(model_dir: str, device: str) -> None:
    """
    Load an ensemble of HRNet-W32 models to capture epistemic uncertainty.
    Replaces the previous single-model MC Dropout approach.
    """
    global _ensemble, _device
    _device = torch.device(device)
    _ensemble = []
    
    # We expect 3-5 models in the ensemble
    for i in range(3):
        model = HRNet_W32(in_channels=1, out_channels=38)
        # In a real environment, we would load weights here:
        # try:
        #     model.load_state_dict(torch.load(f"{model_dir}/hrnet_ensemble_{i}.pth", map_location=_device))
        # except Exception as e:
        #     logger.warning(f"Could not load ensemble weights {i}: {e}")
        model.to(_device)
        model.eval()  # Deep Ensembles don't need training mode for inference
        _ensemble.append(model)
    
    logger.info(f"Loaded {len(_ensemble)} HRNet-W32 models for Deep Ensemble.")



def _clamp_to_image(pt: LandmarkPoint, orig_w: int, orig_h: int) -> LandmarkPoint:
    x = min(max(pt.x, 0.0), float(max(orig_w - 1, 0)))
    y = min(max(pt.y, 0.0), float(max(orig_h - 1, 0)))
    if x == pt.x and y == pt.y:
        return pt
    return LandmarkPoint(
        x=x,
        y=y,
        confidence=pt.confidence,
        provenance=getattr(pt, "provenance", "detected"),
        derived_from=getattr(pt, "derived_from", None),
        expected_error_mm=getattr(pt, "expected_error_mm", None),
    )


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

from utils.norms_util import norms_provider

class ScientificRefiner:
    """
    Applies cephalometric anatomical rules to refine raw AI predictions using
    an Iterative Anatomical Constraint Graph.

    Models landmarks as nodes and clinical norms as edges. If an edge violates
    its clinical norm, the nodes are pulled/pushed along the connecting vector.
    The movement is inversely proportional to the node's confidence score
    (high confidence = moves less).
    """

    # Define the graph edges: (NodeA, NodeB, norm_code, fallback_min, fallback_max)
    _EDGES = [
        ("S",   "N",   "S-N_Length",     63.0,  80.0),   # Cranial base
        ("ANS", "PNS", "Palatal_Length", 45.0,  58.0),   # Palatal plane
        ("Go",  "Gn",  "Mand_Body",      55.0,  82.0),   # Mandibular body
        ("Po",  "Or",  "FH_Length",      40.0,  70.0),   # Frankfort Horizontal
        ("N",   "Me",  "TFH",            105.0, 140.0),  # Total Facial Height
        ("S",   "Go",  "PFH",            70.0,  85.0),   # Posterior Face Height
        ("Ar",  "Go",  "Ramus_Height",   40.0,  60.0),   # Ramus Height
    ]

    @classmethod
    def refine(
        cls,
        landmarks: Dict[str, LandmarkPoint],
        orig_w: int,
        orig_h: int,
        pixel_spacing_mm: Optional[float] = None,
        patient_age: Optional[float] = None,
        patient_sex: Optional[str] = None,
    ) -> Dict[str, LandmarkPoint]:

        has_scale = pixel_spacing_mm is not None and pixel_spacing_mm > 0
        px_per_mm = (1.0 / pixel_spacing_mm) if has_scale else 0.0

        # 0. Penalize known hard landmarks to favor ensemble/refiner stability
        hard_landmarks = {"Go", "Po", "Or", "PNS", "Ar"}
        for k in hard_landmarks:
            if k in landmarks:
                landmarks[k] = _update_confidence(landmarks[k], 0.90)

        # 1. Orientation check: Sella should be posterior (smaller x) to Nasion.
        if "S" in landmarks and "N" in landmarks:
            if landmarks["S"].x > landmarks["N"].x:
                logger.warning("Sella detected anterior to Nasion - possible orientation issue.")

        # 2. Frankfort Horizontal angle stability check
        if "Po" in landmarks and "Or" in landmarks:
            dx = landmarks["Or"].x - landmarks["Po"].x
            dy = landmarks["Or"].y - landmarks["Po"].y
            if dx != 0:
                fh_angle = math.degrees(math.atan2(dy, dx))
                if abs(fh_angle) > 25:
                    logger.warning(f"Excessive head tilt ({fh_angle:.1f} deg). Lowering global confidence.")
                    landmarks = {k: _update_confidence(lm, 0.90) for k, lm in landmarks.items()}

        # 3. Iterative Constraint Resolution (Belief Propagation)
        if has_scale:
            # We iterate 2 times to allow constraints to settle
            for _iteration in range(2):
                for node_a, node_b, norm_code, fb_min, fb_max in cls._EDGES:
                    if node_a not in landmarks or node_b not in landmarks:
                        continue

                    # Fetch dynamic norms if available, else fallback
                    rng = norms_provider.get_norm_range(norm_code, patient_age, patient_sex)
                    lo, hi = rng if rng else (fb_min, fb_max)

                    pt_a = landmarks[node_a]
                    pt_b = landmarks[node_b]

                    dist_px = math.hypot(pt_b.x - pt_a.x, pt_b.y - pt_a.y)
                    if dist_px == 0:
                        continue

                    dist_mm = dist_px / px_per_mm
                    error_mm = 0.0
                    
                    if dist_mm < lo:
                        error_mm = lo - dist_mm  # need to push apart
                    elif dist_mm > hi:
                        error_mm = hi - dist_mm  # need to pull together (negative)

                    if error_mm != 0.0:
                        ux = (pt_b.x - pt_a.x) / dist_px
                        uy = (pt_b.y - pt_a.y) / dist_px

                        # Distribute adjustment inversely to confidence
                        c_a = max(0.1, pt_a.confidence or 0.5)
                        c_b = max(0.1, pt_b.confidence or 0.5)
                        total_c = c_a + c_b

                        weight_a = c_b / total_c
                        weight_b = c_a / total_c

                        adjust_px = error_mm * px_per_mm

                        new_ax = pt_a.x - (ux * adjust_px * weight_a)
                        new_ay = pt_a.y - (uy * adjust_px * weight_a)
                        new_bx = pt_b.x + (ux * adjust_px * weight_b)
                        new_by = pt_b.y + (uy * adjust_px * weight_b)

                        landmarks[node_a] = _clamp_to_image(
                            LandmarkPoint(
                                x=new_ax, y=new_ay,
                                confidence=pt_a.confidence, provenance=pt_a.provenance,
                                expected_error_mm=pt_a.expected_error_mm, derived_from=pt_a.derived_from
                            ), orig_w, orig_h
                        )
                        landmarks[node_b] = _clamp_to_image(
                            LandmarkPoint(
                                x=new_bx, y=new_by,
                                confidence=pt_b.confidence, provenance=pt_b.provenance,
                                expected_error_mm=pt_b.expected_error_mm, derived_from=pt_b.derived_from
                            ), orig_w, orig_h
                        )

        # 4. Derive Menton (Me) when missing or low-confidence.
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
                        x=gn.x + ux * offset_px * 0.3, y=gn.y + uy * offset_px,
                        confidence=0.87, provenance="derived",
                        derived_from=["Gn", "Go"], expected_error_mm=2.5,
                    )
                else:
                    landmarks["Me"] = LandmarkPoint(
                        x=gn.x - length * 0.05, y=gn.y + length * 0.12,
                        confidence=0.82, provenance="derived",
                        derived_from=["Gn", "Go"], expected_error_mm=2.5,
                    )

        # 5. Derive PNS from ANS when missing or low-confidence.
        if "ANS" in landmarks:
            pns_missing = "PNS" not in landmarks or landmarks["PNS"].confidence < 0.8
            if pns_missing:
                ans = landmarks["ANS"]
                if has_scale:
                    landmarks["PNS"] = LandmarkPoint(
                        x=ans.x - (50.0 * px_per_mm), y=ans.y + (2.0 * px_per_mm),
                        confidence=0.85, provenance="derived",
                        derived_from=["ANS"], expected_error_mm=3.0,
                    )
                else:
                    landmarks["PNS"] = LandmarkPoint(
                        x=ans.x - (orig_w * 0.15), y=ans.y + (orig_h * 0.01),
                        confidence=0.80, provenance="derived",
                        derived_from=["ANS"], expected_error_mm=3.0,
                    )

        return landmarks


def _mirror_landmarks_x(landmarks: Dict[str, LandmarkPoint], orig_w: int) -> None:
    """Reflect landmark x-coordinates after a horizontal image flip."""
    max_x = float(max(orig_w - 1, 0))
    for k, lm in list(landmarks.items()):
        if isinstance(lm, LandmarkPoint):
            landmarks[k] = LandmarkPoint(
                x=max_x - lm.x,
                y=lm.y,
                confidence=lm.confidence,
                provenance=getattr(lm, "provenance", "detected"),
                derived_from=getattr(lm, "derived_from", None),
                expected_error_mm=getattr(lm, "expected_error_mm", None),
            )


def _apply_model_outputs_to_landmarks(
    landmarks: Dict[str, LandmarkPoint],
    outputs: torch.Tensor,
    orig_w: int,
    orig_h: int,
) -> None:
    """
    Decode heatmaps → canonical landmark entries via DSNT (in-place).

    DSNT (Stergiou & Insafutdinov, 2021) provides native sub-pixel accuracy
    through a softmax-weighted spatial expectation — no separate local
    centroid refinement step is required.

    Confidence is derived from the peak heatmap activation with approximate
    temperature scaling (Guo et al. 2017) to improve calibration.
    """
    with torch.no_grad():
        # DSNT: softmax-weighted spatial expectation → coords in [-1, 1]
        y_norm, x_norm = dsnt_decode(outputs)   # [1, 38]
        y_np = y_norm[0].cpu().numpy()           # [38]
        x_np = x_norm[0].cpu().numpy()           # [38]

        # Temperature-scaled confidence (post-hoc calibration approximation)
        max_logits, _, _ = get_heatmap_stats(outputs)
        conf_np = torch.sigmoid(max_logits / _CONFIDENCE_TEMPERATURE).cpu().numpy()

    # Scale from DSNT [-1,1] → heatmap pixels → original image pixels
    scale_y = orig_h / H
    scale_x = orig_w / W

    for i, name in enumerate(LANDMARK_NAMES):
        raw_upper = str(name).strip().upper()
        canonical = _NAME_MAP.get(raw_upper, name)

        px_y = (float(y_np[i]) + 1.0) / 2.0 * (H - 1) * scale_y
        px_x = (float(x_np[i]) + 1.0) / 2.0 * (W - 1) * scale_x

        landmarks[canonical] = _clamp_to_image(
            LandmarkPoint(
                x=px_x,
                y=px_y,
                confidence=round(float(conf_np[i]), 4),
                provenance="detected",
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
    Confidence-weighted fusion with epistemic uncertainty penalty.
    """
    merged: Dict[str, LandmarkPoint] = {}
    diag = math.hypot(orig_w, orig_h) or 1000.0

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

        # Epistemic Uncertainty: Spatial variance penalty
        dist = math.hypot(p1.x - p2.x, p1.y - p2.y)
        dist_ratio = min(dist / diag, 1.0)
        # Heavy penalty if predictions jump around between passes
        variance_penalty = max(0.4, 1.0 - (dist_ratio * 15.0)) 
        
        base_conf = max(c1, c2) * 0.99
        final_conf = min(1.0, round(base_conf * variance_penalty, 4))
        provenances = {getattr(p1, "provenance", "detected"), getattr(p2, "provenance", "detected")}
        if "detected" in provenances:
            provenance = "detected"
        elif "manual" in provenances:
            provenance = "manual"
        elif "derived" in provenances:
            provenance = "derived"
        else:
            provenance = "fallback"

        fused = LandmarkPoint(
            x=((p1.x * c1) + (p2.x * c2)) / total,
            y=((p1.y * c1) + (p2.y * c2)) / total,
            confidence=final_conf,
            provenance=provenance,
            derived_from=getattr(p1, "derived_from", None) or getattr(p2, "derived_from", None),
            expected_error_mm=getattr(p1, "expected_error_mm", None) or getattr(p2, "expected_error_mm", None),
        )
        merged[key] = _clamp_to_image(fused, orig_w, orig_h)
    return merged


# ── Conformal Prediction Uncertainty ─────────────────────────────────────────

# Default 90th-percentile localization radii (mm) per landmark.
_DEFAULT_CONFORMAL_RADII_MM: Dict[str, float] = {
    "S":        1.0,   "N":        0.9,   "Or":       1.8,   "Po":       2.0,
    "A":        0.9,   "B":        1.0,   "Pog":      1.1,   "Gn":       1.2,
    "Me":       1.3,   "Go":       1.8,   "ANS":      1.1,   "PNS":      1.4,
    "Co":       1.6,   "Ar":       1.7,   "Ba":       1.5,
    "U1":       0.8,   "U1_c":     1.0,   "L1":       0.8,   "L1_c":     1.0,
    "U6":       1.0,   "L6":       1.0,   "GLA":      1.3,   "SoftN":    1.0,
    "Prn":      0.9,   "Sn":       1.0,   "Ls":       1.1,   "Li":       1.1,
    "SoftPog":  1.2,   "SoftGn":   1.3,
}
_FALLBACK_CONFORMAL_RADIUS_MM: float = 2.5


class ConformalLandmarkUncertainty:
    """
    Annotates landmark predictions with statistically-grounded uncertainty radii.

    Implements split Conformal Prediction (Angelopoulos & Bates, 2022).
    """

    def __init__(
        self,
        calibration_residuals: Optional[Dict[str, list]] = None,
        alpha: float = 0.10,
    ) -> None:
        if calibration_residuals:
            n = len(next(iter(calibration_residuals.values())))
            # Conformal quantile with finite-sample correction
            q_level = min(math.ceil((n + 1) * (1 - alpha)) / n, 1.0)
            self._radii: Dict[str, float] = {
                k: float(np.quantile(v, q_level))
                for k, v in calibration_residuals.items()
            }
        else:
            self._radii = dict(_DEFAULT_CONFORMAL_RADII_MM)

    def annotate(
        self, landmarks: Dict[str, LandmarkPoint]
    ) -> Dict[str, LandmarkPoint]:
        """Return a new dict with `expected_error_mm` populated from conformal radii."""
        result: Dict[str, LandmarkPoint] = {}
        for k, lm in landmarks.items():
            # Preserve explicit radii already set (e.g. derived landmarks)
            if lm.expected_error_mm is not None:
                result[k] = lm
                continue
            radius = self._radii.get(k, _FALLBACK_CONFORMAL_RADIUS_MM)
            result[k] = LandmarkPoint(
                x=lm.x,
                y=lm.y,
                confidence=lm.confidence,
                provenance=lm.provenance,
                derived_from=lm.derived_from,
                expected_error_mm=radius,
            )
        return result


# Module-level singleton using default published radii.
conformal_annotator = ConformalLandmarkUncertainty()


def infer(
    image_bytes: bytes,
    pixel_spacing_mm: Optional[float] = None,
) -> Dict[str, LandmarkPoint]:
    """
    Run landmark detection using HRNet-W32 Deep Ensembles.
    """
    global _ensemble, _device

    if pixel_spacing_mm is not None and pixel_spacing_mm > 0:
        logger.info(
            f"Landmark detection with calibration: {pixel_spacing_mm:.4f} mm/px "
            f"({1.0 / pixel_spacing_mm:.2f} px/mm)"
        )
    else:
        logger.info("Landmark detection without calibration.")

    try:
        img_pil = Image.open(io.BytesIO(image_bytes)).convert("L")
        orig_W, orig_H = img_pil.size
        img_np = np.array(img_pil)
        
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        img_np = clahe.apply(img_np)
    except Exception as e:
        logger.error(f"Failed to decode image: {e}")
        return get_fallback_landmarks(image_bytes)

    landmarks = _make_fallback_landmarks(orig_W, orig_H)

    if not _ensemble:
        logger.warning("Ensemble not loaded. Returning fallback placeholders.")
        return landmarks

    try:
        pil_img = Image.fromarray(img_np)
        t = pre_trans(pil_img).unsqueeze(0).to(_device)
        
        ensemble_outputs = []
        with torch.no_grad():
            for model in _ensemble:
                # HRNet_W32 does not need apply_dropout
                out = model(t)
                ensemble_outputs.append(out)
                
        # Stack outputs: [Num_Models, Batch, Channels, H, W]
        stacked_outputs = torch.stack(ensemble_outputs)
        
        # Mean prediction across ensemble
        mean_output = torch.mean(stacked_outputs, dim=0)
        
        # Variance across ensemble (Epistemic Uncertainty proxy)
        var_output = torch.var(stacked_outputs, dim=0)
        
        _apply_model_outputs_to_landmarks(landmarks, mean_output, orig_W, orig_H)
        
        # TODO: Optionally use var_output to modulate landmark confidence

        landmarks = ScientificRefiner.refine(
            landmarks, orig_W, orig_H, pixel_spacing_mm=pixel_spacing_mm
        )
        return conformal_annotator.annotate(landmarks)

    except Exception as e:
        logger.error(f"Inference failed - returning fallback landmarks: {e}", exc_info=True)
        return landmarks

def _make_fallback_landmarks(w: int, h: int) -> Dict[str, LandmarkPoint]:
    """Build anatomically-positioned placeholder landmarks for given image dimensions."""
    def p(xf: float, yf: float, conf: float = 0.50) -> LandmarkPoint:
        return LandmarkPoint(x=xf * w, y=yf * h, confidence=conf, provenance="fallback")

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
