import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { analysisApi, reportsApi, imagesApi } from '../api/client'
import LandmarkViewer from '../components/LandmarkViewer'
import ErrorBoundary from '../components/ErrorBoundary'
import {
  ArrowLeft, Brain, Ruler, Stethoscope, Clipboard, Image,
  Download, RefreshCw, CheckCircle, AlertTriangle, Info,
  Save, Activity, Clock, Cpu, Layers, BarChart2,
  TrendingUp, BookOpen, AlertCircle, ChevronDown, Maximize2, Minimize2,
  PanelRightClose, PanelRightOpen
} from 'lucide-react'
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer
} from 'recharts'
import toast from 'react-hot-toast'

// ── Design tokens ──────────────────────────────────────────────────────────
const T = {
  bg: '#07090f',
  surface: '#0e1119',
  surfaceHi: '#141824',
  border: 'rgba(255,255,255,0.06)',
  borderMed: 'rgba(255,255,255,0.10)',
  borderHi: 'rgba(255,255,255,0.16)',
  teal: '#2dd4bf',
  tealDim: 'rgba(45,212,191,0.10)',
  tealBorder: 'rgba(45,212,191,0.22)',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,0.10)',
  amber: '#f59e0b',
  amberDim: 'rgba(245,158,11,0.10)',
  red: '#f43f5e',
  redDim: 'rgba(244,63,94,0.10)',
  blue: '#60a5fa',
  blueDim: 'rgba(96,165,250,0.10)',
  violet: '#8b5cf6',
  text0: '#f8fafc',
  text1: '#94a3b8',
  text2: '#475569',
  text3: '#1e293b',
  mono: '"Geist Mono", "JetBrains Mono", "Fira Code", monospace',
  sans: '"Geist", "DM Sans", system-ui, sans-serif',
  r: '6px',
  rLg: '10px',
  rXl: '14px',
}

// ── Tiny helpers ─────────────────────────────────────────────────────────
const fmt = (v, d = 1) => v != null ? Number(v).toFixed(d) : '—'

const StatusChip = ({ status }) => {
  const map = {
    Normal: { bg: T.greenDim, color: T.green, border: 'rgba(34,197,94,0.22)' },
    High: { bg: T.redDim, color: T.red, border: 'rgba(244,63,94,0.22)' },
    Low: { bg: T.amberDim, color: T.amber, border: 'rgba(245,158,11,0.22)' },
    Finalized: { bg: T.greenDim, color: T.green, border: 'rgba(34,197,94,0.22)' },
    Processing: { bg: T.blueDim, color: T.blue, border: 'rgba(96,165,250,0.22)' },
    Pending: { bg: T.tealDim, color: T.teal, border: T.tealBorder },
  }
  const s = map[status] ?? { bg: T.surfaceHi, color: T.text1, border: T.border }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 10,
      fontWeight: 700, letterSpacing: '0.05em', fontFamily: T.mono,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {status}
    </span>
  )
}

const Spinner = ({ size = 16 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    border: `1.5px solid ${T.border}`, borderTopColor: T.teal,
    animation: 'spin 0.7s linear infinite', flexShrink: 0,
  }} />
)

const EmptyState = ({ icon: Icon, title, sub }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', gap: 12, textAlign: 'center' }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: T.surfaceHi, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${T.border}` }}>
      <Icon size={20} color={T.text2} />
    </div>
    <div style={{ fontSize: 13, fontWeight: 600, color: T.text1, fontFamily: T.sans }}>{title}</div>
    <div style={{ fontSize: 11, color: T.text2, fontFamily: T.sans, maxWidth: 220, lineHeight: 1.6 }}>{sub}</div>
  </div>
)

