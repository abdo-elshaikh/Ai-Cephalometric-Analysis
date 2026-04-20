import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../api/client'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  Users, Activity, FileText, Brain, TrendingUp,
  CheckCircle, Clock, AlertTriangle, Zap
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

function StatCard({ icon: Icon, label, value, sub, color = 'var(--accent-primary)' }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon"><Icon size={20} color={color} /></div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value ?? <div className="skeleton" style={{ height: 32, width: 80 }} />}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card" style={{ padding: '10px 14px', minWidth: 120 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontSize: '0.85rem', color: p.color, fontWeight: 600 }}>
          {p.value} {p.name}
        </div>
      ))}
    </div>
  )
}

const QUICK_ACTIONS = [
  { icon: Users,    label: 'Register Patient',  sub: 'Add a new patient record',        to: '/patients',  color: 'var(--accent-primary)', id: 'qa-patients' },
  { icon: Activity, label: 'View History',       sub: 'Browse all analysis sessions',    to: '/history',   color: 'var(--success)',        id: 'qa-history' },
  { icon: FileText, label: 'Clinical Reports',   sub: 'Download PDF ceph reports',       to: '/reports',   color: 'var(--info)',           id: 'qa-reports' },
  { icon: Brain,    label: 'AI Analysis',        sub: 'Start from a patient study',      to: '/patients',  color: 'var(--warning)',        id: 'qa-ai' },
]

export default function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats().then(r => r.data),
    refetchInterval: 30000,
  })

  const chartData = stats?.recentActivity ?? [
    { day: 'Mon', analyses: 3 }, { day: 'Tue', analyses: 7 },
    { day: 'Wed', analyses: 5 }, { day: 'Thu', analyses: 9 },
    { day: 'Fri', analyses: 12 }, { day: 'Sat', analyses: 4 },
    { day: 'Sun', analyses: 8 },
  ]

  const displayName = user?.firstName
    ? `Dr. ${user.firstName} ${user.lastName ?? ''}`.trim()
    : `Dr. ${user?.email?.split('@')[0] ?? 'Doctor'}`

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <div className="page-subtitle">
            Welcome back, <strong style={{ color: 'var(--accent-primary)' }}>{displayName}</strong>
            {' '}— here's your clinical overview
          </div>
        </div>
        <button id="dash-new-patient" className="btn btn-primary" onClick={() => navigate('/patients')}>
          <Users size={16} /> New Patient
        </button>
      </div>

      {/* Quick actions */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {QUICK_ACTIONS.map(({ icon: Icon, label, sub, to, color, id }) => (
          <button key={id} id={id} onClick={() => navigate(to)} style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
            padding: '18px 20px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.boxShadow = `0 0 0 1px ${color}33, 0 4px 20px rgba(0,0,0,0.4)` }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = ''; e.currentTarget.style.boxShadow = '' }}>
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color}30` }}>
              <Icon size={18} color={color} />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard icon={Users}      label="Total Patients"     value={stats?.totalPatients}       sub="Registered" />
        <StatCard icon={Activity}   label="Total Analyses"     value={stats?.totalAnalyses}       sub="All time"         color="var(--success)" />
        <StatCard icon={FileText}   label="Reports Generated"  value={stats?.totalReports}        sub="PDF & clinical"   color="var(--info)" />
        <StatCard icon={Brain}      label="Pending Sessions"   value={stats?.pendingSessions}     sub="Awaiting review"  color="var(--warning)" />
      </div>

      {/* Charts + Clinical breakdown */}
      <div className="grid-2" style={{ marginBottom: 24, alignItems: 'start' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title"><TrendingUp size={16} color="var(--accent-primary)" />Weekly Activity</div>
          </div>
          <ResponsiveContainer width="99%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="analyses" name="analyses" stroke="var(--accent-primary)" strokeWidth={2} fill="url(#aGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><Zap size={16} color="var(--accent-primary)" />Skeletal Classification</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Class I Skeletal',   val: stats?.classI   ?? 0, total: stats?.totalAnalyses ?? 1, color: 'var(--success)' },
              { label: 'Class II Skeletal',  val: stats?.classII  ?? 0, total: stats?.totalAnalyses ?? 1, color: 'var(--warning)' },
              { label: 'Class III Skeletal', val: stats?.classIII ?? 0, total: stats?.totalAnalyses ?? 1, color: 'var(--danger)' },
              { label: 'Finalized Sessions', val: stats?.completedSessions ?? 0, total: stats?.totalAnalyses ?? 1, color: 'var(--accent-primary)' },
            ].map(({ label, val, total, color }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color }}>
                    {val}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                      {' '}({total > 0 ? Math.round((val / total) * 100) : 0}%)
                    </span>
                  </span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${total > 0 ? (val / total) * 100 : 0}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent analyses */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Clock size={16} color="var(--accent-primary)" />Recent Analysis History</div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>View All →</button>
        </div>
        {stats?.recentSessions?.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th><th>MRN</th><th>Type</th><th>Status</th><th>Skeletal Class</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentSessions.slice(0, 8).map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/analysis/${s.id}`)}>
                    <td style={{ fontWeight: 600 }}>{s.patientName}</td>
                    <td><code style={{ fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{s.patientMrn}</code></td>
                    <td><span className="badge badge-accent">{s.analysisType}</span></td>
                    <td>
                      <span className={`badge ${s.status === 'Finalized' ? 'badge-success' : s.status === 'Failed' ? 'badge-danger' : 'badge-warning'}`}>
                        {s.status === 'Finalized' ? <CheckCircle size={10} /> : <Clock size={10} />}
                        {s.status}
                      </span>
                    </td>
                    <td>{s.skeletalClass ? <span className="badge badge-info">{s.skeletalClass}</span> : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {s.completedAt ? new Date(s.completedAt).toLocaleDateString() : new Date(s.queuedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <Brain size={44} style={{ opacity: 0.25 }} />
            <h3 style={{ marginBottom: 8 }}>No analyses yet</h3>
            <p style={{ marginBottom: 20 }}>Register a patient, upload an X-ray, calibrate it, then run the AI pipeline.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" id="dash-start-btn" onClick={() => navigate('/patients')}>
                <Users size={16} /> Register First Patient
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/history')}>
                <Activity size={16} /> View History
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
