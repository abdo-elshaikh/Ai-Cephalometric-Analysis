import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, BrainCircuit, Activity,
  Eye, EyeOff, ChevronRight, Loader2, AlertTriangle,
  Ruler, ShieldCheck,
} from 'lucide-react';
import { TRACING_DEFINITIONS } from '../utils/tracingDefinitions';
import type { TracingLine } from '../utils/tracingDefinitions';
import api from '../api/api';
import toast from 'react-hot-toast';
import XrayViewer, { type MeasurementLabel, type ViewMode } from '../components/XrayViewer';
import { toPublicUrl } from '../utils/publicUrl';
import { angleBetween, lineToLineAngle, NORMS, classifyMeasurement } from '../utils/geometry';

// ── PointNix measurement color convention ────────────────────────────────────

const MEAS_COLORS: Record<string, string> = {
  SNA: '#16a34a',
  SNB: '#ea580c',
  ANB: '#2563eb',
  FMA: '#ea580c',
  IMPA: '#16a34a',
  OJ: '#16a34a',
  OB: '#ea580c',
};

// Landmark nearest to where the annotation should appear for each measurement
const MEAS_ANCHOR: Record<string, { landmark: string; offsetX?: number; offsetY?: number }> = {
  SNA: { landmark: 'N', offsetX: -55, offsetY: -22 },
  SNB: { landmark: 'N', offsetX: -55, offsetY: -8 },
  ANB: { landmark: 'N', offsetX: -55, offsetY: 6 },
  FMA: { landmark: 'Go', offsetX: -65, offsetY: -18 },
  OJ: { landmark: 'UI', offsetX: 10, offsetY: 0 },
  OB: { landmark: 'UI', offsetX: 10, offsetY: 14 },
};

// ── Landmark taxonomy ─────────────────────────────────────────────────────────

const LANDMARK_CATEGORIES: Record<string, string[]> = {
  'Cranial Base': ['S', 'N', 'Ar'],
  'Maxilla': ['A', 'ANS', 'PNS', 'Co'],
  'Mandible': ['B', 'Go', 'Me', 'Gn', 'Pog'],
  'Facial Planes': ['Po', 'Or'],
  'Dental': ['UI', 'LI', 'U1_c', 'L1_c', 'U6', 'L6'],
  'Soft Tissue': ['GLA', 'SoftN', 'Prn', 'Sn', 'Ls', 'Li', 'SoftPog', 'SoftGn', 'StomU', 'StomL'],
};

// ── Measurement definitions ───────────────────────────────────────────────────

interface MeasDef {
  code: string; name: string; analysis: string; normKey: string;
  compute: (lm: Record<string, { x: number; y: number }>, scale: number) => number | null;
}

const MEASUREMENTS: MeasDef[] = [
  {
    code: 'SNA', name: 'Maxillary position', analysis: 'Steiner', normKey: 'SNA',
    compute: lm => lm.S && lm.N && lm.A ? angleBetween(lm.N, lm.S, lm.A) : null
  },
  {
    code: 'SNB', name: 'Mandibular position', analysis: 'Steiner', normKey: 'SNB',
    compute: lm => lm.S && lm.N && lm.B ? angleBetween(lm.N, lm.S, lm.B) : null
  },
  {
    code: 'ANB', name: 'Jaw relationship', analysis: 'Steiner', normKey: 'ANB',
    compute: lm => {
      if (!lm.S || !lm.N || !lm.A || !lm.B) return null;
      return angleBetween(lm.N, lm.S, lm.A) - angleBetween(lm.N, lm.S, lm.B);
    }
  },
  {
    code: 'FMA', name: 'Vertical growth', analysis: 'Tweed', normKey: 'FMA',
    compute: lm => lm.Or && lm.Po && lm.Go && lm.Me ? lineToLineAngle(lm.Or, lm.Po, lm.Go, lm.Me) : null
  },
  {
    code: 'OJ', name: 'Overjet', analysis: 'General', normKey: 'OVERJET',
    compute: (lm, s) => lm.UI && lm.LI ? Math.abs(lm.UI.x - lm.LI.x) * s : null
  },
  {
    code: 'OB', name: 'Overbite', analysis: 'General', normKey: 'OVERBITE',
    compute: (lm, s) => lm.UI && lm.LI ? Math.abs(lm.UI.y - lm.LI.y) * s : null
  },
];

