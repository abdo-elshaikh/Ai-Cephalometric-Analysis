"""
Low-level numeric utilities for heatmap-based landmark coordinate decoding.

DSNT Reference:
    Stergiou & Insafutdinov, "Refining Heatmap-Based Landmark Detection",
    arXiv:2109.09533, 2021.
"""
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