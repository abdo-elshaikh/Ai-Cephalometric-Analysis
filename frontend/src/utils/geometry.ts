/**
 * Geometry Utility — Frontend cephalometric math primitives.
 *
 * Must stay synchronised with backend measurement_engine.py.
 *
 * Conventions
 * ───────────
 * - All angles are in degrees unless the function name says "Rad".
 * - Image coordinates: x grows right, y grows DOWN (standard raster).
 *   This flips the sign of cross-products vs. a standard math frame —
 *   each signed-angle function documents its sign convention explicitly.
 * - "Pixel distance" means raw image pixels. Callers must apply their
 *   mm-per-pixel calibration factor before reporting clinical values.
 */

// ── Core type ────────────────────────────────────────────────────────────────

export interface Point {
    readonly x: number;
    readonly y: number;
}

// ── Internal vector helpers ───────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

function vec(from: Point, to: Point): Vec2 {
    return { x: to.x - from.x, y: to.y - from.y };
}

function magnitude(v: Vec2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

function dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
}

/**
 * 2-D cross product (z-component of a × b).
 * Positive → b is clockwise from a (in image/screen coords where y grows down).
 */
function cross(a: Vec2, b: Vec2): number {
    return a.x * b.y - a.y * b.x;
}

/** Clamp a value to [-1, 1] to guard against floating-point drift before acos/asin. */
function clampUnit(v: number): number {
    return Math.max(-1, Math.min(1, v));
}

const RAD_TO_DEG = 180 / Math.PI;

// ── Distance ─────────────────────────────────────────────────────────────────

/** Straight-line distance between two points (pixels). */
export function euclideanDistance(p1: Point, p2: Point): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Signed perpendicular distance from `p` to the infinite line through `a → b`.
 *
 * Sign convention (image coords, y-down):
 *   Positive → p is to the RIGHT of the directed line a→b.
 *   Negative → p is to the LEFT.
 */
export function signedPointToLineDistance(p: Point, a: Point, b: Point): number {
    const ab = vec(a, b);
    const len = magnitude(ab);
    if (len === 0) return 0;
    const ap = vec(a, p);
    return cross(ab, ap) / len;
}

/**
 * Unsigned perpendicular distance from `p` to the infinite line through `a → b`.
 */
export function pointToLineDistance(p: Point, a: Point, b: Point): number {
    return Math.abs(signedPointToLineDistance(p, a, b));
}

/**
 * Foot of the perpendicular from `p` onto the infinite line through `a → b`.
 */
export function projectPointOntoLine(p: Point, a: Point, b: Point): Point {
    const ab = vec(a, b);
    const len2 = ab.x * ab.x + ab.y * ab.y;
    if (len2 === 0) return { x: a.x, y: a.y };
    const ap = vec(a, p);
    const t = dot(ap, ab) / len2;
    return { x: a.x + t * ab.x, y: a.y + t * ab.y };
}

// ── Angles ────────────────────────────────────────────────────────────────────

/**
 * Unsigned angle (0–180°) at `vertex` formed by rays vertex→p1 and vertex→p2.
 */
export function angleBetween(vertex: Point, p1: Point, p2: Point): number {
    const v1 = vec(vertex, p1);
    const v2 = vec(vertex, p2);
    const mag1 = magnitude(v1);
    const mag2 = magnitude(v2);
    if (mag1 === 0 || mag2 === 0) return 0;
    return Math.acos(clampUnit(dot(v1, v2) / (mag1 * mag2))) * RAD_TO_DEG;
}

/**
 * Signed angle (−180° to +180°) at `vertex` from ray vertex→p1 to vertex→p2,
 * measured clockwise in image/screen coordinates (y-down).
 */
export function signedAngleBetween(vertex: Point, p1: Point, p2: Point): number {
    const v1 = vec(vertex, p1);
    const v2 = vec(vertex, p2);
    const mag1 = magnitude(v1);
    const mag2 = magnitude(v2);
    if (mag1 === 0 || mag2 === 0) return 0;
    const sinA = cross(v1, v2) / (mag1 * mag2);
    const cosA = dot(v1, v2) / (mag1 * mag2);
    return Math.atan2(clampUnit(sinA), clampUnit(cosA)) * RAD_TO_DEG;
}

/**
 * Acute intersection angle (0–90°) between two undirected lines a1→a2 and b1→b2.
 */