// ── Severity ──────────────────────────────────────────────────────────────────

const SEV_COLOR = { Normal: '#059669', MildDeviation: '#ea580c', ModerateDeviation: '#dc2626', SevereDeviation: '#dc2626' } as const;
const SEV_LABEL = { Normal: 'Normal', MildDeviation: 'Mild', ModerateDeviation: 'Moderate', SevereDeviation: 'Severe' } as const;

function confColor(c: number) { return c >= 0.80 ? '#22c55e' : c >= 0.60 ? '#eab308' : '#ef4444'; }

// ── RangeBar ─────────────────────────────────────────────────────────────────

function RangeBar({ value, min, max }: { value: number; min: number; max: number }) {
  const pad = (max - min) * 0.6, lo = min - pad, hi = max + pad, span = hi - lo;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / span) * 100))}%`;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'absolute', left: pct(min), width: `${((max - min) / span) * 100}%`, height: '100%', background: 'rgba(52,211,153,0.15)', borderLeft: '1px solid rgba(52,211,153,0.35)', borderRight: '1px solid rgba(52,211,153,0.35)' }} />
        <div style={{ position: 'absolute', left: pct(value), top: '50%', transform: 'translate(-50%,-50%)', width: 7, height: 7, borderRadius: '50%', background: '#4c9eff', border: '1.5px solid rgba(255,255,255,0.85)', boxShadow: '0 0 5px rgba(76,158,255,0.7)', zIndex: 1 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9.5, color: 'rgba(255,255,255,0.22)', fontFamily: '"DM Mono",monospace' }}>
        <span>{lo.toFixed(1)}</span><span>ref {min}–{max}</span><span>{hi.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ── MeasurementCard ───────────────────────────────────────────────────────────

type LiveM = { code: string; name: string; value: number; unit: string; min: number; max: number; severity: string; deviationSDs: number };

function MCard({ m }: { m: LiveM }) {
  const col = (SEV_COLOR as any)[m.severity] ?? '#4c9eff';
  return (
    <div style={{ padding: '13px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderLeft: `3px solid ${col}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', fontFamily: '"DM Mono",monospace', color: 'rgba(76,158,255,0.9)' }}>{m.code}</span>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.38)', marginTop: 2 }}>{m.name}</div>
        </div>
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, fontFamily: '"DM Mono",monospace', letterSpacing: '0.06em', color: col, background: `${col}18`, border: `1px solid ${col}30` }}>
          {(SEV_LABEL as any)[m.severity] ?? m.severity}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-0.04em', fontFamily: '"DM Mono",monospace', color: 'white' }}>{m.value.toFixed(1)}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: '"DM Mono",monospace' }}>{m.unit}</span>
      </div>
      <RangeBar value={m.value} min={m.min} max={m.max} />
    </div>
  );
}

// ── useLiveAnalysis ───────────────────────────────────────────────────────────

function useLiveAnalysis(landmarks: any[], image: any): LiveM[] {
  return useMemo(() => {
    if (landmarks.length < 3) return [];
    const lm: Record<string, { x: number; y: number }> = {};
    landmarks.forEach(l => { lm[l.name] = l.point; });
    const scale = image?.pixelSpacingMm ?? 1.0;
    return MEASUREMENTS.flatMap(def => {
      const value = def.compute(lm, scale);
      if (value === null) return [];
      const norm = NORMS[def.analysis]?.[def.normKey] ?? NORMS.General?.[def.normKey];
      if (!norm) return [];
      const cls = classifyMeasurement(value, norm);
      return [{ code: def.code, name: def.name, value, unit: norm.unit === 'deg' ? '°' : 'mm', min: norm.min, max: norm.max, severity: cls.severity, deviationSDs: cls.deviationSDs }];
    });
  }, [landmarks, image]);
}

