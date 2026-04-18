import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Activity, Stethoscope, Pill,
  FileText, RefreshCw, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Images
} from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';
import OverlayGallery from '../components/OverlayGallery';

interface MeasurementItem {
  id: string;
  code: string;
  name: string;
  category?: string;
  measurementType: string;
  value: number;
  unit: string;
  normalMin: number;
  normalMax: number;
  status: string;
  deviation?: number;
}

interface DiagnosisData {
  id: string;
  skeletalClass: string;
  verticalPattern: string;
  maxillaryPosition: string;
  mandibularPosition: string;
  upperIncisorInclination: string;
  lowerIncisorInclination: string;
  softTissueProfile?: string;
  overjetMm?: number;
  overjetClassification?: string;
  overbitesMm?: number;
  overbiteClassification?: string;
  confidenceScore?: number;
  summaryText?: string;
  warnings?: string[];
}

interface TreatmentItem {
  id: string;
  planIndex: number;
  treatmentType: string;
  treatmentName: string;
  description: string;
  rationale?: string;
  risks?: string;
  estimatedDurationMonths?: number;
  confidenceScore?: number;
  source: string;
  isPrimary: boolean;
}

interface SessionData {
  id: string;
  xRayImageId: string;
  status: string;
  resultImageUrl?: string;
}

