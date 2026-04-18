import { useState, useEffect } from 'react';
import { X, User, Calendar, Mail, Phone, FileText, CheckCircle2, RefreshCw } from 'lucide-react';
import api from '../api/api';
import toast from 'react-hot-toast';


interface PatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (patient: any) => void;
  patient?: any;
}

export default function PatientModal({ isOpen, onClose, onSuccess, patient }: PatientModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'Male',
    medicalRecordNo: '',
    phone: '',
    email: '',
    notes: ''
  });

  // ── MRN generation ──────────────────────────────────────────────────────
  const generateMrn = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return `PTN-${date}-${suffix}`;
  };

  useEffect(() => {
    if (isOpen) {
      if (patient) {
        setFormData({
          firstName: patient.firstName || '',
          lastName: patient.lastName || '',
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.split('T')[0] : '',
          gender: patient.gender || 'Male',
          medicalRecordNo: patient.medicalRecordNo || '',
          phone: patient.phone || '',
          email: patient.email || '',
          notes: patient.notes || ''
        });
      } else {
        setFormData({
          firstName: '',
          lastName: '',
          dateOfBirth: '',
          gender: 'Male',
          medicalRecordNo: generateMrn(), // ← auto-generate for new patients
          phone: '',
          email: '',
          notes: ''
        });
      }
      setIsAnimating(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen, patient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const action = patient ? 'Updating' : 'Registering';
    const toastId = toast.loading(`${action} patient...`);
    try {
      // Send null for MRN when blank — backend auto-generates a unique MRN
      const payload = {
        ...formData,
        medicalRecordNo: formData.medicalRecordNo.trim() || null,
      };
      let res;
      if (patient) {
        res = await api.put(`/patients/${patient.id}`, payload);
        toast.success('Patient updated successfully', { id: toastId });
      } else {
        res = await api.post('/patients', payload);
        toast.success('Patient registered successfully', { id: toastId });
      }
      onSuccess?.(res.data);
      onClose();
    } catch (error: any) {
      const msg = error.response?.data?.error
        || error.response?.data?.message
        || `Failed to ${action.toLowerCase()} patient`;
      toast.error(msg, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !isAnimating) return null;

  return (
    <div
      className={`modal-overlay ${isOpen ? 'modal-overlay--active' : ''}`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', transition: 'opacity 0.3s ease',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
    >
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes modal-scale-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .modal-content {
          animation: modal-scale-in 0.3s cubic-bezier(0.165, 0.84, 0.44, 1) forwards;
        }
        .form-input-group {
          position: relative;
          margin-bottom: 20px;
        }
        .form-input-group label {
          display: block;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--color-text-muted, #94a3b8);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .form-input-group input, .form-input-group select, .form-input-group textarea {
          width: 100%;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          padding: 10px 12px;
          color: white;
          font-size: 0.9rem;
          transition: all 0.2s;
          outline: none;
        }
        .form-input-group input:focus, .form-input-group select:focus, .form-input-group textarea:focus {
          border-color: var(--color-brand, #6366f1);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }
      `}} />

      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '650px',
          background: 'linear-gradient(135deg, #141b2d 0%, #0c111d 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 32px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.01)'
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <User className="text-brand" size={24} style={{ color: '#6366f1' }} />
              {patient ? 'Edit Clinical Profile' : 'Register New Patient'}
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
              {patient ? 'Modify existing patient information and clinical notes.' : 'Complete the fields below to create a clinical profile.'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.04)', border: 'none', borderRadius: '50%',
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#94a3b8', transition: 'all 0.2s'
            }}
            onMouseOver={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
            onMouseOut={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="form-input-group">
              <label>First Name</label>
              <input
                type="text" required placeholder="e.g. John"
                value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div className="form-input-group">
              <label>Last Name</label>
              <input
                type="text" required placeholder="e.g. Doe"
                value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="form-input-group">
              <label><Calendar size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Date of Birth</label>
              <input
                type="date" required
                value={formData.dateOfBirth} onChange={e => setFormData({ ...formData, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="form-input-group">
              <label>Gender</label>
              <select
                value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div className="form-input-group">
              <label><CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> MRN</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Auto-generated"
                  value={formData.medicalRecordNo}
                  onChange={e => setFormData({ ...formData, medicalRecordNo: e.target.value })}
                  style={{ paddingRight: 38, fontFamily: 'monospace', fontSize: '0.82rem', letterSpacing: '0.04em' }}
                />
                <button
                  type="button"
                  title="Regenerate MRN"
                  onClick={() => setFormData(f => ({ ...f, medicalRecordNo: generateMrn() }))}
                  style={{
                    position: 'absolute', right: 8,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(99,102,241,0.7)', padding: 4, borderRadius: 4,
                    display: 'flex', alignItems: 'center',
                    transition: 'color 0.15s',
                  }}
                  onMouseOver={e => (e.currentTarget.style.color = '#818cf8')}
                  onMouseOut={e => (e.currentTarget.style.color = 'rgba(99,102,241,0.7)')}
                >
                  <RefreshCw size={14} />
                </button>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                Click <RefreshCw size={10} style={{ verticalAlign: 'middle' }} /> to regenerate, or type a custom MRN
              </div>
            </div>
            <div className="form-input-group">
              <label><Phone size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Phone</label>
              <input
                type="tel" placeholder="+12345678"
                value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="form-input-group">
            <label><Mail size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Email Address</label>
            <input
              type="email" placeholder="patient@example.com"
              value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="form-input-group">
            <label><FileText size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Initial Clinical Notes</label>
            <textarea
              rows={3} placeholder="Add any relevant history or notes..."
              value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          {/* Footer Actions */}
          <div style={{
            marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '12px',
            paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <button
              type="button" onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: '10px', background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white',
                cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, transition: 'all 0.2s'
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              style={{
                padding: '10px 24px', borderRadius: '10px',
                background: loading ? 'rgba(99, 102, 241, 0.5)' : '#6366f1',
                border: 'none', color: 'white',
                cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)', transition: 'all 0.2s'
              }}
              onMouseOver={e => !loading && (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseOut={e => !loading && (e.currentTarget.style.transform = 'translateY(0)')}
            >
              {loading ? 'Processing...' : (patient ? 'Save Changes' : 'Register Patient')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
