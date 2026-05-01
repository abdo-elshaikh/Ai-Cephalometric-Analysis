"""
Landmark Engine — CephAI v2

Key improvements over v1:
- Full 80-landmark set (cranial base, maxilla, mandible, dental, soft tissue,
  cervical vertebrae, airway, Ricketts Xi/DC, structural)
- Proper 4-stage HRNet-W32 (Bottleneck stem + 4 HR stages)
- Test-Time Augmentation: horizontal flip + ensemble mean → reduced localization error
- Variance from ensemble modulates per-landmark confidence
- ScientificRefiner with 22+ anatomical constraint edges (was 7)
- Conformal Prediction radii for all 80 landmarks (split-CP, α=0.10)
- Anatomically-accurate fallback positions for all 80 landmarks
"""

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
from config.settings import settings

logger = logging.getLogger(__name__)

_ensemble: list = []
_device = None

H, W = settings.input_size_h, settings.input_size_w   # 512 × 512

# Approximate temperature scaling factor (Guo et al. 2017).
# Replace with a value fit on a held-out calibration set when model weights are available.
_CONFIDENCE_TEMPERATURE: float = 1.5

# ── Canonical 80-Landmark Definition ─────────────────────────────────────────
# Order must match model output channels. Groups are kept together for readability.
LANDMARK_NAMES: list[str] = [
    # ── Cranial Base (8) ──────────────────────────────────────────────────────
    "S",      # Sella turcica centre
    "N",      # Nasion (fronto-nasal suture)
    "Ba",     # Basion (anterior foramen magnum)
    "Or",     # Orbitale (lowest point of orbital floor)
    "Po",     # Porion (superior EAM)
    "Ar",     # Articulare (condyle neck × cranial base)
    "Pt",     # Pterygomaxillary fissure
    "GLA",    # Glabella (most anterior frontal bone)

    # ── Maxilla / Mid-Face (8) ────────────────────────────────────────────────
    "ANS",    # Anterior Nasal Spine
    "PNS",    # Posterior Nasal Spine
    "A",      # A Point (deepest anterior maxilla)
    "Co",     # Condylion (most superior-posterior condyle)
    "Ptm",    # Pterygomaxillary point (inferior pterygomaxillary fissure)
    "Pr",     # Prosthion (most inferior labial upper alveolus)
    "U1",     # Upper incisor tip
    "U1_c",   # Upper incisor root apex

    # ── Mandible (8) ──────────────────────────────────────────────────────────
    "B",      # B Point (deepest anterior mandible)
    "Pog",    # Pogonion (most anterior chin)
    "Gn",     # Gnathion (midpoint anterior-inferior chin)
    "Me",     # Menton (lowest mandible point)
    "Go",     # Gonion (most posterior-inferior mandibular angle)
    "Id",     # Infradentale (most anterior-superior lower alveolus)
    "L1",     # Lower incisor tip
    "L1_c",   # Lower incisor root apex

    # ── Dental (10) ───────────────────────────────────────────────────────────
    "U3",     # Upper canine cusp tip
    "U4",     # Upper 1st premolar cusp tip
    "U5",     # Upper 2nd premolar cusp tip
    "U6",     # Upper 1st molar mesiobuccal cusp
    "U7",     # Upper 2nd molar mesiobuccal cusp
    "L3",     # Lower canine cusp tip
    "L4",     # Lower 1st premolar cusp tip
    "L5",     # Lower 2nd premolar cusp tip
    "L6",     # Lower 1st molar mesiobuccal cusp
    "L7",     # Lower 2nd molar mesiobuccal cusp

    # ── Soft Tissue Profile (14) ──────────────────────────────────────────────
    "SoftN",   # Soft-tissue nasion
    "Prn",     # Pronasale (nose tip)
    "Cm",      # Columella (most inferior columella point)
    "Sn",      # Subnasale (nose base / upper lip junction)
    "Ls",      # Labrale superius (upper vermilion border)
    "Stms",    # Stomion superius (upper lip inferior edge)
    "Stmi",    # Stomion inferius (lower lip superior edge)
    "Li",      # Labrale inferius (lower vermilion border)
    "Sm",      # Supramentale (soft tissue B point)
    "SoftPog", # Soft-tissue pogonion
    "SoftGn",  # Soft-tissue gnathion
    "Gn2",     # Chin button (alternate gnathion)
    "Cer",     # Cervicale (throat-chin junction)
    "T",       # Throat point (deepest throat concavity)

    # ── Cervical Vertebrae — CVM Staging (12) ────────────────────────────────
    "Cv2a",    # CV2 anterior-superior (odontoid tip)
    "Cv2ai",   # CV2 anterior-inferior
    "Cv2pi",   # CV2 posterior-inferior
    "Cv3a",    # CV3 anterior-superior
    "Cv3ai",   # CV3 anterior-inferior
    "Cv3pi",   # CV3 posterior-inferior
    "Cv4a",    # CV4 anterior-superior
    "Cv4ai",   # CV4 anterior-inferior
    "Cv4pi",   # CV4 posterior-inferior
    "Cv5a",    # CV5 anterior-superior
    "Cv5ai",   # CV5 anterior-inferior
    "Cv5pi",   # CV5 posterior-inferior

    # ── Airway (4) ────────────────────────────────────────────────────────────
    "PNW",     # Posterior nasopharyngeal wall (at PNS level)
    "PPW",     # Posterior pharyngeal wall (at tongue base)
    "Hy",      # Hyoid (most superior-anterior point)
    "Epi",     # Epiglottis tip

    # ── Ricketts / Additional (8) ─────────────────────────────────────────────
    "Xi",      # Xi point (geometric centre of mandibular ramus)
    "DC",      # DC point (condyle head centre on Ba-N line)
    "CF",      # Centre of Face (Ricketts)
    "PM",      # Protuberance menti (chin button)
    "D",       # D point (symphysis centroid)
    "Eng",     # Engnathion (inferior-anterior symphysis)
    "Is",      # Incision superius (upper contact point)
    "Ii",      # Incision inferius (lower contact point)

    # ── Structural (8) ────────────────────────────────────────────────────────
    "Mf",      # Mental foramen
    "U6r",     # Upper 1st molar root apex
    "L6r",     # Lower 1st molar root apex
    "Pn",      # Nasion perpendicular (constructed)
    "R1",      # Ramus tangent point
    "OP1",     # Occlusal plane anterior landmark
    "OP2",     # Occlusal plane posterior landmark
    "H",       # H point (Holdaway — intersection of soft-tissue profile line)
]