// ── LandmarkRow / Section ────────────────────────────────────────────────────

function LRow({ landmark, isActive, onHover }: { landmark: any; isActive: boolean; onHover: (id: string | null) => void }) {
  const col = confColor(landmark.confidence);
  return (
    <div onMouseEnter={() => onHover(landmark.name)} onMouseLeave={() => onHover(null)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 20px', cursor: 'default',
        background: isActive ? 'rgba(76,158,255,0.07)' : 'transparent',
        borderLeft: `2px solid ${isActive ? '#4c9eff' : 'transparent'}`, transition: 'all 0.12s'
      }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: col, boxShadow: isActive ? `0 0 5px ${col}` : 'none', transition: 'box-shadow 0.12s' }} />
      <span style={{ flex: 1, fontSize: 12, fontFamily: '"DM Mono",monospace', color: isActive ? 'white' : 'rgba(255,255,255,0.6)', fontWeight: isActive ? 600 : 400 }}>{landmark.name}</span>
      <span style={{ fontSize: 10.5, fontFamily: '"DM Mono",monospace', color: col }}>{(landmark.confidence * 100).toFixed(0)}%</span>
    </div>
  );
}

function LSection({ title, landmarks, activeId, onHover }: { title: string; landmarks: any[]; activeId: string | null; onHover: (id: string | null) => void }) {
  const [open, setOpen] = useState(true);
  if (!landmarks.length) return null;
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px', background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.28)', fontSize: 9.5, fontWeight: 700, fontFamily: '"Instrument Sans",sans-serif', textTransform: 'uppercase', letterSpacing: '0.12em', cursor: 'pointer', textAlign: 'left' }}>
        <ChevronRight size={10} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
        {title}
        <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono",monospace', fontSize: 9.5, opacity: 0.7 }}>{landmarks.length}</span>
      </button>
      {open && landmarks.map(l => <LRow key={l.name} landmark={l} isActive={activeId === l.name} onHover={onHover} />)}
    </div>
  );
}

// ── AnalysisPage ──────────────────────────────────────────────────────────────

const ANALYSIS_OPTIONS = ['Steiner', 'Tweed', 'McNamara', 'Jarabak', 'Ricketts', 'Full'] as const;
type AnalysisType = typeof ANALYSIS_OPTIONS[number];

