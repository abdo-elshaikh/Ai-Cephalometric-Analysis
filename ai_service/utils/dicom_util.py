import io
import pydicom
import numpy as np
from PIL import Image
import logging

logger = logging.getLogger(__name__)

def process_dicom(dicom_bytes: bytes):
    """
    Processes DICOM bytes to extract a displayable image and clinical metadata.
    Returns (Image, pixel_spacing_mm, patient_name, study_date).
    """
    try:
        ds = pydicom.dcmread(io.BytesIO(dicom_bytes))
        
        # 1. Extract Pixel Array
        pixel_array = ds.pixel_array
        
        # Rescale intercept/slope if present
        if hasattr(ds, 'RescaleIntercept') and hasattr(ds, 'RescaleSlope'):
            pixel_array = pixel_array * ds.RescaleSlope + ds.RescaleIntercept
            
        # Normalize to 8-bit for Pillow
        p_min, p_max = pixel_array.min(), pixel_array.max()
        if p_max > p_min:
            pixel_array = (pixel_array - p_min) / (p_max - p_min) * 255.0
        pixel_array = pixel_array.astype(np.uint8)
        
        img = Image.fromarray(pixel_array).convert("L")
        
        # 2. Extract Metadata
        # Pixel Spacing (Critical for Cephalometrics)
        pixel_spacing = None
        if hasattr(ds, 'PixelSpacing'):
            pixel_spacing = float(ds.PixelSpacing[0]) # Assuming square pixels for ceph
        elif hasattr(ds, 'ImagerPixelSpacing'):
            pixel_spacing = float(ds.ImagerPixelSpacing[0])
            
        patient_name = str(ds.get("PatientName", "Unknown Patient"))
        study_date = str(ds.get("StudyDate", "Unknown Date"))
        
        return img, pixel_spacing, patient_name, study_date
        
    except Exception as e:
        logger.error(f"Failed to process DICOM: {e}")
        return None, None, None, None