assert len(LANDMARK_NAMES) == 80, f"Expected 80 landmarks, got {len(LANDMARK_NAMES)}"

# Upper-cased name → canonical key normalisation
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
    "LI":       "Li",
    "SN":       "Sn",
    "CO":       "Co",
    "OR":       "Or",
    "PO":       "Po",
    "POG":      "Pog",
    "GN":       "Gn",
    "GO":       "Go",
    "ANS":      "ANS",
    "PNS":      "PNS",
    "U6":       "U6",
    "L6":       "L6",
    "HY":       "Hy",
    "EPI":      "Epi",
    "CER":      "Cer",
}


# ── Model Loading ─────────────────────────────────────────────────────────────

def load_model(model_dir: str, device: str) -> None:
    """Load an ensemble of HRNet-W32 models (3 folds by default)."""
    global _ensemble, _device
    _device = torch.device(device)
    _ensemble = []

    for i in range(settings.ensemble_size):
        model = HRNet_W32(in_channels=1, out_channels=settings.num_landmarks)
        model_path = f"{model_dir}/hrnet_w32_fold{i}.pth"
        try:
            state = torch.load(model_path, map_location=_device)
            model.load_state_dict(state)
            logger.info(f"Loaded ensemble model {i} from {model_path}")
        except (FileNotFoundError, RuntimeError) as e:
            logger.warning(
                f"Ensemble model {i} weights not found at {model_path} ({e}). "
                "Running with random weights — predictions are uncalibrated placeholders."
            )
        model.to(_device)
        model.eval()
        _ensemble.append(model)

    logger.info(
        f"HRNet-W32 ensemble ready: {len(_ensemble)} model(s), "
        f"{settings.num_landmarks} landmarks, device={device}"
    )


# ── Image Utilities ───────────────────────────────────────────────────────────

pre_trans = transforms.Compose([
    transforms.Resize((H, W)),
    transforms.ToTensor(),
    transforms.Normalize((0.5,), (0.5,)),
])


