import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Scan } from 'lucide-react';

const schema = z.object({
  firstName: z.string().min(1, 'First name required'),
  lastName:  z.string().min(1, 'Last name required'),
  email:     z.string().email('Invalid email'),
  password:  z.string().min(8, 'Minimum 8 characters'),
  confirm:   z.string(),
}).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (d: FormData) => {
    try {
      await registerUser({ firstName: d.firstName, lastName: d.lastName, email: d.email, password: d.password });
      toast.success('Account created — please sign in');
      navigate('/login');
    } catch {
      toast.error('Registration failed. Email may already be in use.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth:460 }}>
        <div className="auth-logo">
          <div className="auth-logo-mark">
            <Scan size={28} color="white" />
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>Create Account</div>
            <div className="text-sm text-muted">Register as a clinician</div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">First Name</label>
              <input className={`form-input${errors.firstName ? ' error' : ''}`} {...register('firstName')} placeholder="Ahmed" />
              {errors.firstName && <span className="form-error">{errors.firstName.message}</span>}
            </div>
            <div className="form-group">
              <label className="form-label">Last Name</label>
              <input className={`form-input${errors.lastName ? ' error' : ''}`} {...register('lastName')} placeholder="Hassan" />
              {errors.lastName && <span className="form-error">{errors.lastName.message}</span>}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className={`form-input${errors.email ? ' error' : ''}`} {...register('email')} placeholder="doctor@clinic.com" />
            {errors.email && <span className="form-error">{errors.email.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className={`form-input${errors.password ? ' error' : ''}`} {...register('password')} placeholder="Min. 8 characters" />
            {errors.password && <span className="form-error">{errors.password.message}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Confirm Password</label>
            <input type="password" className={`form-input${errors.confirm ? ' error' : ''}`} {...register('confirm')} placeholder="Repeat password" />
            {errors.confirm && <span className="form-error">{errors.confirm.message}</span>}
          </div>
          <button type="submit" className="btn btn-primary w-full btn-lg" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:16 }}>
          <span className="text-sm text-muted">Already have an account? </span>
          <Link to="/login" className="text-sm text-accent">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