export default function AnalysisPage() {
  const { imageId } = useParams();
  const navigate = useNavigate();

  const [image, setImage] = useState<any>(null);
  const [landmarks, setLandmarks] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisType, setAnalysisType] = useState<AnalysisType>('Steiner');
  const [showTracings, setShowTracings] = useState(true);
  const [hoveredLm, setHoveredLm] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'landmarks' | 'measurements'>('landmarks');
  const [viewMode, setViewMode] = useState<ViewMode>('overlay');
  const sessionRef = useRef<string | null>(null);

  const fetchImage = useCallback(async () => {
    try {
      const r = await api.get(`/images/direct/${imageId}`);
      if (r.data?.storageUrl) setImage(r.data);
      else toast.error('Image metadata incomplete — please re-upload.');
    } catch { toast.error('Failed to load image.'); }
  }, [imageId]);

  const fetchSession = useCallback(async (): Promise<string | null> => {
    try { const r = await api.get(`/analysis/latest-session/${imageId}`); sessionRef.current = r.data?.id ?? null; }
    catch { sessionRef.current = null; }
    return sessionRef.current;
  }, [imageId]);

  useEffect(() => { fetchImage(); fetchSession(); }, [fetchImage, fetchSession]);

  // Active tracings
  const activeTracings = useMemo((): TracingLine[] => {
    if (analysisType === 'Full') return Object.values(TRACING_DEFINITIONS).flat();
    const base = [...(TRACING_DEFINITIONS[analysisType] ?? [])];
    const seen = new Set(base.map(t => `${t.p1}:${t.p2}`));
    (TRACING_DEFINITIONS['Profile'] ?? []).forEach(t => { if (!seen.has(`${t.p1}:${t.p2}`)) base.push(t); });
    return base;
  }, [analysisType]);

  const liveAnalysis = useLiveAnalysis(landmarks, image);

  // Build PointNix-style measurement label annotations
  const measurementLabels = useMemo((): MeasurementLabel[] => {
    const lmMap: Record<string, { x: number; y: number }> = {};
    landmarks.forEach(l => { lmMap[l.name] = l.point; });
    return liveAnalysis.flatMap(m => {
      const anchor = MEAS_ANCHOR[m.code];
      const baseCol = MEAS_COLORS[m.code];
      
      let color = '#4b5563'; // Default ColDental
      if (baseCol && m.severity === 'Normal') {
          color = baseCol;
      } else {
          color = SEV_COLOR[m.severity as keyof typeof SEV_COLOR] ?? '#4b5563';
      }
      
      if (!anchor || !lmMap[anchor.landmark]) return [];
      return [{
        nearLandmark: anchor.landmark,
        value: m.value,
        unit: m.unit as '°' | 'mm',
        color,
        offsetX: anchor.offsetX,
        offsetY: anchor.offsetY,
      }];
    });
  }, [liveAnalysis, landmarks]);

  const handleAiDetect = async () => {
    if (image && !image.isCalibrated) { toast.error('Calibrate the image first.'); return; }
    setAnalyzing(true);
    try {
      const r = await api.post(`/analysis/detect/${imageId}?type=${analysisType}`);
      setLandmarks(r.data); await fetchSession(); toast.success('Landmarks detected.');
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Detection failed.'); }
    finally { setAnalyzing(false); }
  };

  const handleFinalize = async () => {
    if (!landmarks.length) return;
    setSaving(true);
    const tid = 'fin';
    try {
      const sid = await fetchSession();
      if (!sid) { toast.error('No session — re-run detection.'); return; }
      
      toast.loading('Generating Clinical Draft…', { id: tid });
      
      // Batch update landmarks and finalize everything in one go (Measurements, Diagnosis, Treatment)
      const updates = landmarks.map(l => ({ landmarkCode: l.name, x: l.point.x, y: l.point.y }));
      await api.post(`/analysis/sessions/${sid}/finalize`, updates);
      
      toast.success('Clinical draft generated!', { id: tid });
      navigate(`/results/${sid}`);
    } catch (e: any) { 
      toast.error(e.response?.data?.error ?? 'Finalization failed.', { id: tid }); 
    }
    finally { setSaving(false); }
  };

  const handlePointMove = useCallback((idx: number, x: number, y: number) => {
    setLandmarks(prev => { const n = [...prev]; n[idx] = { ...n[idx], point: { x, y } }; return n; });
  }, []);

  const viewerPoints = useMemo(() => landmarks.map(l => ({
    id: l.name, x: l.point.x, y: l.point.y, label: l.name,
    color: confColor(l.confidence), confidence: l.confidence,
  })), [landmarks]);

  const categorisedLms = useMemo(() => {
    const byName: Record<string, any> = {}; landmarks.forEach(l => { byName[l.name] = l; });
    const acc = new Set<string>(), result: { title: string; items: any[] }[] = [];
    Object.entries(LANDMARK_CATEGORIES).forEach(([title, names]) => {
      const items = names.filter(n => byName[n]).map(n => byName[n]);
      if (items.length) { items.forEach(l => acc.add(l.name)); result.push({ title, items }); }
    });
    const other = landmarks.filter(l => !acc.has(l.name));
    if (other.length) result.push({ title: 'Other', items: other });
    return result;
  }, [landmarks]);

  const sevCounts = useMemo(() => { const c: Record<string, number> = {}; liveAnalysis.forEach(m => { c[m.severity] = (c[m.severity] ?? 0) + 1; }); return c; }, [liveAnalysis]);

  // ── Tokens ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600&family=Instrument+Sans:wght@400;500;600;700&display=swap');
        .ap*,.ap*::before,.ap*::after{box-sizing:border-box;margin:0;}
        .ap{font-family:"Instrument Sans",sans-serif;}
        .ap-tab{flex:1;padding:10px 4px;display:flex;align-items:center;justify-content:center;gap:5px;background:transparent;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,0.28);font:700 10px/1 "Instrument Sans",sans-serif;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;transition:color .12s,border-color .12s;}
        .ap-tab:hover{color:rgba(255,255,255,0.55);}
        .ap-tab.active{color:#4c9eff;border-bottom-color:#4c9eff;}
        .ap-chip{font:700 9.5px/1 "DM Mono",monospace;padding:1px 6px;border-radius:9px;background:rgba(76,158,255,0.14);color:#4c9eff;}
        .ap-pill{padding:0 11px;height:29px;border-radius:5px;cursor:pointer;font:600 10.5px/1 "Instrument Sans",sans-serif;letter-spacing:0.04em;border:1px solid rgba(255,255,255,0.09);color:rgba(255,255,255,0.4);background:transparent;transition:all .12s;}
        .ap-pill:hover{border-color:rgba(255,255,255,0.22);color:rgba(255,255,255,0.7);}
        .ap-pill.active{background:rgba(76,158,255,0.1);border-color:rgba(76,158,255,0.4);color:#4c9eff;}
        .ap-btn{height:32px;padding:0 13px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:600 11px/1 "Instrument Sans",sans-serif;letter-spacing:0.03em;transition:all .12s;border:1px solid transparent;}
        .ap-btn:disabled{opacity:.38;cursor:not-allowed;}
        .ap-ghost{background:transparent;border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.55);}
        .ap-ghost:not(:disabled):hover{border-color:rgba(255,255,255,0.25);color:white;}
        .ap-detect{background:rgba(76,158,255,0.09);border-color:rgba(76,158,255,0.28);color:#4c9eff;}
        .ap-detect:not(:disabled):hover{background:rgba(76,158,255,0.18);border-color:rgba(76,158,255,0.5);}
        .ap-finalize{background:#4c9eff;border-color:#4c9eff;color:#050d1a;font-weight:700;}
        .ap-finalize:not(:disabled):hover{background:#6fb3ff;border-color:#6fb3ff;}
        .ap-vm-btn{padding:0 10px;height:29px;border-radius:5px;cursor:pointer;font:700 9.5px/1 "DM Mono",monospace;letter-spacing:0.07em;border:1px solid rgba(255,255,255,0.09);color:rgba(255,255,255,0.4);background:transparent;transition:all .12s;}
        .ap-vm-btn:hover{border-color:rgba(255,255,255,0.22);color:rgba(255,255,255,0.7);}
        .ap-vm-btn.active{background:rgba(76,158,255,0.1);border-color:rgba(76,158,255,0.4);color:#4c9eff;}
        .ap-sc::-webkit-scrollbar{width:3px;}
        .ap-sc::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.09);border-radius:2px;}
        @keyframes spin{to{transform:rotate(360deg);}}
        .spin{animation:spin 1s linear infinite;}
      `}</style>

      <div className="ap" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#060c18', color: 'white' }}>

        {/* Header */}
        <header style={{
          height: 50, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 14px 0 10px',
          background: 'rgba(6,12,24,0.96)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)', zIndex: 100
        }}>

          <button className="ap-btn ap-ghost" onClick={() => navigate(-1)} style={{ marginRight: 12, padding: '0 9px' }}><ArrowLeft size={14} /></button>

          <div style={{ marginRight: 20 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '-0.01em' }}>Clinical Analysis</div>
            {image && <div style={{ fontSize: 10, marginTop: 1, fontFamily: '"DM Mono",monospace', color: 'rgba(255,255,255,0.3)' }}>{image.fileName}</div>}
          </div>

          <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.08)', marginRight: 16 }} />

          {/* Analysis type */}
          <div style={{ display: 'flex', gap: 5, marginRight: 'auto' }}>
            {ANALYSIS_OPTIONS.map(opt => (
              <button key={opt} className={`ap-pill ${analysisType === opt ? 'active' : ''}`} onClick={() => setAnalysisType(opt)}>{opt}</button>
            ))}
          </div>

          {/* View mode */}
          <div style={{ display: 'flex', gap: 5, marginRight: 12 }}>
            {(['xray', 'tracing', 'overlay'] as ViewMode[]).map(v => (
              <button key={v} className={`ap-vm-btn ${viewMode === v ? 'active' : ''}`} onClick={() => setViewMode(v)}>
                {v === 'xray' ? 'X‑RAY' : v === 'tracing' ? 'TRACE' : 'BOTH'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

            {/* Calibration status badge */}
            {image && (
              image.isCalibrated ? (
                <div title={`Scale: ${image.pixelSpacingMm?.toFixed(4) ?? '?'} mm/px`} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '0 9px', height: 29, borderRadius: 5,
                  background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                  color: '#22c55e', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
                  fontFamily: '"DM Mono",monospace', cursor: 'default',
                }}>
                  <ShieldCheck size={11} />
                  {image.pixelSpacingMm ? `${image.pixelSpacingMm.toFixed(3)} mm/px` : 'Calibrated'}
                </div>
              ) : (
                <button
                  onClick={() => navigate(`/studies/${image.studyId}/calibrate/${imageId}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '0 10px', height: 29, borderRadius: 5, cursor: 'pointer',
                    background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)',
                    color: '#fbbf24', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
                    fontFamily: '"DM Mono",monospace',
                  }}
                  title="Auto-Detect is disabled until you calibrate"
                >
                  <Ruler size={11} /> Calibrate First
                </button>
              )
            )}

            <button className={`ap-btn ap-ghost`} onClick={() => setShowTracings(v => !v)} style={showTracings ? { color: '#4c9eff', borderColor: 'rgba(76,158,255,0.28)' } : undefined}>
              {showTracings ? <Eye size={13} /> : <EyeOff size={13} />} Tracings
            </button>
            <button
              className="ap-btn ap-detect"
              onClick={handleAiDetect}
              disabled={analyzing || !!(image && !image.isCalibrated)}
              title={image && !image.isCalibrated ? 'Calibrate the image first to enable landmark detection' : 'Run AI landmark detection'}
            >
              {analyzing ? <Loader2 size={12} className="spin" /> : <BrainCircuit size={12} />} {analyzing ? 'Detecting…' : 'Auto-Detect'}
            </button>
            <button className="ap-btn ap-finalize" onClick={handleFinalize} disabled={saving || !landmarks.length}>
              {saving ? <Loader2 size={12} className="spin" /> : <CheckCircle size={12} />} {saving ? 'Saving…' : 'Finalize'}
            </button>
          </div>
        </header>

        {/* ── Calibration gate banner ────────────────────────────────────────── */}
        {image && !image.isCalibrated && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px',
            background: 'rgba(251,191,36,0.06)',
            borderBottom: '1px solid rgba(251,191,36,0.18)',
          }}>
            <AlertTriangle size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fbbf24' }}>
                Calibration required before landmark detection.
              </span>
              <span style={{ fontSize: 11, color: 'rgba(251,191,36,0.60)', marginLeft: 6 }}>
                Without calibration the AI cannot use real-world distances — linear measurements will be in pixels only.
              </span>
            </div>
            <button
              onClick={() => navigate(`/studies/${image.studyId}/calibrate/${imageId}`)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
                background: 'rgba(251,191,36,0.14)', border: '1px solid rgba(251,191,36,0.45)',
                color: '#fbbf24', fontSize: 11.5, fontWeight: 700,
                fontFamily: '"Instrument Sans",sans-serif',
                transition: 'background 0.15s',
              }}
            >
              <Ruler size={13} /> Calibrate Now →
            </button>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Viewer */}
          <div style={{ flex: 1, position: 'relative', background: '#03070f' }}>
            {image?.storageUrl ? (
              <XrayViewer
                imageUrl={toPublicUrl(image.storageUrl)}
                points={viewerPoints}
                tracings={activeTracings}
                measurementLabels={measurementLabels}
                showTracings={showTracings}
                viewMode={viewMode}
                mode="analyze"
                onPointMove={handlePointMove}
                selectedPointId={hoveredLm}
                // PointNix patient header
                patientName={image.patientName}
                patientMeta={image.patientAge ? `${image.patientAge}, ${image.patientSex ?? ''}`.trim() : undefined}
                date={new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                analysisMethod={analysisType}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 10, color: 'rgba(255,255,255,0.18)' }}>
                <Loader2 size={24} className="spin" />
                <span style={{ fontSize: 12 }}>Loading image…</span>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#090f1e', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <button className={`ap-tab ${activeTab === 'landmarks' ? 'active' : ''}`} onClick={() => setActiveTab('landmarks')}>
                <BrainCircuit size={11} /> Landmarks {landmarks.length > 0 && <span className="ap-chip">{landmarks.length}</span>}
              </button>
              <button className={`ap-tab ${activeTab === 'measurements' ? 'active' : ''}`} onClick={() => setActiveTab('measurements')}>
                <Activity size={11} /> Measurements {liveAnalysis.length > 0 && <span className="ap-chip">{liveAnalysis.length}</span>}
              </button>
            </div>

            <div className="ap-sc" style={{ flex: 1, overflowY: 'auto' }}>
              {activeTab === 'landmarks' ? (
                landmarks.length === 0 ? (
                  <div style={{ padding: '44px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <BrainCircuit size={26} style={{ opacity: 0.25 }} />
                    <div style={{ fontSize: 12, lineHeight: 1.65, maxWidth: 180 }}>Run Auto-Detect or manually place landmarks.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '9px 20px 7px', display: 'flex', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {([['#34d399', '>95%'], ['#4c9eff', '86–95%'], ['#fbbf24', '≤85%']] as const).map(([col, lbl]) => (
                        <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, color: 'rgba(255,255,255,0.28)' }}>
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />{lbl}
                        </div>
                      ))}
                    </div>
                    {categorisedLms.map(({ title, items }) => (
                      <LSection key={title} title={title} landmarks={items} activeId={hoveredLm} onHover={setHoveredLm} />
                    ))}
                  </>
                )
              ) : (
                liveAnalysis.length === 0 ? (
                  <div style={{ padding: '44px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <Activity size={26} style={{ opacity: 0.25 }} />
                    <div style={{ fontSize: 12, lineHeight: 1.65, maxWidth: 180 }}>Place at least 3 landmarks to see live measurements.</div>
                  </div>
                ) : (
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingBottom: 2 }}>
                      {(['Normal', 'MildDeviation', 'ModerateDeviation', 'SevereDeviation'] as const).map(sev => {
                        const n = sevCounts[sev]; if (!n) return null;
                        const col = SEV_COLOR[sev];
                        return <span key={sev} style={{ fontSize: 9.5, fontFamily: '"DM Mono",monospace', padding: '2px 7px', borderRadius: 4, color: col, background: `${col}14`, border: `1px solid ${col}28` }}>{SEV_LABEL[sev]}: {n}</span>;
                      })}
                    </div>
                    {liveAnalysis.map(m => <MCard key={m.code} m={m} />)}
                  </div>
                )
              )}
            </div>

            {landmarks.length > 0 && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 10, fontFamily: '"DM Mono",monospace', color: 'rgba(255,255,255,0.25)' }}>{landmarks.length} pts · {analysisType}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>drag to refine</span>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}