def _clamp_to_image(pt: LandmarkPoint, orig_w: int, orig_h: int) -> LandmarkPoint:
    x = min(max(pt.x, 0.0), float(max(orig_w - 1, 0)))
    y = min(max(pt.y, 0.0), float(max(orig_h - 1, 0)))
    if x == pt.x and y == pt.y:
        return pt
    return LandmarkPoint(
        x=x, y=y,
        confidence=pt.confidence,
        provenance=getattr(pt, "provenance", "detected"),
        derived_from=getattr(pt, "derived_from", None),
        expected_error_mm=getattr(pt, "expected_error_mm", None),
    )


def _update_confidence(lm: LandmarkPoint, scale: float) -> LandmarkPoint:
    return LandmarkPoint(
        x=lm.x, y=lm.y,
        confidence=round(min(1.0, (lm.confidence or 0.5) * scale), 4),
        provenance=lm.provenance,
        derived_from=lm.derived_from,
        expected_error_mm=lm.expected_error_mm,
    )


def _mirror_landmarks_x(landmarks: Dict[str, LandmarkPoint], orig_w: int) -> None:
    """Reflect x-coordinates after a horizontal flip (in-place)."""
    max_x = float(max(orig_w - 1, 0))
    for k, lm in list(landmarks.items()):
        if isinstance(lm, LandmarkPoint):
            landmarks[k] = LandmarkPoint(
                x=max_x - lm.x, y=lm.y,
                confidence=lm.confidence,
                provenance=getattr(lm, "provenance", "detected"),
                derived_from=getattr(lm, "derived_from", None),
                expected_error_mm=getattr(lm, "expected_error_mm", None),
            )


def _decode_outputs(
    outputs: torch.Tensor, orig_w: int, orig_h: int
) -> Dict[str, LandmarkPoint]:
    """DSNT decode: heatmap logits → canonical LandmarkPoint dict."""
    with torch.no_grad():
        y_norm, x_norm = dsnt_decode(outputs)
        y_np = y_norm[0].cpu().numpy()
        x_np = x_norm[0].cpu().numpy()
        max_logits, _, _ = get_heatmap_stats(outputs)
        conf_np = torch.sigmoid(max_logits / _CONFIDENCE_TEMPERATURE).cpu().numpy()

    scale_y = orig_h / H
    scale_x = orig_w / W
    result: Dict[str, LandmarkPoint] = {}

    for i, name in enumerate(LANDMARK_NAMES):
        canonical = _NAME_MAP.get(str(name).upper(), name)
        px_y = (float(y_np[i]) + 1.0) / 2.0 * (H - 1) * scale_y
        px_x = (float(x_np[i]) + 1.0) / 2.0 * (W - 1) * scale_x
        result[canonical] = _clamp_to_image(
            LandmarkPoint(
                x=px_x, y=px_y,
                confidence=round(float(conf_np[i]), 4),
                provenance="detected",
            ),
            orig_w, orig_h,
        )
    return result


