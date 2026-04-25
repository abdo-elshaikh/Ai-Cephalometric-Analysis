import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analysisApi } from '@/services/api';
import { AnalysisSession, AnalysisType, SessionStatus, SkeletalClass } from '@/types';
import { TableSkeleton, EmptyState } from '@/components/ui/Loading';
import { History, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';

const ANALYSIS_TYPES: AnalysisType[] = ['Steiner','McNamara','Ricketts','Eastman','Jarabak','Tweed','Downs','Full'];
const STATUSES: SessionStatus[] = ['Draft','Processing','Completed','Failed','Reviewed'];

export default function HistoryPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ searchTerm:'', type:'' as AnalysisType | '', status:'' as SessionStatus | '' });

  const { data, isLoading } = useQuery({
    queryKey: ['history', filters],
    queryFn: () => analysisApi.history({
      searchTerm: filters.searchTerm || undefined,
      type: (filters.type as AnalysisType) || undefined,
      status: (filters.status as SessionStatus) || undefined,
    }),
    placeholderData: d => d,
  });

  const statusColor: Record<SessionStatus, string> = {
    Draft:'muted', Processing:'info', Completed:'success', Failed:'danger', Reviewed:'accent',
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analysis History</h1>
          <p className="page-subtitle">{data?.length ?? 0} sessions found</p>
        </div>
      </div>

      <div className="page-body">
        <div className="filter-bar" style={{ marginBottom:20 }}>
          <input
            className="form-input"
            style={{ flex:1, minWidth:200 }}
            placeholder="Search…"
            value={filters.searchTerm}
            onChange={e => setFilters(f => ({ ...f, searchTerm: e.target.value }))}
          />
          <select className="form-select" style={{ width:160 }} value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value as AnalysisType | '' }))}>
            <option value="">All Types</option>
            {ANALYSIS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-select" style={{ width:140 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value as SessionStatus | '' }))}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? <TableSkeleton rows={8} cols={5} /> : !data?.length ? (
          <EmptyState icon={<History size={28} />} title="No sessions found" desc="Run your first analysis to see history." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Analysis Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Model</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s: AnalysisSession) => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs text-muted">{s.id.slice(0,12)}…</td>
                    <td><span className="badge badge-accent">{s.analysisType}</span></td>
                    <td><span className={`badge badge-${statusColor[s.status]}`}>{s.status}</span></td>
                    <td className="text-sm text-muted">
                      {s.totalDurationMs ? `${(s.totalDurationMs/1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="font-mono text-xs text-muted">{s.modelVersion || '—'}</td>
                    <td className="text-sm text-muted">
                      {s.completedAt ? formatDistanceToNow(new Date(s.completedAt), { addSuffix:true }) : '—'}
                    </td>
                    <td>
                      {s.status === 'Completed' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/results/${s.id}`)}>
                          <FlaskConical size={14} /> View Results
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
