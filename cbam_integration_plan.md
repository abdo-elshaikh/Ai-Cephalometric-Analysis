# CBAM Attention Integration for Cephalometric Landmark Detection

## Background

Your current model is a standard **UNet** (`net.py`) with:
- **Encoder**: 4 `Down` blocks (64 → 128 → 256 → 512 → 512 channels)
- **Decoder**: 4 `Up` blocks using skip connections
- **Output**: `OutConv` producing 38 heatmaps (one per landmark)

**CBAM** (Convolutional Block Attention Module) adds two sequential attention gates after every convolutional block:
1. **Channel Attention** — tells the model *which feature maps* matter (e.g., "focus on bone-density channels")
2. **Spatial Attention** — tells the model *where* in the feature map to look (e.g., "focus near the midface")

For cephalometric X-rays this is particularly valuable because landmarks like `A`, `B`, `ANS` are clustered in small, anatomically-specific regions that pure convolution can miss.

---

## Why CBAM Beats Simpler Alternatives Here

| Mechanism | Captures Channel Context | Captures Spatial Context | Overhead |
|---|---|---|---|
| SE Block | ✅ | ❌ | Low |
| Non-local / Self-Attention | ✅ | ✅ | Very High |
| **CBAM** | ✅ | ✅ | **Low** |
| No Attention (current) | ❌ | ❌ | None |

---

## Integration Strategy

There are **two levels** of integration. Choose based on whether you will retrain or not.

### Option A — Plug CBAM into Bottleneck Only (Minimal retraining needed)
Add CBAM only at the bottleneck (`down4` output = 512ch). The skip connections are unchanged.  
**Best if**: you want to quickly test benefit without full retraining.

### Option B — Full CBAM in Every Encoder Block (Recommended, requires retraining)
Add CBAM after each `DoubleConv` in both encoder and decoder.  
**Best if**: you are planning to retrain the model (which you should for best accuracy).

> [!IMPORTANT]
> If you load a **pre-trained `.pth` weight file** trained without CBAM, the new attention parameters will NOT be in it and `load_state_dict` will fail with missing keys. You must either:  
> (a) use `strict=False` in `load_state_dict` to ignore missing keys (the base conv weights will still load), or  
> (b) retrain from scratch / fine-tune with the new architecture.

---

## Full Code: `engines/cbam.py` (New File)

```python
"""
CBAM: Convolutional Block Attention Module
Paper: https://arxiv.org/abs/1807.06521

Integrated into the UNet architecture for cephalometric landmark detection.
CBAM sequentially applies channel attention then spatial attention after
each convolutional block, enabling the network to focus on anatomically
relevant regions and feature channels in lateral cephalometric X-rays.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class ChannelAttention(nn.Module):
    """
    Channel Attention Module.
    Learns to weight each feature channel using global average & max pooling,
    passed through a shared MLP. Helps the model decide which feature maps
    (e.g., edge-detecting, density-sensitive) are most relevant.

    Args:
        in_channels: Number of input feature channels.
        reduction_ratio: Compression ratio for the MLP bottleneck (default 16).
    """
    def __init__(self, in_channels: int, reduction_ratio: int = 16):
        super().__init__()
        bottleneck = max(in_channels // reduction_ratio, 1)

        # Shared MLP applied to both avg-pooled and max-pooled descriptors
        self.shared_mlp = nn.Sequential(
            nn.Linear(in_channels, bottleneck, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(bottleneck, in_channels, bias=False),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, C, H, W)
        B, C, H, W = x.shape

        # Global average pool: (B, C)
        avg_pool = x.view(B, C, -1).mean(dim=2)
        # Global max pool: (B, C)
        max_pool = x.view(B, C, -1).max(dim=2).values

        # Shared MLP on both descriptors
        avg_out = self.shared_mlp(avg_pool)   # (B, C)
        max_out = self.shared_mlp(max_pool)   # (B, C)

        # Sum and sigmoid gate
        scale = torch.sigmoid(avg_out + max_out).view(B, C, 1, 1)
        return x * scale  # Broadcast channel-wise


class SpatialAttention(nn.Module):
    """
    Spatial Attention Module.
    Generates a 2D attention map highlighting *where* in the feature map
    the model should focus, using channel-pooled statistics and a
    single 7×7 convolution.

    Args:
        kernel_size: Convolution kernel size (7 recommended in paper).
    """
    def __init__(self, kernel_size: int = 7):
        super().__init__()
        assert kernel_size in (3, 7), "Kernel size must be 3 or 7"
        padding = kernel_size // 2
        self.conv = nn.Conv2d(2, 1, kernel_size=kernel_size,
                              padding=padding, bias=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, C, H, W)
        # Channel-wise average and max across channels
        avg_map = x.mean(dim=1, keepdim=True)       # (B, 1, H, W)
        max_map = x.max(dim=1, keepdim=True).values # (B, 1, H, W)

        # Concatenate and convolve to get spatial attention map
        combined = torch.cat([avg_map, max_map], dim=1)  # (B, 2, H, W)
        scale = torch.sigmoid(self.conv(combined))        # (B, 1, H, W)
        return x * scale  # Broadcast spatially


class CBAM(nn.Module):
    """
    Full CBAM: Channel Attention followed by Spatial Attention.

    Applied after each DoubleConv block in the UNet encoder/decoder.
    Enables the network to selectively emphasize:
    - Which feature channels encode anatomically relevant structures
    - Which spatial regions contain landmark candidate positions

    Args:
        in_channels: Number of feature channels.
        reduction_ratio: Channel attention MLP bottleneck ratio (default 16).
        spatial_kernel_size: Spatial attention conv kernel size (default 7).
    """
    def __init__(self, in_channels: int,
                 reduction_ratio: int = 16,
                 spatial_kernel_size: int = 7):
        super().__init__()
        self.channel_att = ChannelAttention(in_channels, reduction_ratio)
        self.spatial_att = SpatialAttention(spatial_kernel_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.channel_att(x)
        x = self.spatial_att(x)
        return x
```

