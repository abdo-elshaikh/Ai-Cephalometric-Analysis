import { describe, it, expect } from 'vitest';

// ── Calibration math ─────────────────────────────────────────────────────────
// Mirrors the logic in AnalysisPage: pixelSpacing = knownMm / pixelDistance
function computePixelSpacing(
  x1: number, y1: number,
  x2: number, y2: number,
  knownMm: number,
): number {
  const pixelDist = Math.hypot(x2 - x1, y2 - y1);
  if (pixelDist === 0) throw new Error('Points must be distinct');
  return knownMm / pixelDist;
}

// ── Canvas coordinate conversion ─────────────────────────────────────────────
// Mirrors the logic in AnalysisPage: canvasToImage
function canvasToImage(
  canvasX: number, canvasY: number,
  pan: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: (canvasX - pan.x) / zoom,
    y: (canvasY - pan.y) / zoom,
  };
}

function imageToCanvas(
  imageX: number, imageY: number,
  pan: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: imageX * zoom + pan.x,
    y: imageY * zoom + pan.y,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Calibration Math', () => {
  it('computes pixel spacing for a horizontal line', () => {
    const spacing = computePixelSpacing(0, 0, 100, 0, 20);
    expect(spacing).toBeCloseTo(0.2);
  });

  it('computes pixel spacing for a diagonal line', () => {
    // 3-4-5 right triangle → distance = 5
    const spacing = computePixelSpacing(0, 0, 3, 4, 10);
    expect(spacing).toBeCloseTo(2.0);
  });

  it('computes pixel spacing for a vertical line', () => {
    const spacing = computePixelSpacing(0, 0, 0, 200, 50);
    expect(spacing).toBeCloseTo(0.25);
  });

  it('throws when the two points are identical', () => {
    expect(() => computePixelSpacing(50, 50, 50, 50, 20)).toThrow('Points must be distinct');
  });

  it('handles sub-pixel distances correctly', () => {
    const spacing = computePixelSpacing(0, 0, 0.5, 0, 1);
    expect(spacing).toBeCloseTo(2.0);
  });
});

describe('Canvas ↔ Image Coordinate Conversion', () => {
  it('converts canvas coords to image coords at zoom 1, no pan', () => {
    const result = canvasToImage(100, 200, { x: 0, y: 0 }, 1);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it('converts canvas coords to image coords with pan offset', () => {
    const result = canvasToImage(150, 250, { x: 50, y: 50 }, 1);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it('converts canvas coords to image coords at zoom 2', () => {
    const result = canvasToImage(200, 400, { x: 0, y: 0 }, 2);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it('converts canvas coords to image coords with pan and zoom', () => {
    const result = canvasToImage(250, 450, { x: 50, y: 50 }, 2);
    expect(result).toEqual({ x: 100, y: 200 });
  });

  it('converts image coords back to canvas coords (round-trip)', () => {
    const pan = { x: 30, y: 80 };
    const zoom = 1.5;
    const imgX = 120, imgY = 340;

    const canvas = imageToCanvas(imgX, imgY, pan, zoom);
    const back   = canvasToImage(canvas.x, canvas.y, pan, zoom);

    expect(back.x).toBeCloseTo(imgX);
    expect(back.y).toBeCloseTo(imgY);
  });

  it('handles zoom-out (zoom < 1) correctly', () => {
    const result = canvasToImage(50, 100, { x: 0, y: 0 }, 0.5);
    expect(result).toEqual({ x: 100, y: 200 });
  });
});

describe('Measurement Status Logic', () => {
  type Status = 'Normal' | 'Increased' | 'Decreased';

  function getMeasurementStatus(value: number, min: number, max: number): Status {
    if (value < min) return 'Decreased';
    if (value > max) return 'Increased';
    return 'Normal';
  }

  it('returns Normal when value is within range', () => {
    expect(getMeasurementStatus(5, 1, 10)).toBe('Normal');
  });

  it('returns Normal when value equals the minimum bound', () => {
    expect(getMeasurementStatus(1, 1, 10)).toBe('Normal');
  });

  it('returns Normal when value equals the maximum bound', () => {
    expect(getMeasurementStatus(10, 1, 10)).toBe('Normal');
  });

  it('returns Decreased when value is below the minimum', () => {
    expect(getMeasurementStatus(0, 1, 10)).toBe('Decreased');
  });

  it('returns Increased when value is above the maximum', () => {
    expect(getMeasurementStatus(11, 1, 10)).toBe('Increased');
  });

  it('handles negative normal ranges (e.g. ANB angle corrections)', () => {
    expect(getMeasurementStatus(-5, -10, -2)).toBe('Normal');
    expect(getMeasurementStatus(-11, -10, -2)).toBe('Decreased');
    expect(getMeasurementStatus(-1, -10, -2)).toBe('Increased');
  });
});