// ── Pipeline Steps ───────────────────────────────────────────────────────
function PipelineSteps({ session }) {
  const steps = [
    { key: 'landmarks', label: 'Landmarks', icon: Layers },
    { key: 'measurements', label: 'Measures', icon: Ruler },
    { key: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
    { key: 'treatment', label: 'Treatment', icon: Clipboard },
  ]
  const done = {
    landmarks: (session?.landmarkCount ?? 0) > 0,
    measurements: (session?.measurementCount ?? 0) > 0,
    diagnosis: session?.hasDiagnosis ?? false,
    treatment: session?.hasTreatment ?? false,
  }
  const activeIdx = steps.findIndex(s => !done[s.key])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {steps.map(({ key, label, icon: Icon }, i) => {
        const isDone = done[key]
        const isActive = i === activeIdx
        const isPast = i < activeIdx || activeIdx === -1
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 10px', borderRadius: 20,
              background: isDone ? T.greenDim : isActive ? T.tealDim : 'transparent',
              border: `1px solid ${isDone ? 'rgba(34,197,94,0.20)' : isActive ? T.tealBorder : T.border}`,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isDone ? 'rgba(34,197,94,0.15)' : isActive ? T.tealDim : T.surfaceHi,
              }}>
                {isDone
                  ? <CheckCircle size={11} color={T.green} />
                  : <Icon size={11} color={isActive ? T.teal : T.text2} />
                }
              </div>
              <span style={{
                fontSize: 11, fontWeight: isDone || isActive ? 600 : 400, fontFamily: T.sans,
                color: isDone ? T.green : isActive ? T.teal : T.text2,
              }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: 16, height: 1, background: isPast ? 'rgba(34,197,94,0.4)' : T.border }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Measurements Tab ─────────────────────────────────────────────────────
function MeasurementsTab({ sessionId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['measurements', sessionId],
    queryFn: () => analysisApi.getMeasurements(sessionId).then(r => r.data),
  })

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={24} /></div>
  if (!data?.length) return <EmptyState icon={Ruler} title="No measurements yet" sub="Run the AI pipeline to generate cephalometric measurements." />

  const grouped = data.reduce((acc, m) => {
    const cat = m.category ?? 'General'
      ; (acc[cat] = acc[cat] ?? []).push(m)
    return acc
  }, {})

  const normalCount = data.filter(m => m.status === 'Normal').length

  const radarData = data
    .filter(m => ['SNA', 'SNB', 'ANB', 'FMA', 'IMPA', 'U1-NA'].includes(m.code))
    .map(m => {
      const nm = (m.normalMin + m.normalMax) / 2
      const range = (m.normalMax - m.normalMin) || 1
      const score = 50 + ((m.value - nm) / range) * 20
      return { subject: m.code, val: Math.min(100, Math.max(0, score)), norm: 50 }
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[
          { label: 'Normal', count: data.filter(m => m.status === 'Normal').length, color: T.green },
          { label: 'Abnormal', count: data.filter(m => m.status !== 'Normal').length, color: T.amber },
          { label: 'Total', count: data.length, color: T.teal },
        ].map(({ label, count, color }) => (
          <div key={label} style={{ background: T.surfaceHi, borderRadius: T.r, padding: '10px 12px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 9, color: T.text2, fontFamily: T.mono, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: T.mono }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Radar */}
      {radarData.length > 0 && (
        <div style={{ background: T.surfaceHi, borderRadius: T.rLg, border: `1px solid ${T.border}`, padding: '14px 10px', height: 240, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 11, left: 14, fontSize: 9, fontWeight: 700, color: T.text2, fontFamily: T.mono, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Diagnostic Polygon</div>
          <ResponsiveContainer width="99%" height="100%">
            <RadarChart cx="50%" cy="55%" outerRadius="68%" data={radarData}>
              <PolarGrid stroke={T.border} />
              <PolarAngleAxis dataKey="subject" tick={{ fill: T.text1, fontSize: 9, fontFamily: T.mono }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="Patient" dataKey="val" stroke={T.teal} fill={T.teal} fillOpacity={0.18} strokeWidth={1.5} />
              <Radar name="Normal" dataKey="norm" stroke={T.green} fill="transparent" strokeDasharray="3 3" strokeWidth={1} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Groups */}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: T.text2, fontFamily: T.mono, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid ${T.border}` }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {items.map(m => {
              const isNormal = m.status === 'Normal'
              const isHigh = m.status === 'High'
              const color = isNormal ? T.green : isHigh ? T.red : T.amber
              const val = Number(m.value)
              const mn = Number(m.normalMin)
              const mx = Number(m.normalMax)
              const pct = Math.min(100, Math.max(0, ((val - mn) / ((mx - mn) || 1)) * 100))
              return (
                <div key={m.id}
                  style={{ display: 'grid', gridTemplateColumns: '44px 1fr 64px 26px 80px 56px', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: T.r, transition: 'background 0.12s', cursor: 'default' }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surfaceHi}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: T.teal }}>{m.code}</span>
                  <span style={{ fontFamily: T.sans, fontSize: 11, color: T.text1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  <div style={{ height: 2, borderRadius: 1, background: T.surfaceHi, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 1 }} />
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 700, color, textAlign: 'right' }}>{fmt(m.value)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: T.text2, textAlign: 'center' }}>
                    {fmt(m.normalMin)}–{fmt(m.normalMax)}{m.unit === 'Degrees' ? '°' : 'mm'}
                  </span>
                  <StatusChip status={m.status} />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Diagnosis Tab ────────────────────────────────────────────────────────
function DiagnosisTab({ sessionId }) {
  const { data: diag, isLoading } = useQuery({
    queryKey: ['diagnosis', sessionId],
    queryFn: () => analysisApi.getDiagnosis(sessionId).then(r => r.data),
  })

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={24} /></div>
  if (!diag) return <EmptyState icon={Stethoscope} title="No diagnosis yet" sub="Complete landmark detection and measurements first." />

  const primary = [
    { label: 'Skeletal Class', value: diag.skeletalClass, accent: T.teal },
    { label: 'Vertical Pattern', value: diag.verticalPattern, accent: T.blue },
    { label: 'Maxillary Position', value: diag.maxillaryPosition, accent: T.green },
    { label: 'Mandibular Position', value: diag.mandibularPosition, accent: T.amber },
  ]
  const secondary = [
    { label: 'Upper Incisor', value: diag.upperIncisorInclination },
    { label: 'Lower Incisor', value: diag.lowerIncisorInclination },
    { label: 'Soft Tissue Profile', value: diag.softTissueProfile },
    { label: 'Overjet', value: diag.overjetMm != null ? `${fmt(diag.overjetMm)} mm  ·  ${diag.overjetClassification ?? ''}` : '—' },
    { label: 'Overbite', value: diag.overbitesMm != null ? `${fmt(diag.overbitesMm)} mm  ·  ${diag.overbiteClassification ?? ''}` : '—' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        {primary.map(({ label, value, accent }) => (
          <div key={label} style={{ background: T.surfaceHi, borderRadius: T.rLg, padding: '12px 14px', border: `1px solid ${T.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: accent, borderRadius: '2px 0 0 2px' }} />
            <div style={{ fontSize: 9, color: T.text2, fontFamily: T.mono, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5, paddingLeft: 8 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text0, fontFamily: T.sans, paddingLeft: 8 }}>{value ?? '—'}</div>
          </div>
        ))}
      </div>

      <div style={{ background: T.surfaceHi, borderRadius: T.rLg, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        {secondary.map(({ label, value }, i) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, padding: '10px 14px', borderBottom: i < secondary.length - 1 ? `1px solid ${T.border}` : 'none' }}>
            <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, letterSpacing: '0.04em' }}>{label}</span>
            <span style={{ fontSize: 12, color: T.text0, fontFamily: T.sans, fontWeight: 500 }}>{value ?? '—'}</span>
          </div>
        ))}
      </div>

      {diag.confidenceScore != null && (
        <div style={{ background: T.surfaceHi, borderRadius: T.rLg, padding: '12px 14px', border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono }}>AI Confidence</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.green, fontFamily: T.mono }}>{(Number(diag.confidenceScore) * 100).toFixed(0)}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: T.surface, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Number(diag.confidenceScore) * 100}%`, background: `linear-gradient(90deg, ${T.teal}, ${T.green})`, borderRadius: 2 }} />
          </div>
        </div>
      )}

      {diag.summaryText && (
        <div style={{ background: T.blueDim, borderRadius: T.rLg, padding: '12px 14px', border: `1px solid rgba(96,165,250,0.18)`, display: 'flex', gap: 10 }}>
          <Info size={13} color={T.blue} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, lineHeight: 1.75, color: T.text1, fontFamily: T.sans, margin: 0 }}>{diag.summaryText}</p>
        </div>
      )}

      {diag.warnings?.length > 0 && (
        <div style={{ background: T.amberDim, borderRadius: T.rLg, padding: '12px 14px', border: `1px solid rgba(245,158,11,0.20)` }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 9 }}>
            <AlertTriangle size={13} color={T.amber} />
            <span style={{ fontSize: 10, fontWeight: 700, color: T.amber, fontFamily: T.mono, letterSpacing: '0.06em' }}>CLINICAL WARNINGS</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {diag.warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                <span style={{ color: T.amber, marginTop: 2 }}>›</span>
                <span style={{ fontSize: 11, color: T.text1, fontFamily: T.sans, lineHeight: 1.65 }}>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Treatment Tab ────────────────────────────────────────────────────────
function TreatmentTab({ sessionId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['treatment', sessionId],
    queryFn: () => analysisApi.getTreatment(sessionId).then(r => r.data),
  })

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={24} /></div>
  if (!data?.length) return <EmptyState icon={Clipboard} title="No treatment plans yet" sub="Finalize analysis to generate AI treatment recommendations." />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((t, idx) => (
        <div key={t.id} style={{
          background: T.surfaceHi, borderRadius: T.rXl, padding: '16px 18px',
          border: `1px solid ${t.isPrimary ? T.tealBorder : T.border}`,
          position: 'relative', overflow: 'hidden',
        }}>
          {t.isPrimary && (
            <div style={{ position: 'absolute', top: 0, right: 0, background: T.teal, padding: '3px 10px', borderRadius: '0 0 0 8px', fontSize: 9, fontWeight: 700, color: '#000', fontFamily: T.mono, letterSpacing: '0.07em' }}>PRIMARY</div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: t.isPrimary ? T.tealDim : T.surface, border: `1px solid ${t.isPrimary ? T.tealBorder : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: t.isPrimary ? T.teal : T.text2, fontFamily: T.mono }}>
              {idx + 1}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text0, fontFamily: T.sans, marginBottom: 5 }}>{t.treatmentName}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {[
                  t.treatmentType && { label: t.treatmentType, color: T.blue },
                  t.estimatedDurationMonths && { label: `${t.estimatedDurationMonths} mo`, color: T.text2 },
                  t.confidenceScore != null && { label: `${(Number(t.confidenceScore) * 100).toFixed(0)}%`, color: T.green },
                ].filter(Boolean).map(({ label, color }) => (
                  <span key={label} style={{ padding: '2px 7px', borderRadius: 20, fontSize: 9, fontWeight: 600, background: color + '15', color, border: `1px solid ${color}28`, fontFamily: T.mono }}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.75, color: T.text1, fontFamily: T.sans, margin: '0 0 8px' }}>{t.description}</p>
          {t.rationale && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, marginTop: 4, fontSize: 11, color: T.text1, fontFamily: T.sans }}>
              <span style={{ color: T.text2, fontFamily: T.mono, fontSize: 10, fontWeight: 700 }}>RATIONALE  </span>{t.rationale}
            </div>
          )}
          {t.risks && (
            <div style={{ marginTop: 8, padding: '7px 10px', background: T.redDim, borderRadius: T.r, border: `1px solid rgba(244,63,94,0.18)`, fontSize: 11, color: T.text1 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.red, fontFamily: T.mono }}>RISKS  </span>{t.risks}
            </div>
          )}
          {t.evidenceReference && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
              <BookOpen size={10} color={T.text2} />
              <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono }}>{t.evidenceReference}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Overlays Tab ─────────────────────────────────────────────────────────