---

## Modified `engines/net.py` — Option B (Full Integration)

Apply the diff below. The changes are **additive** — only the `DoubleConv` and `UNet.__init__` need to change.

```diff
+from engines.cbam import CBAM

 class DoubleConv(nn.Module):
     """(convolution => [BN] => ReLU) * 2"""

-    def __init__(self, in_channels, out_channels, mid_channels=None):
+    def __init__(self, in_channels, out_channels, mid_channels=None, use_cbam=True):
         super().__init__()
         if not mid_channels:
             mid_channels = out_channels
         self.double_conv = nn.Sequential(
             nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
             nn.InstanceNorm2d(out_channels, affine=True),
             nn.ReLU(inplace=True),
             nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
             nn.InstanceNorm2d(out_channels, affine=True),
             nn.ReLU(inplace=True)
         )
+        # CBAM attention applied after the double convolution
+        self.cbam = CBAM(out_channels) if use_cbam else nn.Identity()

     def forward(self, x):
-        return self.double_conv(x)
+        return self.cbam(self.double_conv(x))
```

> [!NOTE]
> The `Down` and `Up` modules don't need changes — they call `DoubleConv` internally, which now automatically includes CBAM.  
> The `OutConv` (1×1 conv) does **not** get CBAM since it's a classification head.

---

## Loading Pre-trained Weights with CBAM (Inference)

In `landmark_engine.py`, change the `load_model` call:

```python
# BEFORE (strict load — will FAIL with new CBAM params):
_model.load_state_dict(torch.load(model_path, map_location=device))

# AFTER (non-strict load — base conv weights load, CBAM weights initialize randomly):
state_dict = torch.load(model_path, map_location=device)
missing, unexpected = _model.load_state_dict(state_dict, strict=False)
logger.info(f"CBAM integration: {len(missing)} new params initialized, "
            f"{len(unexpected)} unexpected keys ignored.")
```

> [!WARNING]
> Running inference with randomly-initialized CBAM weights (via `strict=False`) will **degrade accuracy** compared to the original model until you fine-tune. The attention modules will not have learned meaningful patterns yet. Use this only as a temporary measure or for testing the pipeline. **You must fine-tune** to get the benefit of CBAM.

---

## Retraining Guidance

### 1. Recommended Training Loop Changes

After adding CBAM, fine-tune with a **lower learning rate** to avoid disturbing the pre-trained convolutional weights:

```python
optimizer = torch.optim.Adam([
    {'params': [p for n, p in model.named_parameters() if 'cbam' not in n],
     'lr': 1e-5},   # Pre-trained conv layers — small LR
    {'params': [p for n, p in model.named_parameters() if 'cbam' in n],
     'lr': 1e-3},   # New CBAM layers — normal LR
])
```

### 2. Loss Function (Unchanged)
Keep your existing heatmap regression loss (Wing Loss or MSE on heatmaps). CBAM is architecture-level and doesn't require loss changes.

### 3. Expected Improvement
Based on literature:
- **~1–3% MRE reduction** (Mean Radial Error) on cephalometric datasets
- **Biggest gains** on anatomically ambiguous landmarks: `B`, `Pog`, `ANS`, `U1`, `L1`
- CBAM is particularly effective on **grayscale X-ray images** where spatial context is critical

---

## Parameter Count Impact

| Component | Added Parameters per Block |
|---|---|
| ChannelAttention(64) | ~1,024 |
| ChannelAttention(128) | ~4,096 |
| ChannelAttention(256) | ~16,384 |
| ChannelAttention(512) | ~65,536 |
| SpatialAttention (all) | ~98 each |
| **Total new params (Full CBAM)** | **~≈375K** |

Original UNet for this task: ~31M params. CBAM adds ~1.2% overhead — negligible.

---

## File Summary

| File | Action | Notes |
|---|---|---|
| `engines/cbam.py` | **CREATE** | Full CBAM module |
| `engines/net.py` | **MODIFY** | Add `use_cbam` param to `DoubleConv`, import CBAM |
| `engines/landmark_engine.py` | **MODIFY** | Use `strict=False` in `load_state_dict` |

---

## Option A — Bottleneck-Only (Minimal Change)

If you want the smallest possible change without full retraining:

```python
# In UNet.__init__, after self.down4:
self.bottleneck_cbam = CBAM(512)

# In UNet.forward, after x5 = self.down4(x4):
x5 = self.bottleneck_cbam(x5)
```

This adds CBAM only at the bottleneck (deepest features, 512ch), adding only ~65K params. It has the lowest risk of disrupting existing weights.
