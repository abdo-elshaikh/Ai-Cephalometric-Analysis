/**
 * DolphinViewer.tsx — Full Dolphin Imaging–level clinical workspace
 *
 * Layout:
 *   TopBar (ViewerToolbar)
 *   ├── Left: LandmarkSidebar
 *   ├── Center: ClinicalViewer (SVG engine)
 *   └── Right: MeasurementPanel
 *   Bottom: AI Insight floating card
 */
import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { imagesApi, analysisApi } from '@/services/api';
import { AnalysisType, Landmark, LandmarkUpdateDto } from '@/types';
import { Spinner } from '@/components/ui/Loading';
import {
  ArrowLeft, Brain, ChevronRight, CheckCircle2,
  AlertTriangle, Zap, TrendingUp, Play, Layers,
  Activity, GitMerge, Download,
} from 'lucide-react';

import ClinicalViewer, { ViewerTool, LayerVisibility } from '@/components/viewer/ClinicalViewer';
import ViewerToolbar, { AnalysisProtocol } from '@/components/viewer/ViewerToolbar';
import LandmarkSidebar from '@/components/viewer/LandmarkSidebar';
import MeasurementPanel from '@/components/viewer/MeasurementPanel';

const T = {
  bg0: '#060809', bg1: '#0a0d12', bg2: '#0e1219',
  b1: 'rgba(255,255,255,0.06)', b2: 'rgba(255,255,255,0.11)',
  t0: '#f0f4ff', t1: 'rgba(200,215,240,0.85)',
  t2: 'rgba(150,170,210,0.60)', t3: 'rgba(100,120,165,0.45)',
  accent: '#0ea5e9', green: '#10b981', amber: '#f59e0b', red: '#ef4444',
} as const;

