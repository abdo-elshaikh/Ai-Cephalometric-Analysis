import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, Download, Clock, Plus, Filter, Search, 
  ExternalLink, Trash2, Calendar, User, Activity, Brain 
} from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';

interface ReportItem {
  id: string;
  sessionId: string;
  reportFormat: string;
  language: string;
  storageUrl: string;
  fileSizeBytes?: number;
  includesXray: boolean;
  includesLandmarkOverlay: boolean;
  includesMeasurements: boolean;
  includesTreatmentPlan: boolean;
  generatedAt: string;
  expiresAt?: string;
  patientName?: string;
  medicalRecordNo?: string;
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports');
      setReports(res.data);
    } catch (e: any) {
      toast.error('Failed to load reports');
    }
    setLoading(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredReports = reports.filter(r => 
    r.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.medicalRecordNo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="reports-container">
      <style dangerouslySetInnerHTML={{ __html: `
        .reports-container { padding: 40px; max-width: 1300px; margin: 0 auto; }
        .reports-header-adv { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; }
        .reports-header-adv h1 { font-size: 2.25rem; font-weight: 800; color: var(--color-text-primary); margin-bottom: 8px; }
        .reports-header-adv p { color: var(--color-text-secondary); font-size: 1.1rem; }
        
        .reports-action-bar { display: flex; gap: 16px; margin-bottom: 32px; }
        .search-container-adv { flex: 1; position: relative; }
        .search-container-adv svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); }
        .search-input-adv { 
          width: 100%; padding: 14px 14px 14px 48px; background: var(--color-bg-secondary);
          border: 1px solid var(--color-border); border-radius: 16px; color: var(--color-text-primary);
          transition: 0.2s; font-size: 1rem;
        }
        .search-input-adv:focus { border-color: var(--color-primary); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); outline: none; }
        
        .reports-grid-adv { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; }
        .report-card-hifi { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 24px; padding: 24px; transition: 0.3s; position: relative;
          overflow: hidden; box-shadow: var(--shadow-card);
        }
        .report-card-hifi:hover { transform: translateY(-6px); border-color: var(--color-primary); box-shadow: 0 20px 40px -12px rgba(0,0,0,0.3); }
        
        .format-tag { 
          position: absolute; top: 0; right: 0; padding: 6px 16px; 
          background: var(--color-primary); color: white; font-size: 0.65rem; font-weight: 800;
          border-bottom-left-radius: 16px; text-transform: uppercase;
        }
        
        .report-top { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
        .report-icon-box { 
          width: 48px; height: 48px; border-radius: 14px; background: var(--color-bg-primary);
          display: flex; align-items: center; justify-content: center; color: var(--color-primary);
          border: 1px solid var(--color-border);
        }
        
        .patient-summary h3 { font-size: 1.1rem; font-weight: 700; color: var(--color-text-primary); margin-bottom: 2px; }
        .patient-summary span { font-size: 0.8rem; color: var(--color-text-muted); font-family: monospace; }
        
        .report-scope { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
        .scope-badge { 
          padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 600;
          background: rgba(99, 102, 241, 0.05); color: var(--color-primary); border: 1px solid rgba(99, 102, 241, 0.1);
        }
        
        .card-meta-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding: 12px 0; border-top: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); }
        .meta-detail { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--color-text-secondary); }
        
        .report-actions-row { display: grid; grid-template-columns: 1fr 48px; gap: 12px; }
        .dl-btn { 
          background: var(--color-primary); color: white; border: none; padding: 12px;
          border-radius: 14px; font-weight: 700; font-size: 0.9rem; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s;
        }
        .dl-btn:hover { background: #4f46e5; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2); }
        
        .view-btn-hifi { 
          background: var(--color-bg-primary); border: 1px solid var(--color-border);
          border-radius: 14px; color: var(--color-text-secondary); display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: 0.2s;
        }
        .view-btn-hifi:hover { color: var(--color-primary); border-color: var(--color-primary); }
      `}} />

      <header className="reports-header-adv">
        <div>
          <h1>Clinical Repository</h1>
          <p>Enterprise archive for generated cephalometric reports.</p>
        </div>
      </header>

      <div className="reports-action-bar">
        <div className="search-container-adv">
          <Search size={20} />
          <input 
            className="search-input-adv"
            type="text" 
            placeholder="Filter by patient name, MRN, or report ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="view-btn-hifi" style={{ width: 48, height: 48 }} onClick={fetchReports}>
          <Activity size={20} />
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Activity className="animate-spin" size={32} />
          <p style={{ marginTop: 16 }}>Securing clinical documents...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div style={{ padding: 100, textAlign: 'center', background: 'var(--color-bg-secondary)', borderRadius: 32, border: '2px dashed var(--color-border)' }}>
          <FileText size={64} style={{ opacity: 0.1, marginBottom: 20, margin: '0 auto' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>No Reports Found</h2>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 400, margin: '12px auto' }}>Try adjusting your filters or head to the patient workspace to generate a new report.</p>
        </div>
      ) : (
        <div className="reports-grid-adv">
          {filteredReports.map(r => (
            <div key={r.id} className="report-card-hifi">
              <div className="format-tag">{r.reportFormat}</div>
              
              <div className="report-top">
                <div className="report-icon-box">
                  {r.includesTreatmentPlan ? <Brain size={24} /> : <FileText size={24} />}
                </div>
                <div className="patient-summary">
                  <h3>{r.patientName || 'Anonymous Case'}</h3>
                  <span>MRN: {r.medicalRecordNo || 'N/A'}</span>
                </div>
              </div>

              <div className="report-scope">
                {r.includesMeasurements && <span className="scope-badge">Full Metrics</span>}
                {r.includesLandmarkOverlay && <span className="scope-badge">Tracings</span>}
                {r.includesTreatmentPlan && <span className="scope-badge">Clinical Rationale</span>}
              </div>

              <div className="card-meta-row">
                <div className="meta-detail"><Calendar size={14} /> {formatDate(r.generatedAt)}</div>
                <div className="meta-detail"><Clock size={14} /> {r.fileSizeBytes ? `${(r.fileSizeBytes / 1024).toFixed(0)} KB` : '1.2 MB'}</div>
              </div>

              <div className="report-actions-row">
                <a href={r.storageUrl} target="_blank" rel="noreferrer" className="dl-btn" style={{ textDecoration: 'none' }}>
                  <Download size={18} /> Download Archive
                </a>
                <button className="view-btn-hifi" onClick={() => window.open(r.storageUrl, '_blank')}>
                  <ExternalLink size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
