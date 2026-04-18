import { useState, useEffect } from 'react';
import { 
  Search, Plus, Calendar, ChevronRight, Edit2, LayoutDashboard, 
  Menu, Activity, Award, Briefcase, FileText, User, Clock 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import PatientModal from '../components/PatientModal';

export default function PatientsPage() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [isGridView, setIsGridView] = useState(true);

  useEffect(() => {
    fetchPatients();
  }, [search]);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const res = await api.get('/patients', { params: { search } });
      setPatients(res.data.items || []);
    } catch (error) {
      console.error('Failed to fetch clinical registry', error);
    }
    setLoading(false);
  };

  const openEditModal = (e: React.MouseEvent, patient: any) => {
    e.stopPropagation();
    setEditingPatient(patient);
  };

  return (
    <div className="patients-hifi-container">
      <style dangerouslySetInnerHTML={{ __html: `
        .patients-hifi-container { padding: 40px; max-width: 1400px; margin: 0 auto; min-height: 100vh; }
        
        .workspace-title-row { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px; }
        .workspace-title-row h1 { font-size: 2.25rem; font-weight: 800; color: var(--color-text-primary); margin-bottom: 8px; }
        .workspace-title-row p { color: var(--color-text-secondary); font-size: 1.1rem; }
        
        .action-control-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; gap: 20px; }
        .hifi-search-box { flex: 1; position: relative; }
        .hifi-search-box svg { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; }
        .hifi-search-input { 
          width: 100%; padding: 14px 14px 14px 48px; background: var(--color-bg-secondary);
          border: 1px solid var(--color-border); border-radius: 18px; color: var(--color-text-primary);
          transition: 0.2s; font-size: 1rem;
        }
        .hifi-search-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); outline: none; }
        
        .view-mode-pill { display: flex; background: var(--color-bg-secondary); padding: 4px; border-radius: 14px; border: 1px solid var(--color-border); }
        .pill-btn { 
          padding: 8px 16px; border-radius: 10px; border: none; background: transparent; 
          color: var(--color-text-muted); cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px;
          font-size: 0.8rem; font-weight: 700;
        }
        .pill-btn.active { background: var(--color-bg-primary); color: var(--color-primary); box-shadow: var(--shadow-card); }
        
        .hifi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 28px; }
        .hifi-patient-card { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border); padding: 28px;
          border-radius: 32px; transition: 0.3s; cursor: pointer; position: relative; box-shadow: var(--shadow-card);
          display: flex; flex-direction: column; gap: 20px;
        }
        .hifi-patient-card:hover { transform: translateY(-6px); border-color: var(--color-primary); box-shadow: 0 20px 48px -12px rgba(0,0,0,0.3); }
        
        .card-top-info { display: flex; align-items: center; gap: 18px; }
        .patient-avatar-box { 
          width: 64px; height: 64px; border-radius: 20px; background: var(--gradient-brand);
          display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 1.5rem;
          box-shadow: 0 8px 16px -4px rgba(99, 102, 241, 0.4);
        }
        .patient-name-stack h3 { font-size: 1.25rem; font-weight: 800; color: var(--color-text-primary); line-height: 1.2; }
        .patient-name-stack span { font-size: 0.8rem; color: var(--color-text-muted); font-family: monospace; letter-spacing: 0.05em; }
        
        .card-clinical-row { display: flex; gap: 10px; }
        .clinical-indicator { 
          flex: 1; padding: 10px; background: var(--color-bg-primary); border: 1px solid var(--color-border);
          border-radius: 16px; display: flex; flex-direction: column; gap: 2px;
        }
        .indicator-label { font-size: 0.6rem; text-transform: uppercase; color: var(--color-text-muted); font-weight: 800; }
        .indicator-body { font-size: 0.85rem; font-weight: 700; display: flex; align-items: center; gap: 6px; }
        
        .diagnosis-chip { 
          padding: 4px 10px; border-radius: 8px; font-size: 0.65rem; font-weight: 800;
          background: rgba(99, 102, 241, 0.1); color: var(--color-primary);
        }
        .chip-class-i { background: rgba(16, 185, 129, 0.1); color: var(--color-success); }
        .chip-class-ii { background: rgba(245, 158, 11, 0.1); color: var(--color-warning); }
        .chip-class-iii { background: rgba(239, 68, 68, 0.1); color: var(--color-error); }
        
        .record-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid var(--color-border); }
        .activity-text { font-size: 0.75rem; color: var(--color-text-muted); display: flex; align-items: center; gap: 6px; }
        
        .create-btn-hifi { 
          padding: 12px 28px; border-radius: 16px; background: var(--color-primary); color: white; border: none;
          font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 12px; transition: 0.3s;
          box-shadow: 0 10px 20px -5px rgba(99, 102, 241, 0.4);
        }
        .create-btn-hifi:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -5px rgba(99, 102, 241, 0.5); }
      `}} />

      <header className="workspace-title-row">
        <div>
          <h1>Patient Registry</h1>
          <p>Managed access to comprehensive clinical records and analysis trajectories.</p>
        </div>
        <button className="create-btn-hifi" onClick={() => { setEditingPatient(null); setIsModalOpen(true); }}>
          <Plus size={20} /> Create New Record
        </button>
      </header>

      <div className="action-control-row">
        <div className="hifi-search-box">
          <Search size={22} />
          <input 
            className="hifi-search-input"
            type="text" 
            placeholder="Search by name, MRN, or unique clinical identifier..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="view-mode-pill">
          <button className={`pill-btn ${isGridView ? 'active' : ''}`} onClick={() => setIsGridView(true)}>
            <LayoutDashboard size={18} /> Dashboard
          </button>
          <button className={`pill-btn ${!isGridView ? 'active' : ''}`} onClick={() => setIsGridView(false)}>
            <Menu size={18} /> Registry
          </button>
        </div>
      </div>

      <PatientModal 
        isOpen={isModalOpen || !!editingPatient} 
        onClose={() => { setIsModalOpen(false); setEditingPatient(null); }} 
        onSuccess={() => fetchPatients()} 
        patient={editingPatient}
      />

      {loading ? (
        <div style={{ padding: 100, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Activity className="animate-spin" size={32} />
          <p style={{ marginTop: 20, fontWeight: 700 }}>Querying medical archives...</p>
        </div>
      ) : isGridView ? (
        <div className="hifi-grid">
          {patients.map(p => (
            <div key={p.id} className="hifi-patient-card" onClick={() => navigate(`/patients/${p.id}`)}>
              <div className="card-top-info">
                <div className="patient-avatar-box">{p.firstName?.charAt(0)}</div>
                <div className="patient-name-stack">
                  <h3>{p.firstName} {p.lastName}</h3>
                  <span>MRN: {p.medicalRecordNo || p.id.substring(0, 8)}</span>
                </div>
              </div>

              <div className="card-clinical-row">
                <div className="clinical-indicator">
                  <div className="indicator-label">Last Diagnosis</div>
                  <div className="indicator-body">
                    {p.lastSkeletalClass ? (
                      <span className={`diagnosis-chip chip-class-${p.lastSkeletalClass.toLowerCase().replace('class', '')}`}>
                        {p.lastSkeletalClass.replace('Class', 'Class ')}
                      </span>
                    ) : 'Not Analyzed'}
                  </div>
                </div>
                <div className="clinical-indicator" style={{ flex: 0.6 }}>
                  <div className="indicator-label">Studies</div>
                  <div className="indicator-body"><Briefcase size={14} /> {p.totalStudiesCount || 0} Cases</div>
                </div>
              </div>

              <div className="record-footer">
                <div className="activity-text">
                   <Clock size={14} /> Created {new Date(p.createdAt).toLocaleDateString()}
                </div>
                <button 
                  className="btn btn-ghost"
                  style={{ width: 40, height: 40, padding: 0 }}
                  onClick={(e) => { e.stopPropagation(); openEditModal(e, p); }}
                >
                  <Edit2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 28 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient Identity</th>
                <th>Diagnostic Snippet</th>
                <th>Case Load</th>
                <th>Medical Record</th>
                <th>Last Update</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '120px', color: 'var(--color-text-muted)' }}>No medical records match your clinical search criteria.</td></tr>
              ) : (
                patients.map(p => (
                  <tr key={p.id} onClick={() => navigate(`/patients/${p.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gradient-brand)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 800 }}>
                          {p.firstName?.charAt(0)}
                        </div>
                        <span style={{ fontWeight: 800 }}>{p.firstName} {p.lastName}</span>
                      </div>
                    </td>
                    <td>
                      {p.lastSkeletalClass ? (
                        <span className={`diagnosis-chip chip-class-${p.lastSkeletalClass.toLowerCase().replace('class', '')}`}>
                          {p.lastSkeletalClass.replace('Class', 'Class ')}
                        </span>
                      ) : <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><FileText size={14} /> {p.totalStudiesCount}</div></td>
                    <td><span className="badge badge-outline" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{p.medicalRecordNo || p.id.substring(0, 8)}</span></td>
                    <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'Baseline'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <button className="btn btn-ghost" onClick={(e) => openEditModal(e, p)}><Edit2 size={16} /></button>
                        <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}><ChevronRight size={18} /></div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

