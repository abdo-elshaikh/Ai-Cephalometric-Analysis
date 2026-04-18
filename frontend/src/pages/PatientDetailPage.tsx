import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Edit, Plus, Trash2, Calendar, Phone, Mail,
  Activity, Clock, ChevronRight, Brain, FileText, CheckCircle2
} from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';
import PatientModal from '../components/PatientModal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';

export default function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<any>(null);
  const [studies, setStudies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingStudyId, setDeletingStudyId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchPatientAndStudies();
  }, [id]);

  const fetchPatientAndStudies = async () => {
    setLoading(true);
    try {
      const pRes = await api.get(`/patients/${id}`);
      setPatient(pRes.data);

      const sRes = await api.get(`/studies/patient/${id}`);
      setStudies(sRes.data || []);
    } catch (error) {
      toast.error('Failed to load patient history');
    }
    setLoading(false);
  };

  const createStudy = async (studyType: string) => {
    try {
      await api.post('/studies', {
        patientId: id,
        studyType,
        title: `${studyType} Analysis - ${new Date().toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`,
        studyDate: new Date().toISOString().split('T')[0]
      });
      toast.success('New clinical study initialized');
      fetchPatientAndStudies();
    } catch (error) {
      toast.error('Failed to initialize study');
    }
  };

  const handleDeleteStudy = async () => {
    if (!deletingStudyId) return;
    setIsDeleting(true);
    try {
      await api.delete(`/studies/${deletingStudyId}`);
      toast.success('Study archived from medical records');
      setDeletingStudyId(null);
      fetchPatientAndStudies();
    } catch (error) {
      toast.error('Failed to archive study');
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', height: '80vh', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
      <Activity className="animate-spin" size={32} />
    </div>
  );

  if (!patient) return <div style={{ padding: 40, textAlign: 'center' }}>Medical record unavailable.</div>;

  return (
    <div className="patient-detail-hifi">
      <style dangerouslySetInnerHTML={{
        __html: `
        .patient-detail-hifi { padding: 40px; max-width: 1400px; margin: 0 auto; min-height: 100vh; }
        
        .hifi-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
        .patient-id-badge { background: var(--color-bg-secondary); border: 1px solid var(--color-border); padding: 4px 12px; border-radius: 100px; font-size: 0.75rem; font-family: monospace; color: var(--color-text-muted); }
        
        .hifi-layout { display: grid; grid-template-columns: 340px 1fr; gap: 32px; align-items: start; }
        
        .info-sidebar { position: sticky; top: 40px; display: flex; flex-direction: column; gap: 24px; }
        .patient-main-card { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border); 
          border-radius: 28px; padding: 32px; text-align: center;
          box-shadow: var(--shadow-card);
        }
        .avatar-lg { width: 80px; height: 80px; border-radius: 24px; background: var(--gradient-brand); color: white; display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; margin: 0 auto 20px; }
        
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 24px; }
        .stat-item { background: var(--color-bg-primary); border: 1px solid var(--color-border); border-radius: 16px; padding: 12px; }
        .stat-label { font-size: 0.7rem; text-transform: uppercase; color: var(--color-text-muted); font-weight: 700; margin-bottom: 2px; }
        .stat-value { font-size: 0.9rem; font-weight: 700; }
        
        .contact-list { margin-top: 24px; text-align: left; display: flex; flex-direction: column; gap: 12px; }
        .contact-item { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; color: var(--color-text-secondary); }
        .contact-item svg { color: var(--color-primary); }
        
        .activity-feed { display: flex; flex-direction: column; gap: 24px; }
        .section-label-hifi { font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-primary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        
        .study-card-hifi { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border); 
          border-radius: 24px; padding: 24px; transition: 0.2s; cursor: pointer;
          display: grid; grid-template-columns: 1fr 200px 140px auto; align-items: center; gap: 32px;
        }
        .study-card-hifi:hover { border-color: var(--color-primary); background: var(--color-bg-card-hover); transform: translateX(8px); }
        
        .progress-pipeline { display: flex; gap: 4px; margin-top: 8px; }
        .pipeline-dot { height: 4px; flex: 1; border-radius: 2px; background: var(--color-border); }
        .dot-active { background: var(--color-primary); }
        .dot-done { background: var(--color-success); }
        
        .skeletal-badge-hifi { 
          padding: 6px 14px; border-radius: 12px; background: var(--color-bg-primary);
          border: 1px solid var(--color-border); font-size: 0.75rem; font-weight: 700;
          display: flex; align-items: center; gap: 6px;
        }
        .class-i { color: var(--color-success); }
        .class-ii { color: var(--color-warning); }
        .class-iii { color: var(--color-error); }
      `}} />

      <PatientModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => fetchPatientAndStudies()}
        patient={patient}
      />

      <ConfirmDeleteModal
        isOpen={!!deletingStudyId}
        onClose={() => setDeletingStudyId(null)}
        onConfirm={handleDeleteStudy}
        loading={isDeleting}
        title="Archive Case Study?"
        description="This will remove the clinical study and all associated analysis data from the active registry."
      />

      <header className="hifi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/patients')} style={{ width: 44, height: 44, padding: 0 }}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="patient-id-badge">ID: {patient.id.toUpperCase().substring(0, 8)}</div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>Case Dashboard</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-primary" onClick={() => createStudy('Lateral')}>
            <Plus size={18} /> New Lateral Case
          </button>
        </div>
      </header>

      <div className="hifi-layout">
        <aside className="info-sidebar">
          <div className="patient-main-card">
            <div className="avatar-lg">{patient.firstName.charAt(0)}</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{patient.firstName} {patient.lastName}</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Member since {new Date(patient.createdAt).getFullYear()}</p>

            <div className="stat-grid">
              <div className="stat-item">
                <div className="stat-label">Age</div>
                <div className="stat-value">{new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} Y</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Gender</div>
                <div className="stat-value">{patient.gender.charAt(0)}</div>
              </div>
            </div>

            <div className="contact-list">
              <div className="contact-item"><Calendar size={16} /> {new Date(patient.dateOfBirth).toLocaleDateString()}</div>
              <div className="contact-item"><Phone size={16} /> {patient.phone || 'No phone'}</div>
              <div className="contact-item"><Mail size={16} /> {patient.email || 'No email'}</div>
            </div>

            <button className="btn btn-outline" style={{ width: '100%', marginTop: 24, borderRadius: 16 }} onClick={() => setIsEditModalOpen(true)}>
              <Edit size={16} /> Edit Profile
            </button>
          </div>

          <div className="patient-main-card" style={{ textAlign: 'left', padding: '24px' }}>
            <div className="section-label-hifi"><Activity size={14} /> Clinical Notes</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {patient.notes || "No additional diagnostic notes available for this patient record."}
            </p>
          </div>
        </aside>

        <section className="activity-feed">
          <div className="section-label-hifi"><Brain size={14} /> Analysis Pipeline</div>

          {studies.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', background: 'var(--color-bg-secondary)', borderRadius: 28, border: '2px dashed var(--color-border)' }}>
              <FileText size={48} style={{ opacity: 0.1, marginBottom: 16, margin: '0 auto' }} />
              <h3 style={{ fontWeight: 700 }}>No Clinical Cases</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Initialize a new case study to start AI analysis.</p>
            </div>
          ) : (
            studies.map(s => (
              <div key={s.id} className="study-card-hifi" onClick={() => navigate(`/studies/${s.id}`)}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{s.title}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    <Clock size={12} /> Registered {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                  <div className="progress-pipeline">
                    <div className={`pipeline-dot dot-done`}></div>
                    <div className={`pipeline-dot ${(s.lastAnalysisStatus === 'Processing' || s.lastAnalysisStatus === 'Finalized' || s.lastAnalysisStatus === 'Completed') ? 'dot-done' : ''}`}></div>
                    <div className={`pipeline-dot ${(s.lastAnalysisStatus === 'Finalized' || s.lastAnalysisStatus === 'Completed') ? 'dot-done' : ''}`}></div>
                  </div>
                </div>

                <div>
                  <div className="section-label-hifi" style={{ marginBottom: 4, fontSize: '0.65rem' }}>Status</div>
                  <StatusBadge status={s.lastAnalysisStatus || 'Pending'} />
                </div>

                <div>
                  <div className="section-label-hifi" style={{ marginBottom: 4, fontSize: '0.65rem' }}>Diagnosis</div>
                  {s.lastSkeletalClass ? (
                    <div className={`skeletal-badge-hifi class-${s.lastSkeletalClass.toLowerCase().replace('class', '')}`}>
                      <Activity size={12} /> {s.lastSkeletalClass.replace('Class', 'Class ')}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Analysis Pending</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--color-bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                    <ChevronRight size={20} />
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, any> = {
    Completed: { color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)', icon: <CheckCircle2 size={12} /> },
    Finalized: { color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)', icon: <CheckCircle2 size={12} /> },
    Processing: { color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)', icon: <Activity size={12} /> },
    Pending: { color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)', icon: <Clock size={12} /> },
  };
  const current = config[status] || config.Pending;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: '100px',
      fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: current.color, background: current.bg
    }}>
      {current.icon} {status}
    </div>
  );
}

