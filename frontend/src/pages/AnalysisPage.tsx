import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { imagesApi, analysisApi } from '@/services/api';
import { AnalysisType, Landmark, LandmarkUpdateDto, XRayImage } from '@/types';
import { Spinner, EmptyState } from '@/components/ui/Loading';
import {
  Upload, ZoomIn, ZoomOut, Maximize2, Play, Save,
  ArrowLeft, RotateCcw, CheckCircle2, AlertTriangle,
  Crosshair, Sliders, List, Eye, ChevronRight, Info,
  Target, Ruler, Activity, X, ChevronDown, Sun, Contrast,
  Grid3x3, Scan, FlipHorizontal, RefreshCw, FileImage,
  MousePointer2, Move, Search, Filter, SlidersHorizontal,
  AlertCircle, Check, Circle, ArrowUpDown, Layers,
  BarChart2, TrendingUp, Clock, Settings2, Microscope,
  Brain, Zap, Shield, ChevronUp, MoreHorizontal,
  Minus, Plus, RotateCw, Crosshair as CrosshairIcon,
  Lock, Unlock, Download, Share2, History, Bookmark,
  ChevronLeft, Radio, Waves, ScanLine, FlipVertical,
  Maximize, Minimize, PanelRight, PanelLeft
} from 'lucide-react';

/* ─────────────────────────────────────────────
   Design System — Clinical Dark Theme
   Inspired by Dolphin Imaging, OsiriX, Carestream
───────────────────────────────────────────── */
const C = {
  /* Base surfaces */
  bg0: '#060809',
  bg1: '#0a0d12',
  bg2: '#0e1219',
  bg3: '#121720',
  bg4: '#171e2a',
  bg5: '#1c2333',

  /* Borders */
  b0: 'rgba(255,255,255,0.04)',
  b1: 'rgba(255,255,255,0.07)',
  b2: 'rgba(255,255,255,0.11)',
  b3: 'rgba(255,255,255,0.18)',

  /* Text */
  t0: '#f0f4ff',
  t1: 'rgba(200,215,240,0.85)',
  t2: 'rgba(150,170,210,0.6)',
  t3: 'rgba(100,120,165,0.45)',
  t4: 'rgba(70,90,130,0.3)',

  /* Accent — clinical cyan-blue */
  accent: '#0ea5e9',
  accentDim: '#0369a1',
  accentGlow: 'rgba(14,165,233,0.15)',

  /* Semantic */
  green: '#10b981',
  greenBg: 'rgba(16,185,129,0.08)',
  greenBd: 'rgba(16,185,129,0.2)',
  amber: '#f59e0b',
  amberBg: 'rgba(245,158,11,0.08)',
  amberBd: 'rgba(245,158,11,0.2)',
  red: '#ef4444',
  redBg: 'rgba(239,68,68,0.08)',
  redBd: 'rgba(239,68,68,0.2)',
  purple: '#a78bfa',
  purpleBg: 'rgba(167,139,250,0.08)',

  /* Landmark confidence */
  confHigh: '#10b981',
  confMid: '#f59e0b',
  confLow: '#ef4444',
} as const;

const ANALYSIS_TYPES: AnalysisType[] = [
  'Steiner', 'McNamara', 'Ricketts', 'Eastman',
  'Jarabak', 'Tweed', 'Downs', 'Full',
];

const PROTOCOL_DESCRIPTIONS: Record<string, string> = {
  Steiner: 'S-N based skeletal & dental',
  McNamara: 'Maxillary/mandibular lengths',
  Ricketts: '10 key factor analysis',
  Eastman: 'British standard method',
  Jarabak: 'Polygon/ratio method',
  Tweed: 'Frankfurt-mandibular triangle',
  Downs: 'Original cephalometric',
  Full: 'Comprehensive multi-analysis',
};

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const confColor = (s?: number) => s == null ? C.t3 : s >= 0.8 ? C.confHigh : s >= 0.6 ? C.confMid : C.confLow;
const confBg = (s?: number) => s == null ? 'transparent' : s >= 0.8 ? C.greenBg : s >= 0.6 ? C.amberBg : C.redBg;
const confBd = (s?: number) => s == null ? C.b1 : s >= 0.8 ? C.greenBd : s >= 0.6 ? C.amberBd : C.redBd;
const confLabel = (s?: number) => s == null ? '—' : s >= 0.8 ? 'HIGH' : s >= 0.6 ? 'MID' : 'LOW';
const pct = (s?: number) => s != null ? `${(s * 100).toFixed(0)}` : '—';

/* ─────────────────────────────────────────────
   Atoms
───────────────────────────────────────────── */

function Tag({ children, color = C.accent }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
      padding: '2px 5px', borderRadius: 3,
      color, background: `${color}14`,
      border: `1px solid ${color}28`,
      textTransform: 'uppercase', fontFamily: 'monospace',
      lineHeight: 1.4,
    }}>
      {children}
    </span>
  );
}

function StatusPill({ icon, label, color, bg, border }: {
  icon: React.ReactNode; label: string;
  color: string; bg: string; border: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      background: bg, border: `1px solid ${border}`,
      fontSize: 11, fontWeight: 500, color,
      letterSpacing: '0.01em',
    }}>
      {icon}
      {label}
    </div>
  );
}

function ToolBtn({
  onClick, title, active, disabled, children,
  size = 30, variant = 'default',
}: {
  onClick?: () => void; title?: string; active?: boolean;
  disabled?: boolean; children: React.ReactNode;
  size?: number; variant?: 'default' | 'danger';
}) {
  const ac = variant === 'danger' ? C.red : C.accent;
  return (
    <button
      title={title} disabled={disabled} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: 6, padding: 0,
        border: active ? `1px solid ${ac}40` : '1px solid transparent',
        background: active ? `${ac}12` : 'transparent',
        color: active ? ac : C.t2,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'all 0.12s',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (disabled || active) return;
        const b = e.currentTarget as HTMLButtonElement;
        b.style.background = C.bg5;
        b.style.color = C.t0;
        b.style.border = `1px solid ${C.b2}`;
      }}
      onMouseLeave={e => {
        if (disabled || active) return;
        const b = e.currentTarget as HTMLButtonElement;
        b.style.background = 'transparent';
        b.style.color = C.t2;
        b.style.border = '1px solid transparent';
      }}
    >
      {children}
    </button>
  );
}

function Sep({ v = true }: { v?: boolean }) {
  return (
    <div style={v
      ? { width: 1, height: 16, background: C.b1, flexShrink: 0, margin: '0 3px' }
      : { height: 1, background: C.b1, margin: '10px 0' }}
    />
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: C.t3, fontFamily: 'monospace',
    }}>
      {children}
    </span>
  );
}

function MetaRow({ label, value, mono = false, accent = false, last = false }: {
  label: string; value: string; mono?: boolean;
  accent?: boolean; last?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0',
      borderBottom: last ? 'none' : `1px solid ${C.b0}`,
    }}>
      <span style={{ fontSize: 11, color: C.t3 }}>{label}</span>
      <span style={{
        fontSize: 11, fontWeight: 500,
        color: accent ? C.accent : C.t1,
        fontFamily: mono ? '"SF Mono", "Fira Code", monospace' : 'inherit',
        letterSpacing: mono ? '0.02em' : 'normal',
      }}>
        {value}
      </span>
    </div>
  );
}

/* Inline sparkline-like confidence bar */
function ConfBar({ score }: { score?: number }) {
  if (score == null) return null;
  const color = confColor(score);
  return (
    <div style={{
      width: 32, height: 3, background: C.b1, borderRadius: 2,
      overflow: 'hidden', flexShrink: 0,
    }}>
      <div style={{
        width: `${score * 100}%`, height: '100%',
        background: color, borderRadius: 2,
        transition: 'width 0.3s',
      }} />
    </div>
  );
}

