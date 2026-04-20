import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { patientsApi } from '../api/client'
import { Users, Plus, Search, Edit2, Trash2, ChevronRight, Calendar, Hash } from 'lucide-react'
import toast from 'react-hot-toast'

function PatientModal({ patient, onClose, onSaved }) {
  const isEdit = !!patient
  const [form, setForm] = useState(patient ?? {
    firstName: '', lastName: '', dateOfBirth: '', gender: 'Male',
    medicalRecordNumber: `PTN-${Date.now().toString().slice(-6)}`,
    phone: '', email: '', notes: ''
  })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: d => isEdit ? patientsApi.update(patient.id, d) : patientsApi.create(d),
    onSuccess: ({ data }) => { toast.success(isEdit ? 'Patient updated' : 'Patient registered'); onSaved(data) },
    onError: err => toast.error(err.response?.data?.error || 'Failed to save patient'),
  })

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{isEdit ? 'Edit Patient' : 'Register New Patient'}</div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form) }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">First Name *</label>
              <input id="p-fname" className="form-control" required value={form.firstName} onChange={set('firstName')} />
            </div>
            <div className="form-group">
              <label className="form-label">Last Name *</label>
              <input id="p-lname" className="form-control" required value={form.lastName} onChange={set('lastName')} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Date of Birth *</label>
              <input id="p-dob" className="form-control" type="date" required value={form.dateOfBirth?.slice(0,10)} onChange={set('dateOfBirth')} />
            </div>
            <div className="form-group">
              <label className="form-label">Gender</label>
              <select id="p-gender" className="form-control" value={form.gender} onChange={set('gender')}>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Medical Record Number</label>
            <div style={{ position: 'relative' }}>
              <Hash size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input id="p-mrn" className="form-control" value={form.medicalRecordNumber} onChange={set('medicalRecordNumber')} style={{ paddingLeft: 34 }} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input id="p-phone" className="form-control" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input id="p-email" className="form-control" type="email" value={form.email} onChange={set('email')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Clinical Notes</label>
            <textarea id="p-notes" className="form-control" value={form.notes} onChange={set('notes')} rows={2} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button id="p-save" type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Register Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PatientsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null) // null | 'new' | patient object

  const { data, isLoading } = useQuery({
    queryKey: ['patients', page, search],
    queryFn: () => patientsApi.list(page, 20, search).then(r => r.data),
    keepPreviousData: true,
  })

  const deleteMutation = useMutation({
    mutationFn: id => patientsApi.delete(id),
    onSuccess: () => { toast.success('Patient removed'); qc.invalidateQueries(['patients']) },
    onError: err => toast.error(err.response?.data?.error || 'Failed to delete'),
  })

  const patients = data?.items ?? data ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Patients</h1>
          <div className="page-subtitle">Manage your patient registry</div>
        </div>
        <button id="open-new-patient" className="btn btn-primary" onClick={() => setModal('new')}>
          <Plus size={16} /> New Patient
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          id="patient-search"
          className="form-control"
          placeholder="Search by name or MRN…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          style={{ paddingLeft: 40 }}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : patients.length === 0 ? (
          <div className="empty-state">
            <Users size={40} />
            <h3>No patients found</h3>
            <p>{search ? 'Try a different search term' : 'Register your first patient to get started'}</p>
            {!search && <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('new')}><Plus size={16} /> Register Patient</button>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>MRN</th><th>DOB / Age</th><th>Gender</th><th>Contact</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {patients.map(p => {
                  const age = p.dateOfBirth ? new Date().getFullYear() - new Date(p.dateOfBirth).getFullYear() : '—'
                  return (
                    <tr key={p.id}>
                      <td>
                        <button className="btn btn-ghost" style={{ padding: '4px 0', fontWeight: 600, color: 'var(--text-primary)' }}
                          onClick={() => navigate(`/patients/${p.id}`)}>
                          {p.firstName} {p.lastName}
                        </button>
                      </td>
                      <td><code style={{ fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{p.medicalRecordNumber}</code></td>
                      <td style={{ fontSize: '0.82rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                          {p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'}
                          <span style={{ color: 'var(--text-muted)' }}>({age}y)</span>
                        </div>
                      </td>
                      <td><span className="badge badge-muted">{p.gender}</span></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{p.phone || p.email || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <button className="btn btn-ghost btn-icon" title="Edit" onClick={() => setModal(p)}><Edit2 size={14} /></button>
                          <button className="btn btn-ghost btn-icon" title="Delete" style={{ color: 'var(--danger)' }}
                            onClick={() => { if (confirm(`Delete ${p.firstName} ${p.lastName}?`)) deleteMutation.mutate(p.id) }}>
                            <Trash2 size={14} />
                          </button>
                          <button className="btn btn-ghost btn-icon" title="View" onClick={() => navigate(`/patients/${p.id}`)}>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border-subtle)' }}>
            <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span style={{ padding: '6px 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {modal && (
        <PatientModal
          patient={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); qc.invalidateQueries(['patients']) }}
        />
      )}
    </div>
  )
}
