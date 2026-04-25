import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/services/api';
import { TableSkeleton, EmptyState } from '@/components/ui/Loading';
import { FileText, Download } from 'lucide-react';
import { format } from 'date-fns';
import { Report } from '@/types';

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}

export default function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports'],
    queryFn: reportsApi.getAll,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clinical Reports</h1>
          <p className="page-subtitle">{data?.length ?? 0} reports generated</p>
        </div>
      </div>

      <div className="page-body">
        {isLoading ? <TableSkeleton rows={5} cols={5} /> : !data?.length ? (
          <EmptyState
            icon={<FileText size={28} />}
            title="No reports yet"
            desc="Generate a report from the Results page after completing an analysis."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Format</th>
                  <th>Session</th>
                  <th>Includes</th>
                  <th>Size</th>
                  <th>Generated</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: Report) => (
                  <tr key={r.id}>
                    <td>
                      <span className={`badge badge-${r.reportFormat === 'PDF' ? 'danger' : 'info'}`}>
                        {r.reportFormat}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-muted">{r.sessionId.slice(0,12)}…</td>
                    <td>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {r.includesXray && <span className="badge badge-muted">X-Ray</span>}
                        {r.includesLandmarkOverlay && <span className="badge badge-muted">Overlay</span>}
                        {r.includesMeasurements && <span className="badge badge-muted">Measurements</span>}
                        {r.includesTreatmentPlan && <span className="badge badge-muted">Treatment</span>}
                      </div>
                    </td>
                    <td className="text-sm text-muted">{formatBytes(r.fileSizeBytes ?? undefined)}</td>
                    <td className="text-sm text-muted">{format(new Date(r.generatedAt), 'dd MMM yyyy HH:mm')}</td>
                    <td>
                      <a href={r.storageUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        <Download size={14} /> Download
                      </a>
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
