import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../api/api';
import { useAuthStore } from '../store/useAuthStore';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        fullName,
        email,
        password,
        specialty: specialty || undefined,
      });
      const { user, accessToken, refreshToken } = response.data;

      setAuth(user, accessToken, refreshToken);
      toast.success('Account created successfully!');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-primary)',
      padding: '24px',
    }}>
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 480 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(99,120,255,0.35)',
          }}>
            <Activity size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Join the AI-Powered Cephalometric Analysis Platform
          </p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: 32 }}>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                id="register-fullname"
                type="text"
                className="form-input"
                placeholder="Dr. Ahmed Hassan"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                id="register-email"
                type="email"
                className="form-input"
                placeholder="doctor@clinic.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Specialty <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>(optional)</span></label>
              <input
                id="register-specialty"
                type="text"
                className="form-input"
                placeholder="Orthodontics"
                value={specialty}
                onChange={e => setSpecialty(e.target.value)}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input
                  id="register-password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  id="register-confirm-password"
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <button
              id="register-submit"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ marginTop: 4, justifyContent: 'center' }}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 20 }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--color-brand)', fontWeight: 500, textDecoration: 'none' }}>
            Sign In
          </Link>
        </p>

        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 12 }}>
          HIPAA-compliant • Secure JWT authentication
        </p>
      </div>
    </div>
  );
}
