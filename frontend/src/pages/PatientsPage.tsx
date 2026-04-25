import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { patientsApi } from '@/services/api';
import { Patient, CreatePatientRequest, GenderType } from '@/types';
import Modal from '@/components/ui/Modal';
import { TableSkeleton, EmptyState } from '@/components/ui/Loading';
import { Search, Plus, Edit2, Trash2, Users, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import VirtualPatientTable from '@/components/VirtualPatientTable';

// ── Validation schema ─────────────────────────────────────────────────────────
const schema = z.object({
  firstName:  z.string().min(1, 'First name required'),
  lastName:   z.string().min(1, 'Last name required'),
  dateOfBirth: z.string().min(1, 'Date of birth required'),
  gender:     z.enum(['Male','Female','Other'] as const),
  phone:      z.string().optional(),
  email:      z.string().email('Invalid email').optional().or(z.literal('')),
  medicalRecordNo: z.string().optional(),
  notes:      z.string().optional(),
});

type FormData = z.infer<typeof schema>;

function PatientForm({
  defaultValues, onSubmit, isLoading,
}: {
  defaultValues?: Partial<FormData>;
  onSubmit: (d: FormData) => void;
  isLoading: boolean;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { gender: 'Male', ...defaultValues },
  });

  return (
    <form id="patient-form" onSubmit={handleSubmit(onSubmit)}>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="firstName" className="form-label form-required">First Name</label>
          <input id="firstName" className={`form-input${errors.firstName ? ' error' : ''}`} {...register('firstName')} placeholder="e.g. Ahmed" />
          {errors.firstName && <span className="form-error">{errors.firstName.message}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="lastName" className="form-label form-required">Last Name</label>
          <input id="lastName" className={`form-input${errors.lastName ? ' error' : ''}`} {...register('lastName')} placeholder="e.g. Hassan" />
          {errors.lastName && <span className="form-error">{errors.lastName.message}</span>}
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="dob" className="form-label form-required">Date of Birth</label>
          <input id="dob" type="date" className={`form-input${errors.dateOfBirth ? ' error' : ''}`} {...register('dateOfBirth')} />
          {errors.dateOfBirth && <span className="form-error">{errors.dateOfBirth.message}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="gender" className="form-label form-required">Gender</label>
          <select id="gender" className="form-select" {...register('gender')}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="phone" className="form-label">Phone</label>
          <input id="phone" className="form-input" {...register('phone')} placeholder="+20 100 000 0000" />
        </div>
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email</label>
          <input id="email" className="form-input" {...register('email')} placeholder="patient@email.com" />
          {errors.email && <span className="form-error">{errors.email.message}</span>}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Medical Record No.</label>
        <input className="form-input" {...register('medicalRecordNo')} placeholder="Optional record number" />
      </div>
      <div className="form-group">
        <label className="form-label">Clinical Notes</label>
        <textarea className="form-textarea" {...register('notes')} placeholder="Any relevant notes…" rows={3} />
      </div>
      <button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
        {isLoading ? 'Saving…' : 'Save Patient'}
      </button>
    </form>
  );
}

export default function PatientsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<Patient | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['patients', page, search],
    queryFn: () => patientsApi.list(page, 20, search || undefined),
    placeholderData: d => d,
  });

  const createMut = useMutation({
    mutationFn: (d: CreatePatientRequest) => patientsApi.create(d),
    onSuccess: () => { toast.success('Patient created'); qc.invalidateQueries({ queryKey: ['patients'] }); setModalMode(null); },
    onError:   () => toast.error('Failed to create patient'),
  });

  const updateMut = useMutation({
    mutationFn: (d: FormData) => patientsApi.update(selected!.id, d),
    onSuccess: () => { toast.success('Patient updated'); qc.invalidateQueries({ queryKey: ['patients'] }); setModalMode(null); },
    onError:   () => toast.error('Failed to update patient'),
  });

  const deleteMut = useMutation({
    mutationFn: () => patientsApi.delete(selected!.id),
    onSuccess: () => { toast.success('Patient deleted'); qc.invalidateQueries({ queryKey: ['patients'] }); setModalMode(null); },
    onError:   () => toast.error('Failed to delete patient'),
  });

  const genderBadge = (g: GenderType) => {
    const map = { Male: 'info', Female: 'accent', Other: 'muted' } as const;
    return <span className={`badge badge-${map[g]}`}>{g}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="page-subtitle">{data?.totalCount ?? 0} patients registered</p>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginLeft: 'auto' }}
          onClick={() => setModalMode('create')}
          id="btn-create-patient"
        >
          <Plus size={16} /> New Patient
        </button>
      </div>

      <div className="page-body">
        {/* Search */}
        <div className="filter-bar" style={{ marginBottom: 20 }}>
          <div className="search-input-wrapper" style={{ flex: 1 }}>
            <Search size={16} className="search-icon" />
            <input
              className="form-input"
              style={{ paddingLeft: 36 }}
              placeholder="Search by name, email, or phone…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              id="patient-search"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !data?.items?.length ? (
          <EmptyState
            icon={<Users size={28} />}
            title="No patients found"
            desc={search ? `No results for "${search}"` : 'Register your first patient to get started.'}
            action={<button className="btn btn-primary" onClick={() => setModalMode('create')}><Plus size={16} />New Patient</button>}
          />
        ) : (
          <>
            <div className="table-container" style={{ height: 500, border: 'none' }}>
              <VirtualPatientTable
                items={data.items}
                onView={(id) => navigate(`/patients/${id}`)}
                onEdit={(p) => { setSelected(p); setModalMode('edit'); }}
                onDelete={(p) => { setSelected(p); setModalMode('delete'); }}
                genderBadge={genderBadge}
              />
            </div>

            {/* Pagination */}
            {(data?.totalPages ?? 1) > 1 && (
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:20 }}>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                <span className="text-sm text-muted" style={{ display:'flex', alignItems:'center' }}>Page {page} / {data?.totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Modal */}
      {modalMode === 'create' && (
        <Modal title="Register New Patient" onClose={() => setModalMode(null)}>
          <PatientForm onSubmit={d => createMut.mutate(d as CreatePatientRequest)} isLoading={createMut.isPending} />
        </Modal>
      )}

      {/* Edit Modal */}
      {modalMode === 'edit' && selected && (
        <Modal title="Edit Patient" onClose={() => setModalMode(null)}>
          <PatientForm
            defaultValues={{
              firstName: selected.firstName,
              lastName:  selected.lastName,
              dateOfBirth: selected.dateOfBirth,
              gender:    selected.gender,
              phone:     selected.phone ?? '',
              email:     selected.email ?? '',
              medicalRecordNo: selected.medicalRecordNo ?? '',
              notes:     selected.notes ?? '',
            }}
            onSubmit={d => updateMut.mutate(d)}
            isLoading={updateMut.isPending}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {modalMode === 'delete' && selected && (
        <Modal
          title="Delete Patient"
          onClose={() => setModalMode(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalMode(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? 'Deleting…' : 'Delete Patient'}
              </button>
            </>
          }
        >
          <p style={{ color:'var(--text-secondary)' }}>
            Are you sure you want to delete <strong style={{ color:'var(--text-primary)' }}>{selected.fullName}</strong>?
            This will permanently remove all studies, images, and analysis sessions associated with this patient.
          </p>
        </Modal>
      )}
    </div>
  );
}