/* Stat tile */
function Stat({ label, value, color, sub }: {
  label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <div style={{
      flex: 1, padding: '10px 12px',
      background: `${color}06`,
      border: `1px solid ${color}18`,
      borderRadius: 8,
    }}>
      <div style={{
        fontSize: 22, fontWeight: 700, color,
        lineHeight: 1, marginBottom: 2,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: '"SF Mono", monospace',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 9.5, color: C.t3, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 9, color, marginTop: 2, opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}

/* Slider */
function Slider({
  icon, label, value, onChange, min, max, color = C.accent, step = 1,
}: {
  icon?: React.ReactNode; label: string; value: number;
  onChange: (v: number) => void; min: number; max: number;
  color?: string; step?: number;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {icon && <span style={{ color: C.t3, display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, position: 'relative', height: 3, background: C.bg5, borderRadius: 2 }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
          background: color, width: `${pct}%`, transition: 'width 0.04s',
        }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(+e.target.value)}
          title={label}
          style={{
            position: 'absolute', inset: '-8px 0',
            width: '100%', opacity: 0, cursor: 'pointer', margin: 0, zIndex: 1,
          }}
        />
      </div>
      <span style={{
        fontSize: 10, color: C.t2, fontFamily: 'monospace',
        minWidth: 30, textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}%
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Page
───────────────────────────────────────────── */
export default function AnalysisPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cachedCanvas = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  /* ── View ── */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showLines, setShowLines] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState({ x: 0, y: 0 });
  const [isSmoothing, setIsSmoothing] = useState(true);

  /* ── UI ── */
  const [activeTab, setActiveTab] = useState<'meta' | 'landmarks' | 'calibration'>('meta');
  const [analysisType, setAnalysisType] = useState<AnalysisType>('Steiner');
  const [selectedLandmark, setSelectedLandmark] = useState<string | null>(null);
  const [hoveredLandmark, setHoveredLandmark] = useState<string | null>(null);
  const [filterConf, setFilterConf] = useState<'all' | 'low' | 'mid' | 'high'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'code' | 'conf'>('code');
  const [unsaved, setUnsaved] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [imgCoords, setImgCoords] = useState({ x: 0, y: 0 });
  const [showLoupe, setShowLoupe] = useState(false);

  /* ── Upload ── */
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  /* ── Calibration ── */
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibPoints, setCalibPoints] = useState<{ x: number; y: number }[]>([]);
  const [knownDistance, setKnownDistance] = useState<string>('10');

  /* ── Landmark adjust ── */
  const [adjustModal, setAdjustModal] = useState<{ landmark: Landmark; newX: number; newY: number } | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustCategory, setAdjustCategory] = useState<'AIError' | 'AnatomyUnclear' | 'ClinicianCorrection'>('ClinicianCorrection');
  const [dragState, setDragState] = useState<{ landmark: Landmark; originalX: number; originalY: number } | null>(null);
  const [touchDist, setTouchDist] = useState(0);

  /* ── Landmark data ── */
  const [localLandmarks, setLocalLandmarks] = useState<Landmark[]>([]);

  /* ── Queries ── */
  const { data: images, isLoading: loadingImages } = useQuery({
    queryKey: ['images', studyId],
    queryFn: () => imagesApi.getByStudy(studyId!),
    enabled: !!studyId,
  });
  const image = images?.[0];

  const { data: session } = useQuery({
    queryKey: ['latest-session', image?.id],
    queryFn: () => analysisApi.getLatestSession(image!.id),
    enabled: !!image?.id,
  });

  const { data: landmarks } = useQuery({
    queryKey: ['landmarks', session?.id],
    queryFn: () => analysisApi.getLandmarks(session!.id),
    enabled: !!session?.id,
  });

  useEffect(() => { if (landmarks) setLocalLandmarks(landmarks); }, [landmarks]);
  useEffect(() => { if (image && !image.isCalibrated) setActiveTab('calibration'); }, [image?.id]);

  /* ── Derived ── */
  const highConf = localLandmarks.filter(l => (l.confidenceScore ?? 0) >= 0.8).length;
  const midConf = localLandmarks.filter(l => { const s = l.confidenceScore ?? 1; return s >= 0.6 && s < 0.8; }).length;
  const lowConf = localLandmarks.filter(l => (l.confidenceScore ?? 1) < 0.6).length;
  const avgConf = localLandmarks.length
    ? localLandmarks.reduce((a, l) => a + (l.confidenceScore ?? 0), 0) / localLandmarks.length
    : 0;

  const filteredLandmarks = localLandmarks
    .filter(lm => {
      const s = lm.confidenceScore ?? -1;
      if (filterConf === 'high') return s >= 0.8;
      if (filterConf === 'mid') return s >= 0.6 && s < 0.8;
      if (filterConf === 'low') return s < 0.6;
      return true;
    })
    .filter(lm => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return lm.landmarkCode.toLowerCase().includes(q) || (lm.landmarkName ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => sortBy === 'conf'
      ? (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0)
      : a.landmarkCode.localeCompare(b.landmarkCode)
    );

  /* ── Canvas Draw ── */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgRef.current) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    /* Grid */
    if (showGrid) {
      ctx.strokeStyle = 'rgba(14,165,233,0.06)';
      ctx.lineWidth = 1;
      const step = 50 * zoom;
      for (let x = pan.x % step; x < canvas.width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = pan.y % step; y < canvas.height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }
      /* Center cross */
      ctx.strokeStyle = 'rgba(14,165,233,0.12)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* Image */
    const img = imgRef.current;
    if (img?.complete) {
      ctx.save();
      ctx.imageSmoothingEnabled = isSmoothing;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      const src = (cachedCanvas.current?.width ?? 0) > 0 ? cachedCanvas.current! : img;
      ctx.drawImage(src as CanvasImageSource, 0, 0);
      ctx.restore();
    }

    /* Skeleton lines between landmarks */
    if (showLines && localLandmarks.length > 1) {
      ctx.save();
      ctx.strokeStyle = 'rgba(14,165,233,0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      localLandmarks.forEach((lm, i) => {
        if (i === 0) return;
        const prev = localLandmarks[i - 1];
        ctx.beginPath();
        ctx.moveTo(prev.xPx * zoom + pan.x, prev.yPx * zoom + pan.y);
        ctx.lineTo(lm.xPx * zoom + pan.x, lm.yPx * zoom + pan.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.restore();
    }

    /* Landmarks */
    localLandmarks.forEach(lm => {
      const cx = lm.xPx * zoom + pan.x;
      const cy = lm.yPx * zoom + pan.y;
      const isSel = selectedLandmark === lm.landmarkCode;
      const isHov = hoveredLandmark === lm.landmarkCode;
      const active = isSel || isHov;
      const color = confColor(lm.confidenceScore ?? undefined);
      const conf = lm.confidenceScore ?? 0;

      /* Low-conf warning halo */
      if (conf < 0.6) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.strokeStyle = `${C.red}18`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      /* Selection ring */
      if (active) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}22`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.strokeStyle = `${color}55`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      /* Crosshair arms */
      ctx.save();
      const arm = active ? 13 : 9;
      const gap = active ? 4.5 : 3.5;
      ctx.strokeStyle = color;
      ctx.lineWidth = active ? 1.8 : 1.3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm);
      ctx.stroke();

      /* Center dot */
      ctx.beginPath();
      ctx.arc(cx, cy, active ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      /* Confidence arc */
      if (conf > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, 7, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * conf), false);
        ctx.strokeStyle = `${color}60`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      ctx.restore();

      /* Label */
      if (showLabels) {
        ctx.save();
        const code = lm.landmarkCode;
        ctx.font = `600 10px "SF Mono","Fira Code",monospace`;
        const tw = ctx.measureText(code).width;
        const px = cx + 16, py = cy - 5;
        const pw = tw + 10, ph = 16;

        /* Label background */
        ctx.fillStyle = 'rgba(6,8,9,0.9)';
        const r = 3;
        ctx.beginPath();
        ctx.roundRect(px, py - ph + 2, pw, ph, r);
        ctx.fill();

        /* Colored left edge */
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(px, py - ph + 2, 2.5, ph, [r, 0, 0, r]);
        ctx.fill();

        ctx.fillStyle = color;
        ctx.fillText(code, px + 7, py - 1);

        /* Hover tooltip */
        if (isHov && lm.confidenceScore != null) {
          const confStr = `${(lm.confidenceScore * 100).toFixed(0)}% · ${confLabel(lm.confidenceScore ?? undefined)}`;
          ctx.font = '9px "SF Mono",monospace';
          const ctw = ctx.measureText(confStr).width;
          const ty = py + 14;
          ctx.fillStyle = 'rgba(6,8,9,0.95)';
          ctx.beginPath();
          ctx.roundRect(px, ty - ph + 2, ctw + 10, ph, r);
          ctx.fill();
          ctx.fillStyle = `${color}cc`;
          ctx.fillText(confStr, px + 5, ty - 1);
        }

        ctx.restore();
      }
    });

    /* Calibration points */
    calibPoints.forEach((p, i) => {
      const cx = p.x * zoom + pan.x;
      const cy = p.y * zoom + pan.y;

      /* Ring */
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.strokeStyle = `${C.amber}50`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = C.amber;
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), cx, cy);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    });

    if (calibPoints.length === 2) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(calibPoints[0].x * zoom + pan.x, calibPoints[0].y * zoom + pan.y);
      ctx.lineTo(calibPoints[1].x * zoom + pan.x, calibPoints[1].y * zoom + pan.y);
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    /* Loupe magnifier */
    if ((showLoupe || dragState) && imgRef.current) {
      const targetX = dragState ? dragState.landmark.xPx : imgCoords.x;
      const targetY = dragState ? dragState.landmark.yPx : imgCoords.y;
      const lx = Math.min(Math.max(mousePos.x, 80), canvas.width - 80);
      const ly = Math.min(Math.max(mousePos.y - 90, 80), canvas.height - 80);
      const lR = 72;
      const lZ = 3.5;

      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, lR, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#000';
      ctx.fill();

      const src2 = (cachedCanvas.current?.width ?? 0) > 0 ? cachedCanvas.current! : imgRef.current;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(
        src2 as CanvasImageSource,
        targetX - lR / lZ, targetY - lR / lZ, (lR * 2) / lZ, (lR * 2) / lZ,
        lx - lR, ly - lR, lR * 2, lR * 2
      );

      /* Landmarks in loupe */
      localLandmarks.forEach(lm => {
        const dx = (lm.xPx - targetX) * lZ + lx;
        const dy = (lm.yPx - targetY) * lZ + ly;
        if (Math.hypot(dx - lx, dy - ly) < lR - 4) {
          ctx.beginPath();
          ctx.arc(dx, dy, lm.landmarkCode === selectedLandmark ? 5 : 3.5, 0, Math.PI * 2);
          ctx.fillStyle = confColor(lm.confidenceScore ?? undefined);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      ctx.restore();

      /* Loupe border */
      ctx.beginPath();
      ctx.arc(lx, ly, lR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();

      /* Center cross */
      ctx.beginPath();
      ctx.moveTo(lx - 8, ly); ctx.lineTo(lx + 8, ly);
      ctx.moveTo(lx, ly - 8); ctx.lineTo(lx, ly + 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }, [zoom, pan, localLandmarks, calibPoints, selectedLandmark, hoveredLandmark,
    showGrid, showLabels, showLines, isSmoothing, showLoupe, mousePos, imgCoords, dragState]);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  /* Update cached canvas (brightness/contrast/invert) */
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    if (!cachedCanvas.current) cachedCanvas.current = document.createElement('canvas');
    const c = cachedCanvas.current;
    if (c.width !== img.width || c.height !== img.height) {
      c.width = img.width; c.height = img.height;
    }
    const cx = c.getContext('2d');
    if (cx) {
      cx.filter = `brightness(${brightness}%) contrast(${contrast}%)${invert ? ' invert(1)' : ''}`;
      cx.drawImage(img, 0, 0);
    }
  }, [brightness, contrast, invert, image?.id]);

  const fitToScreen = useCallback(() => {
    if (!imgRef.current || !canvasRef.current || !containerRef.current) return;
    const img = imgRef.current, c = canvasRef.current, cont = containerRef.current;
    c.width = cont.clientWidth; c.height = cont.clientHeight;
    const s = Math.min(c.width / img.width, c.height / img.height) * 0.88;
    setZoom(s);
    setPan({ x: (c.width - img.width * s) / 2, y: (c.height - img.height * s) / 2 });
  }, []);

  const loadImage = useCallback((url: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      fitToScreen();
      if (!cachedCanvas.current) cachedCanvas.current = document.createElement('canvas');
      cachedCanvas.current.width = img.width;
      cachedCanvas.current.height = img.height;
      const cx = cachedCanvas.current.getContext('2d');
      if (cx) cx.drawImage(img, 0, 0);
      draw();
    };
    img.onerror = () => toast.error('Could not load radiograph image');
    img.src = url;
  }, [draw, fitToScreen]);

  useEffect(() => { if (image?.storageUrl) loadImage(image.storageUrl); }, [image?.storageUrl, loadImage]);

  useEffect(() => {
    const handleResize = () => fitToScreen();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fitToScreen]);

  /* Input handlers */
  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;

    if (!isCalibrating) {
      const hit = localLandmarks.find(lm => Math.hypot(lm.xPx - x, lm.yPx - y) * zoom < 14);
      if (hit) {
        setDragState({ landmark: hit, originalX: hit.xPx, originalY: hit.yPx });
        setSelectedLandmark(hit.landmarkCode);
        return;
      }
    }
    setIsPanning(true);
    setMouseDownPos({ x: e.clientX, y: e.clientY });
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: mx, y: my });

    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    setImgCoords({ x, y });

    if (dragState) {
      setLocalLandmarks(prev =>
        prev.map(lm => lm.id === dragState.landmark.id ? { ...lm, xPx: x, yPx: y } : lm)
      );
      return;
    }
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }
    if (!isCalibrating) {
      const hov = localLandmarks.find(lm => Math.hypot(lm.xPx - x, lm.yPx - y) * zoom < 14);
      setHoveredLandmark(hov?.landmarkCode ?? null);
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (dragState) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        const d = Math.hypot(x - dragState.originalX, y - dragState.originalY);
        setLocalLandmarks(prev =>
          prev.map(lm => lm.id === dragState.landmark.id
            ? { ...lm, xPx: dragState.originalX, yPx: dragState.originalY }
            : lm)
        );
        if (d > 2 / zoom) setAdjustModal({ landmark: dragState.landmark, newX: x, newY: y });
      }
      setDragState(null);
      return;
    }
    setIsPanning(false);
    const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
    if (dist < 5) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect && isCalibrating && calibPoints.length < 2) {
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        setCalibPoints(p => [...p, { x, y }]);
      }
    }
  };

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.909;
    const nz = Math.max(0.1, Math.min(zoom * factor, 16));
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setPan(p => ({ x: mx - (mx - p.x) * (nz / zoom), y: my - (my - p.y) * (nz / zoom) }));
    setZoom(nz);
  }, [zoom]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setTouchDist(Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      ));
      return;
    }
    const t = e.touches[0];
    handleMouseDown({ clientX: t.clientX, clientY: t.clientY } as unknown as React.MouseEvent<HTMLCanvasElement>);
  };

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setZoom(z => Math.max(0.1, Math.min(z * (d / (touchDist || d)), 16)));
      setTouchDist(d);
      return;
    }
    const t = e.touches[0];
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = t.clientX - rect.left;
    const my = t.clientY - rect.top;
    setMousePos({ x: mx, y: my });
    if (isPanning) setPan({ x: t.clientX - panStart.x, y: t.clientY - panStart.y });
  }, [touchDist, isPanning, panStart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); handleWheel(e); };
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); handleTouchMove(e); };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchmove', onTouchMove);
    };
  }, [handleWheel, handleTouchMove]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, () => void> = {
      '=': () => setZoom(z => Math.min(z + 0.15, 16)),
      '+': () => setZoom(z => Math.min(z + 0.15, 16)),
      '-': () => setZoom(z => Math.max(z - 0.15, 0.1)),
      'f': fitToScreen,
      'ArrowUp': () => setPan(p => ({ ...p, y: p.y + 40 })),
      'ArrowDown': () => setPan(p => ({ ...p, y: p.y - 40 })),
      'ArrowLeft': () => setPan(p => ({ ...p, x: p.x + 40 })),
      'ArrowRight': () => setPan(p => ({ ...p, x: p.x - 40 })),
      'Tab': () => {
        if (!localLandmarks.length) return;
        const i = localLandmarks.findIndex(l => l.landmarkCode === selectedLandmark);
        const next = localLandmarks[(i + 1) % localLandmarks.length];
        setSelectedLandmark(next.landmarkCode);
        setActiveTab('landmarks');
      },
      'g': () => setShowGrid(v => !v),
      'l': () => setShowLabels(v => !v),
      'i': () => setInvert(v => !v),
      'Escape': () => { setSelectedLandmark(null); setIsCalibrating(false); setCalibPoints([]); },
    };
    const fn = map[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  /* Mutations */
  const detectMut = useMutation({
    mutationFn: () => analysisApi.detect(image!.id, analysisType),
    onSuccess: () => {
      toast.success('Detection complete — landmarks populated');
      qc.invalidateQueries({ queryKey: ['latest-session', image?.id] });
      qc.invalidateQueries({ queryKey: ['landmarks', session?.id] });
      setActiveTab('landmarks');
    },
    onError: () => toast.error('AI detection failed. Please retry.'),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const updates: LandmarkUpdateDto[] = localLandmarks.map(lm => ({
        landmarkCode: lm.landmarkCode,
        xPx: lm.xPx, yPx: lm.yPx,
        adjustmentReason: lm.adjustmentReason,
      }));
      return analysisApi.updateLandmarks(session!.id, updates);
    },
    onSuccess: () => { toast.success('Saved'); setUnsaved(false); },
    onError: () => toast.error('Save failed'),
  });

  const finalizeMut = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error('No active session');
      const updates: LandmarkUpdateDto[] = localLandmarks.map(l => ({
        landmarkCode: l.landmarkCode,
        xPx: l.xPx,
        yPx: l.yPx,
      }));

      await analysisApi.finalize(session.id, updates);

      try {
        await analysisApi.generateOverlays(session.id);
        return { overlaysGenerated: true };
      } catch {
        return { overlaysGenerated: false };
      }
    },
    onSuccess: ({ overlaysGenerated }) => {
      if (overlaysGenerated) {
        toast.success('Session finalized and overlays generated');
      } else {
        toast.warning('Session finalized. Overlay generation did not complete.');
      }
      navigate(`/results/${session!.id}`);
    },
    onError: () => toast.error('Finalization failed'),
  });

  const confirmAdjust = async () => {
    if (!adjustModal || !session) return;
    if (!adjustReason.trim()) { toast.error('Reason required'); return; }
    try {
      const updated = await analysisApi.adjustLandmark(session.id, adjustModal.landmark.landmarkCode, {
        x: adjustModal.newX, y: adjustModal.newY, reason: adjustReason,
      });
      setLocalLandmarks(prev => prev.map(lm => lm.landmarkCode === updated.landmarkCode ? updated : lm));
      setUnsaved(true);
      setAdjustModal(null);
      setAdjustReason('');
      toast.success('Landmark repositioned');
    } catch {
      toast.error('Adjustment failed');
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!studyId) return;
    setIsUploading(true);
    try {
      await imagesApi.upload(studyId, file, p => setUploadProgress(p));
      toast.success('Radiograph uploaded');
      qc.invalidateQueries({ queryKey: ['images', studyId] });
    } catch {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const cursorStyle = isCalibrating ? 'crosshair'
    : dragState ? 'grabbing'
      : hoveredLandmark ? 'pointer'
        : isPanning ? 'grabbing'
          : 'grab';

  const selectedLm = localLandmarks.find(l => l.landmarkCode === selectedLandmark);

  /* ─────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes pls {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(1.8); }
        }
        @keyframes fi { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
        @keyframes si { from { opacity:0; transform:scale(0.97) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:3px; height:3px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:2px; }
        input[type=range] { -webkit-appearance:none; appearance:none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:0; height:0; }
        select option { background:#0e1219; }
        ::placeholder { color: rgba(100,120,165,0.4); }
      `}</style>

      <div
        style={{
          display: 'flex', flexDirection: 'column', height: '100vh',
          background: C.bg0, color: C.t0,
          fontFamily: '"Inter","SF Pro Display",-apple-system,sans-serif',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        {/* ══ HEADER ════════════════════════════════════════════ */}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px', height: 44,
          background: C.bg1,
          borderBottom: `1px solid ${C.b1}`,
          flexShrink: 0, zIndex: 30,
          userSelect: 'none',
        }}>
          {/* Back + branding */}
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 5,
              border: `1px solid ${C.b1}`,
              background: 'transparent', color: C.t2,
              cursor: 'pointer', fontSize: 11, fontWeight: 500,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.bg4; e.currentTarget.style.color = C.t0; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.t2; }}
          >
            <ArrowLeft size={12} />
            Back
          </button>

          <Sep />

          {/* App identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: `linear-gradient(135deg, ${C.accentDim}, #0c4a6e)`,
              border: `1px solid ${C.accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Brain size={13} style={{ color: C.accent }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.t0, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                CephaloAI
              </div>
              <div style={{ fontSize: 9, color: C.t3, fontFamily: 'monospace', letterSpacing: '0.06em', lineHeight: 1 }}>
                {studyId?.slice(0, 8).toUpperCase()} · {analysisType}
              </div>
            </div>
          </div>

          <Sep />

          {/* Status chips */}
          {image?.isCalibrated ? (
            <StatusPill
              icon={<CheckCircle2 size={10} />}
              label={`Calibrated · ${image.pixelSpacingMm?.toFixed(4)} mm/px`}
              color={C.green} bg={C.greenBg} border={C.greenBd}
            />
          ) : image ? (
            <StatusPill
              icon={<AlertTriangle size={10} />}
              label="Calibration required"
              color={C.amber} bg={C.amberBg} border={C.amberBd}
            />
          ) : null}

          {session && (
            <StatusPill
              icon={<Radio size={10} />}
              label="Session active"
              color={C.accent} bg={C.accentGlow} border={`${C.accent}30`}
            />
          )}

          {localLandmarks.length > 0 && (
            <StatusPill
              icon={<Target size={10} />}
              label={`${localLandmarks.length} landmarks · ${(avgConf * 100).toFixed(0)}% avg`}
              color={confColor(avgConf)} bg={confBg(avgConf)} border={confBd(avgConf)}
            />
          )}

          <div style={{ flex: 1 }} />

          {/* Protocol selector */}
          {image && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.t3, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Protocol
              </span>
              <div style={{ position: 'relative' }}>
                <select
                  value={analysisType}
                  onChange={e => setAnalysisType(e.target.value as AnalysisType)}
                  style={{
                    background: C.bg3, border: `1px solid ${C.b2}`,
                    borderRadius: 5, color: C.t0,
                    padding: '4px 22px 4px 8px', fontSize: 11, fontWeight: 500,
                    cursor: 'pointer', outline: 'none', appearance: 'none',
                  }}
                >
                  {ANALYSIS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown size={10} style={{
                  position: 'absolute', right: 6, top: '50%',
                  transform: 'translateY(-50%)', color: C.t3, pointerEvents: 'none',
                }} />
              </div>
            </div>
          )}

          {/* Run Detection */}
          {image && (
            <button
              disabled={detectMut.isPending || !image.isCalibrated}
              onClick={() => detectMut.mutate()}
              title={!image.isCalibrated ? 'Calibrate first' : ''}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 5,
                border: image.isCalibrated ? `1px solid ${C.accent}40` : `1px solid ${C.b1}`,
                background: image.isCalibrated
                  ? `linear-gradient(135deg, ${C.accentDim}cc, #0c4a6e)`
                  : C.bg3,
                color: image.isCalibrated ? '#fff' : C.t3,
                cursor: image.isCalibrated && !detectMut.isPending ? 'pointer' : 'not-allowed',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
                boxShadow: image.isCalibrated ? `0 0 0 1px ${C.accentDim}40 inset` : 'none',
                transition: 'all 0.15s',
                opacity: detectMut.isPending ? 0.75 : 1,
              }}
            >
              {detectMut.isPending
                ? <><Spinner size={11} /> Analyzing…</>
                : <><Zap size={11} /> Run AI Detection</>}
            </button>
          )}

          {/* Save */}
          {unsaved && (
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 5,
                border: `1px solid ${C.greenBd}`,
                background: C.greenBg,
                color: C.green,
                cursor: 'pointer', fontSize: 11, fontWeight: 600,
                animation: 'fi 0.2s ease',
              }}
            >
              {saveMut.isPending ? <Spinner size={11} /> : <Save size={11} />}
              Save
            </button>
          )}

          <Sep />

          {/* Sidebar toggle */}
          <ToolBtn onClick={() => setSidebarOpen(v => !v)} title="Toggle panel" active={sidebarOpen}>
            <PanelRight size={14} />
          </ToolBtn>
        </header>

        {/* ══ BODY ══════════════════════════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── LEFT MINI TOOLBAR ─────────────────────────────── */}
          <div style={{
            width: 40, flexShrink: 0,
            background: C.bg1,
            borderRight: `1px solid ${C.b1}`,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', paddingTop: 8, gap: 2,
          }}>
            <ToolBtn onClick={fitToScreen} title="Fit to screen (F)">
              <Maximize2 size={14} />
            </ToolBtn>
            <ToolBtn onClick={() => setZoom(z => Math.min(z + 0.15, 16))} title="Zoom in (+)">
              <Plus size={14} />
            </ToolBtn>
            <ToolBtn onClick={() => setZoom(z => Math.max(z - 0.15, 0.1))} title="Zoom out (-)">
              <Minus size={14} />
            </ToolBtn>
            <div style={{ margin: '4px 0', width: 24, height: 1, background: C.b1 }} />
            <ToolBtn active={showGrid} onClick={() => setShowGrid(v => !v)} title="Grid (G)">
              <Grid3x3 size={14} />
            </ToolBtn>
            <ToolBtn active={showLabels} onClick={() => setShowLabels(v => !v)} title="Labels (L)">
              <Eye size={14} />
            </ToolBtn>
            <ToolBtn active={showLines} onClick={() => setShowLines(v => !v)} title="Skeleton lines">
              <Waves size={14} />
            </ToolBtn>
            <ToolBtn active={showLoupe} onClick={() => setShowLoupe(v => !v)} title="Magnifier">
              <Search size={14} />
            </ToolBtn>
            <div style={{ margin: '4px 0', width: 24, height: 1, background: C.b1 }} />
            <ToolBtn active={invert} onClick={() => setInvert(v => !v)} title="Invert (I)">
              <FlipHorizontal size={14} />
            </ToolBtn>
            <ToolBtn onClick={() => { setBrightness(100); setContrast(100); setInvert(false); }} title="Reset image">
              <RefreshCw size={14} />
            </ToolBtn>
            <div style={{ margin: '4px 0', width: 24, height: 1, background: C.b1 }} />
            <ToolBtn
              onClick={() => {
                if (!image) return;
                setIsCalibrating(true);
                setCalibPoints([]);
                setActiveTab('calibration');
              }}
              active={isCalibrating}
              title="Calibrate ruler"
            >
              <Ruler size={14} />
            </ToolBtn>
          </div>

          {/* ── CANVAS AREA ───────────────────────────────────── */}
          <div
            ref={containerRef}
            style={{
              flex: 1, position: 'relative',
              background: 'radial-gradient(ellipse at 50% 50%, #0a0f18 0%, #060809 70%)',
              overflow: 'hidden',
            }}
          >
            {!image ? (
              /* Upload drop zone */
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isUploading ? (
                  <div style={{ textAlign: 'center', width: 360 }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: 14,
                      background: C.accentGlow, border: `1px solid ${C.accent}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 18px',
                    }}>
                      <ScanLine size={26} style={{ color: C.accent }} />
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.t0, marginBottom: 4 }}>
                      Processing radiograph…
                    </p>
                    <p style={{ fontSize: 11, color: C.t2, marginBottom: 18 }}>
                      {uploadProgress}% complete
                    </p>
                    <div style={{ height: 2, background: C.bg4, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        background: `linear-gradient(90deg, ${C.accentDim}, ${C.accent})`,
                        width: `${uploadProgress}%`, transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                ) : (
                  <label
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={e => {
                      e.preventDefault(); setIsDragOver(false);
                      const f = e.dataTransfer.files[0];
                      if (f) handleFileUpload(f);
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                      padding: '52px 80px', borderRadius: 16,
                      border: `1.5px dashed ${isDragOver ? C.accent : C.b2}`,
                      background: isDragOver ? C.accentGlow : 'transparent',
                      cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    <input
                      type="file" accept=".jpg,.jpeg,.png,.dcm" style={{ display: 'none' }}
                      onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                    />
                    <div style={{
                      width: 64, height: 64, borderRadius: 16,
                      background: C.accentGlow, border: `1px solid ${C.accent}25`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Upload size={26} style={{ color: C.accent }} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: C.t0, marginBottom: 8 }}>
                        Drop lateral cephalogram here
                      </p>
                      <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
                        JPEG · PNG · DICOM · Up to 100 MB<br />
                        <span style={{ color: C.accent }}>Click to browse</span>
                      </p>
                    </div>
                  </label>
                )}
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                tabIndex={0}
                aria-label="Cephalometric X-Ray Viewer"
                style={{ display: 'block', cursor: cursorStyle, outline: 'none', width: '100%', height: '100%' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setIsPanning(false); setHoveredLandmark(null); }}
                onTouchStart={handleTouchStart}
                onTouchEnd={e => {
                  const t = e.changedTouches[0];
                  handleMouseUp({ clientX: t.clientX, clientY: t.clientY } as unknown as React.MouseEvent<HTMLCanvasElement>);
                }}
                onKeyDown={handleKeyDown}
              />
            )}

            {/* ── Floating image controls bar ── */}
            {image && (
              <div style={{
                position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(6,8,9,0.92)', backdropFilter: 'blur(20px)',
                border: `1px solid ${C.b2}`,
                borderRadius: 10, padding: '5px 8px',
                boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                userSelect: 'none',
              }}>
                {/* Zoom */}
                <ToolBtn onClick={() => setZoom(z => Math.max(z - 0.15, 0.1))} title="Zoom out (-)">
                  <ZoomOut size={13} />
                </ToolBtn>
                <button
                  onClick={fitToScreen}
                  style={{
                    padding: '2px 7px', borderRadius: 4,
                    border: `1px solid ${C.b1}`, background: 'transparent',
                    color: C.t2, cursor: 'pointer', fontSize: 10,
                    fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums',
                    minWidth: 42, textAlign: 'center',
                  }}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <ToolBtn onClick={() => setZoom(z => Math.min(z + 0.15, 16))} title="Zoom in (+)">
                  <ZoomIn size={13} />
                </ToolBtn>

                <Sep />

                {/* Brightness */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 4px' }}>
                  <Sun size={12} style={{ color: C.t3, flexShrink: 0 }} />
                  <div style={{ width: 66 }}>
                    <Slider label="Brightness" value={brightness} onChange={setBrightness} min={50} max={200} color={C.accent} />
                  </div>
                </div>

                {/* Contrast */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 4px' }}>
                  <Contrast size={12} style={{ color: C.t3, flexShrink: 0 }} />
                  <div style={{ width: 66 }}>
                    <Slider label="Contrast" value={contrast} onChange={setContrast} min={50} max={200} color={C.green} />
                  </div>
                </div>

                <Sep />

                <ToolBtn active={invert} onClick={() => setInvert(v => !v)} title="Invert (I)">
                  <FlipHorizontal size={13} />
                </ToolBtn>
                <ToolBtn onClick={() => { setBrightness(100); setContrast(100); setInvert(false); }} title="Reset">
                  <RefreshCw size={13} />
                </ToolBtn>
              </div>
            )}

            {/* Calibration banner */}
            {isCalibrating && (
              <div style={{
                position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(6,8,9,0.92)', backdropFilter: 'blur(12px)',
                border: `1px solid ${C.amberBd}`, borderRadius: 8,
                padding: '7px 14px', fontSize: 11, color: C.amber,
                animation: 'fi 0.2s ease', zIndex: 10,
              }}>
                <CrosshairIcon size={13} />
                <span>
                  Calibration mode · Click point&nbsp;<strong>{calibPoints.length + 1}</strong>&nbsp;on the ruler
                </span>
                <button
                  onClick={() => { setIsCalibrating(false); setCalibPoints([]); }}
                  style={{
                    display: 'flex', width: 18, height: 18, borderRadius: 4,
                    background: `${C.amber}15`, border: `1px solid ${C.amber}25`,
                    color: C.amber, cursor: 'pointer', padding: 0,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Coordinates HUD */}
            {image && (
              <div style={{
                position: 'absolute', bottom: 18, right: 12,
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(6,8,9,0.85)', backdropFilter: 'blur(8px)',
                border: `1px solid ${C.b1}`, borderRadius: 7,
                padding: '4px 10px', fontSize: 9.5, color: C.t3,
                fontFamily: 'monospace', letterSpacing: '0.04em',
              }}>
                <span>
                  X&nbsp;<span style={{ color: C.t1 }}>{imgCoords.x.toFixed(0)}</span>
                  &nbsp;·&nbsp;
                  Y&nbsp;<span style={{ color: C.t1 }}>{imgCoords.y.toFixed(0)}</span>
                </span>
                <span style={{ color: C.b2 }}>|</span>
                <span>
                  <kbd style={{ fontFamily: 'monospace', opacity: 0.7 }}>G</kbd>&nbsp;grid&nbsp;·&nbsp;
                  <kbd style={{ fontFamily: 'monospace', opacity: 0.7 }}>L</kbd>&nbsp;labels&nbsp;·&nbsp;
                  <kbd style={{ fontFamily: 'monospace', opacity: 0.7 }}>Tab</kbd>&nbsp;cycle
                </span>
              </div>
            )}

            {/* Selected landmark info */}
            {selectedLm && (
              <div style={{
                position: 'absolute', top: 12, left: 12,
                background: 'rgba(6,8,9,0.92)', backdropFilter: 'blur(12px)',
                border: `1px solid ${confBd(selectedLm.confidenceScore ?? undefined)}`,
                borderRadius: 9, padding: '10px 14px', minWidth: 200,
                animation: 'fi 0.15s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: confColor(selectedLm.confidenceScore ?? undefined),
                    flexShrink: 0,
                    boxShadow: `0 0 0 2px ${confColor(selectedLm.confidenceScore ?? undefined)}25`,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.t0, fontFamily: 'monospace' }}>
                    {selectedLm.landmarkCode}
                  </span>
                  {selectedLm.isManuallyAdjusted && <Tag color={C.amber}>adj</Tag>}
                </div>
                <div style={{ fontSize: 11, color: C.t2, marginBottom: 8 }}>{selectedLm.landmarkName}</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>CONFIDENCE</div>
                    <div style={{
                      fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
                      color: confColor(selectedLm.confidenceScore ?? undefined),
                    }}>
                      {selectedLm.confidenceScore != null
                        ? `${(selectedLm.confidenceScore * 100).toFixed(0)}%`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: C.t3, marginBottom: 2 }}>POSITION</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.t1 }}>
                      {selectedLm.xPx.toFixed(1)}, {selectedLm.yPx.toFixed(1)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedLandmark(null)}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    display: 'flex', width: 18, height: 18, borderRadius: 4,
                    background: C.bg4, border: `1px solid ${C.b1}`,
                    color: C.t3, cursor: 'pointer', padding: 0,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────── */}
          {sidebarOpen && (
            <aside style={{
              width: 292, flexShrink: 0,
              background: C.bg1,
              borderLeft: `1px solid ${C.b1}`,
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
              animation: 'fi 0.15s ease',
            }}>
              {/* Tab bar */}
              <div style={{
                display: 'flex',
                borderBottom: `1px solid ${C.b1}`,
                flexShrink: 0, padding: '0 2px',
              }}>
                {([
                  { key: 'meta', icon: <Info size={11} />, label: 'Info' },
                  { key: 'landmarks', icon: <Target size={11} />, label: 'Landmarks' },
                  { key: 'calibration', icon: <Ruler size={11} />, label: 'Calibrate' },
                ] as const).map(tab => {
                  const isActive = activeTab === tab.key;
                  const hasBadge = tab.key === 'landmarks' && lowConf > 0;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        flex: 1, padding: '8px 4px 10px',
                        fontSize: 11, fontWeight: isActive ? 600 : 400,
                        color: isActive ? C.t0 : C.t3,
                        background: 'transparent', border: 'none',
                        borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                        cursor: 'pointer', marginBottom: -1,
                        transition: 'color 0.12s',
                        position: 'relative',
                      }}
                    >
                      {tab.icon}{tab.label}
                      {hasBadge && (
                        <span style={{
                          position: 'absolute', top: 5, right: 10,
                          width: 6, height: 6, borderRadius: '50%',
                          background: C.red,
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: 'auto', padding: 14 }}>

                {/* ═══ INFO TAB ════════════════════════════════════ */}
                {activeTab === 'meta' && (
                  <div style={{ animation: 'fi 0.18s ease', display: 'flex', flexDirection: 'column', gap: 18 }}>

                    {/* Protocol info */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <PanelLabel>Protocol</PanelLabel>
                      </div>
                      <div style={{
                        background: C.bg3, border: `1px solid ${C.b1}`,
                        borderRadius: 8, padding: '10px 12px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <div style={{
                            fontSize: 15, fontWeight: 700, color: C.t0, letterSpacing: '-0.01em',
                          }}>
                            {analysisType}
                          </div>
                          <Tag>{PROTOCOL_DESCRIPTIONS[analysisType]?.split(' ')[0]}</Tag>
                        </div>
                        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.6 }}>
                          {PROTOCOL_DESCRIPTIONS[analysisType]}
                        </div>
                      </div>
                    </div>

                    {/* Image metadata */}
                    <div>
                      <PanelLabel>Image</PanelLabel>
                      <div style={{ marginTop: 8, background: C.bg3, border: `1px solid ${C.b1}`, borderRadius: 8, padding: '4px 12px' }}>
                        {[
                          ['Dimensions', image ? `${image.widthPx ?? '—'} × ${image.heightPx ?? '—'} px` : '—', true],
                          ['File size', image?.fileSizeBytes ? `${(image.fileSizeBytes / 1024 / 1024).toFixed(2)} MB` : '—', false],
                          ['Format', image?.fileFormat?.toUpperCase() ?? '—', false],
                          ['Spacing', image?.isCalibrated ? `${image.pixelSpacingMm?.toFixed(4)} mm/px` : 'Not calibrated', true],
                          ['Landmarks', String(localLandmarks.length), false],
                          ['Session', session?.id ? 'Active' : 'None', false],
                        ].map(([l, v, accent], i, a) => (
                          <MetaRow
                            key={l as string}
                            label={l as string}
                            value={v as string}
                            mono={!!(i === 0 || i === 3)}
                            accent={!!accent}
                            last={i === a.length - 1}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Image adjustments */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <PanelLabel>Image adjustments</PanelLabel>
                        <button
                          onClick={() => { setBrightness(100); setContrast(100); setInvert(false); }}
                          style={{
                            fontSize: 10, color: C.accent, background: 'none', border: 'none',
                            cursor: 'pointer', padding: 0,
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <div style={{
                        background: C.bg3, border: `1px solid ${C.b1}`,
                        borderRadius: 8, padding: '12px 14px',
                        display: 'flex', flexDirection: 'column', gap: 14,
                      }}>
                        <Slider
                          icon={<Sun size={12} />} label="Brightness"
                          value={brightness} onChange={setBrightness}
                          min={50} max={200} color={C.accent}
                        />
                        <Slider
                          icon={<Contrast size={12} />} label="Contrast"
                          value={contrast} onChange={setContrast}
                          min={50} max={200} color={C.green}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.t2, flex: 1 }}>Invert</span>
                          <button
                            onClick={() => setInvert(v => !v)}
                            style={{
                              width: 34, height: 18, borderRadius: 9,
                              background: invert ? C.accent : C.bg5,
                              border: `1px solid ${invert ? C.accent : C.b2}`,
                              cursor: 'pointer', position: 'relative',
                              transition: 'all 0.2s', padding: 0,
                            }}
                          >
                            <div style={{
                              width: 12, height: 12, borderRadius: '50%',
                              background: '#fff', position: 'absolute',
                              top: 2, left: invert ? 18 : 2,
                              transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.t2, flex: 1 }}>Smooth rendering</span>
                          <button
                            onClick={() => setIsSmoothing(v => !v)}
                            style={{
                              width: 34, height: 18, borderRadius: 9,
                              background: isSmoothing ? C.accent : C.bg5,
                              border: `1px solid ${isSmoothing ? C.accent : C.b2}`,
                              cursor: 'pointer', position: 'relative',
                              transition: 'all 0.2s', padding: 0,
                            }}
                          >
                            <div style={{
                              width: 12, height: 12, borderRadius: '50%',
                              background: '#fff', position: 'absolute',
                              top: 2, left: isSmoothing ? 18 : 2,
                              transition: 'left 0.2s',
                            }} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Keyboard shortcuts */}
                    <div>
                      <div style={{ marginBottom: 8 }}><PanelLabel>Shortcuts</PanelLabel></div>
                      <div style={{
                        background: C.bg3, border: `1px solid ${C.b1}`,
                        borderRadius: 8, padding: '10px 12px',
                        display: 'flex', flexDirection: 'column', gap: 6,
                      }}>
                        {[
                          ['Scroll', 'Zoom'],
                          ['Drag', 'Pan'],
                          ['Tab', 'Cycle landmarks'],
                          ['G', 'Grid'],
                          ['L', 'Labels'],
                          ['I', 'Invert'],
                          ['F', 'Fit to screen'],
                          ['Esc', 'Deselect'],
                        ].map(([key, desc]) => (
                          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, color: C.t2 }}>{desc}</span>
                            <span style={{
                              fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                              color: C.accent, background: `${C.accent}10`,
                              border: `1px solid ${C.accent}20`,
                              padding: '1px 6px', borderRadius: 3,
                            }}>
                              {key}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══ LANDMARKS TAB ════════════════════════════════ */}
                {activeTab === 'landmarks' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fi 0.18s ease' }}>

                    {localLandmarks.length > 0 && (
                      <>
                        {/* Stats */}
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Stat label="Total" value={localLandmarks.length} color={C.t2} />
                          <Stat label="High" value={highConf} color={C.green} />
                          <Stat label="Low" value={lowConf} color={C.red} />
                        </div>

                        {/* Avg confidence bar */}
                        <div style={{
                          background: C.bg3, border: `1px solid ${C.b1}`,
                          borderRadius: 8, padding: '8px 12px',
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          <span style={{ fontSize: 10, color: C.t3, flex: 1 }}>Avg. confidence</span>
                          <div style={{
                            width: 80, height: 4, background: C.bg5, borderRadius: 2, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${avgConf * 100}%`, height: '100%',
                              background: confColor(avgConf),
                              borderRadius: 2, transition: 'width 0.4s',
                            }} />
                          </div>
                          <span style={{
                            fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                            color: confColor(avgConf), minWidth: 32, textAlign: 'right',
                          }}>
                            {(avgConf * 100).toFixed(0)}%
                          </span>
                        </div>

                        {/* Search */}
                        <div style={{ position: 'relative' }}>
                          <Search size={12} style={{
                            position: 'absolute', left: 9, top: '50%',
                            transform: 'translateY(-50%)', color: C.t3, pointerEvents: 'none',
                          }} />
                          <input
                            type="text"
                            placeholder="Search by code or name…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 9px 6px 28px',
                              background: C.bg3, border: `1px solid ${C.b1}`,
                              borderRadius: 7, color: C.t0, fontSize: 11,
                              outline: 'none',
                            }}
                          />
                        </div>

                        {/* Filter + sort */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {(['all', 'high', 'mid', 'low'] as const).map(f => {
                            const colors: Record<string, string> = {
                              all: C.accent, high: C.green, mid: C.amber, low: C.red,
                            };
                            const fc = colors[f];
                            const isActive = filterConf === f;
                            return (
                              <button
                                key={f}
                                onClick={() => setFilterConf(f)}
                                style={{
                                  flex: 1, padding: '3px 0', borderRadius: 5,
                                  fontSize: 10, fontWeight: 600,
                                  border: `1px solid ${isActive ? `${fc}40` : C.b1}`,
                                  background: isActive ? `${fc}12` : 'transparent',
                                  color: isActive ? fc : C.t3,
                                  cursor: 'pointer', letterSpacing: '0.04em',
                                  textTransform: 'uppercase',
                                }}
                              >
                                {f}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => setSortBy(s => s === 'code' ? 'conf' : 'code')}
                            title={`Sort by ${sortBy === 'code' ? 'confidence' : 'code'}`}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 26, height: 26, borderRadius: 5, flexShrink: 0,
                              border: `1px solid ${C.b1}`, background: 'transparent',
                              color: C.t3, cursor: 'pointer',
                            }}
                          >
                            <ArrowUpDown size={11} />
                          </button>
                        </div>
                      </>
                    )}

                    {/* Landmark list */}
                    {localLandmarks.length === 0 ? (
                      <div style={{
                        flex: 1, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 14, paddingTop: 32, animation: 'fi 0.3s ease',
                      }}>
                        <div style={{
                          width: 52, height: 52, borderRadius: 12,
                          background: C.bg3, border: `1px solid ${C.b1}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Brain size={22} style={{ color: C.t3 }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.t1, marginBottom: 4 }}>
                            No landmarks detected
                          </p>
                          <p style={{ fontSize: 11, color: C.t3, lineHeight: 1.6 }}>
                            Run AI detection to automatically<br />
                            locate anatomical landmarks
                          </p>
                        </div>
                        {image?.isCalibrated && (
                          <button
                            onClick={() => detectMut.mutate()}
                            disabled={detectMut.isPending}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '7px 16px', borderRadius: 7,
                              border: `1px solid ${C.accent}40`,
                              background: C.accentGlow, color: C.accent,
                              fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            <Zap size={12} /> Run Detection
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filteredLandmarks.length === 0 ? (
                          <p style={{ fontSize: 11, color: C.t3, textAlign: 'center', paddingTop: 16 }}>
                            No landmarks match filters
                          </p>
                        ) : filteredLandmarks.map(lm => {
                          const isSel = selectedLandmark === lm.landmarkCode;
                          const color = confColor(lm.confidenceScore ?? undefined);
                          return (
                            <div
                              key={lm.id}
                              onClick={() => {
                                setSelectedLandmark(isSel ? null : lm.landmarkCode);
                                setHoveredLandmark(lm.landmarkCode);
                              }}
                              onMouseEnter={() => setHoveredLandmark(lm.landmarkCode)}
                              onMouseLeave={() => setHoveredLandmark(null)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                                background: isSel ? `${C.accent}08` : C.bg3,
                                border: `1px solid ${isSel ? `${C.accent}30` : C.b0}`,
                                transition: 'all 0.1s',
                              }}
                            >
                              {/* Color strip + dot */}
                              <div style={{
                                width: 3, height: 28, borderRadius: 2,
                                background: color, flexShrink: 0, opacity: 0.8,
                              }} />

                              {/* Code + name */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                                  <span style={{
                                    fontSize: 11, fontWeight: 700, color: C.t0,
                                    fontFamily: '"SF Mono","Fira Code",monospace',
                                    letterSpacing: '0.01em',
                                  }}>
                                    {lm.landmarkCode}
                                  </span>
                                  {lm.isManuallyAdjusted && <Tag color={C.amber}>adj</Tag>}
                                </div>
                                <div style={{
                                  fontSize: 10, color: C.t3,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {lm.landmarkName}
                                </div>
                              </div>

                              {/* Confidence */}
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                                  color, fontVariantNumeric: 'tabular-nums',
                                }}>
                                  {lm.confidenceScore != null ? `${(lm.confidenceScore * 100).toFixed(0)}%` : '—'}
                                </span>
                                <ConfBar score={lm.confidenceScore ?? undefined} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Finalize */}
                    {session && localLandmarks.length > 0 && (
                      <div style={{
                        paddingTop: 12, marginTop: 4,
                        borderTop: `1px solid ${C.b1}`, flexShrink: 0,
                      }}>
                        {lowConf > 0 && (
                          <div style={{
                            display: 'flex', gap: 7, alignItems: 'flex-start',
                            padding: '8px 10px', borderRadius: 7, marginBottom: 10,
                            background: C.amberBg, border: `1px solid ${C.amberBd}`,
                            fontSize: 11, color: C.amber,
                          }}>
                            <AlertTriangle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
                            <span>
                              <strong>{lowConf}</strong> landmark{lowConf > 1 ? 's' : ''} with low
                              confidence — review before finalizing.
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            if (unsaved) { toast.error('Save before finalizing'); return; }
                            finalizeMut.mutate();
                          }}
                          disabled={finalizeMut.isPending}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 7,
                            padding: '9px 0', borderRadius: 8,
                            border: `1px solid ${C.accent}40`,
                            background: `linear-gradient(135deg, ${C.accentDim}cc 0%, #0c4a6e 100%)`,
                            color: '#fff', fontSize: 12, fontWeight: 600,
                            cursor: finalizeMut.isPending ? 'not-allowed' : 'pointer', letterSpacing: '0.01em',
                            boxShadow: `0 1px 0 ${C.accent}20 inset`,
                            transition: 'all 0.15s',
                            opacity: finalizeMut.isPending ? 0.75 : 1,
                          }}
                          onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        >
                          {finalizeMut.isPending ? 'Finalizing & generating overlays…' : 'Finalize & View Results'}
                          {!finalizeMut.isPending && <ChevronRight size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* ═══ CALIBRATION TAB ══════════════════════════════ */}
                {activeTab === 'calibration' && (
                  <div style={{ animation: 'fi 0.18s ease', display: 'flex', flexDirection: 'column', gap: 14 }}>

                    {/* Status banner */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 9,
                      background: image?.isCalibrated ? C.greenBg : C.amberBg,
                      border: `1px solid ${image?.isCalibrated ? C.greenBd : C.amberBd}`,
                    }}>
                      {image?.isCalibrated ? (
                        <>
                          <CheckCircle2 size={16} style={{ color: C.green, flexShrink: 0 }} />
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 1 }}>Calibrated</p>
                            <p style={{ fontSize: 10, color: C.t2, fontFamily: 'monospace' }}>
                              {image.pixelSpacingMm?.toFixed(4)} mm / pixel
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertCircle size={16} style={{ color: C.amber, flexShrink: 0 }} />
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 600, color: C.amber, marginBottom: 1 }}>Not calibrated</p>
                            <p style={{ fontSize: 10, color: C.t2 }}>Required before AI detection</p>
                          </div>
                        </>
                      )}
                    </div>

                    {!isCalibrating ? (
                      <>
                        <p style={{ fontSize: 11, color: C.t2, lineHeight: 1.7 }}>
                          Click two points on the radiographic ruler to define a known distance,
                          then enter the measurement in millimetres.
                        </p>

                        <button
                          onClick={() => { setIsCalibrating(true); setCalibPoints([]); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 7,
                            padding: '9px 0', borderRadius: 8, marginBottom: 2,
                            border: `1px solid ${C.amberBd}`,
                            background: C.amberBg, color: C.amber,
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <CrosshairIcon size={13} /> Interactive Calibration
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 1, background: C.b1 }} />
                          <span style={{ fontSize: 10, color: C.t4 }}>or</span>
                          <div style={{ flex: 1, height: 1, background: C.b1 }} />
                        </div>

                        <button
                          onClick={() => {
                            if (!image) return;
                            imagesApi.calibrate(image.id, {
                              point1: { x: 0, y: 0 }, point2: { x: 10, y: 0 }, knownDistanceMm: 1,
                            }).then(() => {
                              toast.success('Default calibration applied');
                              qc.invalidateQueries({ queryKey: ['images', studyId] });
                            });
                          }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 7,
                            padding: '8px 0', borderRadius: 8,
                            border: `1px solid ${C.b2}`, background: C.bg3,
                            color: C.t2, fontSize: 11, cursor: 'pointer',
                          }}
                        >
                          Apply default (0.1 mm/px)
                        </button>
                      </>
                    ) : (
                      <div style={{
                        background: C.bg3,
                        border: `1px solid ${C.amberBd}`,
                        borderRadius: 9, padding: 14,
                      }}>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: C.amber, marginBottom: 14,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <CrosshairIcon size={12} /> Calibration active
                        </div>

                        {[
                          { n: 1, label: 'First ruler point' },
                          { n: 2, label: 'Second ruler point' },
                        ].map(step => {
                          const done = calibPoints.length >= step.n;
                          return (
                            <div key={step.n} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                              <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                border: `1.5px solid ${done ? C.green : C.amberBd}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, fontSize: 10, fontWeight: 700,
                                color: done ? C.green : C.amber,
                                background: done ? C.greenBg : C.amberBg,
                                transition: 'all 0.2s',
                              }}>
                                {done ? <Check size={12} /> : step.n}
                              </div>
                              <span style={{ fontSize: 11, color: done ? C.green : C.t1 }}>
                                {step.label}
                              </span>
                            </div>
                          );
                        })}

                        {calibPoints.length === 2 && (
                          <div style={{ marginTop: 12 }}>
                            <label style={{ fontSize: 10, color: C.t3, marginBottom: 5, display: 'block', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              Known distance (mm)
                            </label>
                            <input
                              type="number"
                              value={knownDistance}
                              onChange={e => setKnownDistance(e.target.value)}
                              min={1}
                              style={{
                                width: '100%', background: C.bg2,
                                border: `1px solid ${C.b2}`, borderRadius: 6,
                                padding: '7px 10px', color: C.t0,
                                fontSize: 13, outline: 'none', marginBottom: 10,
                              }}
                            />
                            <button
                              onClick={() => {
                                imagesApi.calibrate(image!.id, {
                                  point1: calibPoints[0], point2: calibPoints[1],
                                  knownDistanceMm: parseFloat(knownDistance),
                                }).then(() => {
                                  toast.success('Calibration applied successfully');
                                  setIsCalibrating(false); setCalibPoints([]);
                                  qc.invalidateQueries({ queryKey: ['images', studyId] });
                                });
                              }}
                              style={{
                                width: '100%', padding: '8px 0', borderRadius: 7,
                                border: `1px solid ${C.greenBd}`,
                                background: C.greenBg, color: C.green,
                                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              }}
                            >
                              Apply calibration
                            </button>
                          </div>
                        )}

                        <button
                          onClick={() => { setIsCalibrating(false); setCalibPoints([]); }}
                          style={{
                            width: '100%', marginTop: 8, padding: '7px 0', borderRadius: 7,
                            border: `1px solid ${C.b1}`, background: 'transparent',
                            color: C.t2, fontSize: 11, cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ══ ADJUST LANDMARK MODAL ═════════════════════════════════ */}
      {adjustModal && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 200,
          }}
          onClick={() => setAdjustModal(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.bg2, border: `1px solid ${C.b2}`,
              borderRadius: 14, width: 420, overflow: 'hidden',
              boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
              animation: 'si 0.2s cubic-bezier(0.34,1.56,0.64,1)',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: `1px solid ${C.b1}`,
              background: C.bg3,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: C.amberBg, border: `1px solid ${C.amberBd}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Target size={15} style={{ color: C.amber }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.t0 }}>
                    Landmark Adjustment
                  </p>
                  <p style={{ fontSize: 10, color: C.t3, fontFamily: 'monospace' }}>
                    {adjustModal.landmark.landmarkCode} · {adjustModal.landmark.landmarkName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAdjustModal(null)}
                style={{
                  display: 'flex', width: 26, height: 26, borderRadius: 6,
                  border: `1px solid ${C.b1}`, background: 'transparent',
                  color: C.t2, cursor: 'pointer', padding: 0,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={13} />
              </button>
            </div>

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Audit notice */}
              <div style={{
                display: 'flex', gap: 8, padding: '8px 10px',
                borderRadius: 7, background: `${C.accent}06`, border: `1px solid ${C.accent}20`,
                fontSize: 11, color: C.t2,
              }}>
                <Shield size={12} style={{ color: C.accent, flexShrink: 0, marginTop: 1 }} />
                An audit record will be created for this adjustment.
              </div>

              {/* New coords */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['New X', adjustModal.newX.toFixed(1) + ' px'], ['New Y', adjustModal.newY.toFixed(1) + ' px']].map(([l, v]) => (
                  <div key={l} style={{
                    background: C.bg3, border: `1px solid ${C.b1}`, borderRadius: 7, padding: '8px 12px',
                  }}>
                    <p style={{ fontSize: 9.5, color: C.t4, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.t0, fontFamily: 'monospace' }}>{v}</p>
                  </div>
                ))}
              </div>

              {/* Category */}
              <div>
                <label style={{ fontSize: 10, color: C.t3, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Reason category
                </label>
                <div style={{ position: 'relative' }}>
                  <select
                    value={adjustCategory}
                    onChange={e => setAdjustCategory(e.target.value as typeof adjustCategory)}
                    style={{
                      width: '100%', background: C.bg3,
                      border: `1px solid ${C.b2}`, borderRadius: 7,
                      color: C.t0, padding: '7px 28px 7px 10px',
                      fontSize: 11, outline: 'none', appearance: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="AIError">AI Detection Error</option>
                    <option value="AnatomyUnclear">Anatomy Unclear</option>
                    <option value="ClinicianCorrection">Clinician Correction</option>
                  </select>
                  <ChevronDown size={11} style={{
                    position: 'absolute', right: 9, top: '50%',
                    transform: 'translateY(-50%)', color: C.t3, pointerEvents: 'none',
                  }} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: 10, color: C.t3, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Description <span style={{ color: C.red }}>*</span>
                </label>
                <textarea
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="Describe the reason for repositioning this landmark…"
                  rows={3}
                  style={{
                    width: '100%', background: C.bg3,
                    border: `1px solid ${adjustReason.trim() ? C.b2 : C.b1}`,
                    borderRadius: 7, color: C.t0, padding: '8px 10px',
                    fontSize: 11, resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.6,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '11px 18px', borderTop: `1px solid ${C.b1}`,
              display: 'flex', gap: 8, justifyContent: 'flex-end',
              background: C.bg3,
            }}>
              <button
                onClick={() => setAdjustModal(null)}
                style={{
                  padding: '6px 14px', borderRadius: 7,
                  border: `1px solid ${C.b2}`, background: 'transparent',
                  color: C.t2, fontSize: 11, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAdjust}
                disabled={!adjustReason.trim()}
                style={{
                  padding: '7px 16px', borderRadius: 7,
                  border: `1px solid ${C.accent}40`,
                  background: `linear-gradient(135deg, ${C.accentDim} 0%, #0c4a6e 100%)`,
                  color: '#fff', fontSize: 11, fontWeight: 600,
                  cursor: adjustReason.trim() ? 'pointer' : 'not-allowed',
                  opacity: adjustReason.trim() ? 1 : 0.45,
                  transition: 'opacity 0.15s',
                }}
              >
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}