/**
 * Tracing Definitions
 * Maps landmark name pairs to line segments for each cephalometric analysis.
 *
 * Color tokens are semantically consistent across analyses:
 *   PLANE_SN        — SN reference plane
 *   PLANE_FH        — Frankfort horizontal
 *   PLANE_MAND      — Mandibular plane
 *   PLANE_OPAL      — Occlusal plane
 *   LINE_MAXILLA    — Maxillary / midface measurements
 *   LINE_MANDIBLE   — Mandibular length measurements
 *   LINE_VERTICAL   — Vertical / height measurements
 *   LINE_INCISOR    — Incisor long axis
 *   LINE_SOFT       — Soft tissue / profile
 *   LINE_AP         — AP jaw relationship lines (A-N-B etc.)
 */

export const PLANE_COLORS = {
  SN: '#9333ea',       // ColSkeletal
  FH: '#9333ea',       // ColSkeletal
  MAND: '#9333ea',     // ColSkeletal
  OPAL: '#4b5563',     // ColDental
  MAXILLA: '#16a34a',  // ColAnatomical
  MANDIBLE: '#16a34a', // ColAnatomical
  VERTICAL: '#0891b2', // ColAdvanced
  INCISOR: '#4b5563',  // ColDental
  SOFT: '#16a34a',     // ColProfile
  AP: '#0891b2',       // ColAdvanced
} as const;

export interface TracingLine {
  p1?: string;
  p2?: string;
  points?: string[];
  type?: 'line' | 'spline' | 'tooth' | 'molar' | 'mandible' | 'maxilla';
  isUpper?: boolean;
  color?: string;
  /** Short label shown along the line midpoint */
  label?: string;
  /**
   * When true, the line represents a reference axis that extends beyond
   * the landmark pair — rendered dashed in the viewer.
   */
  isAxis?: boolean;
}

export type TracingDefinition = Record<string, TracingLine[]>;

