import torch
import torch.nn as nn
import torch.nn.functional as F

class BasicBlock(nn.Module):
    expansion = 1
    def __init__(self, inplanes, planes, stride=1, downsample=None):
        super(BasicBlock, self).__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, kernel_size=3, stride=stride, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(planes)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(planes, planes, kernel_size=3, stride=1, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(planes)
        self.downsample = downsample

    def forward(self, x):
        identity = x
        out = self.conv1(x)
        out = self.bn1(out)
        out = self.relu(out)
        out = self.conv2(out)
        out = self.bn2(out)
        if self.downsample is not None:
            identity = self.downsample(x)
        out += identity
        out = self.relu(out)
        return out

class HRModule(nn.Module):
    """Simplified High-Resolution Module."""
    def __init__(self, num_branches, num_channels):
        super().__init__()
        self.num_branches = num_branches
        self.branches = nn.ModuleList([
            nn.Sequential(
                BasicBlock(num_channels[i], num_channels[i]),
                BasicBlock(num_channels[i], num_channels[i])
            ) for i in range(num_branches)
        ])
        
        # Fuse layers (simplified: just upsample and add to highest resolution)
        self.fuse_layers = nn.ModuleList()
        for i in range(num_branches):
            if i == 0:
                self.fuse_layers.append(nn.Identity())
            else:
                self.fuse_layers.append(nn.Sequential(
                    nn.Conv2d(num_channels[i], num_channels[0], kernel_size=1, bias=False),
                    nn.BatchNorm2d(num_channels[0]),
                    nn.Upsample(scale_factor=2**i, mode='bilinear', align_corners=False)
                ))
        self.relu = nn.ReLU(inplace=True)

    def forward(self, x):
        out = [branch(xi) for branch, xi in zip(self.branches, x)]
        
        # Fuse into highest resolution branch
        x_fuse = self.fuse_layers[0](out[0])
        for i in range(1, self.num_branches):
            x_fuse = x_fuse + self.fuse_layers[i](out[i])
        
        out[0] = self.relu(x_fuse)
        return out

class HRNet_W32(nn.Module):
    """
    High-Resolution Network (HRNet-W32) for Cephalometric Heatmap Detection.
    Maintains high-resolution representations through the entire process.
    """
    def __init__(self, in_channels: int = 1, out_channels: int = 38):
        super().__init__()
        # Stem
        self.conv1 = nn.Conv2d(in_channels, 64, kernel_size=3, stride=2, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.conv2 = nn.Conv2d(64, 64, kernel_size=3, stride=2, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)

        # Stage 1
        self.layer1 = nn.Sequential(
            BasicBlock(64, 64),
            BasicBlock(64, 64)
        )

        # Transition 1
        self.trans1 = nn.ModuleList([
            nn.Sequential(
                nn.Conv2d(64, 32, kernel_size=3, padding=1, bias=False),
                nn.BatchNorm2d(32),
                nn.ReLU(inplace=True)
            ),
            nn.Sequential(
                nn.Conv2d(64, 64, kernel_size=3, stride=2, padding=1, bias=False),
                nn.BatchNorm2d(64),
                nn.ReLU(inplace=True)
            )
        ])

        # Stage 2 (HR Module)
        self.stage2 = HRModule(num_branches=2, num_channels=[32, 64])

        # Transition 2
        self.trans2 = nn.ModuleList([
            nn.Identity(),
            nn.Identity(),
            nn.Sequential(
                nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1, bias=False),
                nn.BatchNorm2d(128),
                nn.ReLU(inplace=True)
            )
        ])

        # Stage 3 (HR Module)
        self.stage3 = HRModule(num_branches=3, num_channels=[32, 64, 128])

        # Output head: upsample the 1/4 resolution representation back to full
        self.final_layer = nn.Sequential(
            nn.Conv2d(32, 32, kernel_size=1, bias=False),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Upsample(scale_factor=4, mode='bilinear', align_corners=False),
            nn.Conv2d(32, out_channels, kernel_size=1)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Stem
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.layer1(x)

        # Transition 1
        x_list = [t(x) for t in self.trans1]

        # Stage 2
        x_list = self.stage2(x_list)

        # Transition 2 (creating 3rd branch)
        x_list.append(self.trans2[2](x_list[1]))

        # Stage 3
        x_list = self.stage3(x_list)

        # Head (take highest resolution branch which is 1/4 of input)
        out = self.final_layer(x_list[0])
        return out
