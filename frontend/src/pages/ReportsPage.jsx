import { useQuery } from '@tanstack/react-query'
import { reportsApi } from '../api/client'
import { FileText, Download, Clock, CheckCircle, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'

export default function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: () => reportsApi.list().then(r => r.data),
  })

  const reports = data ?? []

  const statusBadge = s => ({
    Generated: 'badge-success', Pending: 'badge-warning', Failed: 'badge-danger'
  }[s] ?? 'badge-muted')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clinical Reports</h1>
          <div className="page-subtitle">AI-generated PDF cephalometric reports</div>
        </div>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : !reports.length ? (
          <div className="empty-state">
            <FileText size={40} />
            <h3>No reports yet</h3>
            <p>Open an analysis session and click "Generate Report" to create a PDF report.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Patient</th><th>Session ID</th><th>Status</th><th>Created</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td>{r.patientName ?? '—'}</td>
                    <td><code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.sessionId?.slice(0, 8)}…</code></td>
                    <td>
                      <span className={`badge ${statusBadge(r.status)}`}>
                        {r.status === 'Generated' ? <CheckCircle size={10} /> : <Clock size={10} />}
                        {r.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {r.generatedAt ? format(new Date(r.generatedAt), 'dd MMM yyyy, HH:mm') : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {r.fileUrl && (
                          <a
                            id={`report-dl-${r.id}`}
                            href={r.fileUrl.startsWith('http') ? r.fileUrl : `/uploads/${r.fileUrl}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-primary btn-sm"
                            download
                          >
                            <Download size={13} /> Download PDF
                          </a>
                        )}
                        {r.sessionId && (
                          <a href={`/analysis/${r.sessionId}`} className="btn btn-ghost btn-sm">
                            <ExternalLink size={13} /> Session
                          </a>
                        )}
                      </div>
                    </td>
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
