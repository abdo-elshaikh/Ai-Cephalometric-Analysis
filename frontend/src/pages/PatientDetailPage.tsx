import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { patientsApi, studiesApi } from '@/services/api';
import { Study, CreateStudyRequest, StudyType, StudyStatus } from '@/types';
import Modal from '@/components/ui/Modal';
import { Skeleton, EmptyState } from '@/components/ui/Loading';
import { ArrowLeft, FolderOpen, Plus, Edit2, Trash2, FlaskConical, Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';

const studySchema = z.object({
  studyDate: z.string().min(1, 'Date required'),
  studyType: z.enum(['Lateral','PA','CBCT'] as const),
  title:     z.string().optional(),
  clinicalNotes: z.string().optional(),
});

type StudyForm = z.infer<typeof studySchema>;

const studyStatusBadge = (s: StudyStatus) => {
  const map: Record<StudyStatus, string> = {
    Pending: 'warning', InProgress: 'info', Completed: 'success', Archived: 'muted',
  };
  return <span className={`badge badge-${map[s]}`}>{s}</span>;
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);

  const { data: patient, isLoading: loadingPatient } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id!),
    enabled: !!id,
  });

  const { data: studies, isLoading: loadingStudies } = useQuery({
    queryKey: ['studies', 'patient', id],
    queryFn: () => studiesApi.getByPatient(id!),
    enabled: !!id,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<StudyForm>({
    resolver: zodResolver(studySchema),
    defaultValues: { studyType: 'Lateral' },
  });

  const createMut = useMutation({
    mutationFn: (d: StudyForm) => studiesApi.create({ ...d, patientId: id! } as CreateStudyRequest),
    onSuccess: () => { toast.success('Study created'); qc.invalidateQueries({ queryKey: ['studies', 'patient', id] }); setModalMode(null); reset(); },
    onError: () => toast.error('Failed to create study'),
  });

  const updateMut = useMutation({
    mutationFn: (d: StudyForm) => studiesApi.update(selectedStudy!.id, d),
    onSuccess: () => { toast.success('Study updated'); qc.invalidateQueries({ queryKey: ['studies', 'patient', id] }); setModalMode(null); reset(); },
    onError: () => toast.error('Failed to update study'),
  });

  const deleteMut = useMutation({
    mutationFn: () => studiesApi.delete(selectedStudy!.id),
    onSuccess: () => { toast.success('Study deleted'); qc.invalidateQueries({ queryKey: ['studies', 'patient', id] }); setModalMode(null); },
    onError: () => toast.error('Failed to delete study'),
  });

  if (loadingPatient) {
    return (
      <div className="page-body">
        <Skeleton height="32px" width="240px" />
        <Skeleton height="20px" width="180px" style={{ marginTop:8 }} />
      </div>
    );
  }

  if (!patient) return <div className="page-body"><p className="text-muted">Patient not found.</p></div>;

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/patients')}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title">{patient.fullName}</h1>
          <p className="page-subtitle">Age {patient.age} · {patient.gender} · {patient.email ?? patient.phone ?? 'No contact'}</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginLeft:'auto' }}
          onClick={() => setModalMode('create')}
          id="btn-create-study"
        >
          <Plus size={16} /> New Study
        </button>
      </div>

      <div className="page-body">
        {/* Info card */}
        <div className="card" style={{ marginBottom:24 }}>
          <div className="card-body">
            <div className="grid-3">
              {[
                ['Date of Birth', format(new Date(patient.dateOfBirth), 'dd MMM yyyy')],
                ['Phone', patient.phone ?? '—'],
                ['Email', patient.email ?? '—'],
                ['Medical Record', patient.medicalRecordNo ?? '—'],
                ['Registered', format(new Date(patient.createdAt), 'dd MMM yyyy')],
                ['Notes', patient.notes ?? '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-xs text-muted" style={{ marginBottom:2 }}>{k}</div>
                  <div className="text-sm" style={{ color:'var(--text-primary)' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Studies */}
        <h2 className="card-title" style={{ marginBottom:16 }}>
          <FolderOpen size={16} style={{ display:'inline', marginRight:6, color:'var(--accent)' }} />
          Studies
        </h2>

        {loadingStudies ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {Array.from({length:3}).map((_,i) => <Skeleton key={i} height="72px" />)}
          </div>
        ) : !studies?.length ? (
          <EmptyState
            icon={<FolderOpen size={28} />}
            title="No studies yet"
            desc="Create a cephalometric study to start uploading X-rays."
            action={<button className="btn btn-primary" onClick={() => setModalMode('create')}><Plus size={16}/>New Study</button>}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Title</th><th>Type</th><th>Date</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {studies.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight:600 }}>{s.title ?? 'Untitled Study'}</div>
                      {s.clinicalNotes && <div className="text-xs text-muted">{s.clinicalNotes.slice(0,60)}…</div>}
                    </td>
                    <td><span className="badge badge-accent">{s.studyType}</span></td>
                    <td className="text-sm text-muted">{s.studyDate}</td>
                    <td>{studyStatusBadge(s.status)}</td>
                    <td>
                      <div style={{ display:'flex', gap:6 }}>
                        <button className="btn btn-ghost btn-icon" title="Open Analysis" onClick={() => navigate(`/analysis/${s.id}`)}>
                          <FlaskConical size={15} />
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Clinical Viewer" onClick={() => navigate(`/viewer/${s.id}`)}>
                          <Zap size={15} color="var(--accent)" />
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Edit" onClick={() => { 
                          setSelectedStudy(s); 
                          reset({ studyDate: s.studyDate, studyType: s.studyType, title: s.title, clinicalNotes: s.clinicalNotes });
                          setModalMode('edit'); 
                        }}>
                          <Edit2 size={15} />
                        </button>
                        <button className="btn btn-ghost btn-icon" title="Delete" onClick={() => { setSelectedStudy(s); setModalMode('delete'); }} style={{ color:'var(--danger)' }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Study Modal */}
      {modalMode === 'create' && (
        <Modal title="New Cephalometric Study" onClose={() => setModalMode(null)}>
          <form onSubmit={handleSubmit(d => createMut.mutate(d))}>
            <div className="form-group">
              <label className="form-label form-required">Study Date</label>
              <input type="date" className={`form-input${errors.studyDate ? ' error' : ''}`} {...register('studyDate')} />
              {errors.studyDate && <span className="form-error">{errors.studyDate.message}</span>}
            </div>
            <div className="form-group">
              <label className="form-label form-required">Study Type</label>
              <select className="form-select" {...register('studyType')}>
                {(['Lateral','PA','CBCT'] as StudyType[]).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" {...register('title')} placeholder="e.g. Initial Assessment" />
            </div>
            <div className="form-group">
              <label className="form-label">Clinical Notes</label>
              <textarea className="form-textarea" {...register('clinicalNotes')} placeholder="Observations, referral notes…" rows={3} />
            </div>
            <div className="modal-footer" style={{ padding:0, marginTop:8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={createMut.isPending}>
                {createMut.isPending ? 'Creating…' : 'Create Study'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Study Modal */}
      {modalMode === 'edit' && selectedStudy && (
        <Modal title="Edit Cephalometric Study" onClose={() => setModalMode(null)}>
          <form onSubmit={handleSubmit(d => updateMut.mutate(d))}>
            <div className="form-group">
              <label className="form-label form-required">Study Date</label>
              <input type="date" className={`form-input${errors.studyDate ? ' error' : ''}`} {...register('studyDate')} />
              {errors.studyDate && <span className="form-error">{errors.studyDate.message}</span>}
            </div>
            <div className="form-group">
              <label className="form-label form-required">Study Type</label>
              <select className="form-select" {...register('studyType')}>
                {(['Lateral','PA','CBCT'] as StudyType[]).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" {...register('title')} placeholder="e.g. Initial Assessment" />
            </div>
            <div className="form-group">
              <label className="form-label">Clinical Notes</label>
              <textarea className="form-textarea" {...register('clinicalNotes')} placeholder="Observations, referral notes…" rows={3} />
            </div>
            <div className="modal-footer" style={{ padding:0, marginTop:8 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete confirm */}
      {modalMode === 'delete' && selectedStudy && (
        <Modal
          title="Delete Study"
          onClose={() => setModalMode(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? 'Deleting…' : 'Delete Study'}
              </button>
            </>
          }
        >
          <p style={{ color:'var(--text-secondary)' }}>
            Delete study <strong style={{ color:'var(--text-primary)' }}>{selectedStudy.title ?? 'Untitled Study'}</strong>?
            All images and analysis sessions will be permanently removed.
          </p>
        </Modal>
      )}
    </div>
  );
}
