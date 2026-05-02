"""
Low-level numeric utilities for heatmap-based landmark coordinate decoding.

DSNT Reference:
    Stergiou & Insafutdinov, "Refining Heatmap-Based Landmark Detection",
    arXiv:2109.09533, 2021.

Entropy confidence reference:
    Tompson JJ et al., "Efficient Object Localization Using Convolutional Networks",
    CVPR 2015; Shannon CE, "A Mathematical Theory of Communication", Bell Syst 1948.

Spatial variance reference:
    Nibali A et al., "Numerical Coordinate Regression with Convolutional Neural Networks",
    arXiv:1801.07372, 2018. (DSNT variance as localization uncertainty proxy.)
"""
import math as _math
import torch
import torch.nn.functional as F


def dsnt_decode(heatmaps: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """
    DSNT — Differentiable Spatial to Numerical Transform.

    Maps raw heatmap logits to sub-pixel landmark coordinates via a
    softmax-weighted spatial expectation. Replaces the argsoftmax
    approximation with a principled, differentiable decode that achieves
    native sub-pixel accuracy without any separate local refinement step.

    Args:
        heatmaps: [B, C, H, W] raw logits (pre-softmax).

    Returns:
        y_coords, x_coords — [B, C] normalized in [-1, 1].
        Convert to pixel space:
            px_y = (y_coord + 1) / 2 * (H - 1)
            px_x = (x_coord + 1) / 2 * (W - 1)
    """
    B, C, H, W = heatmaps.shape
    flat = heatmaps.view(B, C, -1)
    prob = F.softmax(flat, dim=-1).view(B, C, H, W)

    # Coordinate grids bounded in [-1+Δ, 1-Δ] for numerical stability
    y_grid = torch.linspace(-1.0 + 1.0 / H, 1.0 - 1.0 / H, H, device=heatmaps.device)
    x_grid = torch.linspace(-1.0 + 1.0 / W, 1.0 - 1.0 / W, W, device=heatmaps.device)

    y_coords = (prob.sum(dim=-1) * y_grid).sum(dim=-1)   # [B, C]
    x_coords = (prob.sum(dim=-2) * x_grid).sum(dim=-1)   # [B, C]
    return y_coords, x_coords


def heatmap_entropy_confidence(heatmaps: torch.Tensor) -> torch.Tensor:
    """
    Shannon entropy-based confidence score for landmark heatmaps.

    A sharp (concentrated) heatmap has low entropy → high confidence.
    A diffuse (near-uniform) heatmap has high entropy → low confidence.

    Motivation: The raw peak logit value is a proxy for confidence but is
    sensitive to temperature and architecture. The normalized entropy of the
    softmax probability distribution is a principled, scale-invariant measure
    of how "peaked" the heatmap is, independent of absolute logit magnitude.

    Returns:
        [B, C] tensor of confidence values in [0, 1].
        1 = Dirac delta (perfectly concentrated), 0 = uniform.

    Reference:
        Shannon CE (1948). A mathematical theory of communication.
        Bell Syst Tech J 27(3):379-423.
    """
    B, C, H, W = heatmaps.shape
    flat = heatmaps.view(B, C, -1)
    prob = F.softmax(flat, dim=-1)
    log_prob = torch.log(prob + 1e-10)
    entropy = -(prob * log_prob).sum(dim=-1)           # [B, C] — nats
    max_entropy = _math.log(H * W)                     # log(N) for uniform distribution
    return (1.0 - entropy / max_entropy).clamp(0.0, 1.0)  # [B, C]


def dsnt_spatial_variance(heatmaps: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Compute the marginal spatial variance of the heatmap probability distribution.

    Var[X] = E[X²] - E[X]²  where X is drawn from the softmax distribution.

    A sharp heatmap → near-zero variance (precise localization).
    A diffuse heatmap → high variance (uncertain localization).

    Returns:
        var_y, var_x — [B, C] variance tensors in normalized [-1, 1] coordinate space.

    To convert to pixel standard deviation:
        σ_y_pixels = sqrt(var_y) * (H - 1) / 2
        σ_x_pixels = sqrt(var_x) * (W - 1) / 2

    Reference:
        Nibali A et al. (2018). Numerical Coordinate Regression with Convolutional
        Neural Networks. arXiv:1801.07372. (DSNT spatial variance as uncertainty proxy.)
    """
    B, C, H, W = heatmaps.shape
    flat = heatmaps.view(B, C, -1)
    prob = F.softmax(flat, dim=-1).view(B, C, H, W)

    y_grid = torch.linspace(-1.0 + 1.0 / H, 1.0 - 1.0 / H, H, device=heatmaps.device)
    x_grid = torch.linspace(-1.0 + 1.0 / W, 1.0 - 1.0 / W, W, device=heatmaps.device)

    # Marginal distributions
    p_y = prob.sum(dim=-1)   # [B, C, H]
    p_x = prob.sum(dim=-2)   # [B, C, W]

    e_y  = (p_y * y_grid).sum(dim=-1)           # E[Y]  — [B, C]
    e_y2 = (p_y * y_grid ** 2).sum(dim=-1)      # E[Y²]
    e_x  = (p_x * x_grid).sum(dim=-1)           # E[X]
    e_x2 = (p_x * x_grid ** 2).sum(dim=-1)      # E[X²]

    var_y = (e_y2 - e_y ** 2).clamp(min=0.0)    # numerical safety clamp
    var_x = (e_x2 - e_x ** 2).clamp(min=0.0)
    return var_y, var_x


def argsoftmax(x: torch.Tensor, index: torch.Tensor, beta: float = 1e-2) -> torch.Tensor:
    """
    Legacy differentiable-argmax via exponential weighting.

    .. deprecated::
        Retained solely for backward compatibility with existing checkpoints.
        Use :func:`dsnt_decode` for all new code — it is more accurate and
        numerically stable.
    """
    a = torch.exp(-torch.abs(x - x.max(dim=1).values.unsqueeze(1)) / beta)
    b = torch.sum(a, dim=1).unsqueeze(1)
    softmax = a / b
    return torch.mm(softmax, index)


def get_heatmap_stats(
    outputs: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Extract peak activation values (confidence proxy) and grid-space max locations.

    Returns:
        peak_values [C], max_y [C], max_x [C] — all for batch index 0.
    """
    batch_size, n_classes, h, w = outputs.shape
    flattened = outputs.view(batch_size, n_classes, -1)
    max_vals, max_indices = torch.max(flattened, dim=2)
    y = max_indices // w
    x = max_indices % w
    return max_vals[0], y[0], x[0]
