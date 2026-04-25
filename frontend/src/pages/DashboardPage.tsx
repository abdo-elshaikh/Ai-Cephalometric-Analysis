import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/services/api';
import {
  Users, FolderOpen, FlaskConical, CheckCircle2,
  Clock, TrendingUp, Activity,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/Loading';
import { formatDistanceToNow } from 'date-fns';

function StatCard({ icon, label, value, color, trend }: {
  icon: React.ReactNode; label: string; value: number | string;
  color: string; trend?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: color + '22' }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {trend && <div className="stat-trend text-success">{trend}</div>}
      </div>
    </div>
  );
}

import React from 'react';
import { SessionStatus } from '@/types';

function sessionStatusBadge(status: SessionStatus) {
  const map: Record<SessionStatus, string> = {
    Draft: 'muted', Processing: 'info', Completed: 'success', Failed: 'danger', Reviewed: 'accent',
  };
  return <span className={`badge badge-${map[status]}`}>{status}</span>;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.stats,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clinical Dashboard</h1>
          <p className="page-subtitle">Real-time overview of your cephalometric analysis platform</p>
        </div>
        <div style={{ marginLeft: 'auto', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)', animation:'pulse 2s infinite' }} />
          <span className="text-sm text-muted">Live</span>
        </div>
      </div>

      <div className="page-body">
        {/* Stats Grid */}
        <div className="grid-4" style={{ marginBottom: 32 }}>
          {isLoading ? (
            Array.from({length:4}).map((_,i) => (
              <div key={i} className="stat-card"><Skeleton width="100%" height="80px" /></div>
            ))
          ) : (
            <>
              <StatCard icon={<Users size={20} />} label="Total Patients" value={stats?.totalPatients ?? 0} color="var(--accent)" />
              <StatCard icon={<FolderOpen size={20} />} label="Total Studies" value={stats?.totalStudies ?? 0} color="var(--info)" />
              <StatCard icon={<FlaskConical size={20} />} label="Total Sessions" value={stats?.totalSessions ?? 0} color="#7c3aed" />
              <StatCard icon={<CheckCircle2 size={20} />} label="Completed" value={stats?.completedSessions ?? 0} color="var(--success)" />
            </>
          )}
        </div>

        {/* Recent Sessions */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Activity size={18} style={{ color:'var(--accent)' }} /> Recent Analysis Sessions
            </h2>
          </div>
          <div className="card-body" style={{ padding:0 }}>
            {isLoading ? (
              <div style={{ padding:'20px 24px' }}>
                {Array.from({length:4}).map((_,i) => <Skeleton key={i} height="48px" style={{ marginBottom:8 }} />)}
              </div>
            ) : !stats?.recentSessions?.length ? (
              <div className="empty-state" style={{ padding:'40px' }}>
                <Clock size={32} style={{ color:'var(--text-muted)' }} />
                <div className="empty-state-title">No sessions yet</div>
                <div className="empty-state-desc">Run your first AI detection to see results here.</div>
              </div>
            ) : (
              <div className="table-container" style={{ border:'none', borderRadius:0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Session ID</th>
                      <th>Analysis Type</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentSessions.map(s => (
                      <tr key={s.id}>
                        <td className="font-mono text-xs" style={{ color:'var(--text-secondary)' }}>
                          {s.id.slice(0,8)}…
                        </td>
                        <td><span className="badge badge-accent">{s.analysisType}</span></td>
                        <td>{sessionStatusBadge(s.status)}</td>
                        <td className="text-sm text-muted">
                          {s.totalDurationMs ? `${(s.totalDurationMs/1000).toFixed(1)}s` : '—'}
                        </td>
                        <td className="text-sm text-muted">
                          {s.completedAt
                            ? formatDistanceToNow(new Date(s.completedAt), { addSuffix: true })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid-3" style={{ marginTop: 24 }}>
          <a href="/patients/new" className="stat-card" style={{ textDecoration:'none', cursor:'pointer' }}>
            <div className="stat-icon" style={{ background:'var(--accent-dim)' }}>
              <Users size={20} style={{ color:'var(--accent)' }} />
            </div>
            <div>
              <div style={{ fontWeight:600, color:'var(--text-primary)' }}>New Patient</div>
              <div className="text-sm text-muted" style={{ marginTop:2 }}>Register a new patient record</div>
            </div>
          </a>
          <a href="/studies/new" className="stat-card" style={{ textDecoration:'none', cursor:'pointer' }}>
            <div className="stat-icon" style={{ background:'var(--info-dim)' }}>
              <FolderOpen size={20} style={{ color:'var(--info)' }} />
            </div>
            <div>
              <div style={{ fontWeight:600, color:'var(--text-primary)' }}>New Study</div>
              <div className="text-sm text-muted" style={{ marginTop:2 }}>Create a cephalometric study</div>
            </div>
          </a>
          <a href="/analysis" className="stat-card" style={{ textDecoration:'none', cursor:'pointer' }}>
            <div className="stat-icon" style={{ background:'rgba(124,58,237,0.12)' }}>
              <TrendingUp size={20} style={{ color:'#7c3aed' }} />
            </div>
            <div>
              <div style={{ fontWeight:600, color:'var(--text-primary)' }}>Run Analysis</div>
              <div className="text-sm text-muted" style={{ marginTop:2 }}>Detect landmarks & measurements</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