export default function DolphinViewer() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ── View state ── */
  const [activeTool, setActiveTool] = useState<ViewerTool>('select');
  const [protocol, setProtocol] = useState<AnalysisProtocol>('Steiner');
  const [layers, setLayers] = useState<LayerVisibility>({
    image: true, landmarks: true, measurements: true,
    softTissue: true, heatmap: false, grid: false,
  });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);
  const [selectedLandmark, setSelectedLandmark] = useState<string | null>(null);
  const [highlightedMeas, setHighlightedMeas] = useState<string | null>(null);
  const [localLandmarks, setLocalLandmarks] = useState<Landmark[]>([]);
  const [zoomSignal, setZoomSignal] = useState(0);
  const [fitSignal, setFitSignal] = useState(0);
  const [analysisTypeVal, setAnalysisTypeVal] = useState<AnalysisType>('Steiner');

  /* ── Queries ── */
  const { data: images, isLoading: loadingImg } = useQuery({
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

  const { data: measurements } = useQuery({
    queryKey: ['measurements', session?.id],
    queryFn: () => analysisApi.getMeasurements(session!.id),
    enabled: !!session?.id,
  });

  const { data: diagnosis } = useQuery({
    queryKey: ['diagnosis', session?.id],
    queryFn: () => analysisApi.getDiagnosis(session!.id),
    enabled: !!session?.id,
  });

  useEffect(() => {
    if (landmarks) setLocalLandmarks(landmarks);
  }, [landmarks]);

  /* ── Mutations ── */
  const detectMut = useMutation({
    mutationFn: () => analysisApi.detect(image!.id, analysisTypeVal),
    onSuccess: () => {
      toast.success('Landmarks detected');
      qc.invalidateQueries({ queryKey: ['latest-session', image?.id] });
      qc.invalidateQueries({ queryKey: ['landmarks'] });
    },
    onError: () => toast.error('Detection failed'),
  });

  const saveMut = useMutation({
    mutationFn: (updates: LandmarkUpdateDto[]) =>
      analysisApi.updateLandmarks(session!.id, updates),
    onSuccess: () => toast.success('Landmarks saved'),
    onError: () => toast.error('Save failed'),
  });

  const adjustMut = useMutation({
    mutationFn: ({ code, x, y }: { code: string; x: number; y: number }) =>
      analysisApi.adjustLandmark(session!.id, code, { x, y, reason: 'Manual drag adjustment' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landmarks', session?.id] }),
  });

  const fullPipelineMut = useMutation({
    mutationFn: () => analysisApi.fullPipeline(image!.id, analysisTypeVal),
    onSuccess: () => {
      toast.success('Full pipeline complete — landmarks, measurements & diagnosis ready');
      qc.invalidateQueries({ queryKey: ['latest-session', image?.id] });
      qc.invalidateQueries({ queryKey: ['landmarks'] });
      qc.invalidateQueries({ queryKey: ['measurements'] });
      qc.invalidateQueries({ queryKey: ['diagnosis'] });
    },
    onError: () => toast.error('Full pipeline failed'),
  });

  const calcMeasMut = useMutation({
    mutationFn: () => analysisApi.calculateMeasurements(session!.id),
    onSuccess: () => {
      toast.success('Measurements calculated');
      qc.invalidateQueries({ queryKey: ['measurements', session?.id] });
    },
    onError: () => toast.error('Measurement calculation failed'),
  });

  const diagnoseMut = useMutation({
    mutationFn: () => analysisApi.classifyDiagnosis(session!.id),
    onSuccess: () => {
      toast.success('Diagnosis complete');
      qc.invalidateQueries({ queryKey: ['diagnosis', session?.id] });
    },
    onError: () => toast.error('Diagnosis failed'),
  });

  const finalizeMut = useMutation({
    mutationFn: () => analysisApi.finalize(
      session!.id,
      localLandmarks.map(l => ({ landmarkCode: l.landmarkCode, xPx: l.xPx, yPx: l.yPx }))
    ),
    onSuccess: (sess) => {
      toast.success('Session finalized — proceeding to results');
      navigate(`/results/${sess.id}`);
    },
    onError: () => toast.error('Finalize failed'),
  });

  /* ── Handlers ── */
  const handleLandmarkMoved = useCallback((code: string, nx: number, ny: number) => {
    if (!image) return;
    const px = nx * (image.widthPx ?? 1000);
    const py = ny * (image.heightPx ?? 1000);
    setLocalLandmarks(prev =>
      prev.map(l => l.landmarkCode === code ? { ...l, xPx: px, yPx: py } : l)
    );
    // debounced server update
    adjustMut.mutate({ code, x: px, y: py });
  }, [image, adjustMut]);

  const handleLayerToggle = useCallback((k: keyof LayerVisibility) => {
    setLayers(prev => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const handleProtocol = useCallback((p: AnalysisProtocol) => {
    setProtocol(p);
    setAnalysisTypeVal(p as AnalysisType);
  }, []);

  const handleExport = useCallback(() => {
    if (!session) return;
    navigate(`/results/${session.id}`);
  }, [session, navigate]);

  const handleReset = useCallback(() => {
    if (landmarks) setLocalLandmarks(landmarks);
    setBrightness(100); setContrast(100); setInvert(false);
    toast.info('Viewer reset');
  }, [landmarks]);

  const imageDims = image ? { w: image.widthPx ?? 1000, h: image.heightPx ?? 1000 } : undefined;

  /* ── AI Insight card ── */
  const aiInsightVisible = !!diagnosis;
  const low = localLandmarks.filter(l => (l.confidenceScore ?? 1) < 0.6).length;

  if (loadingImg) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg0 }}>
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', background: T.bg0, overflow: 'hidden',
    }}>
      {/* ── Page header (above toolbar) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 16px', height: 44,
        background: T.bg1, borderBottom: `1px solid ${T.b1}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none',
            color: T.t2, cursor: 'pointer', fontSize: 12, padding: 0,
          }}
        >
          <ArrowLeft size={14}/> Back
        </button>
        <div style={{ width: 1, height: 16, background: T.b1 }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: T.t0 }}>
          {image?.fileName ?? 'Cephalometric Analysis'}
        </div>
        {session && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: `${T.green}14`, border: `1px solid ${T.green}30`, color: T.green,
          }}>
            SESSION · {session.status}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Pipeline step buttons */}
        {image && !session && (
          <button
            onClick={() => fullPipelineMut.mutate()}
            disabled={fullPipelineMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 14px', borderRadius: 6,
              background: `${T.accent}20`, border: `1px solid ${T.accent}50`,
              color: T.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {fullPipelineMut.isPending ? <Spinner size={12}/> : <Play size={12}/>}
            Run Full Pipeline
          </button>
        )}

        {session && !measurements?.length && (
          <button
            onClick={() => calcMeasMut.mutate()}
            disabled={calcMeasMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6,
              background: `${T.amber}18`, border: `1px solid ${T.amber}40`,
              color: T.amber, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {calcMeasMut.isPending ? <Spinner size={12}/> : <Activity size={12}/>}
            Calc Measurements
          </button>
        )}

        {measurements && measurements.length > 0 && !diagnosis && (
          <button
            onClick={() => diagnoseMut.mutate()}
            disabled={diagnoseMut.isPending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6,
              background: `${T.green}18`, border: `1px solid ${T.green}40`,
              color: T.green, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {diagnoseMut.isPending ? <Spinner size={12}/> : <GitMerge size={12}/>}
            Classify Diagnosis
          </button>
        )}

        {/* Landmark stats pills */}
        {localLandmarks.length > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ fontSize: 10, color: T.t2 }}>{localLandmarks.length} landmarks</span>
            {low > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4,
                background: `${T.amber}14`, border: `1px solid ${T.amber}30`, color: T.amber,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <AlertTriangle size={10}/> {low} low conf
              </span>
            )}
          </div>
        )}

        {/* Save + Finalize */}
        {localLandmarks.length > 0 && (
          <>
            <button
              onClick={() => saveMut.mutate(
                localLandmarks.map(l => ({ landmarkCode: l.landmarkCode, xPx: l.xPx, yPx: l.yPx }))
              )}
              disabled={saveMut.isPending}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 6,
                background: `${T.accent}18`, border: `1px solid ${T.accent}44`,
                color: T.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {saveMut.isPending ? <Spinner size={12}/> : <CheckCircle2 size={12}/>}
              Save
            </button>
            {diagnosis && (
              <button
                onClick={() => finalizeMut.mutate()}
                disabled={finalizeMut.isPending}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 14px', borderRadius: 6,
                  background: `${T.green}20`, border: `1px solid ${T.green}55`,
                  color: T.green, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {finalizeMut.isPending ? <Spinner size={12}/> : <Download size={12}/>}
                Finalize &amp; Report
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Toolbar ── */}
      <ViewerToolbar
        activeTool={activeTool} onToolChange={setActiveTool}
        protocol={protocol} onProtocolChange={handleProtocol}
        layers={layers} onLayerToggle={handleLayerToggle}
        brightness={brightness} contrast={contrast} invert={invert}
        onBrightnessChange={setBrightness} onContrastChange={setContrast}
        onInvertToggle={() => setInvert(v => !v)}
        onFitView={() => setFitSignal(n => n + 1)}
        onReset={handleReset}
        onAiDetect={() => detectMut.mutate()}
        onExport={handleExport}
        aiDetecting={detectMut.isPending}
        hasLandmarks={localLandmarks.length > 0}
        zoomIn={() => setZoomSignal(n => n + 1)}
        zoomOut={() => setZoomSignal(n => n - 1)}
      />

      {/* ── Main workspace ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: Landmark sidebar */}
        <div style={{ width: 230, flexShrink: 0, overflow: 'hidden' }}>
          <LandmarkSidebar
            landmarks={localLandmarks}
            selected={selectedLandmark}
            onSelect={setSelectedLandmark}
          />
        </div>

        {/* Centre: SVG Viewer */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {!image ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: 16, color: T.t3,
            }}>
              <Zap size={48} color={T.accent} style={{ opacity: 0.3 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No radiograph loaded</div>
              <div style={{ fontSize: 12 }}>Upload an X-ray from the patient study page</div>
            </div>
          ) : (
            <ClinicalViewer
              imageUrl={image.storageUrl}
              imageDims={imageDims}
              landmarks={localLandmarks}
              onLandmarkMoved={handleLandmarkMoved}
              onLandmarkSelected={setSelectedLandmark}
              selectedLandmark={selectedLandmark}
              activeTool={activeTool}
              layers={layers}
              brightness={brightness}
              contrast={contrast}
              invert={invert}
              highlightedMeasCode={highlightedMeas}
            />
          )}

          {/* AI Insight floating card */}
          {aiInsightVisible && diagnosis && (
            <div style={{
              position: 'absolute', bottom: 16, left: 16,
              background: 'rgba(10,13,18,0.92)',
              border: `1px solid ${T.accent}33`,
              borderRadius: 10, padding: '12px 16px',
              maxWidth: 240,
              backdropFilter: 'blur(12px)',
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${T.accent}14`,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                marginBottom: 10, paddingBottom: 8,
                borderBottom: `1px solid ${T.b1}`,
              }}>
                <Brain size={14} color={T.accent}/>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: T.accent, letterSpacing: '0.05em' }}>
                  AI INSIGHT
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { label: diagnosis.skeletalClass.replace('Class', 'Skeletal Class '), icon: <TrendingUp size={10}/> },
                  { label: `Vertical: ${diagnosis.verticalPattern}`, icon: <ChevronRight size={10}/> },
                  { label: diagnosis.maxillaryPosition !== 'Normal' ? `Maxilla: ${diagnosis.maxillaryPosition}` : null, icon: <ChevronRight size={10}/> },
                ].filter(i => i.label).map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: T.t1 }}>
                    <span style={{ color: T.accent, marginTop: 1 }}>{item.icon}</span>
                    {item.label}
                  </div>
                ))}
              </div>
              {diagnosis.summaryText && (
                <div style={{
                  marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.b1}`,
                  fontSize: 10, color: T.t2, lineHeight: 1.5,
                }}>
                  {diagnosis.summaryText.slice(0, 100)}{diagnosis.summaryText.length > 100 ? '…' : ''}
                </div>
              )}
            </div>
          )}

          {/* Detecting overlay */}
          {detectMut.isPending && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(6,8,9,0.6)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 12, backdropFilter: 'blur(4px)',
            }}>
              <Spinner size={36} />
              <div style={{ fontSize: 13, fontWeight: 600, color: T.t0 }}>
                AI detecting landmarks…
              </div>
              <div style={{ fontSize: 11, color: T.t3 }}>
                Analysing radiograph with deep learning model
              </div>
            </div>
          )}
        </div>

        {/* Right: Measurement panel */}
        <div style={{ width: 300, flexShrink: 0, overflow: 'hidden' }}>
          <MeasurementPanel
            measurements={measurements ?? []}
            diagnosis={diagnosis ?? null}
            highlightCode={highlightedMeas}
            onHighlight={setHighlightedMeas}
          />
        </div>
      </div>
    </div>
  );
}
