/**
 * ClinicalViewer.tsx — Dolphin Imaging–level SVG Overlay Viewer
 *
 * Architecture:
 *   ImageLayer  → base X-ray (HTML <image> inside SVG for pan/zoom)
 *   LandmarkLayer → draggable confidence-coded crosshairs
 *   MeasurementLayer → live-computed skeletal/dental lines & angle arcs
 *   AnnotationLayer → text labels
 *
 * All coordinate math is in normalised [0-1] space; rendered via SVG viewBox.
 */
import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import { Landmark } from '@/types';

/* ─── Design Tokens ────────────────────────────────── */
const T = {
  bg0: '#060809',
  bg1: '#0a0d12',
  bg2: '#0e1219',
  bg3: '#121720',
  bg4: '#171e2a',
  bg5: '#1c2333',
  b1: 'rgba(255,255,255,0.07)',
  b2: 'rgba(255,255,255,0.12)',
  b3: 'rgba(255,255,255,0.20)',
  t0: '#f0f4ff',
  t1: 'rgba(200,215,240,0.85)',
  t2: 'rgba(150,170,210,0.60)',
  t3: 'rgba(100,120,165,0.45)',
  accent: '#0ea5e9',
  accentGlow: 'rgba(14,165,233,0.18)',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  // clinical colour palette
  skeletal: '#ef4444',   // red  – SNA, SNB, ANB, FH
  dental:   '#3b82f6',   // blue – incisors, molars
  soft:     '#10b981',   // green – E-line, soft tissue
  vertical: '#a78bfa',   // purple – FMA, GoGn
} as const;

/* ─── Confidence helpers ───────────────────────────── */
const confColor = (s?: number) =>
  s == null ? T.t3 : s >= 0.80 ? T.green : s >= 0.60 ? T.amber : T.red;

/* ─── Measurement line definitions ─────────────────── */
interface MeasLine {
  id: string;
  label: string;
  pts: string[];           // landmark codes
  color: string;
  dash?: string;
  category: 'skeletal' | 'dental' | 'soft' | 'vertical';
}

const MEAS_LINES: MeasLine[] = [
  // Skeletal (Steiner)
  { id: 'SN',    label: 'S-N',   pts: ['S','N'],     color: T.skeletal, category: 'skeletal' },
  { id: 'NA',    label: 'N-A',   pts: ['N','A'],     color: T.skeletal, category: 'skeletal' },
  { id: 'NB',    label: 'N-B',   pts: ['N','B'],     color: T.skeletal, category: 'skeletal' },
  { id: 'NPg',   label: 'N-Pg',  pts: ['N','Pg'],    color: T.skeletal, dash:'4 3', category: 'skeletal' },
  { id: 'SGn',   label: 'S-Gn',  pts: ['S','Gn'],    color: T.skeletal, dash:'6 4', category: 'skeletal' },
  // Vertical
  { id: 'FH',    label: 'FH',    pts: ['Po','Or'],   color: T.vertical, category: 'vertical' },
  { id: 'GoGn',  label: 'Go-Gn', pts: ['Go','Gn'],   color: T.vertical, dash:'5 3', category: 'vertical' },
  { id: 'MP',    label: 'MP',    pts: ['Me','Go'],   color: T.vertical, dash:'5 3', category: 'vertical' },
  // Dental
  { id: 'OcPlane', label: 'OcP', pts: ['UI','LI'],   color: T.dental, dash:'3 4', category: 'dental' },
  // Soft tissue
  { id: 'Eline', label: 'E-line',pts: ['Prn','Pog'], color: T.soft, dash:'4 3', category: 'soft' },
];

/* ─── Angle arc definitions ─────────────────────────── */
interface AngleDef {
  id: string;
  label: string;
  vertex: string;   // landmark at vertex (angle origin)
  ray1: string;     // first arm endpoint
  ray2: string;     // second arm endpoint
  color: string;
  r: number;        // arc radius in normalised coords
}
const ANGLE_DEFS: AngleDef[] = [
  { id:'SNA', label:'SNA', vertex:'N', ray1:'S', ray2:'A', color:T.skeletal, r:0.040 },
  { id:'SNB', label:'SNB', vertex:'N', ray1:'S', ray2:'B', color:T.skeletal, r:0.055 },
  { id:'ANB', label:'ANB', vertex:'N', ray1:'A', ray2:'B', color:'#f97316',  r:0.028 },
  { id:'FMA', label:'FMA', vertex:'Go',ray1:'Me',ray2:'Or', color:T.vertical, r:0.038 },
];

