import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Scan, Eye, EyeOff } from 'lucide-react';

const schema = z.object({
  email:    z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (d: FormData) => {
    try {
      await login(d);
      navigate('/dashboard');
    } catch {
      toast.error('Invalid email or password');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">
            <Scan size={28} color="white" />
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>CephAI Platform</div>
            <div className="text-sm text-muted">AI Cephalometric Analysis</div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              id="login-email"
              type="email"
              className={`form-input${errors.email ? ' error' : ''}`}
              {...register('email')}
              placeholder="doctor@clinic.com"
              autoComplete="email"
            />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position:'relative' }}>
              <input
                id="login-password"
                type={showPwd ? 'text' : 'password'}
                className={`form-input${errors.password ? ' error' : ''}`}
                {...register('password')}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{ paddingRight:42 }}
              />
              <button
                type="button"
                style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', padding:4 }}
                onClick={() => setShowPwd(p => !p)}
              >
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>

          <button id="btn-login" type="submit" className="btn btn-primary w-full btn-lg" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:20 }}>
          <span className="text-sm text-muted">Don't have an account? </span>
          <Link to="/register" className="text-sm text-accent">Create account</Link>
        </div>
      </div>
    </div>
  );
}