function OverlaysTab({ sessionId }) {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['overlays', sessionId],
    queryFn: () => analysisApi.getOverlays(sessionId).then(r => r.data),
  })
  const regen = useMutation({
    mutationFn: () => analysisApi.generateOverlays(sessionId),
    onSuccess: () => { toast.success('Overlays generated'); qc.invalidateQueries(['overlays', sessionId]) },
    onError: err => toast.error(err.response?.data?.error || 'Failed'),
  })
  const urlFor = u => {
    const url = typeof u === 'string' ? u : u?.storageUrl
    if (!url) return ''
    return url.startsWith('http') ? url : (url.startsWith('uploads/') ? `/${url}` : `/uploads/${url}`)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => regen.mutate()} disabled={regen.isPending} style={btn('ghost')}>
          <RefreshCw size={12} style={{ animation: regen.isPending ? 'spin 0.7s linear infinite' : 'none' }} />
          {regen.isPending ? 'Generating…' : 'Regenerate'}
        </button>
      </div>
      {isLoading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={24} /></div>
        : !data?.length
          ? <EmptyState icon={Image} title="No overlays" sub="Click regenerate to create AI clinical overlay images." />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 10 }}>
              {data.map((entry, i) => (
                <div key={entry.key ?? i} style={{ borderRadius: T.rLg, overflow: 'hidden', border: `1px solid ${T.border}`, background: '#000', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.borderMed}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                  <img src={urlFor(entry)} alt={entry.label} style={{ width: '100%', display: 'block', aspectRatio: '4/3', objectFit: 'cover' }} />
                  <div style={{ padding: '7px 10px', background: T.surfaceHi, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: T.text2, fontFamily: T.mono, fontWeight: 700, textTransform: 'uppercase' }}>{entry.label}</span>
                    <a href={urlFor(entry)} download style={{ color: T.teal, display: 'flex' }}><Download size={11} /></a>
                  </div>
                </div>
              ))}
            </div>
          )
      }
    </div>
  )
}

