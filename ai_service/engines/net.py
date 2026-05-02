import glob
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from PIL import Image
from torch.utils.data import Dataset
from torchvision import transforms


def gray_to_rgb(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape
    rgb = np.zeros((h, w, 3), dtype=gray.dtype)
    rgb[:, :, 0] = gray
    rgb[:, :, 1] = gray
    rgb[:, :, 2] = gray
    return rgb


class dataload(Dataset):
    def __init__(self, path: str = "train", H: int = 600, W: int = 480,
                 pow_n: int = 3, aug: bool = True, mode: str = "img"):
        self.mode = mode
        self.H = H
        self.W = W
        self.aug = aug
        self.pow_n = pow_n

        if mode == "img":
            self.path = path
            self.data_num = 1
        elif mode == "dir":
            self.path = glob.glob(path + "/*.png")
            self.data_num = len(self.path)
        else:
            raise ValueError(f"Unknown mode: {mode!r}")

        self.trans = transforms.Compose([
            transforms.Resize((self.H, self.W)),
            transforms.Grayscale(num_output_channels=1),
            transforms.ToTensor(),
            transforms.Normalize((0.5,), (0.5,)),
        ])

    def __len__(self) -> int:
        return self.data_num

    def __getitem__(self, idx: int) -> torch.Tensor:
        if self.mode == "img":
            img = Image.open(self.path).convert("L")
        else:
            img = Image.open(self.path[idx]).convert("L")

        img_np = np.array(img)
        # self.trans expects a numpy array and returns a tensor
        return self.trans(img_np)


# ── UNet building blocks ──────────────────────────────────────────────────────

class DoubleConv(nn.Module):
    """(Conv → InstanceNorm → ReLU) × 2"""

    def __init__(self, in_channels: int, out_channels: int, mid_channels: int | None = None):
        super().__init__()
        if mid_channels is None:
            mid_channels = out_channels
        self.double_conv = nn.Sequential(
            nn.Conv2d(in_channels, mid_channels, kernel_size=3, padding=1, bias=False),
            nn.InstanceNorm2d(mid_channels, affine=True),   # FIX: was out_channels (wrong after first conv)
            nn.ReLU(inplace=True),
            nn.Conv2d(mid_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.InstanceNorm2d(out_channels, affine=True),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.double_conv(x)


class Down(nn.Module):
    """MaxPool2d → DoubleConv"""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.maxpool_conv(x)


class Up(nn.Module):
    """Bilinear upsample → DoubleConv (skip-connection via concat)"""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        # FIX: use bilinear interpolation to avoid nearest-neighbour checkerboard artifacts
        self.up = nn.Upsample(scale_factor=2, mode="bilinear", align_corners=False)
        self.conv = DoubleConv(in_channels, out_channels)

    def forward(self, x1: torch.Tensor, x2: torch.Tensor) -> torch.Tensor:
        x1 = self.up(x1)
        # input is CHW
        diffY = x2.size()[2] - x1.size()[2]
        diffX = x2.size()[3] - x1.size()[3]

        x1 = F.pad(x1, [diffX // 2, diffX - diffX // 2,
                        diffY // 2, diffY - diffY // 2])
        # if you have padding issues, see
        # https://github.com/HaiyongJiang/U-Net-Pytorch-Unfold-Gate-Adoption/blob/master/unet/unet_model.py
        # for a more robust implementation with cropping
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)


class OutConv(nn.Module):
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.conv(x)


class UNet(nn.Module):
    def __init__(self, n_channels: int, n_classes: int):
        super().__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes
        factor = 2

        self.inc   = DoubleConv(n_channels, 64)
        self.down1 = Down(64, 128)
        self.down2 = Down(128, 256)
        self.down3 = Down(256, 512)
        self.down4 = Down(512, 1024 // factor)
        self.up1   = Up(1024, 512 // factor)
        self.up2   = Up(512, 256 // factor)
        self.up3   = Up(256, 128 // factor)
        self.up4   = Up(128, 64)
        self.outc  = OutConv(64, n_classes)

    def forward(self, x: torch.Tensor, apply_dropout: bool = False) -> torch.Tensor:
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)
        
        # Bayesian CNN: Monte Carlo Dropout at deep feature representations
        if apply_dropout:
            x5 = F.dropout2d(x5, p=0.2, training=True)
            
        x  = self.up1(x5, x4)
        if apply_dropout:
            x = F.dropout2d(x, p=0.15, training=True)
            
        x  = self.up2(x, x3)
        if apply_dropout:
            x = F.dropout2d(x, p=0.1, training=True)
            
        x  = self.up3(x, x2)
        x  = self.up4(x, x1)
        return self.outc(x)


