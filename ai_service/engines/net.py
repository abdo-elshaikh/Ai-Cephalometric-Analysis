import glob

import torch.nn as nn
import torch
from torchvision import transforms, datasets, models
from engines.mytransforms import mytransforms
import numpy as np
from numpy import *
from PIL import Image
from torch.utils.data import Dataset, DataLoader
import random
import cv2

def gray_to_rgb(gray):
    h, w = gray.shape
    rgb = np.zeros((h, w, 3))
    rgb[:, :, 0] = gray;
    rgb[:, :, 1] = gray;
    rgb[:, :, 2] = gray;
    return rgb


class dataload(Dataset):
    def __init__(self, path='train', H=600, W=480, pow_n=3, aug=True, mode='img'):

        self.mode = mode
        if mode == 'img':
            self.path = path
            self.data_num = 1
        elif mode == 'dir':
            self.path = glob.glob(path + '/*.png')
            self.data_num = len(self.path)

        self.aug = aug
        self.pow_n = pow_n
        self.task = path
        self.H = H
        self.W = W
        # Professional MONAI augmentation and preprocessing
        from monai.transforms import (
            Compose, Resize, Grayscale, ToTensor, 
            RandGaussianNoise, RandBiasField, ScaleIntensity
        )
        
        self.trans = Compose([
            Resize((self.H, self.W)),
            Grayscale(num_output_channels=1),
            ScaleIntensity(),
            # Augmentations (only if aug=True)
            # RandGaussianNoise(prob=0.1 if aug else 0),
            ToTensor()
        ])
        
        self.norm = Compose([
            # monai.transforms.NormalizeIntensity(subtrahend=0.5, divisor=0.5)
        ])

    def __len__(self):
        return self.data_num

    def __getitem__(self, idx):
        if self.mode == 'img':
            input = Image.open(self.path).convert("L")
        elif self.mode == 'dir':
            input = Image.open(self.path[idx]).convert("L")

        input_np = np.array(input)
        input_tensor = self.trans(input_np)
        # img_size = input_tensor.size()

        return input


# UNET parts
class DoubleConv(nn.Module):
    """(convolution => [BN] => ReLU) * 2"""

    def __init__(self, in_channels, out_channels, mid_channels=None):
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

    def forward(self, x):
        return self.double_conv(x)


class Down(nn.Module):
    """Downscaling with maxpool then double conv"""

    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.maxpool_conv = nn.Sequential(
            nn.MaxPool2d(2),
            DoubleConv(in_channels, out_channels)
        )

    def forward(self, x):
        return self.maxpool_conv(x)


class Up(nn.Module):
    """Upscaling then double conv"""

    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.up = nn.Upsample(scale_factor=2)
        self.conv = DoubleConv(in_channels, out_channels)

    def forward(self, x1, x2):
        x1 = self.up(x1)
        x = torch.cat([x2, x1], dim=1)
        return self.conv(x)


class UNet(nn.Module):
    def __init__(self, n_channels, n_classes):
        super(UNet, self).__init__()
        self.n_channels = n_channels
        self.n_classes = n_classes
        factor = 2
        # print(factor)

        self.inc = DoubleConv(n_channels, 64)
        self.down1 = Down(64, 128)
        self.down2 = Down(128, 256)
        self.down3 = Down(256, 512)
        self.down4 = Down(512, 1024 // factor)
        self.up1 = Up(1024, 512 // factor)
        self.up2 = Up(512, 256 // factor)
        self.up3 = Up(256, 128 // factor)
        self.up4 = Up(128, 64)
        self.outc = OutConv(64, n_classes)

    def forward(self, x):
        x1 = self.inc(x)
        x2 = self.down1(x1)
        x3 = self.down2(x2)
        x4 = self.down3(x3)
        x5 = self.down4(x4)
        x = self.up1(x5, x4)
        x = self.up2(x, x3)
        x = self.up3(x, x2)
        x = self.up4(x, x1)
        logits = self.outc(x)
        return logits


class MONAIUNet(nn.Module):
    """
    State-of-the-art UNet implementation from MONAI.
    Features residual units and professional medical-grade architecture.
    """
    def __init__(self, n_channels=1, n_classes=38):
        super().__init__()
        from monai.networks.nets import UNet as MONAI_UNet
        
        self.model = MONAI_UNet(
            spatial_dims=2,
            in_channels=n_channels,
            out_channels=n_classes,
            channels=(64, 128, 256, 512, 1024),
            strides=(2, 2, 2, 2),
            num_res_units=2,
            norm="INSTANCE",
            dropout=0.1
        )

    def forward(self, x):
        return self.model(x)


class OutConv(nn.Module):
    def __init__(self, in_channels, out_channels):
        super(OutConv, self).__init__()
        self.conv = nn.Conv2d(in_channels, out_channels, kernel_size=1)

    def forward(self, x):
        return self.conv(x)