export const TRACING_DEFINITIONS: TracingDefinition = {

  // ── Downs ────────────────────────────────────────────────────────────────
  // Original foundational analysis. All angular measures reference FH or
  // the occlusal plane.
  Downs: [
    { p1: 'Po', p2: 'Or', color: PLANE_COLORS.FH, label: 'FH', isAxis: true },
    { p1: 'A', p2: 'Pog', color: PLANE_COLORS.AP, label: 'A-Pog' },
    { p1: 'N', p2: 'A', color: PLANE_COLORS.AP },
    { p1: 'N', p2: 'B', color: PLANE_COLORS.AP },
    { p1: 'Go', p2: 'Gn', color: PLANE_COLORS.MAND, label: 'Mand. plane', isAxis: true },
    { p1: 'U6', p2: 'L6', color: PLANE_COLORS.OPAL, label: 'Occlusal', isAxis: true },
    { type: 'tooth', p1: 'U1', p2: 'U1_c', isUpper: true, color: PLANE_COLORS.INCISOR, label: 'U1 axis' },
    { type: 'tooth', p1: 'L1', p2: 'L1_c', isUpper: false, color: PLANE_COLORS.INCISOR, label: 'L1 axis' },
    { type: 'molar', p1: 'U6', isUpper: true, color: PLANE_COLORS.OPAL },
    { type: 'molar', p1: 'L6', isUpper: false, color: PLANE_COLORS.OPAL },
  ],

  // ── Steiner ───────────────────────────────────────────────────────────────
  Steiner: [
    { p1: 'S', p2: 'N', color: PLANE_COLORS.SN, label: 'SN', isAxis: true },
    { p1: 'N', p2: 'A', color: PLANE_COLORS.AP },
    { p1: 'N', p2: 'B', color: PLANE_COLORS.AP },
    { p1: 'N', p2: 'Pog', color: PLANE_COLORS.AP, label: 'N-Pog' },
    { p1: 'A', p2: 'Pog', color: PLANE_COLORS.AP, label: 'A-Pog' },
    { p1: 'Go', p2: 'Gn', color: PLANE_COLORS.MAND, label: 'Mand. plane', isAxis: true },
    { p1: 'Po', p2: 'Or', color: PLANE_COLORS.FH, label: 'FH', isAxis: true },
    { type: 'tooth', p1: 'U1', p2: 'U1_c', isUpper: true, color: PLANE_COLORS.INCISOR, label: 'U1 axis' },
    { type: 'tooth', p1: 'L1', p2: 'L1_c', isUpper: false, color: PLANE_COLORS.INCISOR, label: 'L1 axis' },
    { type: 'molar', p1: 'U6', isUpper: true, color: PLANE_COLORS.OPAL },
    { type: 'molar', p1: 'L6', isUpper: false, color: PLANE_COLORS.OPAL },
  ],

  // ── Tweed ─────────────────────────────────────────────────────────────────
  // FMA, FMIA, IMPA triangle — three angles fully define the case.
  Tweed: [
    { p1: 'Po', p2: 'Or', color: PLANE_COLORS.FH, label: 'FH (FMA base)', isAxis: true },
    { p1: 'Go', p2: 'Me', color: PLANE_COLORS.MAND, label: 'Mand. plane', isAxis: true },
    { type: 'tooth', p1: 'L1', p2: 'L1_c', isUpper: false, color: PLANE_COLORS.INCISOR, label: 'L1 axis (IMPA)' },
  ],

  // ── McNamara ─────────────────────────────────────────────────────────────
  // Linear rather than angular — condyle to A, condyle to Gnathion, LAFH.
  McNamara: [
    { p1: 'Po', p2: 'Or', color: PLANE_COLORS.FH, label: 'FH', isAxis: true },
    // Nasion perpendicular to FH — rendered as vertical through N
    { p1: 'N', p2: 'N_FH', color: PLANE_COLORS.AP, label: 'N-perp', isAxis: true },
    { p1: 'Co', p2: 'A', color: PLANE_COLORS.MAXILLA, label: 'Co-A' },
    { p1: 'Co', p2: 'Gn', color: PLANE_COLORS.MANDIBLE, label: 'Co-Gn' },
    { p1: 'ANS', p2: 'Me', color: PLANE_COLORS.VERTICAL, label: 'LAFH' },
    { p1: 'N', p2: 'Me', color: PLANE_COLORS.VERTICAL, label: 'TAFH' },
  ],

  // ── Ricketts ──────────────────────────────────────────────────────────────
  // Aesthetic E-line assessment only. Lip points are soft tissue.
  Ricketts: [
    { p1: 'Po', p2: 'Or', color: PLANE_COLORS.FH, label: 'FH', isAxis: true },
    { p1: 'Prn', p2: 'SoftPog', color: PLANE_COLORS.SOFT, label: 'E-Line', isAxis: true },
    // Lip projection reference dots (rendered as very short lines on the E-line)
    { p1: 'Ls_E', p2: 'Ls', color: PLANE_COLORS.SOFT, label: 'Ls ref' },
    { p1: 'Li_E', p2: 'Li', color: PLANE_COLORS.SOFT, label: 'Li ref' },
  ],

  // ── Jarabak ───────────────────────────────────────────────────────────────
  // Growth prediction — posterior / anterior face height ratio.
  Jarabak: [
    { p1: 'S', p2: 'N', color: PLANE_COLORS.SN, label: 'SN' },
    { p1: 'S', p2: 'Ar', color: PLANE_COLORS.SN },
    { p1: 'Ar', p2: 'Go', color: PLANE_COLORS.MAND },
    { p1: 'Go', p2: 'Me', color: PLANE_COLORS.MAND, label: 'Mand. plane' },
    { p1: 'S', p2: 'Go', color: PLANE_COLORS.VERTICAL, label: 'PFH' },
    { p1: 'N', p2: 'Me', color: PLANE_COLORS.AP, label: 'AFH' },
  ],

  // ── Profile (soft tissue tracing) ─────────────────────────────────────────
  // Connects soft tissue landmarks to outline the facial profile.
  Profile: [
    { type: 'spline', points: ['GLA', 'SoftN', 'Prn', 'Sn', 'Ls', 'StomU', 'StomL', 'Li', 'Sm', 'SoftPog', 'SoftGn'], color: PLANE_COLORS.SOFT },
    // E-line overlaid on profile for quick Ricketts lip assessment
    { p1: 'Prn', p2: 'SoftPog', color: '#16a34a', label: 'E-Line', isAxis: true },
  ],
};

/**
 * Returns a flat list of all unique landmark names required by a given set
 * of analyses — useful for validating that all points are digitised before
 * computing a measurement set.
 */
export function requiredLandmarks(analyses: string[]): string[] {
  const seen = new Set<string>();
  analyses.forEach(key => {
    TRACING_DEFINITIONS[key]?.forEach((t) => {
      if (t.p1) seen.add(t.p1);
      if (t.p2) seen.add(t.p2);
      if (t.points) t.points.forEach(p => seen.add(p));
    });
  });
  return [...seen].sort();
}