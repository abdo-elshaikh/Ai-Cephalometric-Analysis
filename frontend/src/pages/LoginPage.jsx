import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Brain, Eye, EyeOff, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(form.email, form.password)
      toast.success('Welcome back!')
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg-base)' }}>
      {/* Left panel */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px', maxWidth: '480px', margin: '0 auto'
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{
            width: 44, height: 44, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <Brain size={22} color="#000" />
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>CephAnalysis</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>AI Clinical Platform</div>
          </div>
        </div>

        <div style={{ width: '100%' }}>
          <h1 style={{ fontSize: '1.8rem', marginBottom: 8 }}>Sign In</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 32, fontSize: '0.9rem' }}>
            Access your clinical dashboard
          </p>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: 20 }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-email"
                  className="form-control"
                  type="email"
                  placeholder="doctor@clinic.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={{ paddingLeft: 40 }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="login-password"
                  className="form-control"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ paddingLeft: 40, paddingRight: 40 }}
                  required
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
            >
              {loading ? <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : <>Sign In <ArrowRight size={16} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No account?{' '}
            <Link to="/register" style={{ color: 'var(--accent-primary)' }}>Create one</Link>
          </p>
        </div>
      </div>

      {/* Right panel — decorative */}
      <div style={{
        flex: 1, background: 'linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)',
        borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 48,
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Glow orb */}
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,194,224,0.12) 0%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)'
        }} />
        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: '4rem', marginBottom: 24 }}>🦷</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>AI-Powered Cephalometric Analysis</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
            Detect 19 anatomical landmarks, compute Steiner & McNamara measurements,
            and generate AI-driven clinical diagnoses — all in seconds.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}>
            {['Landmark AI', 'Auto-Diagnosis', 'PDF Reports', 'Treatment Plans'].map(f => (
              <span key={f} className="badge badge-accent">{f}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
