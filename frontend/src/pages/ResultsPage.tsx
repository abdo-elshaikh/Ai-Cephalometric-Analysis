import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { analysisApi, reportsApi } from '@/services/api';
import {
  Measurement, Diagnosis, TreatmentPlan, MeasurementStatus, DeviationSeverity,
  SkeletalClass, VerticalPattern, ReportFormat,
} from '@/types';
import { Spinner, EmptyState } from '@/components/ui/Loading';
import Modal from '@/components/ui/Modal';
import {
  ArrowLeft, FileText, Download, BarChart2,
  Activity, Brain, Stethoscope, AlertTriangle, CheckCircle2,
  HelpCircle, ShieldCheck, Eye, Search, Maximize2,
  Minimize2, RotateCcw, Layers3, PanelRightOpen, PanelRightClose,
  SkipBack, SkipForward, Play, Pause, Move,
} from 'lucide-react';
import { XAIRequest, XAIResponse, XAIDecisionStep } from '@/types';

type OverlayItem = { label: string; url: string };

function OverlayDiagnosticViewer({ overlays }: { overlays: OverlayItem[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(Math.min(1, Math.max(0, overlays.length - 1)));
  const [showCompare, setShowCompare] = useState(false);
  const [compareLayout, setCompareLayout] = useState<'side-by-side' | 'blend'>('side-by-side');
  const [linkView, setLinkView] = useState(true);
  const [blendOpacity, setBlendOpacity] = useState(50);
  const [showFilmstrip, setShowFilmstrip] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturate, setSaturate] = useState(100);
  const [invert, setInvert] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isCine, setIsCine] = useState(false);
  const [cineFps, setCineFps] = useState(2);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  const primary = overlays[activeIndex];
  const secondary = overlays[compareIndex] ?? overlays[0];

  const imageFilter = useMemo(() => {
    const invertExpr = invert ? ' invert(1)' : '';
    return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)${invertExpr}`;
  }, [brightness, contrast, saturate, invert]);

  const resetViewport = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const resetWindow = () => {
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
    setInvert(false);
  };

  const clampIndex = (idx: number) => (idx + overlays.length) % overlays.length;

  const goPrev = () => setActiveIndex((i) => clampIndex(i - 1));
  const goNext = () => setActiveIndex((i) => clampIndex(i + 1));

  useEffect(() => {
    if (!isCine || overlays.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((i) => (i + 1) % overlays.length);
    }, Math.max(120, Math.floor(1000 / cineFps)));
    return () => window.clearInterval(timer);
  }, [isCine, cineFps, overlays.length]);

  useEffect(() => {
    if (!showCompare) return;
    if (compareIndex === activeIndex) {
      setCompareIndex((activeIndex + 1) % overlays.length);
    }
  }, [activeIndex, compareIndex, overlays.length, showCompare]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setActiveIndex((i) => clampIndex(i - 1));
      if (e.key === 'ArrowRight') setActiveIndex((i) => clampIndex(i + 1));
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(6, z + 0.2));
      if (e.key === '-' || e.key === '_') setZoom((z) => Math.max(0.4, z - 0.2));
      if (e.key === '0') resetViewport();
      if (e.key.toLowerCase() === 'c') setShowCompare((v) => !v);
      if (e.key.toLowerCase() === 'f') setShowFilmstrip((v) => !v);
      if (e.key.toLowerCase() === 'x') {
        setCompareLayout((v) => (v === 'side-by-side' ? 'blend' : 'side-by-side'));
      }
      if (e.key === ' ') {
        e.preventDefault();
        setIsCine((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlays.length]);

  const applyWindowPreset = (preset: 'neutral' | 'bone' | 'soft') => {
    if (preset === 'neutral') {
      setBrightness(100);
      setContrast(100);
      setSaturate(100);
      setInvert(false);
      return;
    }
    if (preset === 'bone') {
      setBrightness(112);
      setContrast(142);
      setSaturate(82);
      setInvert(false);
      return;
    }
    setBrightness(118);
    setContrast(108);
    setSaturate(120);
    setInvert(false);
  };

  const onPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoom <= 1) return;
    setIsPanning(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const onPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };

  const onPointerUp = () => {
    setIsPanning(false);
    dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    setZoom((z) => Math.max(0.4, Math.min(6, z + delta)));
  };

  return (
    <div className="overlay-studio card animate-fade">
      <div className="overlay-studio-header">
        <div className="overlay-studio-heading">
          <Layers3 size={16} />
          <div>
            <h3>Diagnostic Overlay Studio</h3>
            <p>
              {activeIndex + 1}/{overlays.length} • {primary?.label}
            </p>
          </div>
        </div>

        <div className="overlay-studio-actions">
          <button className="btn btn-secondary btn-sm" onClick={goPrev} title="Previous (Left)">
            <SkipBack size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={goNext} title="Next (Right)">
            <SkipForward size={14} />
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCompare((v) => !v)}>
            {showCompare ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {showCompare ? 'Single' : 'Compare'}
          </button>
          {showCompare && (
            <select
              value={compareLayout}
              className="form-select overlay-compare-layout"
              onChange={(e) => setCompareLayout(e.target.value as 'side-by-side' | 'blend')}
              title="Compare layout"
            >
              <option value="side-by-side">Split</option>
              <option value="blend">Blend</option>
            </select>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowFilmstrip((v) => !v)}>
            {showFilmstrip ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />} Strip
          </button>
          <a href={primary?.url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
            <Download size={14} /> Export
          </a>
        </div>
      </div>

      <div className="overlay-studio-toolbar">
        <div className="overlay-control-inline">
          <Move size={13} />
          <span>Zoom</span>
          <input
            type="range"
            min={40}
            max={600}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(Number(e.target.value) / 100)}
          />
          <span>{Math.round(zoom * 100)}%</span>
        </div>
        <div className="overlay-control-inline">
          <span>B</span>
          <input type="range" min={60} max={180} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} />
          <span>{brightness}</span>
        </div>
        <div className="overlay-control-inline">
          <span>C</span>
          <input type="range" min={60} max={180} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
          <span>{contrast}</span>
        </div>
        <div className="overlay-control-inline">
          <span>S</span>
          <input type="range" min={0} max={220} value={saturate} onChange={(e) => setSaturate(Number(e.target.value))} />
          <span>{saturate}</span>
        </div>
        <label className="overlay-toggle">
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
          Invert
        </label>
        {showCompare && (
          <label className="overlay-toggle">
            <input type="checkbox" checked={linkView} onChange={(e) => setLinkView(e.target.checked)} />
            Link view
          </label>
        )}
        {showCompare && compareLayout === 'blend' && (
          <div className="overlay-control-inline">
            <span>Blend</span>
            <input type="range" min={0} max={100} value={blendOpacity} onChange={(e) => setBlendOpacity(Number(e.target.value))} />
            <span>{blendOpacity}%</span>
          </div>
        )}
        <div className="overlay-preset-group">
          <button className="btn btn-ghost btn-sm" onClick={() => applyWindowPreset('neutral')}>Neutral</button>
          <button className="btn btn-ghost btn-sm" onClick={() => applyWindowPreset('bone')}>Bone</button>
          <button className="btn btn-ghost btn-sm" onClick={() => applyWindowPreset('soft')}>Soft</button>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={resetViewport}>Reset View</button>
        <button className="btn btn-ghost btn-sm" onClick={resetWindow}>
          <RotateCcw size={13} /> Reset Window
        </button>
      </div>

      <div className="overlay-studio-body">
        <div className={`overlay-main-panel ${showCompare && compareLayout === 'side-by-side' ? 'is-compare' : ''}`}>
          <div
            className="overlay-viewport"
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onWheel={onWheel}
            role="presentation"
          >
            <div className="overlay-viewport-stack">
              <img
                src={primary?.url}
                alt={primary?.label}
                className={`overlay-image ${isPanning ? 'is-panning' : ''}`}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  filter: imageFilter,
                }}
                draggable={false}
              />

              {showCompare && compareLayout === 'blend' && (
                <img
                  src={secondary?.url}
                  alt={secondary?.label}
                  className="overlay-image overlay-image-secondary"
                  style={{
                    opacity: blendOpacity / 100,
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    filter: imageFilter,
                  }}
                  draggable={false}
                />
              )}
            </div>
            <div className="overlay-corner-label">Primary: {primary?.label}</div>
            {showCompare && compareLayout === 'blend' && (
              <div className="overlay-corner-label overlay-corner-label-right">
                Blend secondary: {secondary?.label}
              </div>
            )}
          </div>

          {showCompare && compareLayout === 'side-by-side' && (
            <div className="overlay-viewport secondary">
              <img
                src={secondary?.url}
                alt={secondary?.label}
                className="overlay-image"
                style={linkView
                  ? {
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    filter: imageFilter,
                  }
                  : { filter: imageFilter }}
                draggable={false}
              />
              <div className="overlay-corner-label">Secondary: {secondary?.label}</div>
            </div>
          )}
        </div>

        {showFilmstrip && (
          <aside className="overlay-filmstrip">
            <div className="overlay-filmstrip-header">
              <h4>Series</h4>
              <div className="overlay-cine-controls">
                <button className="btn btn-ghost btn-sm" onClick={() => setIsCine((v) => !v)}>
                  {isCine ? <Pause size={13} /> : <Play size={13} />} {isCine ? 'Pause' : 'Cine'}
                </button>
                <select
                  value={cineFps}
                  onChange={(e) => setCineFps(Number(e.target.value))}
                  className="form-select"
                  style={{ width: 86, padding: '6px 28px 6px 10px', fontSize: 12 }}
                >
                  {[1, 2, 4, 6, 8].map((fps) => (
                    <option key={fps} value={fps}>{fps} fps</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overlay-thumb-list">
              {overlays.map((ov, idx) => {
                const isActive = idx === activeIndex;
                const isSecondary = showCompare && idx === compareIndex;
                return (
                  <div
                    key={ov.label}
                    className={`overlay-thumb ${isActive ? 'active' : ''} ${isSecondary ? 'secondary' : ''}`}
                    onClick={() => setActiveIndex(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveIndex(idx);
                    }}
                  >
                    <img src={ov.url} alt={ov.label} draggable={false} />
                    <div className="overlay-thumb-meta">
                      <strong>{ov.label}</strong>
                      <div className="overlay-thumb-meta-actions">
                        {showCompare && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompareIndex(idx);
                            }}
                          >
                            Compare
                          </button>
                        )}
                        <a
                          href={ov.url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-ghost btn-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download size={12} />
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}
      </div>

      <div className="overlay-studio-hintbar">
        <span>Shortcuts: Left/Right navigate</span>
        <span>+/- zoom</span>
        <span>0 reset view</span>
        <span>C compare</span>
        <span>X split/blend</span>
        <span>F filmstrip</span>
        <span>Space cine</span>
      </div>
    </div>
  );
}

function statusBadge(s: MeasurementStatus) {
  const map: Record<MeasurementStatus, string> = { Normal: 'success', Increased: 'warning', Decreased: 'info' };
  return <span className={`badge badge-${map[s]}`}>{s}</span>;
}

function severityColor(s: DeviationSeverity) {
  const map: Record<DeviationSeverity, string> = {
    Normal:'var(--success)', Mild:'var(--info)', Moderate:'var(--warning)', Severe:'var(--danger)',
  };
  return map[s];
}

function skeletalBadge(c: SkeletalClass) {
  const label = c.replace('Class', 'Class ');
  const color = c === 'ClassI' ? 'success' : c === 'ClassII' ? 'warning' : 'danger';
  return <span className={`badge badge-${color}`} style={{ fontSize:14, padding:'4px 12px' }}>{label}</span>;
}

function verticalBadge(v: VerticalPattern) {
  const color = v === 'Normal' ? 'success' : v === 'LowAngle' ? 'info' : 'warning';
  return <span className={`badge badge-${color}`}>{v}</span>;
}

function SkeletalDifferential({ diff, primary }: { diff: Record<string, number>; primary: SkeletalClass }) {
  const classes: SkeletalClass[] = ['ClassI', 'ClassII', 'ClassIII'];
  const barColor: Record<SkeletalClass, string> = {
    ClassI: 'var(--success)', ClassII: 'var(--warning)', ClassIII: 'var(--danger)',
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:16 }}>
      <div className="text-xs text-muted" style={{ fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:2 }}>Skeletal Probability Distribution</div>
      {classes.map(cls => {
        const pct = Math.round((diff[cls] ?? 0) * 100);
        const isPrimary = cls === primary;
        return (
          <div key={cls} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ width:68, fontSize:12, fontWeight: isPrimary ? 700 : 400, color: isPrimary ? barColor[cls] : 'var(--text-muted)' }}>
              {cls.replace('Class', 'Class ')}
            </span>
            <div style={{ flex:1, height:10, borderRadius:6, background:'var(--bg-elevated)', overflow:'hidden', position:'relative' }}>
              <div style={{
                width:`${pct}%`, height:'100%', borderRadius:6,
                background: barColor[cls],
                opacity: isPrimary ? 1 : 0.45,
                transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
            <span style={{ width:36, fontSize:12, fontWeight:600, color: isPrimary ? barColor[cls] : 'var(--text-muted)', textAlign:'right' }}>
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PredictedOutcomes({ current, predicted }: { current?: Record<string, number>; predicted: Record<string, number> }) {
  const keys = Object.keys(predicted);
  if (!keys.length) return null;
  const unitFor = (k: string) => ['SNA','SNB','ANB','FMA','UI-NA_DEG','LI-NB_DEG'].includes(k) ? '°' : 'mm';
  return (
    <div style={{ marginTop:14 }}>
      <div className="text-xs text-muted" style={{ fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:8 }}>
        📊 Predicted Cephalometric Outcomes
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:8 }}>
        {keys.map(k => {
          const before = current?.[k];
          const after = predicted[k];
          const delta = before != null ? after - before : null;
          const improved = delta != null && (
            (k === 'ANB' && delta < 0) ||
            (['SNB','SNA'].includes(k) && Math.abs(after - 80) < Math.abs(before! - 80)) ||
            (['Ls-Eline','Li-Eline'].includes(k))
          );
          return (
            <div key={k} style={{ background:'var(--bg-elevated)', borderRadius:'var(--radius)', padding:'10px 12px', border:`1px solid ${delta != null && Math.abs(delta) > 0.5 ? 'rgba(37,99,235,0.3)' : 'var(--border)'}` }}>
              <div className="text-xs text-muted" style={{ marginBottom:4 }}>{k}</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:6 }}>
                {before != null && <span style={{ fontSize:11, color:'var(--text-muted)', textDecoration:'line-through' }}>{before.toFixed(1)}{unitFor(k)}</span>}
                <span style={{ fontWeight:700, fontSize:15, color:'var(--accent)' }}>{after.toFixed(1)}{unitFor(k)}</span>
                {delta != null && Math.abs(delta) > 0.1 && (
                  <span style={{ fontSize:11, color: improved ? 'var(--success)' : 'var(--text-muted)' }}>
                    {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DecisionAuditTrail({ xai }: { xai: XAIResponse }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ padding:'16px', background:'var(--bg-elevated)', borderRadius:'var(--radius)', borderLeft:'4px solid var(--accent)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <Brain size={18} color="var(--accent)" />
          <span style={{ fontWeight:700, fontSize:14 }}>Clinical Reasoning Chain</span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {xai.decisionChain.map((step, i) => (
            <div key={i} style={{ display:'flex', gap:12 }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                <div style={{ 
                  width:24, height:24, borderRadius:'50%', 
                  background: step.impact === 'High' ? 'var(--accent)' : 'var(--bg-card)', 
                  border:'1px solid var(--border)', 
                  display:'flex', alignItems:'center', justifyContent:'center', 
                  fontSize:11, fontWeight:700, color: step.impact === 'High' ? 'white' : 'var(--text-primary)'
                }}>
                  {step.step}
                </div>
                {i < xai.decisionChain.length - 1 && <div style={{ flex:1, width:2, background:'var(--border)', margin:'4px 0', opacity:0.5 }} />}
              </div>
              <div style={{ flex:1, paddingBottom: i < xai.decisionChain.length - 1 ? 4 : 0 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:2 }}>{step.factor}</div>
                <div style={{ fontSize:12, color:'var(--text-secondary)', marginBottom:6, lineHeight:1.4 }}>{step.evidence}</div>
                <div style={{ 
                  fontSize:10, padding:'2px 8px', borderRadius:4, 
                  background: step.impact === 'High' ? 'rgba(37,99,235,0.1)' : 'var(--bg-card)', 
                  border:'1px solid var(--border)', 
                  display:'inline-block', fontWeight:600,
                  color: step.impact === 'High' ? 'var(--accent)' : 'var(--text-muted)' 
                }}>
                  Impact: {step.impact}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ padding:'16px', background:'var(--bg-elevated)', borderRadius:'var(--radius)' }}>
          <div className="text-xs text-muted" style={{ fontWeight:600, textTransform:'uppercase', marginBottom:12, letterSpacing:'0.02em' }}>Key Diagnostic Drivers</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {xai.keyDrivers.map((d, i) => (
              <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, fontSize:12, color:'var(--text-primary)' }}>
                <ShieldCheck size={14} color="var(--success)" style={{ marginTop:2 }} />
                {d}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:'16px', background:'var(--bg-elevated)', borderRadius:'var(--radius)' }}>
          <div className="text-xs text-muted" style={{ fontWeight:600, textTransform:'uppercase', marginBottom:12, letterSpacing:'0.02em' }}>Clinical Confidence</div>
          <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
            <div style={{ fontSize:20, fontWeight:800, color: xai.clinicalConfidence === 'High' ? 'var(--success)' : 'var(--warning)' }}>
              {xai.clinicalConfidence}
            </div>
            <div className="text-xs text-muted" style={{ fontWeight:600 }}>Rating</div>
          </div>
          {xai.uncertaintyFactors.length > 0 && (
            <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--danger)', textTransform:'uppercase' }}>Caveats</div>
              <div style={{ fontSize:11, color:'var(--text-secondary)' }}>
                {xai.uncertaintyFactors.join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding:'16px', background:'rgba(37,99,235,0.03)', borderRadius:'var(--radius)', border:'1px dashed rgba(37,99,235,0.2)' }}>
        <div className="text-xs text-muted" style={{ fontWeight:600, textTransform:'uppercase', marginBottom:6, letterSpacing:'0.02em' }}>Differential Analysis</div>
        <p style={{ fontSize:12, color:'var(--text-secondary)', fontStyle:'italic', lineHeight:1.5 }}>{xai.alternativeInterpretation}</p>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'measurements' | 'diagnosis' | 'treatment' | 'overlays'>('measurements');
  const [reportModal, setReportModal] = useState(false);
  const [reportFormat, setReportFormat] = useState<ReportFormat>('PDF');
  const [reportOpts, setReportOpts] = useState({ includesXray: true, includesLandmarkOverlay: true, includesMeasurements: true, includesTreatmentPlan: true });
  const [measureFilter, setMeasureFilter] = useState<'All' | MeasurementStatus>('All');

  const { data: measurements, isLoading: loadingMeas } = useQuery({
    queryKey: ['measurements', sessionId],
    queryFn: () => analysisApi.getMeasurements(sessionId!),
    enabled: !!sessionId,
  });

  const { data: diagnosis, isLoading: loadingDx } = useQuery({
    queryKey: ['diagnosis', sessionId],
    queryFn: () => analysisApi.getDiagnosis(sessionId!),
    enabled: !!sessionId,
  });

  const { data: treatment, isLoading: loadingTx } = useQuery({
    queryKey: ['treatment', sessionId],
    queryFn: () => analysisApi.getTreatment(sessionId!),
    enabled: !!sessionId,
  });

  const { data: overlays, isLoading: loadingOv } = useQuery({
    queryKey: ['overlays', sessionId],
    queryFn: () => analysisApi.getOverlays(sessionId!),
    enabled: !!sessionId,
  });

  const reportMut = useMutation({
    mutationFn: () => reportsApi.generate(sessionId!, {
      format: reportFormat,
      ...reportOpts,
    }),
    onSuccess: (report) => {
      toast.success('Report generated');
      window.open(report.storageUrl, '_blank');
      setReportModal(false);
    },
    onError: () => toast.error('Report generation failed'),
  });

  const filteredMeasurements = measurements?.filter(
    m => measureFilter === 'All' || m.status === measureFilter,
  ) ?? [];

  const abnormalCount = measurements?.filter(m => m.status !== 'Normal').length ?? 0;

  const [xaiModal, setXaiModal] = useState(false);
  const [xaiData, setXaiData] = useState<XAIResponse | null>(null);

  const xaiMut = useMutation({
    mutationFn: (body: XAIRequest) => analysisApi.explainDecision(sessionId!, body),
    onSuccess: (data) => {
      setXaiData(data);
      setXaiModal(true);
    },
    onError: () => toast.error('Failed to generate reasoning audit'),
  });

  const handleExplain = (plan: TreatmentPlan) => {
    if (!diagnosis || !measurements) return;
    
    // Map measurements array to dict
    const mDict: Record<string, number> = {};
    measurements.forEach(m => { mDict[m.measurementCode] = m.value; });

    xaiMut.mutate({
      skeletalClass: diagnosis.skeletalClass,
      skeletalProbabilities: diagnosis.skeletalDifferential ?? {},
      verticalPattern: diagnosis.verticalPattern,
      measurements: mDict,
      treatmentName: plan.treatmentName,
      predictedOutcomes: plan.predictedOutcomes ?? {},
      uncertaintyLandmarks: [], // AI landmarks confidence could go here
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
        <div>
          <h1 className="page-title">Clinical Results</h1>
          <p className="page-subtitle">Session {sessionId?.slice(0,8)}…</p>
        </div>
        <button className="btn btn-primary" style={{ marginLeft:'auto' }} onClick={() => setReportModal(true)} id="btn-generate-report">
          <FileText size={16} /> Generate Report
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-bar" style={{ padding:'0 24px', background:'var(--bg-surface)' }}>
        {[
          { key:'measurements', label:`Measurements${abnormalCount ? ` (${abnormalCount} ⚠)` : ''}` },
          { key:'diagnosis',    label:'Diagnosis' },
          { key:'treatment',    label:'Treatment Plans' },
          { key:'overlays',     label:'Overlay Images' },
        ].map(t => (
          <button key={t.key} className={`tab-btn${activeTab === t.key ? ' active' : ''}`} onClick={() => setActiveTab(t.key as typeof activeTab)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="page-body">
        {/* ── Measurements ─────────────────────────────────── */}
        {activeTab === 'measurements' && (
          <>
            <div className="filter-bar" style={{ marginBottom:16 }}>
              {(['All','Normal','Increased','Decreased'] as const).map(f => (
                <button
                  key={f}
                  className={`btn btn-sm ${measureFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setMeasureFilter(f)}
                >
                  {f}
                </button>
              ))}
              <span className="text-sm text-muted" style={{ marginLeft:'auto' }}>
                {filteredMeasurements.length} measurements
              </span>
            </div>

            {loadingMeas ? <Spinner /> : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="hide-mobile">Code</th>
                      <th>Measurement</th>
                      <th>Value</th>
                      <th>Normal Range</th>
                      <th>Status</th>
                      <th>Severity</th>
                      <th className="hide-mobile">Deviation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {['Angle', 'Distance', 'Ratio'].map(type => {
                      const ms = filteredMeasurements.filter(m => m.measurementType === type);
                      if (ms.length === 0) return null;
                      return (
                        <React.Fragment key={type}>
                          <tr style={{ background:'var(--bg-elevated)' }}>
                            <td colSpan={7} style={{ fontWeight:600, color:'var(--text-primary)', borderBottom:'1px solid var(--border)', paddingTop:12, paddingBottom:12 }}>
                              {type}s
                            </td>
                          </tr>
                          {ms.map(m => (
                            <tr key={m.id}>
                              <td className="font-mono text-xs text-muted hide-mobile">{m.measurementCode}</td>
                              <td style={{ fontWeight:500 }}>{m.measurementName}</td>
                              <td className="font-mono" style={{ color:'var(--text-primary)', fontWeight:600 }}>
                                {m.value.toFixed(1)} <span className="text-xs text-muted">{m.unit === 'Degrees' ? '°' : m.unit === 'Millimeters' ? 'mm' : '%'}</span>
                              </td>
                              <td className="text-sm text-muted">{m.normalMin} – {m.normalMax}</td>
                              <td>{statusBadge(m.status)}</td>
                              <td>
                                <span style={{ color: severityColor(m.severity), fontWeight:500, fontSize:13 }}>{m.severity}</span>
                              </td>
                              <td className="font-mono text-xs text-muted hide-mobile">
                                {m.deviation != null ? `${m.deviation > 0 ? '+' : ''}${m.deviation.toFixed(1)}` : '—'}
                              </td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Diagnosis ─────────────────────────────────────── */}
        {activeTab === 'diagnosis' && (
          loadingDx ? <Spinner /> : !diagnosis ? (
            <EmptyState icon={<Brain size={28} />} title="No diagnosis" desc="Finalize analysis to generate diagnosis." />
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {/* Summary banner */}
              <div className="card">
                <div className="card-body">
                  <div style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
                    <div style={{ textAlign:'center' }}>
                      <div className="text-xs text-muted" style={{ marginBottom:8 }}>Skeletal Class</div>
                      {skeletalBadge(diagnosis.skeletalClass)}
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div className="text-xs text-muted" style={{ marginBottom:8 }}>Vertical Pattern</div>
                      {verticalBadge(diagnosis.verticalPattern)}
                    </div>
                    <div style={{ textAlign:'center' }}>
                      <div className="text-xs text-muted" style={{ marginBottom:4 }}>ANB Angle</div>
                      <div style={{ fontWeight:700, fontSize:18, color:'var(--accent)' }}>{diagnosis.anbUsed?.toFixed(1)}°</div>
                    </div>
                    {diagnosis.confidenceScore && (
                      <div style={{ textAlign:'center' }}>
                        <div className="text-xs text-muted" style={{ marginBottom:4 }}>Confidence</div>
                        <div style={{ fontWeight:700, fontSize:18, color:'var(--success)' }}>{(diagnosis.confidenceScore*100).toFixed(0)}%</div>
                      </div>
                    )}
                  </div>
                  {/* Skeletal Probability Distribution — from Gaussian Mixture model */}
              {diagnosis.skeletalDifferential && (
                <SkeletalDifferential
                  diff={diagnosis.skeletalDifferential}
                  primary={diagnosis.skeletalClass}
                />
              )}
              {diagnosis.summaryText && (
                <div style={{ marginTop:16, padding:'12px 16px', background:'var(--bg-elevated)', borderRadius:'var(--radius)', borderLeft:'3px solid var(--accent)' }}>
                  <p className="text-sm" style={{ color:'var(--text-secondary)', lineHeight:1.7 }}>{diagnosis.summaryText}</p>
                </div>
              )}
                </div>
              </div>

              {/* Details grid */}
              <div className="grid-2">
                <div className="card">
                  <div className="card-header"><h3 className="card-title" style={{ fontSize:14 }}><Activity size={14} style={{ display:'inline', marginRight:6, color:'var(--accent)' }} />Jaw Positions</h3></div>
                  <div className="card-body">
                    {[
                      ['Maxillary', diagnosis.maxillaryPosition],
                      ['Mandibular', diagnosis.mandibularPosition],
                    ].map(([k,v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span className="text-sm text-muted">{k}</span>
                        <span className={`badge badge-${v === 'Normal' ? 'success' : 'warning'}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <div className="card-header"><h3 className="card-title" style={{ fontSize:14 }}>Incisors & Occlusion</h3></div>
                  <div className="card-body">
                    {[
                      ['Upper Incisor', diagnosis.upperIncisorInclination],
                      ['Lower Incisor', diagnosis.lowerIncisorInclination],
                      ['Overjet', `${diagnosis.overjetMm ?? '—'} mm (${diagnosis.overjetClassification ?? '—'})`],
                      ['Overbite', `${diagnosis.overbitesMm ?? '—'} mm (${diagnosis.overbiteClassification ?? '—'})`],
                    ].map(([k,v]) => (
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span className="text-sm text-muted">{k}</span>
                        <span className="text-sm" style={{ color:'var(--text-primary)' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Warnings */}
              {diagnosis.warnings?.length > 0 && (
                <div style={{ background:'var(--warning-dim)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'var(--radius)', padding:'16px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <AlertTriangle size={16} style={{ color:'var(--warning)' }} />
                    <span style={{ fontWeight:600, color:'var(--warning)' }}>Clinical Warnings</span>
                  </div>
                  <ul style={{ paddingLeft:20, display:'flex', flexDirection:'column', gap:4 }}>
                    {diagnosis.warnings.map((w, i) => (
                      <li key={i} className="text-sm" style={{ color:'var(--text-secondary)' }}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        )}

        {/* ── Treatment ─────────────────────────────────────── */}
        {activeTab === 'treatment' && (
          loadingTx ? <Spinner /> : !treatment?.length ? (
            <EmptyState icon={<Stethoscope size={28} />} title="No treatment plans" desc="Finalize diagnosis to generate treatment suggestions." />
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {treatment.map((plan: TreatmentPlan, idx: number) => (
                <div key={plan.id} className="card">
                  <div className="card-header">
                    <h3 className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {plan.isPrimary && <span className="badge badge-accent">Primary</span>}
                      Plan {idx + 1}: {plan.treatmentName}
                    </h3>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ display:'flex', gap:8 }}>
                        <span className="badge badge-muted">{plan.treatmentType}</span>
                        <span className="badge badge-muted">{plan.source}</span>
                        {plan.estimatedDurationMonths && (
                          <span className="badge badge-info">{plan.estimatedDurationMonths}mo</span>
                        )}
                      </div>
                      <button 
                        onClick={() => handleExplain(plan)}
                        disabled={xaiMut.isPending}
                        className="btn-ghost"
                        style={{ 
                          padding:'4px 10px', fontSize:11, display:'flex', alignItems:'center', gap:6,
                          borderRadius:6, background:'var(--bg-elevated)', border:'1px solid var(--border)'
                        }}
                      >
                        {xaiMut.isPending && xaiMut.variables?.treatmentName === plan.treatmentName 
                          ? <Spinner size={12} /> 
                          : <Brain size={14} color="var(--accent)" />}
                        View Decision Audit
                      </button>
                    </div>
                  </div>
                  <div className="card-body">
                    <p className="text-sm" style={{ color:'var(--text-secondary)', marginBottom:12 }}>{plan.description}</p>
                    {plan.rationale && (
                      <div style={{ background:'var(--bg-elevated)', borderRadius:'var(--radius)', padding:'12px', marginBottom:12 }}>
                        <div className="text-xs text-muted" style={{ marginBottom:4 }}>Rationale</div>
                        <p className="text-sm" style={{ color:'var(--text-primary)' }}>{plan.rationale}</p>
                      </div>
                    )}
                    {/* Biomechanical Predicted Outcomes */}
                    {plan.predictedOutcomes && Object.keys(plan.predictedOutcomes).length > 0 && (
                      <PredictedOutcomes predicted={plan.predictedOutcomes} />
                    )}
                    {plan.risks && (
                      <div style={{ background:'var(--danger-dim)', borderRadius:'var(--radius)', padding:'12px', border:'1px solid rgba(239,68,68,0.2)', marginTop:12 }}>
                        <div className="text-xs" style={{ color:'var(--danger)', marginBottom:4, fontWeight:600 }}>Risks</div>
                        <p className="text-sm" style={{ color:'var(--text-secondary)' }}>{plan.risks}</p>
                      </div>
                    )}
                    {plan.evidenceReference && (
                      <div className="text-xs text-muted" style={{ marginTop:8 }}>📎 {plan.evidenceReference}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── Overlays ──────────────────────────────────────── */}
        {activeTab === 'overlays' && (
          loadingOv ? <Spinner /> : !overlays?.length ? (
            <EmptyState icon={<BarChart2 size={28} />} title="No overlays yet" desc="Generate overlays after finalizing the session." />
          ) : (
            <OverlayDiagnosticViewer overlays={overlays} />
          )
        )}
      </div>

      {/* Decision Reasoning Audit Modal */}
      {xaiModal && (
        <Modal 
          onClose={() => setXaiModal(false)} 
          title="AI Decision Reasoning Audit"
        >
          {xaiData ? <DecisionAuditTrail xai={xaiData} /> : <Spinner />}
        </Modal>
      )}

      {/* Report Generation Modal */}
      {reportModal && (
        <Modal 
          onClose={() => setReportModal(false)} 
          title="Generate Clinical Report"
        >
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <label className="text-sm font-medium">Report Format</label>
              <div style={{ display:'flex', gap:10 }}>
                {(['PDF', 'Word'] as ReportFormat[]).map(f => (
                  <button
                    key={f}
                    className={`btn ${reportFormat === f ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex:1 }}
                    onClick={() => setReportFormat(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <label className="text-sm font-medium">Included Sections</label>
              {[
                { key: 'includesXray', label: 'Original X-Ray' },
                { key: 'includesLandmarkOverlay', label: 'Landmark Tracing' },
                { key: 'includesMeasurements', label: 'Measurement Table' },
                { key: 'includesTreatmentPlan', label: 'Treatment Plans' },
              ].map(opt => (
                <label key={opt.key} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reportOpts[opt.key as keyof typeof reportOpts]}
                    onChange={e => setReportOpts({ ...reportOpts, [opt.key]: e.target.checked })}
                    style={{ width:18, height:18, accentColor:'var(--accent)' }}
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>

            <div style={{ display:'flex', gap:10, marginTop:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setReportModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ flex:1 }}
                onClick={() => reportMut.mutate()}
                disabled={reportMut.isPending}
              >
                {reportMut.isPending ? <Spinner size={16} /> : <Download size={16} />}
                Generate Report
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