export function lineToLineAngle(a1: Point, a2: Point, b1: Point, b2: Point): number {
    const v1 = vec(a1, a2);
    const v2 = vec(b1, b2);
    const mag1 = magnitude(v1);
    const mag2 = magnitude(v2);
    if (mag1 === 0 || mag2 === 0) return 0;
    const cosA = Math.abs(clampUnit(dot(v1, v2) / (mag1 * mag2)));
    return Math.acos(cosA) * RAD_TO_DEG;
}

// ── Norms ────────────────────────────────────────────────────────────────────

export interface NormRange {
    mean: number;
    min: number;
    max: number;
    sd: number;
    unit: 'deg' | 'mm' | 'ratio';
}

export const NORMS: Record<string, Record<string, NormRange>> = {
    Steiner: {
        SNA:          { mean: 82.0, min: 80.0, max: 84.0, sd: 2.0, unit: 'deg' },
        SNB:          { mean: 80.0, min: 78.0, max: 82.0, sd: 2.0, unit: 'deg' },
        ANB:          { mean: 2.0,  min: 0.0,  max: 4.0,  sd: 4.0, unit: 'deg' },
        FMA:          { mean: 25.0, min: 21.0, max: 29.0, sd: 4.0, unit: 'deg' },
        'SN-MP':      { mean: 32.0, min: 26.0, max: 38.0, sd: 6.0, unit: 'deg' },
        'U1-NA_MM':   { mean: 4.0,  min: 3.0,  max: 5.0,  sd: 1.0, unit: 'mm'  },
        'U1-SN':      { mean: 103.0,min: 99.0, max: 107.0,sd: 4.0, unit: 'deg' },
        'L1-NB_MM':   { mean: 4.0,  min: 3.0,  max: 5.0,  sd: 1.0, unit: 'mm'  },
        'L1-MP':      { mean: 99.0, min: 98.0, max: 100.0,sd: 1.0, unit: 'deg' },
    },
    Tweed: {
        FMA:          { mean: 25.0, min: 21.0, max: 29.0, sd: 4.0, unit: 'deg' },
        FMIA:         { mean: 65.0, min: 61.0, max: 69.0, sd: 3.5, unit: 'deg' },
        IMPA:         { mean: 90.0, min: 85.0, max: 95.0, sd: 5.0, unit: 'deg' },
    },
    Ricketts: {
        'LS_E':       { mean: -4.0, min: -6.0, max: -2.0, sd: 2.0, unit: 'mm'  },
        'LI_E':       { mean: -2.0, min: -4.0, max: 0.0,  sd: 2.0, unit: 'mm'  },
    },
    McNamara: {
        'Co-A':       { mean: 91.0, min: 85.0, max: 97.0, sd: 5.5, unit: 'mm'  },
        'Co-Gn':      { mean: 120.0,min: 112.0,max: 128.0,sd: 6.5, unit: 'mm'  },
        'LAFH':       { mean: 65.0, min: 60.0, max: 70.0, sd: 4.0, unit: 'mm'  },
    },
    General: {
        OVERJET:      { mean: 3.5,  min: 1.0,  max: 6.0,  sd: 2.5, unit: 'mm'  },
        OVERBITE:     { mean: 2.0,  min: -0.5, max: 4.5,  sd: 2.5, unit: 'mm'  },
    }
};

/** Compat aliases for AnalysisPage */
export const STEINER_NORMS = NORMS.Steiner;

// ── Classification ────────────────────────────────────────────────────────────

export type DeviationSeverity = 'Normal' | 'Mild' | 'Moderate' | 'Severe';

export interface ClassificationResult {
    status: 'Normal' | 'Increased' | 'Decreased';
    deviationSDs: number;
    severity: DeviationSeverity;
}

export function classifyMeasurement(value: number, norm: NormRange): ClassificationResult {
    if (value >= norm.min && value <= norm.max) {
        return { status: 'Normal', deviationSDs: 0, severity: 'Normal' };
    }

    const excess = value < norm.min ? norm.min - value : value - norm.max;
    const deviationSDs = norm.sd > 0 ? excess / norm.sd : 0;

    const severity: DeviationSeverity =
        deviationSDs <= 1 ? 'Mild' :
        deviationSDs <= 2 ? 'Moderate' :
        'Severe';

    return {
        status: value < norm.min ? 'Decreased' : 'Increased',
        deviationSDs: Math.round(deviationSDs * 100) / 100,
        severity,
    };
}

/** Legacy support */
export function classifyStatus(value: number, min: number, max: number, type?: any): string {
    if (value < min) return 'Decreased';
    if (value > max) return 'Increased';
    return 'Normal';
}
