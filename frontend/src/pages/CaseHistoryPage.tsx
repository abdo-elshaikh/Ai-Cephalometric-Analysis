import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, Calendar, Brain, Clock,
  ChevronRight, ArrowUpDown, User, Activity, Trash2
} from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

interface HistoryItem {
  id: string;
  patientName: string;
  patientMrn: string;
  analysisType: string;
  status: string;
  queuedAt: string;
  skeletalClass?: string;
  verticalPattern?: string;
  completedAt?: string;
}

export default function CaseHistoryPage() {
  const navigate = useNavigate();
  const [analyses, setAnalyses] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingCaseId, setDeletingCaseId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [skeletalClass, setSkeletalClass] = useState('');

  useEffect(() => {
    fetchHistory();
  }, [status, type, skeletalClass]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('searchTerm', searchTerm);
      if (status) params.append('status', status);
      if (type) params.append('type', type);
      if (skeletalClass) params.append('skeletalClass', skeletalClass);

      const res = await api.get(`/analysis/history?${params.toString()}`);
      setAnalyses(res.data);
    } catch (e) {
      toast.error('Failed to load analysis history');
    }
    setLoading(false);
  };

  const handleDeleteCase = async () => {
    if (!deletingCaseId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/analysis/sessions/${deletingCaseId}`);
      toast.success('Case deleted successfully');
      setDeletingCaseId(null);
      fetchHistory();
    } catch (error) {
      toast.error('Failed to delete case');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  return (
    <div className="case-history-container">
      <style dangerouslySetInnerHTML={{ __html: `
        .case-history-container { padding: 40px; max-width: 1300px; margin: 0 auto; }
        .history-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; }
        .history-header h1 { font-size: 2.25rem; font-weight: 800; color: var(--color-text-primary); margin-bottom: 8px; }
        .history-header p { color: var(--color-text-secondary); font-size: 1.1rem; }
        
        .filter-panel { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 24px; padding: 24px; margin-bottom: 32px; display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr; gap: 20px; align-items: flex-end;
          box-shadow: var(--shadow-card);
        }
        
        .filter-label { font-size: 0.75rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; margin-bottom: 8px; display: block; }
        .filter-input { 
          width: 100%; background: var(--color-bg-primary); border: 1px solid var(--color-border);
          padding: 12px; border-radius: 12px; color: var(--color-text-primary); font-weight: 500;
        }
        
        .case-list { display: flex; flex-direction: column; gap: 16px; }
        .case-card { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 20px; padding: 20px; display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr auto;
          align-items: center; gap: 24px; transition: 0.2s; cursor: pointer;
        }
        .case-card:hover { border-color: var(--color-primary); background: var(--color-bg-card-hover); transform: translateX(8px); }
        
        .patient-cell { display: flex; align-items: center; gap: 14px; }
        .patient-avatar { width: 44px; height: 44px; border-radius: 12px; background: var(--gradient-brand); color: white; display: flex; align-items: center; justify-content: center; font-weight: 800; }
        
        .skeletal-badge { 
          padding: 6px 12px; border-radius: 8px; font-size: 0.8rem; font-weight: 700;
          background: var(--color-bg-primary); border: 1px solid var(--color-border);
          color: var(--color-text-primary); display: flex; align-items: center; gap: 6px;
        }
        .class-icon { width: 8px; height: 8px; border-radius: 50%; }
        .class-i { background: var(--color-success); }
        .class-ii { background: var(--color-warning); }
        .class-iii { background: var(--color-error); }
        
        .status-pill-adv {
          padding: 6px 12px; border-radius: 100px; font-size: 0.7rem; font-weight: 800;
          text-transform: uppercase; display: inline-flex; align-items: center; gap: 6px;
        }
        
        .action-actions { display: flex; gap: 8px; }
        .icon-btn-ghost { 
          width: 40px; height: 40px; border-radius: 10px; border: none; background: transparent; 
          color: var(--color-text-muted); cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center;
        }
        .icon-btn-ghost:hover { background: var(--color-bg-primary); color: var(--color-text-primary); }
      `}} />

      <ConfirmDeleteModal 
        isOpen={!!deletingCaseId}
        onClose={() => setDeletingCaseId(null)}
        onConfirm={handleDeleteCase}
        loading={isDeleting}
        title="Archive Analysis Case?"
        description="Proceeding will permanently remove this analysis record from the clinical database. This action is irreversible."
      />

      <header className="history-header">
        <div>
          <h1>Case Pipeline</h1>
          <p>Global monitor for analysis sessions and diagnostic history.</p>
        </div>
      </header>

      <div className="filter-panel">
        <div>
          <label className="filter-label">Patient Search</label>
          <input className="filter-input" placeholder="Search by name or record ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div>
          <label className="filter-label">Analysis Type</label>
          <select className="filter-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All Methods</option>
            <option value="Steiner">Steiner</option>
            <option value="Tweed">Tweed</option>
            <option value="McNamara">McNamara</option>
            <option value="Jarabak">Jarabak</option>
          </select>
        </div>
        <div>
          <label className="filter-label">Diagnostic Status</label>
          <select className="filter-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All States</option>
            <option value="Completed">Completed</option>
            <option value="Processing">Processing</option>
            <option value="Queued">Queued</option>
          </select>
        </div>
        <div>
          <label className="filter-label">Skeletal Pattern</label>
          <select className="filter-input" value={skeletalClass} onChange={(e) => setSkeletalClass(e.target.value)}>
            <option value="">Any Pattern</option>
            <option value="ClassI">Class I</option>
            <option value="ClassII">Class II</option>
            <option value="ClassIII">Class III</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Activity className="animate-spin" size={32} />
          <p style={{ marginTop: 16 }}>Retrieving clinical history...</p>
        </div>
      ) : (
        <div className="case-list">
          {analyses.map(a => (
            <div key={a.id} className="case-card" onClick={() => navigate(a.status === 'Completed' ? `/results/${a.id}` : `/analysis/${a.id}`)}>
              <div className="patient-cell">
                <div className="patient-avatar">{a.patientName?.charAt(0)}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{a.patientName}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}># {a.patientMrn}</div>
                </div>
              </div>
              
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{a.analysisType} Analysis</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}><Clock size={12} /> {formatDate(a.queuedAt)}</div>
              </div>

              <div>
                <StatusBadge status={a.status} />
              </div>

              <div>
                {a.skeletalClass ? (
                  <div className="skeletal-badge">
                    <div className={`class-icon class-${a.skeletalClass.toLowerCase().replace('class', '')}`}></div>
                    {a.skeletalClass.replace('Class', 'Class ')}
                  </div>
                ) : <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Analysis Pending</span>}
              </div>

              <div className="action-actions">
                <button 
                  className="icon-btn-ghost" 
                  onClick={(e) => { e.stopPropagation(); setDeletingCaseId(a.id); }}
                  style={{ color: 'var(--color-error)' }}
                >
                  <Trash2 size={18} />
                </button>
                <div className="icon-btn-ghost"><ChevronRight size={20} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, any> = {
    Completed: { color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)' },
    Processing: { color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)' },
    Failed: { color: 'var(--color-error)', bg: 'rgba(239,68,68,0.1)' },
    Queued: { color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
  };
  const current = styles[status] || { color: 'var(--color-text-muted)', bg: 'rgba(255,255,255,0.05)' };
  return (
    <span className="status-pill-adv" style={{ color: current.color, background: current.bg }}>
      <Activity size={12} /> {status}
    </span>
  );
}
