import io
import logging
from typing import Optional, Tuple

import numpy as np
import pydicom
from PIL import Image

logger = logging.getLogger(__name__)


def process_dicom(
    dicom_bytes: bytes,
) -> Tuple[Optional[Image.Image], Optional[float], Optional[str], Optional[str]]:
    """
    Process raw DICOM bytes into a displayable image with clinical metadata.

    Returns:
        (image, pixel_spacing_mm, patient_name, study_date)

    Each value may be None if extraction fails.

    Notes:
        - Applies Rescale Slope/Intercept when present (CT/CR images).
        - Applies DICOM windowing (WindowCenter/WindowWidth) when available
          for faithful clinical rendering, rather than naïve full-range normalisation.
        - Converts the final image to 8-bit grayscale (PIL 'L' mode) suitable for
          downstream landmark detection.
    """
    try:
        ds = pydicom.dcmread(io.BytesIO(dicom_bytes))

        # ── 1. Extract pixel array ────────────────────────────────────────────
        pixel_array = ds.pixel_array.astype(np.float32)

        # Apply Rescale Slope / Intercept (standard for CR, CT, DR)
        slope     = float(getattr(ds, "RescaleSlope",     1.0))
        intercept = float(getattr(ds, "RescaleIntercept", 0.0))
        pixel_array = pixel_array * slope + intercept

        # ── 2. Windowing ──────────────────────────────────────────────────────
        window_center = getattr(ds, "WindowCenter", None)
        window_width  = getattr(ds, "WindowWidth",  None)

        # DICOM tags may store multi-value sequences — pick the first element
        if isinstance(window_center, pydicom.multival.MultiValue):
            window_center = float(window_center[0])
        elif window_center is not None:
            window_center = float(window_center)

        if isinstance(window_width, pydicom.multival.MultiValue):
            window_width = float(window_width[0])
        elif window_width is not None:
            window_width = float(window_width)

        if window_center is not None and window_width is not None and window_width > 0:
            # Apply DICOM linear windowing: clip to [WC - WW/2, WC + WW/2]
            lo = window_center - window_width / 2.0
            hi = window_center + window_width / 2.0
            pixel_array = np.clip(pixel_array, lo, hi)
            pixel_array = (pixel_array - lo) / (hi - lo) * 255.0
        else:
            # Fall back to full-range normalisation
            p_min, p_max = pixel_array.min(), pixel_array.max()
            if p_max > p_min:
                pixel_array = (pixel_array - p_min) / (p_max - p_min) * 255.0
            else:
                pixel_array = np.zeros_like(pixel_array)

        img = Image.fromarray(pixel_array.astype(np.uint8)).convert("L")

        # ── 3. Extract clinical metadata ──────────────────────────────────────
        pixel_spacing: Optional[float] = None
        if hasattr(ds, "PixelSpacing"):
            # Use row spacing (index 0); assumed square for cephalometric images
            pixel_spacing = float(ds.PixelSpacing[0])
        elif hasattr(ds, "ImagerPixelSpacing"):
            pixel_spacing = float(ds.ImagerPixelSpacing[0])

        patient_name = str(ds.get("PatientName", "Unknown Patient"))
        study_date   = str(ds.get("StudyDate",   "Unknown Date"))

        return img, pixel_spacing, patient_name, study_date

    except Exception as e:
        logger.error(f"Failed to process DICOM: {e}", exc_info=True)
        return None, None, None, None
