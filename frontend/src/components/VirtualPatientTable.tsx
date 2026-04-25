import React from 'react';
import { List } from 'react-window';
import { Patient, GenderType } from '@/types';
import { Eye, Edit2, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface VirtualPatientTableProps {
  items: Patient[];
  onView: (id: string) => void;
  onEdit: (p: Patient) => void;
  onDelete: (p: Patient) => void;
  genderBadge: (g: GenderType) => React.ReactNode;
}

interface RowProps {
  items: Patient[];
  onView: (id: string) => void;
  onEdit: (p: Patient) => void;
  onDelete: (p: Patient) => void;
  genderBadge: (g: GenderType) => React.ReactNode;
}

const PatientRow = ({ index, style, items, onView, onEdit, onDelete, genderBadge }: { 
  index: number; 
  style: React.CSSProperties; 
} & RowProps) => {
  const p = items[index];
  if (!p) return null;
  
  return (
    <div style={{ ...style, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 12px' }}>
      <div style={{ flex: 2, minWidth: 150 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.fullName}</div>
        {p.medicalRecordNo && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{p.medicalRecordNo}</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 80, fontSize: '14px' }}>{p.age} yrs</div>
      <div style={{ flex: 1, minWidth: 80 }} className="hide-xs">{genderBadge(p.gender)}</div>
      <div style={{ flex: 1.5, minWidth: 120, fontSize: '13px', color: 'var(--text-muted)' }} className="hide-mobile">{p.phone ?? '—'}</div>
      <div style={{ flex: 1.5, minWidth: 150, fontSize: '13px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }} className="hide-mobile">
        {p.email ?? '—'}
      </div>
      <div style={{ flex: 1.5, minWidth: 120, fontSize: '13px', color: 'var(--text-muted)' }} className="hide-mobile">
        {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
      </div>
      <div style={{ width: 100, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-icon btn-sm" title="View" onClick={() => onView(p.id)}>
          <Eye size={14} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => onEdit(p)}>
          <Edit2 size={14} />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => onDelete(p)} style={{ color: 'var(--danger)' }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};

export default function VirtualPatientTable(props: VirtualPatientTableProps) {
  return (
    <div className="card" style={{ height: 500, overflow: 'hidden' }}>
      <div style={{ 
        display: 'flex', 
        padding: '12px', 
        background: 'var(--bg-elevated)', 
        borderBottom: '1px solid var(--border)',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        <div style={{ flex: 2, minWidth: 150 }}>Name</div>
        <div style={{ flex: 1, minWidth: 80 }}>Age</div>
        <div style={{ flex: 1, minWidth: 80 }} className="hide-xs">Gender</div>
        <div style={{ flex: 1.5, minWidth: 120 }} className="hide-mobile">Phone</div>
        <div style={{ flex: 1.5, minWidth: 150 }} className="hide-mobile">Email</div>
        <div style={{ flex: 1.5, minWidth: 120 }} className="hide-mobile">Registered</div>
        <div style={{ width: 100, textAlign: 'right' }}>Actions</div>
      </div>
      <List<RowProps>
        rowCount={props.items.length}
        rowHeight={56}
        rowComponent={PatientRow}
        rowProps={{
          items: props.items,
          onView: props.onView,
          onEdit: props.onEdit,
          onDelete: props.onDelete,
          genderBadge: props.genderBadge
        }}
        style={{ height: 450 }}
      />
    </div>
  );
}
