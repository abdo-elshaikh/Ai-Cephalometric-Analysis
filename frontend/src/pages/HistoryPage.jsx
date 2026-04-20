import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { analysisApi } from '../api/client'
import { History, Search, Filter, CheckCircle, Clock, XCircle, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_OPTIONS = ['', 'Finalized', 'Processing', 'Failed']
const TYPE_OPTIONS   = ['', 'Steiner', 'McNamara', 'Tweed']
const CLASS_OPTIONS  = ['', 'ClassI', 'ClassII', 'ClassIII']

export default function HistoryPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ searchTerm: '', type: '', status: '', skeletalClass: '', startDate: '', endDate: '' })
  const setF = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['history', params],
    queryFn: () => analysisApi.history(params).then(r => r.data),
    keepPreviousData: true,
  })

  const sessions = data ?? []

  const statusIcon = s => s === 'Finalized' ? <CheckCircle size={12} color="var(--success)" /> : s === 'Failed' ? <XCircle size={12} color="var(--danger)" /> : <Clock size={12} color="var(--warning)" />
  const statusBadge = s => `badge ${s === 'Finalized' ? 'badge-success' : s === 'Failed' ? 'badge-danger' : 'badge-warning'}`

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Analysis History</h1>
          <div className="page-subtitle">All AI analysis sessions across patients</div>
        </div>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {sessions.length} record{sessions.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          <div style={{ position: 'relative', gridColumn: '1 / span 2' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input id="hist-search" className="form-control" placeholder="Search patient name or MRN…" value={filters.searchTerm} onChange={setF('searchTerm')} style={{ paddingLeft: 36 }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Type</label>
            <select id="hist-type" className="form-control" value={filters.type} onChange={setF('type')}>
              {TYPE_OPTIONS.map(o => <option key={o} value={o}>{o || 'All Types'}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Status</label>
            <select id="hist-status" className="form-control" value={filters.status} onChange={setF('status')}>
              {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o || 'All Statuses'}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Skeletal Class</label>
            <select id="hist-class" className="form-control" value={filters.skeletalClass} onChange={setF('skeletalClass')}>
              {CLASS_OPTIONS.map(o => <option key={o} value={o}>{o || 'All Classes'}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">From Date</label>
            <input id="hist-from" className="form-control" type="date" value={filters.startDate} onChange={setF('startDate')} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">To Date</label>
            <input id="hist-to" className="form-control" type="date" value={filters.endDate} onChange={setF('endDate')} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ searchTerm: '', type: '', status: '', skeletalClass: '', startDate: '', endDate: '' })}>
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : !sessions.length ? (
          <div className="empty-state">
            <History size={40} />
            <h3>No sessions found</h3>
            <p>Try adjusting your filters or run an AI analysis from a patient study.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>MRN</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Skeletal Class</th>
                  <th>Vertical Pattern</th>
                  <th>Completed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/analysis/${s.id}`)}>
                    <td style={{ fontWeight: 600 }}>{s.patientName}</td>
                    <td><code style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>{s.patientMrn}</code></td>
                    <td><span className="badge badge-info">{s.analysisType}</span></td>
                    <td>
                      <span className={statusBadge(s.status)}>
                        {statusIcon(s.status)} {s.status}
                      </span>
                    </td>
                    <td>
                      {s.skeletalClass
                        ? <span className="badge badge-accent">{s.skeletalClass}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{s.verticalPattern ?? '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {s.completedAt ? format(new Date(s.completedAt), 'dd MMM yyyy, HH:mm') : '—'}
                    </td>
                    <td><ChevronRight size={16} color="var(--text-muted)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
