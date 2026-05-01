"""
HRNet-W32 — Full 4-Stage High-Resolution Network for cephalometric landmark detection.

Reference: Wang et al., "Deep High-Resolution Representation Learning for Visual Recognition",
           IEEE TPAMI 2020. https://arxiv.org/abs/1908.07919

Architecture (W32 configuration):
  Stem     : 2× stride-2 conv + 4× Bottleneck blocks → 256ch @ H/4 × W/4
  Stage 2  : 1 HRModule, 2 branches  [32, 64]
  Stage 3  : 4 HRModules, 3 branches [32, 64, 128]
  Stage 4  : 3 HRModules, 4 branches [32, 64, 128, 256]
  Head     : All branches upsampled → concat (480ch) → 1×1 conv → out_channels heatmaps

W32 channel widths: [32, 64, 128, 256]
Total concat channels at head: 32+64+128+256 = 480
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import List


# ── Building Blocks ──────────────────────────────────────────────────────────

class BasicBlock(nn.Module):
    """2-conv residual block — used in all HR parallel branches."""
    expansion = 1

    def __init__(self, inplanes: int, planes: int, stride: int = 1, downsample=None):
        super().__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, 3, stride=stride, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(planes)
        self.conv2 = nn.Conv2d(planes, planes, 3, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(planes)
        self.relu  = nn.ReLU(inplace=True)
        self.downsample = downsample

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x if self.downsample is None else self.downsample(x)
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.relu(out + identity)


class Bottleneck(nn.Module):
    """1×1→3×3→1×1 bottleneck block — used only in Stage 1 stem."""
    expansion = 4

    def __init__(self, inplanes: int, planes: int, stride: int = 1, downsample=None):
        super().__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, 1, bias=False)
        self.bn1   = nn.BatchNorm2d(planes)
        self.conv2 = nn.Conv2d(planes, planes, 3, stride=stride, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(planes)
        self.conv3 = nn.Conv2d(planes, planes * self.expansion, 1, bias=False)
        self.bn3   = nn.BatchNorm2d(planes * self.expansion)
        self.relu  = nn.ReLU(inplace=True)
        self.downsample = downsample

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        identity = x if self.downsample is None else self.downsample(x)
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.relu(self.bn2(self.conv2(out)))
        out = self.bn3(self.conv3(out))
        return self.relu(out + identity)


def _make_layer(block, inplanes: int, planes: int, num_blocks: int, stride: int = 1):
    """Stack `num_blocks` residual layers."""
    downsample = None
    if stride != 1 or inplanes != planes * block.expansion:
        downsample = nn.Sequential(
            nn.Conv2d(inplanes, planes * block.expansion, 1, stride=stride, bias=False),
            nn.BatchNorm2d(planes * block.expansion),
        )
    layers = [block(inplanes, planes, stride, downsample)]
    in_ch = planes * block.expansion
    for _ in range(1, num_blocks):
        layers.append(block(in_ch, planes))
    return nn.Sequential(*layers)


# ── HR Module ─────────────────────────────────────────────────────────────────

class HRModule(nn.Module):
    """
    One High-Resolution Module: parallel branches + full multi-resolution fusion.

    Branch index 0 = highest resolution (fewest channels).
    Branch index n = lowest resolution (most channels).

    Fusion: every branch receives summed contributions from all other branches,
    downsampled (stride-2 conv) or upsampled (bilinear) as needed.
    ReLU is applied after the summation.
    """

    def __init__(self, num_branches: int, channels: List[int], num_blocks: int = 4):
        super().__init__()
        self.num_branches = num_branches

        # Independent BasicBlock sequences per branch
        self.branches = nn.ModuleList([
            nn.Sequential(*[BasicBlock(channels[i], channels[i]) for _ in range(num_blocks)])
            for i in range(num_branches)
        ])

        # fuse_layers[i][j]: transform branch-j output to branch-i resolution/channels
        self.fuse_layers = nn.ModuleList()
        for i in range(num_branches):
            row = nn.ModuleList()
            for j in range(num_branches):
                if i == j:
                    row.append(nn.Identity())
                elif j < i:
                    # j has HIGHER resolution → downsample to match branch i
                    layers = []
                    cur_ch = channels[j]
                    n_strides = i - j
                    for k in range(n_strides):
                        next_ch = channels[i] if k == n_strides - 1 else channels[j]
                        layers += [
                            nn.Conv2d(cur_ch, next_ch, 3, stride=2, padding=1, bias=False),
                            nn.BatchNorm2d(next_ch),
                        ]
                        if k < n_strides - 1:
                            layers.append(nn.ReLU(inplace=True))
                        cur_ch = next_ch
                    row.append(nn.Sequential(*layers))
                else:
                    # j has LOWER resolution → 1×1 conv + bilinear upsample to match branch i
                    row.append(nn.Sequential(
                        nn.Conv2d(channels[j], channels[i], 1, bias=False),
                        nn.BatchNorm2d(channels[i]),
                        nn.Upsample(scale_factor=2 ** (j - i), mode="bilinear", align_corners=False),
                    ))
            self.fuse_layers.append(row)

        self.relu = nn.ReLU(inplace=True)

    def forward(self, x: List[torch.Tensor]) -> List[torch.Tensor]:
        x = [branch(xi) for branch, xi in zip(self.branches, x)]
        out: List[torch.Tensor] = []
        for i, row in enumerate(self.fuse_layers):
            fused = row[0](x[0])
            for j in range(1, self.num_branches):
                fused = fused + row[j](x[j])
            out.append(self.relu(fused))
        return out


# ── Transition Layers ─────────────────────────────────────────────────────────

def _make_transition(in_channels: List[int], out_channels: List[int]) -> nn.ModuleList:
    """
    Build channel-adapter modules between stages.
    Existing branches adjust channels if needed; new branches downsample from the last branch.
    """
    transitions = nn.ModuleList()
    for i, out_ch in enumerate(out_channels):
        if i < len(in_channels):
            in_ch = in_channels[i]
            if in_ch == out_ch:
                transitions.append(nn.Identity())
            else:
                transitions.append(nn.Sequential(
                    nn.Conv2d(in_ch, out_ch, 3, padding=1, bias=False),
                    nn.BatchNorm2d(out_ch),
                    nn.ReLU(inplace=True),
                ))
        else:
            # New branch: stride-2 from the last existing input branch
            n_strides = i - len(in_channels) + 1
            layers = []
            cur_ch = in_channels[-1]
            for k in range(n_strides):
                next_ch = out_ch if k == n_strides - 1 else cur_ch
                layers += [
                    nn.Conv2d(cur_ch, next_ch, 3, stride=2, padding=1, bias=False),
                    nn.BatchNorm2d(next_ch),
                    nn.ReLU(inplace=True),
                ]
                cur_ch = next_ch
            transitions.append(nn.Sequential(*layers))
    return transitions


def _apply_transition(
    transitions: nn.ModuleList,
    x_list: List[torch.Tensor],
) -> List[torch.Tensor]:
    """
    Apply transition modules.
    Existing branches consume their matching input; new branches consume the last input.
    """
    out = []
    for i, t in enumerate(transitions):
        src = x_list[i] if i < len(x_list) else x_list[-1]
        out.append(t(src))
    return out


# ── Full HRNet-W32 ─────────────────────────────────────────────────────────────

class HRNet_W32(nn.Module):
    """
    Full 4-stage HRNet-W32 for cephalometric landmark heatmap detection.

    W32 channel widths per branch: [32, 64, 128, 256]

    Input : [B, in_channels, H, W]  — grayscale X-ray, H=W=512 recommended
    Output: [B, out_channels, H/4, W/4]  — one heatmap per landmark
    """

    _CHANNELS: List[int] = [32, 64, 128, 256]

    def __init__(self, in_channels: int = 1, out_channels: int = 80):
        super().__init__()

        # ── Stem ─────────────────────────────────────────────────────────────
        # Two stride-2 convs reduce spatial resolution to 1/4.
        self.conv1 = nn.Conv2d(in_channels, 64, 3, stride=2, padding=1, bias=False)
        self.bn1   = nn.BatchNorm2d(64)
        self.conv2 = nn.Conv2d(64, 64, 3, stride=2, padding=1, bias=False)
        self.bn2   = nn.BatchNorm2d(64)
        self.relu  = nn.ReLU(inplace=True)

        # Stage 1: 4 Bottleneck blocks → 256 channels (Bottleneck.expansion=4)
        self.stage1 = _make_layer(Bottleneck, 64, 64, num_blocks=4)

        # ── Stage 2: 2 branches [32, 64] ─────────────────────────────────────
        self.trans1 = _make_transition([256], [32, 64])
        self.stage2 = nn.Sequential(HRModule(2, [32, 64], num_blocks=4))

        # ── Stage 3: 3 branches [32, 64, 128], 4 modules ─────────────────────
        self.trans2 = _make_transition([32, 64], [32, 64, 128])
        self.stage3 = nn.Sequential(
            *[HRModule(3, [32, 64, 128], num_blocks=4) for _ in range(4)]
        )

        # ── Stage 4: 4 branches [32, 64, 128, 256], 3 modules ────────────────
        self.trans3 = _make_transition([32, 64, 128], [32, 64, 128, 256])
        self.stage4 = nn.Sequential(
            *[HRModule(4, [32, 64, 128, 256], num_blocks=4) for _ in range(3)]
        )

        # ── Output head ───────────────────────────────────────────────────────
        # Concatenate all 4 branches after upsampling to branch-0 resolution.
        # Total channels: 32+64+128+256 = 480
        total_ch = sum(self._CHANNELS)
        self.final_layer = nn.Sequential(
            nn.Conv2d(total_ch, total_ch, 1, bias=False),
            nn.BatchNorm2d(total_ch),
            nn.ReLU(inplace=True),
            nn.Conv2d(total_ch, out_channels, 1),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Stem
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))

        # Stage 1 (single branch Bottleneck → 256ch)
        x = self.stage1(x)

        # Stage 2
        x_list = [t(x) for t in self.trans1]          # both branches from same stem output
        x_list = self.stage2(x_list)

        # Stage 3
        x_list = _apply_transition(self.trans2, x_list)
        x_list = self.stage3(x_list)

        # Stage 4
        x_list = _apply_transition(self.trans3, x_list)
        x_list = self.stage4(x_list)

        # Aggregate: upsample all branches to branch-0 spatial size, concatenate
        h, w = x_list[0].shape[2], x_list[0].shape[3]
        parts = [x_list[0]] + [
            F.interpolate(x_list[i], size=(h, w), mode="bilinear", align_corners=False)
            for i in range(1, len(x_list))
        ]
        out = torch.cat(parts, dim=1)
        return self.final_layer(out)