/** SVG arc path for angle between two rays from vertex, radius r (normalised) */
function arcPath(
  vx: number, vy: number,
  ax: number, ay: number,
  bx: number, by: number,
  r: number,
): string {
  const a1 = Math.atan2(ay - vy, ax - vx);
  const a2 = Math.atan2(by - vy, bx - vx);
  const startX = vx + r * Math.cos(a1);
  const startY = vy + r * Math.sin(a1);
  const endX   = vx + r * Math.cos(a2);
  const endY   = vy + r * Math.sin(a2);
  // choose short arc
  let diff = a2 - a1;
  while (diff > Math.PI)  diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const largeArc = Math.abs(diff) > Math.PI ? 1 : 0;
  const sweep    = diff > 0 ? 1 : 0;
  return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} ${sweep} ${endX} ${endY}`;
}

/* ─── Types ────────────────────────────────────────── */
export interface ViewerLandmark extends Landmark {
  /** normalised coords 0-1 (derived from px + image dims) */
  nx: number;
  ny: number;
}

export type ViewerTool = 'select' | 'pan' | 'landmark' | 'measure';

export interface LayerVisibility {
  image: boolean;
  landmarks: boolean;
  measurements: boolean;
  softTissue: boolean;
  heatmap: boolean;
  grid: boolean;
}

interface Props {
  imageUrl?: string;
  imageDims?: { w: number; h: number };
  landmarks: Landmark[];
  onLandmarkMoved?: (code: string, nx: number, ny: number) => void;
  onLandmarkSelected?: (code: string | null) => void;
  selectedLandmark?: string | null;
  activeTool: ViewerTool;
  layers: LayerVisibility;
  brightness: number;   // 50-200
  contrast: number;     // 50-200
  invert: boolean;
  highlightedMeasCode?: string | null;
}

/* ─── Coordinate utilities ──────────────────────────── */
function toNorm(px: number, dim: number) { return px / dim; }
function fromNorm(n: number, dim: number) { return n * dim; }

/* ─── Angle calc (degrees) ─────────────────────────── */
function angleDeg(A: [number,number], B: [number,number], C: [number,number]) {
  const BAx = A[0]-B[0], BAy = A[1]-B[1];
  const BCx = C[0]-B[0], BCy = C[1]-B[1];
  const dot = BAx*BCx + BAy*BCy;
  const magBA = Math.hypot(BAx, BAy), magBC = Math.hypot(BCx, BCy);
  if (!magBA || !magBC) return 0;
  return (Math.acos(Math.min(1, Math.max(-1, dot/(magBA*magBC)))) * 180) / Math.PI;
}

/* ─── Sub-component: Heatmap (confidence radial blur) ── */
function HeatmapLayer({ lms }: { lms: ViewerLandmark[] }) {
  return (
    <g opacity={0.45}>
      <defs>
        <filter id="blur-heat">
          <feGaussianBlur stdDeviation="0.018" />
        </filter>
      </defs>
      {lms.map(lm => {
        const c = confColor(lm.confidenceScore ?? undefined);
        return (
          <circle
            key={lm.id}
            cx={lm.nx} cy={lm.ny} r={0.030}
            fill={c} opacity={0.4}
            filter="url(#blur-heat)"
          />
        );
      })}
    </g>
  );
}

/* ─── Sub-component: Grid ──────────────────────────── */
function GridLayer() {
  const lines = [];
  for (let i = 0.1; i < 1; i += 0.1) {
    lines.push(
      <line key={`v${i}`} x1={i} y1={0} x2={i} y2={1}
        stroke="rgba(14,165,233,0.05)" strokeWidth="0.002" />,
      <line key={`h${i}`} x1={0} y1={i} x2={1} y2={i}
        stroke="rgba(14,165,233,0.05)" strokeWidth="0.002" />
    );
  }
  // Centre cross
  lines.push(
    <line key="cx" x1={0.5} y1={0} x2={0.5} y2={1}
      stroke="rgba(14,165,233,0.10)" strokeWidth="0.003" strokeDasharray="0.02 0.02" />,
    <line key="cy" x1={0} y1={0.5} x2={1} y2={0.5}
      stroke="rgba(14,165,233,0.10)" strokeWidth="0.003" strokeDasharray="0.02 0.02" />
  );
  return <g>{lines}</g>;
}

/* ─── Sub-component: Angle Arcs ────────────────────── */
function AngleLayer({ lms, visible, highlightedCode }: {
  lms: ViewerLandmark[]; visible: boolean; highlightedCode?: string | null;
}) {
  if (!visible) return null;
  const map: Record<string, ViewerLandmark> = {};
  lms.forEach(l => { map[l.landmarkCode] = l; });

  return (
    <g>
      {ANGLE_DEFS.map(def => {
        const V = map[def.vertex]; const A = map[def.ray1]; const B = map[def.ray2];
        if (!V || !A || !B) return null;
        const isHL = highlightedCode === def.id;
        const d = arcPath(V.nx, V.ny, A.nx, A.ny, B.nx, B.ny, def.r);
        // compute angle value
        const BAx = A.nx-V.nx, BAy = A.ny-V.ny;
        const BCx = B.nx-V.nx, BCy = B.ny-V.ny;
        const dot = BAx*BCx + BAy*BCy;
        const deg = (Math.acos(Math.max(-1,Math.min(1,dot/(Math.hypot(BAx,BAy)*Math.hypot(BCx,BCy)))))*180/Math.PI).toFixed(1);
        // label position: midpoint of arc
        const a1 = Math.atan2(A.ny-V.ny, A.nx-V.nx);
        const a2 = Math.atan2(B.ny-V.ny, B.nx-V.nx);
        const amid = (a1+a2)/2;
        const lx = V.nx + (def.r+0.022)*Math.cos(amid);
        const ly = V.ny + (def.r+0.022)*Math.sin(amid);
        return (
          <g key={def.id}>
            {/* Ray lines from vertex */}
            <line x1={V.nx} y1={V.ny} x2={A.nx} y2={A.ny}
              stroke={def.color} strokeWidth="0.0015" opacity={isHL ? 0.9 : 0.4}
              strokeDasharray="0.006 0.004" />
            <line x1={V.nx} y1={V.ny} x2={B.nx} y2={B.ny}
              stroke={def.color} strokeWidth="0.0015" opacity={isHL ? 0.9 : 0.4}
              strokeDasharray="0.006 0.004" />
            {/* Arc */}
            <path d={d} fill="none" stroke={def.color}
              strokeWidth={isHL ? 0.004 : 0.0025}
              opacity={isHL ? 1 : 0.7} />
            {/* Label chip */}
            <rect x={lx-0.022} y={ly-0.013} width={0.048} height={0.020}
              rx={0.003} fill="rgba(6,8,9,0.88)" />
            <text x={lx} y={ly+0.005} fontSize="0.014"
              fill={def.color} textAnchor="middle"
              fontFamily='"SF Mono","Fira Code",monospace' fontWeight="700">
              {`${def.label} ${deg}°`}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ─── Sub-component: Soft Tissue Spline ─────────────── */
function SoftTissueLayer({ lms, visible }: { lms: ViewerLandmark[]; visible: boolean }) {
  if (!visible) return null;
  const order = ['N','Prn','Sn','Ls','Li','Pog','Me'];
  const pts = order.map(c => lms.find(l => l.landmarkCode === c)).filter(Boolean) as ViewerLandmark[];
  if (pts.length < 3) return null;
  // Catmull-Rom spline
  const d = pts.map((p, i) => {
    if (i === 0) return `M ${p.nx} ${p.ny}`;
    const p0 = pts[Math.max(0, i-1)];
    const p1 = pts[i];
    const p2 = pts[Math.min(pts.length-1, i+1)];
    const cpx = p0.nx + (p1.nx - p0.nx) * 0.5;
    const cpy = p0.ny + (p1.ny - p0.ny) * 0.5;
    return `Q ${cpx} ${cpy} ${p1.nx} ${p1.ny}`;
  }).join(' ');
  return (
    <path d={d} fill="none" stroke={T.soft}
      strokeWidth="0.004" opacity={0.75}
      strokeLinecap="round" strokeLinejoin="round" />
  );
}

/* ─── Sub-component: Measurement Lines ─────────────── */
function MeasurementLayer({
  lms, visible, highlightedCode,
}: {
  lms: ViewerLandmark[];
  visible: boolean;
  highlightedCode?: string | null;
}) {
  if (!visible) return null;
  const map: Record<string, ViewerLandmark> = {};
  lms.forEach(l => { map[l.landmarkCode] = l; });

  return (
    <g>
      {MEAS_LINES.map(line => {
        if (line.pts.length < 2) return null;
        const p0 = map[line.pts[0]];
        const p1 = map[line.pts[1]];
        if (!p0 || !p1) return null;
        const isHighlighted = highlightedCode === line.id;
        const opacity = isHighlighted ? 1 : 0.65;
        const sw = isHighlighted ? 0.004 : 0.0025;

        // extend the line slightly beyond endpoints for clinical look
        const dx = p1.nx - p0.nx, dy = p1.ny - p0.ny;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) return null;
        const ex = 0.015 * (dx / len), ey = 0.015 * (dy / len);

        return (
          <g key={line.id}>
            <line
              x1={p0.nx - ex} y1={p0.ny - ey}
              x2={p1.nx + ex} y2={p1.ny + ey}
              stroke={line.color}
              strokeWidth={sw}
              strokeDasharray={line.dash}
              opacity={opacity}
              strokeLinecap="round"
            />
            {/* Mid-label */}
            <text
              x={(p0.nx + p1.nx) / 2 + 0.008}
              y={(p0.ny + p1.ny) / 2}
              fontSize="0.018"
              fill={line.color}
              opacity={isHighlighted ? 1 : 0.8}
              fontFamily='"SF Mono","Fira Code",monospace'
              fontWeight="600"
            >
              {line.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/* ─── Sub-component: Context menu ───────────────────── */
interface CtxMenu { code: string; x: number; y: number; }

function ContextMenu({ menu, onClose, onDelete, onLock, onRefine }: {
  menu: CtxMenu;
  onClose: () => void;
  onDelete: (code: string) => void;
  onLock: (code: string) => void;
  onRefine: (code: string) => void;
}) {
  const items = [
    { label: '🔬 Refine with AI', action: () => { onRefine(menu.code); onClose(); } },
    { label: '🔒 Lock position',  action: () => { onLock(menu.code);   onClose(); } },
    { label: '🗑 Delete',         action: () => { onDelete(menu.code); onClose(); }, danger: true },
  ];
  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex:9998,
      }} />
      <div style={{
        position:'fixed', left: menu.x, top: menu.y, zIndex:9999,
        background:'rgba(12,16,24,0.97)', border:'1px solid rgba(255,255,255,0.12)',
        borderRadius:8, padding:'4px 0', minWidth:170,
        boxShadow:'0 8px 32px rgba(0,0,0,0.7)',
      }}>
        <div style={{ padding:'6px 12px 6px', fontSize:9.5, color:'rgba(100,120,165,0.6)',
          fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'monospace' }}>
          {menu.code}
        </div>
        {items.map(item => (
          <button key={item.label} onClick={item.action} style={{
            display:'block', width:'100%', textAlign:'left',
            padding:'7px 14px', background:'none', border:'none',
            color: item.danger ? '#ef4444' : '#c8d7f0', fontSize:12,
            cursor:'pointer', fontFamily:'system-ui',
          }}>{item.label}</button>
        ))}
      </div>
    </>
  );
}

/* ─── Sub-component: Landmark crosshairs ─────────────── */
interface LandmarkLayerProps {
  lms: ViewerLandmark[];
  visible: boolean;
  selected: string | null;
  hovered: string | null;
  onHover: (code: string | null) => void;
  onSelect: (code: string) => void;
  onDragStart: (code: string) => void;
  tooltip: { code: string; nx: number; ny: number } | null;
}

function LandmarkLayer({
  lms, visible, selected, hovered,
  onHover, onSelect, onDragStart, tooltip,
}: LandmarkLayerProps) {
  if (!visible) return null;
  return (
    <g>
      {lms.map(lm => {
        const isSel = selected === lm.landmarkCode;
        const isHov = hovered === lm.landmarkCode;
        const active = isSel || isHov;
        const color = confColor(lm.confidenceScore ?? undefined);
        const r = active ? 0.012 : 0.008;
        const arm = active ? 0.022 : 0.016;
        const gap = arm * 0.42;

        return (
          <g
            key={lm.id}
            style={{ cursor: 'crosshair' }}
            onMouseEnter={() => onHover(lm.landmarkCode)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(lm.landmarkCode)}
            onMouseDown={(e) => { e.stopPropagation(); onDragStart(lm.landmarkCode); }}
          >
            {/* Low-conf warning halo */}
            {(lm.confidenceScore ?? 1) < 0.6 && (
              <circle
                cx={lm.nx} cy={lm.ny} r={0.030}
                fill="none" stroke={T.red}
                strokeWidth="0.002" opacity={0.35}
                strokeDasharray="0.008 0.006"
              />
            )}

            {/* Selection ring */}
            {active && (
              <>
                <circle cx={lm.nx} cy={lm.ny} r={0.030}
                  fill="none" stroke={color} strokeWidth="0.0015" opacity={0.25} />
                <circle cx={lm.nx} cy={lm.ny} r={0.018}
                  fill="none" stroke={color} strokeWidth="0.002" opacity={0.5} />
              </>
            )}

            {/* Confidence arc */}
            {(lm.confidenceScore ?? 0) > 0 && (
              <circle
                cx={lm.nx} cy={lm.ny} r={0.011}
                fill="none" stroke={color} strokeWidth="0.0025"
                strokeDasharray={`${0.069 * (lm.confidenceScore ?? 0)} 0.069`}
                strokeDashoffset="0.017"
                opacity={0.7}
              />
            )}

            {/* Crosshair arms */}
            <line x1={lm.nx - arm} y1={lm.ny} x2={lm.nx - gap} y2={lm.ny}
              stroke={color} strokeWidth={active ? 0.003 : 0.002} strokeLinecap="round" />
            <line x1={lm.nx + gap} y1={lm.ny} x2={lm.nx + arm} y2={lm.ny}
              stroke={color} strokeWidth={active ? 0.003 : 0.002} strokeLinecap="round" />
            <line x1={lm.nx} y1={lm.ny - arm} x2={lm.nx} y2={lm.ny - gap}
              stroke={color} strokeWidth={active ? 0.003 : 0.002} strokeLinecap="round" />
            <line x1={lm.nx} y1={lm.ny + gap} x2={lm.nx} y2={lm.ny + arm}
              stroke={color} strokeWidth={active ? 0.003 : 0.002} strokeLinecap="round" />

            {/* Centre dot */}
            <circle cx={lm.nx} cy={lm.ny} r={r * 0.5}
              fill={color} />

            {/* Label badge */}
            <g>
              <rect
                x={lm.nx + 0.015} y={lm.ny - 0.018}
                width={0.038} height={0.016}
                rx={0.003} fill="rgba(6,8,9,0.88)"
              />
              <rect
                x={lm.nx + 0.015} y={lm.ny - 0.018}
                width={0.003} height={0.016}
                rx={0.002} fill={color}
              />
              <text
                x={lm.nx + 0.022} y={lm.ny - 0.007}
                fontSize="0.013"
                fill={color}
                fontFamily='"SF Mono","Fira Code",monospace'
                fontWeight="700"
              >
                {lm.landmarkCode}
              </text>
            </g>
          </g>
        );
      })}

      {/* Floating tooltip */}
      {tooltip && (() => {
        const lm = lms.find(l => l.landmarkCode === tooltip.code);
        if (!lm) return null;
        const color = confColor(lm.confidenceScore ?? undefined);
        const conf = lm.confidenceScore != null ? `${(lm.confidenceScore * 100).toFixed(0)}%` : '—';
        const label = lm.confidenceScore == null ? '—' : lm.confidenceScore >= 0.8 ? 'HIGH' : lm.confidenceScore >= 0.6 ? 'MID' : 'LOW';
        return (
          <g>
            <rect x={tooltip.nx + 0.015} y={tooltip.ny + 0.02}
              width={0.13} height={0.055} rx={0.004}
              fill="rgba(10,13,18,0.96)" stroke={color} strokeWidth="0.002" />
            <text x={tooltip.nx + 0.023} y={tooltip.ny + 0.038}
              fontSize="0.016" fill={T.t0}
              fontFamily='"SF Mono","Fira Code",monospace' fontWeight="700">
              {lm.landmarkName || lm.landmarkCode}
            </text>
            <text x={tooltip.nx + 0.023} y={tooltip.ny + 0.054}
              fontSize="0.012" fill={T.t2}
              fontFamily='"SF Mono","Fira Code",monospace'>
              {`x:${lm.xPx.toFixed(1)}  y:${lm.yPx.toFixed(1)}`}
            </text>
            <text x={tooltip.nx + 0.023} y={tooltip.ny + 0.066}
              fontSize="0.012" fill={color}
              fontFamily='"SF Mono","Fira Code",monospace' fontWeight="600">
              {`Conf: ${conf} · ${label}`}
            </text>
          </g>
        );
      })()}
    </g>
  );
}

/* ─── Main ClinicalViewer component ─────────────────── */
export default function ClinicalViewer({
  imageUrl,
  imageDims,
  landmarks,
  onLandmarkMoved,
  onLandmarkSelected,
  selectedLandmark = null,
  activeTool,
  layers,
  brightness,
  contrast,
  invert,
  highlightedMeasCode,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ code: string; nx: number; ny: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 });
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [lockedLandmarks, setLockedLandmarks] = useState<Set<string>>(new Set());
  const [mouseNorm, setMouseNorm] = useState({ nx: 0, ny: 0 });

  // Convert pixel landmarks to normalised [0-1] coords
  const vLandmarks = useMemo<ViewerLandmark[]>(() => {
    if (!imageDims) return landmarks.map(l => ({ ...l, nx: l.xPx / 1000, ny: l.yPx / 1000 }));
    return landmarks.map(l => ({
      ...l,
      nx: toNorm(l.xPx, imageDims.w),
      ny: toNorm(l.yPx, imageDims.h),
    }));
  }, [landmarks, imageDims]);

  /* SVG coords from mouse event */
  const svgPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { nx: 0, ny: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = (svg.getScreenCTM())!.inverse();
    const tp = pt.matrixTransform(ctm);
    // undo viewer transform
    const nx = (tp.x - transform.tx) / transform.scale;
    const ny = (tp.y - transform.ty) / transform.scale;
    return { nx, ny };
  }, [transform]);

  /* Zoom with wheel */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ox = (e.clientX - rect.left) / rect.width;
    const oy = (e.clientY - rect.top) / rect.height;
    setTransform(prev => {
      const ns = Math.min(12, Math.max(0.3, prev.scale * factor));
      const tx = ox - (ox - prev.tx) * (ns / prev.scale);
      const ty = oy - (oy - prev.ty) * (ns / prev.scale);
      return { scale: ns, tx, ty };
    });
  }, []);

  /* Pan */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === 'pan' || e.button === 1) {
      setIsPanning(true);
      panStart.current = { mx: e.clientX, my: e.clientY, tx: transform.tx, ty: transform.ty };
    }
  }, [activeTool, transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = (e.clientX - panStart.current.mx) / rect.width;
      const dy = (e.clientY - panStart.current.my) / rect.height;
      setTransform(prev => ({ ...prev, tx: panStart.current.tx + dx, ty: panStart.current.ty + dy }));
      return;
    }
    const { nx, ny } = svgPoint(e);
    setMouseNorm({ nx, ny });
    if (dragging) {
      onLandmarkMoved?.(dragging, Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny)));
    }
  }, [isPanning, dragging, svgPoint, onLandmarkMoved]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { nx, ny } = svgPoint(e);
    const hit = vLandmarks.find(lm => Math.hypot(lm.nx - nx, lm.ny - ny) * transform.scale < 0.04);
    if (hit) setCtxMenu({ code: hit.landmarkCode, x: e.clientX, y: e.clientY });
  }, [svgPoint, vLandmarks, transform.scale]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragging(null);
  }, []);

  const handleDragStart = useCallback((code: string) => {
    if (activeTool === 'select' || activeTool === 'landmark') {
      setDragging(code);
    }
  }, [activeTool]);

  const handleHover = useCallback((code: string | null) => {
    setHovered(code);
    if (code) {
      const lm = vLandmarks.find(l => l.landmarkCode === code);
      if (lm) setTooltip({ code, nx: lm.nx, ny: lm.ny });
    } else {
      setTooltip(null);
    }
  }, [vLandmarks]);

  const handleSelect = useCallback((code: string) => {
    onLandmarkSelected?.(code);
  }, [onLandmarkSelected]);

  const fitToView = useCallback(() => {
    setTransform({ scale: 1, tx: 0, ty: 0 });
  }, []);

  useEffect(() => { fitToView(); }, [imageUrl, fitToView]);

  const cursor = activeTool === 'pan' || isPanning ? 'grab'
    : dragging ? 'crosshair'
    : activeTool === 'landmark' ? 'crosshair'
    : 'default';

  const groupTransform = `translate(${transform.tx}, ${transform.ty}) scale(${transform.scale})`;

  const filterStr = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    invert ? 'invert(1)' : '',
  ].filter(Boolean).join(' ');

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
    <svg
      ref={svgRef}
      viewBox="0 0 1 1"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block', background: '#000', cursor }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleContextMenu}
    >
      <defs>
        <filter id="img-filter">
          <feColorMatrix type="saturate" values="0.3" />
        </filter>
      </defs>

      <g transform={groupTransform}>
        {/* Image Layer */}
        {layers.image && imageUrl && (
          <image
            href={imageUrl}
            x={0} y={0} width={1} height={1}
            preserveAspectRatio="xMidYMid meet"
            style={{ filter: filterStr }}
          />
        )}

        {/* Grid */}
        {layers.grid && <GridLayer />}

        {/* Soft tissue spline */}
        <SoftTissueLayer lms={vLandmarks} visible={layers.softTissue} />

        {/* Measurement lines */}
        <MeasurementLayer
          lms={vLandmarks}
          visible={layers.measurements}
          highlightedCode={highlightedMeasCode}
        />

        {/* Angle arcs */}
        <AngleLayer
          lms={vLandmarks}
          visible={layers.measurements}
          highlightedCode={highlightedMeasCode}
        />

        {/* Heatmap */}
        {layers.heatmap && <HeatmapLayer lms={vLandmarks} />}

        {/* Landmarks */}
        <LandmarkLayer
          lms={vLandmarks}
          visible={layers.landmarks}
          selected={selectedLandmark}
          hovered={hovered}
          onHover={handleHover}
          onSelect={handleSelect}
          onDragStart={handleDragStart}
          tooltip={tooltip}
        />
      </g>

      {/* Status bar: zoom + cursor coords */}
      <g>
        <rect x={0} y={0.958} width={1} height={0.042}
          fill="rgba(6,8,9,0.82)" />
        <text x={0.012} y={0.979} fontSize="0.018"
          fill="rgba(14,165,233,0.85)"
          fontFamily='"SF Mono","Fira Code",monospace' fontWeight="700">
          {`${(transform.scale * 100).toFixed(0)}%`}
        </text>
        <text x={0.12} y={0.979} fontSize="0.016"
          fill="rgba(150,170,210,0.55)"
          fontFamily='"SF Mono","Fira Code",monospace'>
          {`x:${(mouseNorm.nx * (imageDims?.w ?? 1000)).toFixed(1)}  y:${(mouseNorm.ny * (imageDims?.h ?? 1000)).toFixed(1)}`}
        </text>
        {dragging && (
          <text x={0.55} y={0.979} fontSize="0.016"
            fill="rgba(245,158,11,0.9)"
            fontFamily='"SF Mono","Fira Code",monospace'>
            {`Adjusting: ${dragging}`}
          </text>
        )}
      </g>
    </svg>

    {/* Context menu (outside SVG – needs DOM coordinates) */}
    {ctxMenu && (
      <ContextMenu
        menu={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onDelete={(code) => { /* caller handles via prop */ setCtxMenu(null); }}
        onLock={(code) => setLockedLandmarks(prev => { const s = new Set(prev); s.has(code) ? s.delete(code) : s.add(code); return s; })}
        onRefine={(code) => { /* trigger AI refine via prop */ setCtxMenu(null); }}
      />
    )}
    </div>
  );
}