// ── Button helper ─────────────────────────────────────────────────────────
function btn(variant = 'ghost', extra = {}) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: T.r, cursor: 'pointer',
    fontSize: 12, fontWeight: 600, fontFamily: T.sans,
    border: 'none', transition: 'all 0.14s', outline: 'none', whiteSpace: 'nowrap',
  }
  if (variant === 'primary') return { ...base, background: T.teal, color: '#000', border: 'none', ...extra }
  if (variant === 'danger') return { ...base, background: T.redDim, color: T.red, border: `1px solid rgba(244,63,94,0.22)`, ...extra }
  return { ...base, background: T.surfaceHi, color: T.text1, border: `1px solid ${T.border}`, ...extra }
}

// ────────────────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = useState('measurements')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [localLandmarks, setLocalLandmarks] = useState(null)
  const [unsaved, setUnsaved] = useState(false)
  const [viewerExpanded, setViewerExpanded] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => analysisApi.getSession(sessionId).then(r => r.data),
  })
  const { data: image } = useQuery({
    queryKey: ['image', session?.xRayImageId],
    queryFn: () => imagesApi.get(session.xRayImageId).then(r => r.data),
    enabled: !!session?.xRayImageId,
  })
  const { data: landmarksData } = useQuery({
    queryKey: ['landmarks', sessionId],
    queryFn: () => analysisApi.getLandmarks(sessionId).then(r => r.data),
    enabled: !!session,
  })

  useEffect(() => {
    if (landmarksData && !localLandmarks) {
      setLocalLandmarks(landmarksData)
      setHistory([landmarksData])
      setHistoryIdx(0)
    }
  }, [landmarksData, localLandmarks])

  const saveMut = useMutation({
    mutationFn: () => {
      const updates = localLandmarks.map(l => ({ landmarkCode: l.landmarkCode, x: l.xPx, y: l.yPx }))
      return analysisApi.updateLandmarks(sessionId, updates)
    },
    onSuccess: () => { toast.success('Saved'); setUnsaved(false); qc.invalidateQueries(['landmarks', sessionId]) },
    onError: () => toast.error('Save failed'),
  })

  const finalizeMut = useMutation({
    mutationFn: () => {
      const updates = unsaved ? localLandmarks.map(l => ({ landmarkCode: l.landmarkCode, x: l.xPx, y: l.yPx })) : []
      return analysisApi.finalize(sessionId, updates)
    },
    onSuccess: () => {
      toast.success('Analysis finalized')
      setUnsaved(false)
        ;['session', 'measurements', 'diagnosis', 'treatment', 'overlays'].forEach(k => qc.invalidateQueries([k, sessionId]))
    },
    onError: err => toast.error(err.response?.data?.error || 'Finalization failed'),
  })

  const generateReport = async () => {
    setGeneratingReport(true)
    try {
      await reportsApi.generate(sessionId, { includeImages: true, includeTreatment: true })
      toast.success('Report generated')
      navigate('/reports')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Report generation failed')
    } finally {
      setGeneratingReport(false)
    }
  }

  const handleLandmarkUpdate = (code, xPx, yPx) => {
    setLocalLandmarks(prev => prev.map(lm =>
      lm.landmarkCode === code ? { ...lm, xPx, yPx, isManuallyAdjusted: true } : lm
    ))
    setUnsaved(true)
  }

  const handleUpdateEnd = () => {
    const nextHistory = history.slice(0, historyIdx + 1)
    nextHistory.push(localLandmarks)
    if (nextHistory.length > 50) nextHistory.shift()
    setHistory(nextHistory)
    setHistoryIdx(nextHistory.length - 1)
  }

  const handleUndo = () => {
    if (historyIdx > 0) {
      const nextIdx = historyIdx - 1
      setHistoryIdx(nextIdx)
      setLocalLandmarks(history[nextIdx])
      setUnsaved(true)
    }
  }

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const nextIdx = historyIdx + 1
      setHistoryIdx(nextIdx)
      setLocalLandmarks(history[nextIdx])
      setUnsaved(true)
    }
  }

  const imageUrl = (() => {
    const u = image?.storageUrl
    if (!u) return null
    return u.startsWith('http') ? u : u.startsWith('uploads/') ? `/${u}` : `/uploads/${u}`
  })()

  const tabs = [
    { key: 'measurements', label: 'Measurements', icon: BarChart2 },
    { key: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
    { key: 'treatment', label: 'Treatment', icon: TrendingUp },
    { key: 'overlays', label: 'AI Overlays', icon: Image },
  ]

  const metaItems = [
    { label: 'Landmarks', value: session?.landmarkCount ?? 0, icon: Layers },
    { label: 'Measures', value: session?.measurementCount ?? 0, icon: Ruler },
    { label: 'Model', value: session?.modelVersion ?? 'v1.0', icon: Cpu },
    { label: 'Inference', value: session?.inferenceDurationMs ? `${session.inferenceDurationMs}ms` : '—', icon: Activity },
  ]

  if (isLoading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: T.bg }}>
      <Spinner size={28} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, fontFamily: T.sans }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px }
        ::-webkit-scrollbar-thumb:hover { background: ${T.borderMed} }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        height: 52, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 18px', borderBottom: `1px solid ${T.border}`,
        background: T.surface, flexShrink: 0, zIndex: 50, position: 'sticky', top: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: T.r, background: T.surfaceHi, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.text1 }}>
          <ArrowLeft size={14} />
        </button>

        <div style={{ width: 1, height: 18, background: T.border }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: T.tealDim, border: `1px solid ${T.tealBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={13} color={T.teal} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text0, lineHeight: 1 }}>Analysis Session</div>
            <div style={{ fontSize: 9, color: T.text2, fontFamily: T.mono, marginTop: 2 }}>{sessionId}</div>
          </div>
        </div>

        <StatusChip status={session?.status} />

        <div style={{ flex: 1 }} />

        <PipelineSteps session={session} />

        <div style={{ flex: 1 }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {unsaved && (
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} style={btn('ghost')}>
              {saveMut.isPending ? <Spinner size={12} /> : <Save size={12} />}
              {saveMut.isPending ? 'Saving…' : 'Save'}
            </button>
          )}
          <button onClick={() => finalizeMut.mutate()} disabled={finalizeMut.isPending || session?.status === 'Finalized'} style={btn('ghost')}>
            {finalizeMut.isPending ? <Spinner size={12} /> : <CheckCircle size={12} />}
            {finalizeMut.isPending ? 'Finalizing…' : 'Finalize'}
          </button>
          <button onClick={generateReport} disabled={generatingReport} style={btn('primary')}>
            {generatingReport ? <Spinner size={12} /> : <Download size={12} />}
            {generatingReport ? 'Exporting…' : 'Export Report'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left: Viewer ── */}
        <div style={{
          flex: viewerExpanded ? '1 1 100%' : '1 1 58%',
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${T.border}`,
          transition: 'flex 0.28s ease', overflow: 'hidden',
        }}>
          {/* Viewer header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', height: 40, borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Brain size={12} color={T.teal} />
              <span style={{ fontSize: 11, fontWeight: 500, color: T.text1 }}>
                {session?.status === 'Finalized' ? 'Annotated Radiograph' : 'Landmark Editor'}
              </span>
              {unsaved && (
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: T.amberDim, color: T.amber, border: `1px solid rgba(245,158,11,0.22)`, fontFamily: T.mono, animation: 'fadeIn 0.2s ease' }}>
                  ● unsaved
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setViewerExpanded(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: T.r, background: T.surfaceHi, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.text2 }}>
                {viewerExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
              </button>
              <button onClick={() => setRightPanelOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: T.r, background: T.surfaceHi, border: `1px solid ${T.border}`, cursor: 'pointer', color: T.text2 }}>
                {rightPanelOpen ? <PanelRightClose size={11} /> : <PanelRightOpen size={11} />}
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ErrorBoundary>
              {session?.status === 'Finalized' && session?.resultImageUrl ? (
                <img
                  src={session.resultImageUrl.startsWith('http') ? session.resultImageUrl : (session.resultImageUrl.startsWith('uploads/') ? `/${session.resultImageUrl}` : `/uploads/${session.resultImageUrl}`)}
                  alt="Annotated X-ray"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', background: T.bg }}
                />
              ) : imageUrl ? (
                <LandmarkViewer
                  imageUrl={imageUrl}
                  landmarks={localLandmarks || []}
                  onUpdate={handleLandmarkUpdate}
                  onUpdateEnd={handleUpdateEnd}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  canUndo={historyIdx > 0}
                  canRedo={historyIdx < history.length - 1}
                  readOnly={session?.status === 'Finalized'}
                />
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: T.bg }}>
                  <Spinner size={24} />
                </div>
              )}
            </ErrorBoundary>
          </div>

          {/* Viewer footer */}
          <div style={{ display: 'flex', alignItems: 'center', height: 32, borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
            {metaItems.map(({ label, value, icon: Icon }, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 12px', borderRight: i < metaItems.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                <Icon size={10} color={T.text2} />
                <span style={{ fontSize: 9, color: T.text2, fontFamily: T.mono }}>{label}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.text1, fontFamily: T.mono }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Analysis panel ── */}
        {rightPanelOpen && !viewerExpanded && (
          <div style={{ flex: '0 0 42%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface, animation: 'fadeIn 0.2s ease' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', height: 40, borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflowX: 'auto' }}>
              {tabs.map(({ key, label, icon: Icon }) => {
                const active = tab === key
                return (
                  <button key={key} onClick={() => setTab(key)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '0 16px', height: '100%', border: 'none', cursor: 'pointer',
                    background: 'transparent', fontFamily: T.sans, fontSize: 11,
                    fontWeight: active ? 600 : 400, color: active ? T.teal : T.text2,
                    borderBottom: `2px solid ${active ? T.teal : 'transparent'}`,
                    transition: 'all 0.14s', whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    <Icon size={12} />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
              <ErrorBoundary>
                {tab === 'measurements' && <MeasurementsTab sessionId={sessionId} />}
                {tab === 'diagnosis' && <DiagnosisTab sessionId={sessionId} />}
                {tab === 'treatment' && <TreatmentTab sessionId={sessionId} />}
                {tab === 'overlays' && <OverlaysTab sessionId={sessionId} />}
              </ErrorBoundary>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
