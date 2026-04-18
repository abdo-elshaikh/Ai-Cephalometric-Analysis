import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../api/api';
import { useAuthStore } from '../store/useAuthStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data;
      
      setAuth(user, accessToken, refreshToken);
      toast.success('Signed in successfully');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to sign in. Please check your credentials.');
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
      <div className="animate-fade-in-up" style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 60, height: 60, borderRadius: 16,
            background: 'var(--gradient-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(99,120,255,0.35)',
          }}>
            <Activity size={28} color="white" />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>CephAnalysis</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            AI-Powered Cephalometric Analysis Platform
          </p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: 32 }}>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                id="login-email"
                type="email"
                className="form-input"
                placeholder="doctor@clinic.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                id="login-password"
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ marginTop: 4, justifyContent: 'center' }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 20 }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color: 'var(--color-brand)', fontWeight: 500, textDecoration: 'none' }}>
            Sign Up
          </Link>
        </p>

        <p style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 12 }}>
          HIPAA-compliant • Secure JWT authentication
        </p>
      </div>
    </div>
  );
}