export default function ResultsPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [treatments, setTreatments] = useState<TreatmentItem[]>([]);
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'measurements' | 'diagnosis' | 'treatment' | 'visuals'>('measurements');
  const [expandedTreatment, setExpandedTreatment] = useState<number | null>(0);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [sessionId]);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const [sessRes, measRes, diagRes, treatRes] = await Promise.allSettled([
        api.get(`/analysis/sessions/${sessionId}`),
        api.get(`/analysis/sessions/${sessionId}/measurements`),
        api.get(`/analysis/sessions/${sessionId}/diagnosis`),
        api.get(`/analysis/sessions/${sessionId}/treatment`),
      ]);

      if (sessRes.status === 'fulfilled') setSession(sessRes.value.data);
      if (measRes.status === 'fulfilled') setMeasurements(measRes.value.data);
      if (diagRes.status === 'fulfilled') setDiagnosis(diagRes.value.data);
      if (treatRes.status === 'fulfilled') setTreatments(treatRes.value.data);
    } catch {
      toast.error('Failed to load results');
    }
    setLoading(false);
  };

  const handleRunMeasurements = async () => {
    try {
      toast.loading('Calculating measurements...', { id: 'meas' });
      const res = await api.post(`/analysis/sessions/${sessionId}/measurements`);
      setMeasurements(res.data);
      toast.success('Measurements calculated!', { id: 'meas' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed', { id: 'meas' });
    }
  };

  const handleRunDiagnosis = async () => {
    try {
      toast.loading('Classifying diagnosis...', { id: 'diag' });
      const res = await api.post(`/analysis/sessions/${sessionId}/diagnosis`);
      setDiagnosis(res.data);
      toast.success('Diagnosis complete!', { id: 'diag' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed', { id: 'diag' });
    }
  };

  const handleRunTreatment = async () => {
    try {
      toast.loading('Generating treatment plans...', { id: 'treat' });
      const res = await api.post(`/analysis/sessions/${sessionId}/treatment`);
      setTreatments(res.data);
      toast.success('Treatment plan generated!', { id: 'treat' });
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed', { id: 'treat' });
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    const toastId = toast.loading('Assembling Clinical Report...');
    try {
      const res = await api.post(`/reports/sessions/${sessionId}`, {
        includesXray: true,
        includesLandmarkOverlay: true,
        includesMeasurements: true,
        includesTreatmentPlan: true
      });

      const { storageUrl } = res.data;
      if (storageUrl) {
        // Construct full URL if it's relative
        const fullUrl = storageUrl.startsWith('http')
          ? storageUrl
          : `${api.defaults.baseURL?.replace('/api', '')}/${storageUrl}`;

        window.open(fullUrl, '_blank');
        toast.success('Report ready for download!', { id: toastId });
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to generate report', { id: toastId });
    }
    setGeneratingReport(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Normal': return 'var(--color-success, #10b981)';
      case 'Increased': return 'var(--color-warning, #f59e0b)';
      case 'Decreased': return 'var(--color-error, #ef4444)';
      default: return 'var(--color-text-secondary)';
    }
  };

  const tabs = [
    { key: 'measurements', label: 'Measurements', icon: BarChart3, count: measurements.length },
    { key: 'diagnosis',    label: 'Diagnosis',    icon: Stethoscope, count: diagnosis ? 1 : 0 },
    { key: 'treatment',   label: 'Treatment',    icon: Pill,        count: treatments.length },
    { key: 'visuals',     label: 'Clinical Visuals', icon: Images,  count: 0 },
  ] as const;

  return (
    <div className="page-container" style={{ maxWidth: 1100 }}>
      <header className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ padding: 8 }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="page-title" style={{ fontSize: '1.4rem', fontWeight: 800, background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Case File: Clinical Draft</h1>
            <p className="page-subtitle" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={12} className="text-success" /> All clinical modules drafted automatically
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-primary"
            onClick={handleGenerateReport}
            disabled={!measurements.length || generatingReport}
            style={{
              background: 'var(--gradient-brand)',
              border: 'none',
              boxShadow: '0 4px 12px rgba(99,120,255,0.3)'
            }}
          >
            {generatingReport ? (
              <Activity size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {generatingReport ? 'Generating...' : 'Generate Full Report'}
          </button>

          <div style={{ width: 1, backgroundColor: 'var(--color-border)', margin: '0 5px' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recalculate:</span>
            <button className="btn btn-ghost" onClick={handleRunMeasurements} style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
              <RefreshCw size={12} /> Metrics
            </button>
            <button className="btn btn-ghost" onClick={handleRunDiagnosis} disabled={!measurements.length} style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
              <Stethoscope size={12} /> Diagnosis
            </button>
            <button className="btn btn-ghost" onClick={handleRunTreatment} disabled={!diagnosis} style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
              <Pill size={12} /> Treatment
            </button>
          </div>
        </div>
      </header>

      {/* AI Overlay snapshot — kept as compact preview above tabs */}
      {session?.resultImageUrl && activeTab !== 'visuals' && (
        <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 6px 24px rgba(0,0,0,0.25)' }}>
          <div style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.68rem', fontWeight: 600, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            SKIA MARKUP SNAPSHOT
            <button onClick={() => setActiveTab('visuals')} style={{ marginLeft: 'auto', background: 'rgba(99,120,255,0.12)', border: 'none', color: '#818cf8', padding: '2px 10px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Images size={11} /> View AI Overlays
            </button>
          </div>
          <img src={session.resultImageUrl} alt="Clinical Markup" style={{ width: '100%', display: 'block', maxHeight: 260, objectFit: 'cover' }} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--color-border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '10px 18px',
              border: 'none',
              background: 'none',
              color: activeTab === t.key ? 'var(--color-brand)' : 'var(--color-text-muted)',
              borderBottom: activeTab === t.key ? '2px solid var(--color-brand)' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.85rem',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
          >
            <t.icon size={16} /> {t.label}
            {t.count > 0 && (
              <span style={{
                background: activeTab === t.key ? 'rgba(99,120,255,0.15)' : 'rgba(255,255,255,0.05)',
                padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem'
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-muted)' }}>
          <Activity size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 12 }}>Loading results...</p>
        </div>
      ) : (
        <>
          {/* Measurements Tab */}
          {activeTab === 'measurements' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {measurements.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <BarChart3 size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <p>No measurements yet. Click "Run Measurements" to calculate.</p>
                </div>
              ) : (
                Object.entries(
                  measurements.reduce((acc, m) => {
                    const cat = m.category || 'Standard';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(m);
                    return acc;
                  }, {} as Record<string, MeasurementItem[]>)
                ).map(([category, items]) => (
                  <div key={category} className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-brand)' }}>{category} Analysis</h3>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{items.length} Metrics</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          {['Code', 'Measurement', 'Value', 'Normal Range', 'Status', 'Deviation'].map(h => (
                            <th key={h} style={{
                              padding: '12px 16px', textAlign: 'left', fontSize: '0.75rem',
                              fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(m => (
                          <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '10px 16px', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-brand)' }}>
                              {m.code}
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: '0.85rem' }}>{m.name}</td>
                            <td style={{ padding: '10px 16px', fontSize: '0.85rem', fontWeight: 600 }}>
                              {m.value.toFixed(1)}{m.unit === 'Degrees' ? '°' : ' mm'}
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              {m.normalMin.toFixed(1)} – {m.normalMax.toFixed(1)}
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <span style={{
                                padding: '3px 10px', borderRadius: 12,
                                fontSize: '0.75rem', fontWeight: 600,
                                background: `${getStatusColor(m.status)}15`,
                                color: getStatusColor(m.status),
                              }}>{m.status}</span>
                            </td>
                            <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: m.deviation ? getStatusColor(m.status) : 'var(--color-text-muted)' }}>
                              {m.deviation ? `${m.deviation > 0 ? '+' : ''}${m.deviation.toFixed(1)}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Diagnosis Tab */}
          {activeTab === 'diagnosis' && (
            <div>
              {!diagnosis ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <Stethoscope size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <p>No diagnosis yet. Run measurements first, then classify.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: 16, color: 'var(--color-text-muted)' }}>Skeletal & Soft Tissue</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <DiagnosisItem label="Skeletal Class" value={diagnosis.skeletalClass} />
                      <DiagnosisItem label="Vertical Pattern" value={diagnosis.verticalPattern} />
                      <DiagnosisItem label="Jaw (Mx)" value={diagnosis.maxillaryPosition} />
                      <DiagnosisItem label="Jaw (Mn)" value={diagnosis.mandibularPosition} />
                      <DiagnosisItem label="Soft Tissue" value={diagnosis.softTissueProfile || 'N/A'} />
                    </div>
                  </div>
                  <div className="card" style={{ padding: 24 }}>
                    <h3 style={{ fontSize: '0.9rem', marginBottom: 16, color: 'var(--color-text-muted)' }}>Dental Assessment</h3>
                    <div style={{ display: 'grid', gap: 12 }}>
                      <DiagnosisItem label="Upper Incisor" value={diagnosis.upperIncisorInclination} />
                      <DiagnosisItem label="Lower Incisor" value={diagnosis.lowerIncisorInclination} />
                      <DiagnosisItem label="Overjet" value={
                        diagnosis.overjetMm != null
                          ? `${diagnosis.overjetMm.toFixed(1)} mm (${diagnosis.overjetClassification || 'Normal'})`
                          : 'N/A'
                      } />
                      <DiagnosisItem label="Overbite" value={
                        diagnosis.overbitesMm != null
                          ? `${diagnosis.overbitesMm.toFixed(1)} mm (${diagnosis.overbiteClassification || 'Normal'})`
                          : 'N/A'
                      } />
                    </div>
                  </div>
                  {diagnosis.warnings && diagnosis.warnings.length > 0 && (
                    <div className="card" style={{ padding: 16, gridColumn: '1 / -1', border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)' }}>
                      <h4 style={{ fontSize: '0.8rem', color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <AlertCircle size={14} /> Clinical Warnings
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {diagnosis.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {diagnosis.summaryText && (
                    <div className="card" style={{ padding: 24, gridColumn: '1 / -1' }}>
                      <h3 style={{ fontSize: '0.9rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={16} /> Clinical Summary
                      </h3>
                      <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
                        {diagnosis.summaryText}
                      </p>
                      {diagnosis.confidenceScore != null && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 12 }}>
                          Confidence: {(diagnosis.confidenceScore * 100).toFixed(0)}%
                        </p>
                      )}
                    </div>
                  )}

                  {/* Harmonic Box Visualization */}
                  {measurements.some(m => m.code === 'JRatio') && (
                    <div className="card" style={{ padding: 24, gridColumn: '1 / -1', background: 'rgba(99,120,255,0.03)', border: '1px solid rgba(99,120,255,0.1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Activity size={18} className="text-brand" /> Jarabak Harmonic Box
                          </h3>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Facial Growth Pattern Assessment (PFH/AFH)</p>
                        </div>
                        {(() => {
                          const ratio = measurements.find(m => m.code === 'JRatio')?.value || 0;
                          let type = "Neutral";
                          let color = "var(--color-success)";
                          if (ratio < 59) { type = "Clockwise (Long Face)"; color = "var(--color-error)"; }
                          else if (ratio > 63) { type = "Counter-Clockwise (Short Face)"; color = "var(--color-warning)"; }

                          return (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{ratio.toFixed(1)}%</div>
                              <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{type}</div>
                            </div>
                          );
                        })()}
                      </div>

                      <div style={{ display: 'flex', gap: 30, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 6 }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Ratio Scale</span>
                            <span style={{ fontWeight: 600 }}>Optimal: 62% - 65%</span>
                          </div>
                          <div style={{ height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', left: '0%', width: '59%', height: '100%', background: 'rgba(239,68,68,0.2)' }} /> {/* Low */}
                            <div style={{ position: 'absolute', left: '59%', width: '4%', height: '100%', background: 'rgba(16,185,129,0.3)' }} /> {/* Neutral */}
                            <div style={{ position: 'absolute', left: '63%', width: '37%', height: '100%', background: 'rgba(245,158,11,0.2)' }} /> {/* High */}

                            {/* Marker */}
                            {(() => {
                              const ratio = measurements.find(m => m.code === 'JRatio')?.value || 0;
                              const pos = Math.min(100, Math.max(0, (ratio / 80) * 100)); // Scaled to 80 max for visual
                              return (
                                <div style={{
                                  position: 'absolute', left: `${pos}%`, top: 0, width: 3, height: '100%',
                                  background: 'white', boxShadow: '0 0 8px rgba(255,255,255,0.8)', zIndex: 10
                                }} />
                              );
                            })()}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: 4, color: 'var(--color-text-muted)' }}>
                            <span>Clockwise</span>
                            <span>Neutral</span>
                            <span>Counter-Clockwise</span>
                          </div>
                        </div>

                        <div style={{ width: 150, display: 'grid', gap: 8 }}>
                          <div className="card" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: 'none' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>S-Go (PFH)</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{measurements.find(m => m.code === 'PFH')?.value.toFixed(1)} mm</div>
                          </div>
                          <div className="card" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', border: 'none' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>N-Me (AFH)</div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{measurements.find(m => m.code === 'AFH')?.value.toFixed(1)} mm</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Treatment Tab */}
          {activeTab === 'treatment' && (
            <div>
              {treatments.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  <Pill size={40} style={{ opacity: 0.3, marginBottom: 10 }} />
                  <p>No treatment plans yet. Run diagnosis first, then generate treatment plans.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {treatments.map((t, idx) => (
                    <div key={t.id} className="card" style={{
                      padding: 0,
                      border: t.isPrimary ? '1px solid rgba(99,120,255,0.3)' : undefined,
                      overflow: 'hidden'
                    }}>
                      <button
                        onClick={() => setExpandedTreatment(expandedTreatment === idx ? null : idx)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '16px 20px',
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 12,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          background: t.isPrimary ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.05)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.8rem', fontWeight: 700, color: t.isPrimary ? 'white' : 'var(--color-text-muted)'
                        }}>
                          {t.planIndex + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {t.treatmentName}
                            <div style={{ display: 'flex', gap: 6 }}>
                              {t.isPrimary && (
                                <span style={{
                                  fontSize: '0.65rem', padding: '2px 8px', borderRadius: 8,
                                  background: 'rgba(16,185,129,0.15)', color: 'var(--color-success)', fontWeight: 600
                                }}>PRIMARY</span>
                              )}
                              {t.source === 'LLM' && (
                                <span style={{
                                  fontSize: '0.65rem', padding: '2px 8px', borderRadius: 8,
                                  background: 'rgba(99,120,255,0.15)', color: 'var(--color-brand)', fontWeight: 600,
                                  display: 'flex', alignItems: 'center', gap: 4
                                }}>
                                  <Activity size={10} /> AI-GENERATED
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {t.treatmentType} • {t.source === 'LLM' ? 'Generative AI' : 'Clinical Rules'}
                            {t.estimatedDurationMonths && ` • ~${t.estimatedDurationMonths} months`}
                          </div>
                        </div>
                        {t.confidenceScore != null && (
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-brand)' }}>
                            {(t.confidenceScore * 100).toFixed(0)}%
                          </span>
                        )}
                        {expandedTreatment === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {expandedTreatment === idx && (
                        <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--color-border)' }}>
                          <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                            <div>
                              <h4 style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase' }}>Description</h4>
                              <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{t.description}</p>
                            </div>
                            {t.rationale && (
                              <div>
                                <h4 style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={12} /> Rationale
                                </h4>
                                <p style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>{t.rationale}</p>
                              </div>
                            )}
                            {t.risks && (
                              <div>
                                <h4 style={{ fontSize: '0.75rem', color: 'var(--color-warning, #f59e0b)', marginBottom: 4, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <AlertCircle size={12} /> Risks
                                </h4>
                                <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{t.risks}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Clinical Visuals Tab */}
          {activeTab === 'visuals' && sessionId && (
            <div style={{ animation: 'fadeInUp 0.35s ease' }}>
              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
                padding: '14px 20px', borderRadius: 14,
                background: 'linear-gradient(135deg,rgba(99,120,255,0.07),rgba(168,85,247,0.05))',
                border: '1px solid rgba(99,120,255,0.12)',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg,#6366f1,#a855f7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Images size={20} color="white" />
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                    AI Clinical Overlay Images
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    5 professional clinical visualizations rendered by the AI microservice
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Tracing', 'Measurements', 'Wiggle Chart', 'Tracing Only', 'Table'].map(tag => (
                    <span key={tag} style={{
                      padding: '2px 8px', borderRadius: 6,
                      background: 'rgba(99,120,255,0.1)',
                      border: '1px solid rgba(99,120,255,0.15)',
                      fontSize: '0.65rem', fontWeight: 600, color: '#818cf8',
                    }}>{tag}</span>
                  ))}
                </div>
              </div>

              <OverlayGallery sessionId={sessionId} allowGenerate={!!measurements.length} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DiagnosisItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{
        fontSize: '0.85rem', fontWeight: 600,
        padding: '3px 12px', borderRadius: 8,
        background: 'rgba(99,120,255,0.08)',
        color: 'var(--color-brand)'
      }}>{value}</span>
    </div>
  );
}