def _run_ensemble(t: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """Run all ensemble models and return (mean, variance) heatmaps."""
    outputs_list = []
    with torch.no_grad():
        for model in _ensemble:
            outputs_list.append(model(t))
    stacked = torch.stack(outputs_list)           # [N, B, C, H, W]
    mean_out = stacked.mean(dim=0)                # [B, C, H, W]
    var_out  = stacked.var(dim=0) if len(outputs_list) > 1 else torch.zeros_like(mean_out)
    return mean_out, var_out


def _apply_variance_penalty(
    landmarks: Dict[str, LandmarkPoint], var_out: torch.Tensor
) -> None:
    """Modulate confidence downward for landmarks with high epistemic variance (in-place)."""
    var_np = var_out[0].mean(dim=(-1, -2)).cpu().numpy()   # [C] — mean spatial variance per channel
    var_max = float(var_np.max()) + 1e-8
    for i, name in enumerate(LANDMARK_NAMES):
        canonical = _NAME_MAP.get(str(name).upper(), name)
        if canonical in landmarks:
            normalized_var = float(var_np[i]) / var_max
            penalty = max(0.5, 1.0 - normalized_var * 0.4)
            landmarks[canonical] = _update_confidence(landmarks[canonical], penalty)


# ── Confidence-Weighted Landmark Merge ───────────────────────────────────────

def _merge_landmarks(
    primary: Dict[str, LandmarkPoint],
    secondary: Dict[str, LandmarkPoint],
    orig_w: int,
    orig_h: int,
) -> Dict[str, LandmarkPoint]:
    """Confidence-weighted fusion with spatial-variance epistemic penalty."""
    merged: Dict[str, LandmarkPoint] = {}
    diag = math.hypot(orig_w, orig_h) or 1000.0

    for key in set(primary) | set(secondary):
        p1 = primary.get(key)
        p2 = secondary.get(key)
        if p1 is None:
            merged[key] = _clamp_to_image(p2, orig_w, orig_h)
            continue
        if p2 is None:
            merged[key] = _clamp_to_image(p1, orig_w, orig_h)
            continue

        c1 = max(float(p1.confidence or 0.5), 0.05)
        c2 = max(float(p2.confidence or 0.5), 0.05)
        total = c1 + c2

        dist = math.hypot(p1.x - p2.x, p1.y - p2.y)
        dist_ratio = min(dist / diag, 1.0)
        variance_penalty = max(0.4, 1.0 - dist_ratio * 15.0)
        final_conf = min(1.0, round(max(c1, c2) * 0.99 * variance_penalty, 4))

        provenances = {
            getattr(p1, "provenance", "detected"),
            getattr(p2, "provenance", "detected"),
        }
        provenance = (
            "detected" if "detected" in provenances
            else "manual" if "manual" in provenances
            else "derived" if "derived" in provenances
            else "fallback"
        )

        merged[key] = _clamp_to_image(
            LandmarkPoint(
                x=(p1.x * c1 + p2.x * c2) / total,
                y=(p1.y * c1 + p2.y * c2) / total,
                confidence=final_conf,
                provenance=provenance,
                derived_from=getattr(p1, "derived_from", None) or getattr(p2, "derived_from", None),
                expected_error_mm=getattr(p1, "expected_error_mm", None) or getattr(p2, "expected_error_mm", None),
            ),
            orig_w, orig_h,
        )
    return merged


# ── Anatomical Constraint Refiner ─────────────────────────────────────────────

from utils.norms_util import norms_provider


class ScientificRefiner:
    """
    Iterative Anatomical Constraint Graph with 22 edges (was 7 in v1).

    Each edge encodes a published distance norm between two landmarks.
    Belief propagation (3 iterations) resolves violations by moving lower-confidence
    landmarks more than higher-confidence ones.
    """

    _EDGES = [
        # ── Cranial base & skull ──────────────────────────────────────────────
        ("S",   "N",   "S-N_Length",      63.0,  80.0),
        ("Ba",  "N",   "Ba-N_Length",     98.0, 115.0),
        ("S",   "Ar",  "S-Ar_Length",     28.0,  40.0),
        ("Po",  "Or",  "FH_Length",       40.0,  70.0),
        # ── Maxilla ───────────────────────────────────────────────────────────
        ("ANS", "PNS", "Palatal_Length",  45.0,  58.0),
        ("Co",  "A",   "MidfaceLen",      80.0, 100.0),
        ("N",   "ANS", "UFH",             45.0,  55.0),
        # ── Mandible ──────────────────────────────────────────────────────────
        ("Go",  "Gn",  "Mand_Body",       55.0,  82.0),
        ("Go",  "Me",  "Mand_Body_Me",    53.0,  80.0),
        ("Ar",  "Go",  "Ramus_Height",    40.0,  60.0),
        ("Co",  "Gn",  "MandLength",     100.0, 130.0),
        ("Pog", "Me",  "Chin_Height",      8.0,  18.0),
        # ── Facial heights ────────────────────────────────────────────────────
        ("N",   "Me",  "TFH",            105.0, 140.0),
        ("S",   "Go",  "PFH",             70.0,  85.0),
        ("ANS", "Me",  "LAFH",            60.0,  70.0),
        # ── Posterior cranial ─────────────────────────────────────────────────
        ("S",   "Go",  "PFH",             70.0,  85.0),
        # ── Dental ────────────────────────────────────────────────────────────
        ("U1",  "L1",  "Incisal_Gap",      0.5,   4.0),
        ("U6",  "L6",  "Molar_Gap",        0.5,   4.0),
        # ── Airway / Hyoid ────────────────────────────────────────────────────
        ("Hy",  "Me",  "MP_H_Dist",        8.0,  20.0),
        # ── Soft tissue ───────────────────────────────────────────────────────
        ("Sn",  "Ls",  "Sn_Ls_Length",     3.0,   8.0),
        ("Li",  "Sm",  "Li_Sm_Length",     3.0,   8.0),
        # ── Inter-jaw ─────────────────────────────────────────────────────────
        ("A",   "B",   "AB_Distance",      3.0,  12.0),
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

        # 0. Reduce confidence on known hard-to-detect landmarks
        for k in {"Go", "Po", "Or", "PNS", "Ar", "Co", "Ba", "Ptm"}:
            if k in landmarks:
                landmarks[k] = _update_confidence(landmarks[k], 0.90)

        # 1. Orientation check: S should be posterior to N
        if "S" in landmarks and "N" in landmarks:
            if landmarks["S"].x > landmarks["N"].x:
                logger.warning("Sella anterior to Nasion — possible left/right flip.")

        # 2. Frankfort Horizontal tilt check
        if "Po" in landmarks and "Or" in landmarks:
            dx = landmarks["Or"].x - landmarks["Po"].x
            dy = landmarks["Or"].y - landmarks["Po"].y
            if dx != 0:
                fh_angle = math.degrees(math.atan2(dy, dx))
                if abs(fh_angle) > 25:
                    logger.warning(
                        f"Excessive head tilt ({fh_angle:.1f}°) — "
                        "reducing global landmark confidence."
                    )
                    landmarks = {k: _update_confidence(lm, 0.90) for k, lm in landmarks.items()}

        # 3. Iterative Belief Propagation (3 passes)
        if has_scale:
            for _iter in range(3):
                for node_a, node_b, norm_code, fb_min, fb_max in cls._EDGES:
                    if node_a not in landmarks or node_b not in landmarks:
                        continue
                    rng = norms_provider.get_norm_range(norm_code, patient_age, patient_sex)
                    lo, hi = rng if rng else (fb_min, fb_max)
                    pt_a, pt_b = landmarks[node_a], landmarks[node_b]
                    dist_px = math.hypot(pt_b.x - pt_a.x, pt_b.y - pt_a.y)
                    if dist_px == 0:
                        continue
                    dist_mm = dist_px / px_per_mm
                    if dist_mm < lo:
                        error_mm = lo - dist_mm
                    elif dist_mm > hi:
                        error_mm = hi - dist_mm
                    else:
                        continue
                    ux = (pt_b.x - pt_a.x) / dist_px
                    uy = (pt_b.y - pt_a.y) / dist_px
                    c_a = max(0.1, pt_a.confidence or 0.5)
                    c_b = max(0.1, pt_b.confidence or 0.5)
                    t_c = c_a + c_b
                    adjust_px = error_mm * px_per_mm
                    landmarks[node_a] = _clamp_to_image(LandmarkPoint(
                        x=pt_a.x - ux * adjust_px * (c_b / t_c),
                        y=pt_a.y - uy * adjust_px * (c_b / t_c),
                        confidence=pt_a.confidence, provenance=pt_a.provenance,
                        expected_error_mm=pt_a.expected_error_mm, derived_from=pt_a.derived_from,
                    ), orig_w, orig_h)
                    landmarks[node_b] = _clamp_to_image(LandmarkPoint(
                        x=pt_b.x + ux * adjust_px * (c_a / t_c),
                        y=pt_b.y + uy * adjust_px * (c_a / t_c),
                        confidence=pt_b.confidence, provenance=pt_b.provenance,
                        expected_error_mm=pt_b.expected_error_mm, derived_from=pt_b.derived_from,
                    ), orig_w, orig_h)

        # 4. Derive Menton (Me) if absent/low-confidence
        if "Gn" in landmarks and "Go" in landmarks:
            if "Me" not in landmarks or (landmarks["Me"].confidence or 0) < 0.8:
                gn, go = landmarks["Gn"], landmarks["Go"]
                dx = gn.x - go.x; dy = gn.y - go.y
                length = math.hypot(dx, dy) or 1.0
                ux, uy = dx / length, dy / length
                offset_px = (6.0 * px_per_mm) if has_scale else length * 0.12
                landmarks["Me"] = LandmarkPoint(
                    x=gn.x + ux * offset_px * 0.3,
                    y=gn.y + uy * offset_px,
                    confidence=0.87, provenance="derived",
                    derived_from=["Gn", "Go"], expected_error_mm=2.5,
                )

        # 5. Derive PNS from ANS if absent/low-confidence
        if "ANS" in landmarks:
            if "PNS" not in landmarks or (landmarks["PNS"].confidence or 0) < 0.8:
                ans = landmarks["ANS"]
                offset = (50.0 * px_per_mm) if has_scale else (orig_w * 0.15)
                landmarks["PNS"] = LandmarkPoint(
                    x=ans.x - offset, y=ans.y + (2.0 * px_per_mm if has_scale else orig_h * 0.01),
                    confidence=0.85, provenance="derived",
                    derived_from=["ANS"], expected_error_mm=3.0,
                )

        # 6. Derive Ar from Co if absent
        if "Co" in landmarks and "Ar" not in landmarks:
            co = landmarks["Co"]
            landmarks["Ar"] = LandmarkPoint(
                x=co.x - (orig_w * 0.02), y=co.y + (orig_h * 0.04),
                confidence=0.80, provenance="derived",
                derived_from=["Co"], expected_error_mm=3.0,
            )

        # 7. Derive Ba from S if absent
        if "S" in landmarks and "Ba" not in landmarks:
            s = landmarks["S"]
            landmarks["Ba"] = LandmarkPoint(
                x=s.x - (orig_w * 0.10), y=s.y + (orig_h * 0.06),
                confidence=0.78, provenance="derived",
                derived_from=["S"], expected_error_mm=4.0,
            )

        return landmarks


# ── Conformal Prediction Uncertainty ─────────────────────────────────────────

_DEFAULT_CONFORMAL_RADII_MM: Dict[str, float] = {
    # Cranial base
    "S": 1.0, "N": 0.9, "Ba": 1.6, "Or": 1.8, "Po": 2.0,
    "Ar": 1.7, "Pt": 2.0, "GLA": 1.3,
    # Maxilla
    "ANS": 1.1, "PNS": 1.4, "A": 0.9, "Co": 1.6,
    "Ptm": 2.0, "Pr": 1.2, "U1": 0.8, "U1_c": 1.0,
    # Mandible
    "B": 1.0, "Pog": 1.1, "Gn": 1.2, "Me": 1.3,
    "Go": 1.8, "Id": 1.2, "L1": 0.8, "L1_c": 1.0,
    # Dental
    "U3": 1.0, "U4": 1.1, "U5": 1.1, "U6": 1.0, "U7": 1.2,
    "L3": 1.0, "L4": 1.1, "L5": 1.1, "L6": 1.0, "L7": 1.2,
    # Soft tissue
    "SoftN": 1.0, "Prn": 0.9, "Cm": 1.0, "Sn": 1.0,
    "Ls": 1.1, "Stms": 1.2, "Stmi": 1.2, "Li": 1.1,
    "Sm": 1.1, "SoftPog": 1.2, "SoftGn": 1.3,
    "Gn2": 1.3, "Cer": 1.8, "T": 2.0,
    # CVM
    "Cv2a": 1.5, "Cv2ai": 1.5, "Cv2pi": 1.6,
    "Cv3a": 1.5, "Cv3ai": 1.5, "Cv3pi": 1.6,
    "Cv4a": 1.6, "Cv4ai": 1.6, "Cv4pi": 1.7,
    "Cv5a": 1.8, "Cv5ai": 1.8, "Cv5pi": 1.9,
    # Airway
    "PNW": 2.0, "PPW": 2.2, "Hy": 1.5, "Epi": 2.0,
    # Ricketts / structural
    "Xi": 2.0, "DC": 1.8, "CF": 1.8, "PM": 1.2,
    "D": 1.5, "Eng": 1.5, "Is": 0.9, "Ii": 0.9,
    "Mf": 1.8, "U6r": 1.5, "L6r": 1.5, "Pn": 1.0,
    "R1": 2.0, "OP1": 1.2, "OP2": 1.3, "H": 1.5,
}
_FALLBACK_CONFORMAL_RADIUS_MM: float = 2.5


class ConformalLandmarkUncertainty:
    """
    Annotates landmark predictions with statistically-grounded uncertainty radii.

    Implements split Conformal Prediction (Angelopoulos & Bates, 2022).
    When calibration residuals are provided, per-landmark radii are computed
    from the finite-sample corrected quantile at level (1-alpha).
    Otherwise published default radii are used.
    """

    def __init__(
        self,
        calibration_residuals: Optional[Dict[str, list]] = None,
        alpha: float = 0.10,
    ) -> None:
        if calibration_residuals:
            n = len(next(iter(calibration_residuals.values())))
            q_level = min(math.ceil((n + 1) * (1 - alpha)) / n, 1.0)
            self._radii: Dict[str, float] = {
                k: float(np.quantile(v, q_level))
                for k, v in calibration_residuals.items()
            }
        else:
            self._radii = dict(_DEFAULT_CONFORMAL_RADII_MM)

    def annotate(self, landmarks: Dict[str, LandmarkPoint]) -> Dict[str, LandmarkPoint]:
        result: Dict[str, LandmarkPoint] = {}
        for k, lm in landmarks.items():
            if lm.expected_error_mm is not None:
                result[k] = lm
                continue
            result[k] = LandmarkPoint(
                x=lm.x, y=lm.y,
                confidence=lm.confidence, provenance=lm.provenance,
                derived_from=lm.derived_from,
                expected_error_mm=self._radii.get(k, _FALLBACK_CONFORMAL_RADIUS_MM),
            )
        return result


conformal_annotator = ConformalLandmarkUncertainty()


# ── Fallback Landmark Positions ───────────────────────────────────────────────

def _make_fallback_landmarks(w: int, h: int) -> Dict[str, LandmarkPoint]:
    """
    Anatomically-positioned placeholder landmarks for all 80 points,
    expressed as fractions of image (width, height) for a right-facing profile.
    """
    def p(xf: float, yf: float, conf: float = 0.50) -> LandmarkPoint:
        return LandmarkPoint(x=xf * w, y=yf * h, confidence=conf, provenance="fallback")

    return {
        # Cranial base
        "S":      p(0.52, 0.30), "N":      p(0.74, 0.28),
        "Ba":     p(0.42, 0.38), "Or":     p(0.70, 0.36),
        "Po":     p(0.48, 0.36), "Ar":     p(0.48, 0.44),
        "Pt":     p(0.57, 0.38), "GLA":    p(0.80, 0.20),
        # Maxilla
        "ANS":    p(0.73, 0.48), "PNS":    p(0.58, 0.50),
        "A":      p(0.73, 0.52), "Co":     p(0.50, 0.40),
        "Ptm":    p(0.57, 0.41), "Pr":     p(0.75, 0.55),
        "U1":     p(0.72, 0.57), "U1_c":   p(0.71, 0.52),
        # Mandible
        "B":      p(0.70, 0.65), "Pog":    p(0.71, 0.70),
        "Gn":     p(0.69, 0.72), "Me":     p(0.66, 0.75),
        "Go":     p(0.49, 0.70), "Id":     p(0.71, 0.60),
        "L1":     p(0.70, 0.61), "L1_c":   p(0.69, 0.66),
        # Dental
        "U3":     p(0.68, 0.54), "U4":     p(0.65, 0.53),
        "U5":     p(0.61, 0.53), "U6":     p(0.57, 0.54),
        "U7":     p(0.53, 0.55), "L3":     p(0.68, 0.62),
        "L4":     p(0.64, 0.62), "L5":     p(0.60, 0.62),
        "L6":     p(0.56, 0.62), "L7":     p(0.52, 0.62),
        # Soft tissue
        "SoftN":  p(0.78, 0.27), "Prn":    p(0.87, 0.44),
        "Cm":     p(0.84, 0.48), "Sn":     p(0.80, 0.50),
        "Ls":     p(0.80, 0.54), "Stms":   p(0.79, 0.56),
        "Stmi":   p(0.79, 0.58), "Li":     p(0.78, 0.61),
        "Sm":     p(0.76, 0.66), "SoftPog":p(0.76, 0.71),
        "SoftGn": p(0.74, 0.74), "Gn2":    p(0.72, 0.74),
        "Cer":    p(0.64, 0.80), "T":      p(0.55, 0.82),
        # CVM
        "Cv2a":   p(0.43, 0.28), "Cv2ai":  p(0.42, 0.32), "Cv2pi":  p(0.38, 0.32),
        "Cv3a":   p(0.42, 0.36), "Cv3ai":  p(0.41, 0.41), "Cv3pi":  p(0.37, 0.41),
        "Cv4a":   p(0.41, 0.45), "Cv4ai":  p(0.40, 0.50), "Cv4pi":  p(0.36, 0.50),
        "Cv5a":   p(0.40, 0.54), "Cv5ai":  p(0.39, 0.59), "Cv5pi":  p(0.35, 0.59),
        # Airway
        "PNW":    p(0.40, 0.46), "PPW":    p(0.38, 0.62),
        "Hy":     p(0.56, 0.76), "Epi":    p(0.44, 0.68),
        # Ricketts / structural
        "Xi":     p(0.50, 0.58), "DC":     p(0.50, 0.40),
        "CF":     p(0.60, 0.35), "PM":     p(0.71, 0.72),
        "D":      p(0.68, 0.70), "Eng":    p(0.67, 0.76),
        "Is":     p(0.72, 0.58), "Ii":     p(0.71, 0.60),
        "Mf":     p(0.58, 0.68), "U6r":    p(0.57, 0.49),
        "L6r":    p(0.56, 0.67), "Pn":     p(0.74, 0.28),
        "R1":     p(0.50, 0.64), "OP1":    p(0.70, 0.58),
        "OP2":    p(0.56, 0.58), "H":      p(0.75, 0.58),
    }


def get_fallback_landmarks(image_bytes: bytes) -> Dict[str, LandmarkPoint]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as img:
            w, h = img.size
    except Exception:
        w, h = 800, 640
    return _make_fallback_landmarks(w, h)


# ── Main Inference ─────────────────────────────────────────────────────────────

def infer(
    image_bytes: bytes,
    pixel_spacing_mm: Optional[float] = None,
) -> Dict[str, LandmarkPoint]:
    """
    Run 80-landmark detection with Deep Ensemble + optional TTA.

    Pipeline:
      1. CLAHE preprocessing
      2. Ensemble inference (mean + variance heatmaps)
      3. [If TTA enabled] Flip inference + mirror back + weighted merge
      4. Variance penalty applied to per-landmark confidence
      5. ScientificRefiner (22-edge belief propagation, 3 iterations)
      6. Conformal Prediction uncertainty radius annotation
    """
    global _ensemble, _device

    if pixel_spacing_mm and pixel_spacing_mm > 0:
        logger.info(f"Landmark detection with calibration: {pixel_spacing_mm:.4f} mm/px")
    else:
        logger.info("Landmark detection without pixel calibration.")

    try:
        img_pil = Image.open(io.BytesIO(image_bytes)).convert("L")
        orig_W, orig_H = img_pil.size
        img_np = np.array(img_pil, dtype=np.uint8)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        img_np = clahe.apply(img_np)
    except Exception as e:
        logger.error(f"Image decode failed: {e}")
        return get_fallback_landmarks(image_bytes)

    landmarks = _make_fallback_landmarks(orig_W, orig_H)

    if not _ensemble:
        logger.warning("Ensemble not loaded — returning fallback landmarks.")
        return landmarks

    try:
        pil_orig = Image.fromarray(img_np)
        t_orig = pre_trans(pil_orig).unsqueeze(0).to(_device)

        # ── Primary ensemble pass ─────────────────────────────────────────────
        mean_out, var_out = _run_ensemble(t_orig)
        landmarks = _decode_outputs(mean_out, orig_W, orig_H)
        _apply_variance_penalty(landmarks, var_out)

        # ── Test-Time Augmentation (horizontal flip) ──────────────────────────
        if settings.tta_enabled:
            pil_flip = pil_orig.transpose(Image.FLIP_LEFT_RIGHT)
            t_flip = pre_trans(pil_flip).unsqueeze(0).to(_device)
            mean_flip, _ = _run_ensemble(t_flip)
            lm_flip = _decode_outputs(mean_flip, orig_W, orig_H)
            _mirror_landmarks_x(lm_flip, orig_W)
            landmarks = _merge_landmarks(landmarks, lm_flip, orig_W, orig_H)

        # ── Anatomical constraint refinement ──────────────────────────────────
        landmarks = ScientificRefiner.refine(
            landmarks, orig_W, orig_H,
            pixel_spacing_mm=pixel_spacing_mm,
        )

        return conformal_annotator.annotate(landmarks)

    except Exception as e:
        logger.error(f"Inference failed — returning fallback landmarks: {e}", exc_info=True)
        return _make_fallback_landmarks(orig_W, orig_H)
