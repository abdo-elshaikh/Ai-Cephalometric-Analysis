/**
 * ViewerToolbar.tsx — Dolphin Imaging–style top toolbar
 */
import React from 'react';
import {
  MousePointer2, Move, Crosshair, Ruler, RotateCcw,
  Maximize2, Sun, Contrast, FlipHorizontal, Grid3x3,
  Eye, EyeOff, Layers, FileDown, Brain, ZoomIn, ZoomOut,
} from 'lucide-react';
import { ViewerTool, LayerVisibility } from './ClinicalViewer';

const T = {
  bg2: '#0e1219', bg3: '#121720', bg4: '#171e2a',
  b1: 'rgba(255,255,255,0.07)', b2: 'rgba(255,255,255,0.12)',
  t0: '#f0f4ff', t2: 'rgba(150,170,210,0.60)', t3: 'rgba(100,120,165,0.45)',
  accent: '#0ea5e9', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
} as const;

export type AnalysisProtocol = 'Steiner' | 'McNamara' | 'Ricketts' | 'Eastman' | 'Tweed' | 'Full';

interface Props {
  activeTool: ViewerTool;
  onToolChange: (t: ViewerTool) => void;
  protocol: AnalysisProtocol;
  onProtocolChange: (p: AnalysisProtocol) => void;
  layers: LayerVisibility;
  onLayerToggle: (k: keyof LayerVisibility) => void;
  brightness: number;
  contrast: number;
  invert: boolean;
  onBrightnessChange: (v: number) => void;
  onContrastChange: (v: number) => void;
  onInvertToggle: () => void;
  onFitView: () => void;
  onReset: () => void;
  onAiDetect: () => void;
  onExport: () => void;
  aiDetecting: boolean;
  hasLandmarks: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
}

function ToolBtn({
  onClick, title, active, children, danger = false,
}: {
  onClick?: () => void; title?: string; active?: boolean;
  children: React.ReactNode; danger?: boolean;
}) {
  const ac = danger ? T.red : T.accent;
  return (
    <button
      title={title} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 6,
        border: active ? `1px solid ${ac}44` : `1px solid transparent`,
        background: active ? `${ac}14` : 'transparent',
        color: active ? ac : T.t2,
        cursor: 'pointer', flexShrink: 0,
        transition: 'all 0.12s',
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 20, background: T.b1, flexShrink: 0, margin: '0 4px' }} />;
}

