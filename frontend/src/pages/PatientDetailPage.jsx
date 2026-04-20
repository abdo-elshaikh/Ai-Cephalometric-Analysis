import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { patientsApi, studiesApi } from '../api/client'
import { ArrowLeft, Plus, FolderOpen, Calendar, User, Hash, Activity, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

function CreateStudyModal({ patientId, onClose, onSaved }) {
  const [form, setForm] = useState({ patientId, studyType: 'Lateral', notes: '', referralReason: '' })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const mutation = useMutation({
    mutationFn: d => studiesApi.create(d),
    onSuccess: ({ data }) => { toast.success('Study created'); onSaved(data) },
    onError: err => toast.error(err.response?.data?.error || 'Failed to create study'),
  })
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New Study / Case</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }}>
          <div className="form-group">
            <label className="form-label">Study Type</label>
            <select id="study-type" className="form-control" value={form.studyType} onChange={set('studyType')}>
              <option value="Lateral">Lateral Cephalogram</option>
              <option value="Frontal">Frontal (PA)</option>
              <option value="Panoramic">Panoramic</option>
              <option value="CBCT">CBCT</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Referral Reason</label>
            <input id="study-reason" className="form-control" placeholder="e.g. Pre-surgical planning" value={form.referralReason} onChange={set('referralReason')} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea id="study-notes" className="form-control" rows={3} value={form.notes} onChange={set('notes')} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="study-save" type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create Study'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PatientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)

  const { data: patient, isLoading: pLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => patientsApi.get(id).then(r => r.data),
  })

  const { data: studies, isLoading: sLoading } = useQuery({
    queryKey: ['studies', id],
    queryFn: () => studiesApi.listForPatient(id).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: sid => studiesApi.delete(sid),
    onSuccess: () => { toast.success('Study deleted'); qc.invalidateQueries(['studies', id]) },
    onError: err => toast.error(err.response?.data?.error || 'Delete failed'),
  })

  if (pLoading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><div className="spinner" /></div></div>
  if (!patient) return <div className="page"><p>Patient not found.</p></div>

  const age = Math.floor((Date.now() - new Date(patient.dateOfBirth)) / (365.25 * 86400000))

  const statusColor = s => ({ Active: 'badge-success', Completed: 'badge-accent', Pending: 'badge-warning', Cancelled: 'badge-danger' }[s] ?? 'badge-muted')

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/patients')}><ArrowLeft size={18} /></button>
        <div style={{ flex: 1 }}>
          <h1 style={{ marginBottom: 2 }}>{patient.firstName} {patient.lastName}</h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <code style={{ fontSize: '0.8rem', color: 'var(--accent-primary)' }}>{patient.medicalRecordNumber}</code>
            <span className="badge badge-muted">{patient.gender}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{age} years old</span>
          </div>
        </div>
        <button id="new-study-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> New Study
        </button>
      </div>

      {/* Patient info card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-title" style={{ marginBottom: 16 }}><User size={16} color="var(--accent-primary)" /> Patient Information</div>
        <div className="grid-3">
          {[
            { label: 'Date of Birth', value: format(new Date(patient.dateOfBirth), 'dd MMM yyyy'), icon: Calendar },
            { label: 'Phone', value: patient.phone || '—', icon: null },
            { label: 'Email', value: patient.email || '—', icon: null },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{value}</div>
            </div>
          ))}
        </div>
        {patient.notes && (
          <>
            <hr className="divider" />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}><strong>Notes:</strong> {patient.notes}</div>
          </>
        )}
      </div>

      {/* Studies */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="card-title"><FolderOpen size={16} color="var(--accent-primary)" /> Studies & Cases</div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{studies?.length ?? 0} total</span>
        </div>

        {sLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" /></div>
        ) : !studies?.length ? (
          <div className="empty-state">
            <FolderOpen size={40} />
            <h3>No studies yet</h3>
            <p>Create a study to start uploading X-rays and running AI analysis.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
              <Plus size={16} /> Create First Study
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Study Type</th><th>Status</th><th>Referral Reason</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {studies.map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/studies/${s.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Activity size={14} color="var(--accent-primary)" />
                        {s.studyType}
                      </div>
                    </td>
                    <td><span className={`badge ${statusColor(s.status)}`}>{s.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{s.referralReason || '—'}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{format(new Date(s.createdAt), 'dd MMM yyyy')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/studies/${s.id}`)}>Open</button>
                        <button className="btn btn-ghost btn-icon" style={{ color: 'var(--danger)' }}
                          onClick={() => { if (confirm('Delete this study?')) deleteMutation.mutate(s.id) }}>
                          <Trash2 size={14} />
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

      {showModal && (
        <CreateStudyModal patientId={id} onClose={() => setShowModal(false)}
          onSaved={s => { setShowModal(false); qc.invalidateQueries(['studies', id]); navigate(`/studies/${s.id}`) }} />
      )}
    </div>
  )
}