function MiniSlider({ value, onChange, min, max, label }: {
  value: number; onChange: (v: number) => void; min: number; max: number; label: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 9, color: T.t3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em', minWidth: 20 }}>{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(+e.target.value)}
        style={{ width: 60, accentColor: T.accent, cursor: 'pointer' }}
      />
      <span style={{ fontSize: 10, color: T.t2, fontFamily: 'monospace', minWidth: 26, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

const TOOLS: { id: ViewerTool; icon: React.ReactNode; label: string }[] = [
  { id: 'select',   icon: <MousePointer2 size={15}/>, label: 'Select & Edit (S)' },
  { id: 'pan',      icon: <Move size={15}/>,          label: 'Pan (Space)' },
  { id: 'landmark', icon: <Crosshair size={15}/>,     label: 'Add Landmark (L)' },
  { id: 'measure',  icon: <Ruler size={15}/>,         label: 'Measure (M)' },
];

const PROTOCOLS: AnalysisProtocol[] = ['Steiner','McNamara','Ricketts','Eastman','Tweed','Full'];
const LAYER_KEYS: { key: keyof LayerVisibility; label: string }[] = [
  { key: 'landmarks',    label: 'Landmarks' },
  { key: 'measurements', label: 'Measurements' },
  { key: 'softTissue',  label: 'Soft Tissue' },
  { key: 'heatmap',     label: 'AI Heatmap' },
  { key: 'grid',        label: 'Grid' },
];

export default function ViewerToolbar({
  activeTool, onToolChange, protocol, onProtocolChange,
  layers, onLayerToggle,
  brightness, contrast, invert,
  onBrightnessChange, onContrastChange, onInvertToggle,
  onFitView, onReset, onAiDetect, onExport,
  aiDetecting, hasLandmarks,
  zoomIn, zoomOut,
}: Props) {
  const [showLayers, setShowLayers] = React.useState(false);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '0 12px', height: 48,
      background: T.bg2, borderBottom: `1px solid ${T.b1}`,
      flexShrink: 0, position: 'relative', zIndex: 10,
    }}>
      {/* Tools */}
      <div style={{ display: 'flex', gap: 2 }}>
        {TOOLS.map(t => (
          <ToolBtn key={t.id} title={t.label} active={activeTool === t.id}
            onClick={() => onToolChange(t.id)}>
            {t.icon}
          </ToolBtn>
        ))}
      </div>

      <Sep />

      {/* Zoom */}
      <ToolBtn title="Zoom In (+)" onClick={zoomIn}><ZoomIn size={15}/></ToolBtn>
      <ToolBtn title="Zoom Out (-)" onClick={zoomOut}><ZoomOut size={15}/></ToolBtn>
      <ToolBtn title="Fit to View (F)" onClick={onFitView}><Maximize2 size={15}/></ToolBtn>

      <Sep />

      {/* Image controls */}
      <MiniSlider label="BRT" value={brightness} onChange={onBrightnessChange} min={50} max={200} />
      <MiniSlider label="CON" value={contrast}   onChange={onContrastChange}   min={50} max={200} />
      <ToolBtn title="Invert (I)" active={invert} onClick={onInvertToggle}>
        <FlipHorizontal size={15}/>
      </ToolBtn>

      <Sep />

      {/* Protocol selector */}
      <select
        value={protocol}
        onChange={e => onProtocolChange(e.target.value as AnalysisProtocol)}
        style={{
          background: T.bg4, border: `1px solid ${T.b2}`, borderRadius: 6,
          color: T.t0, fontSize: 12, fontWeight: 600, padding: '4px 8px',
          cursor: 'pointer', outline: 'none',
        }}
      >
        {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>

      <Sep />

      {/* Layer toggle */}
      <div style={{ position: 'relative' }}>
        <ToolBtn title="Toggle Layers" active={showLayers} onClick={() => setShowLayers(v => !v)}>
          <Layers size={15}/>
        </ToolBtn>
        {showLayers && (
          <div style={{
            position: 'absolute', top: 38, left: 0,
            background: T.bg3, border: `1px solid ${T.b2}`, borderRadius: 8,
            padding: '10px 14px', minWidth: 170, zIndex: 999,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <span style={{ fontSize: 9.5, color: T.t3, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.1em' }}>Layers</span>
            {LAYER_KEYS.map(l => (
              <label key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={layers[l.key]} onChange={() => onLayerToggle(l.key)}
                  style={{ accentColor: T.accent, width: 14, height: 14 }} />
                <span style={{ fontSize: 12, color: layers[l.key] ? T.t0 : T.t3 }}>{l.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* AI Detect */}
      <button
        onClick={onAiDetect} disabled={aiDetecting}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 14px', borderRadius: 6,
          background: aiDetecting ? T.bg4 : `${T.accent}18`,
          border: `1px solid ${T.accent}44`, color: T.accent,
          fontSize: 12, fontWeight: 700, cursor: aiDetecting ? 'not-allowed' : 'pointer',
          opacity: aiDetecting ? 0.6 : 1, transition: 'all 0.15s',
        }}
      >
        <Brain size={14} style={{ flexShrink: 0 }}/>
        {aiDetecting ? 'Detecting…' : 'AI Detect'}
      </button>

      {/* Export */}
      <ToolBtn title="Export Report" onClick={onExport}><FileDown size={15}/></ToolBtn>

      {/* Reset */}
      <ToolBtn title="Reset" onClick={onReset} danger><RotateCcw size={14}/></ToolBtn>
    </div>
  );
}
