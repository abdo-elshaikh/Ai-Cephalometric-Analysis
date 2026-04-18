import { User, Mail, Shield, Award, Calendar, Activity, Edit3 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export default function ProfilePage() {
  const { user } = useAuthStore();

  return (
    <div className="profile-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        .profile-wrapper { padding: 40px; max-width: 1000px; margin: 0 auto; }
        .profile-header { display: flex; align-items: flex-end; gap: 32px; margin-bottom: 48px; }
        
        .profile-avatar-large {
          width: 120px; height: 120px; border-radius: 32px;
          background: var(--gradient-brand); color: white;
          display: flex; align-items: center; justify-content: center;
          font-size: 3rem; font-weight: 800; box-shadow: 0 20px 40px rgba(99, 102, 241, 0.2);
        }
        
        .header-content h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 8px; color: var(--color-text-primary); }
        .header-content p { font-size: 1.1rem; color: var(--color-text-secondary); }
        
        .profile-grid { display: grid; grid-template-columns: 1fr 340px; gap: 32px; }
        .info-card { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 24px; padding: 32px; box-shadow: var(--shadow-card);
        }
        
        .section-title { 
          font-size: 1.1rem; font-weight: 700; color: var(--color-text-primary);
          margin-bottom: 24px; display: flex; align-items: center; gap: 12px;
        }
        
        .detail-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--color-border); }
        .detail-row:last-child { border-bottom: none; }
        .detail-icon { color: var(--color-text-muted); }
        .detail-label { font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 4px; }
        .detail-value { font-size: 1rem; font-weight: 600; color: var(--color-text-primary); }
        
        .credential-badge {
          display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px;
          background: rgba(99, 102, 241, 0.1); color: var(--color-primary);
          border-radius: 100px; font-size: 0.85rem; font-weight: 600; margin-top: 12px;
        }

        .stats-mini-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        .mini-stat {
          background: var(--color-bg-primary); border: 1px solid var(--color-border);
          padding: 16px; border-radius: 16px; text-align: center;
        }
        .mini-stat-val { font-size: 1.25rem; font-weight: 700; color: var(--color-primary); }
        .mini-stat-label { font-size: 0.75rem; color: var(--color-text-muted); }
      `}} />

      <header className="profile-header">
        <div className="profile-avatar-large">{user?.fullName?.charAt(0) || 'D'}</div>
        <div className="header-content">
          <h1>{user?.fullName || 'Dr. Clinical'}</h1>
          <p>{user?.specialty || 'Orthodontist'} • Senior Practitioner</p>
          <div className="credential-badge">
            <Shield size={16} /> Verified Clinician
          </div>
        </div>
      </header>

      <div className="profile-grid">
        <div className="info-card">
          <h2 className="section-title"><User size={20} color="var(--color-primary)" /> Personal Credentials</h2>
          
          <div className="detail-row">
            <Mail className="detail-icon" size={20} />
            <div style={{ flex: 1 }}>
              <div className="detail-label">Email Address</div>
              <div className="detail-value">{user?.email || 'dr.clinical@ceph.ai'}</div>
            </div>
            <button style={{ background: 'transparent', border: 'none', color: 'var(--color-primary)', cursor: 'pointer' }}><Edit3 size={16} /></button>
          </div>

          <div className="detail-row">
            <Award className="detail-icon" size={20} />
            <div style={{ flex: 1 }}>
              <div className="detail-label">Professional Registry ID</div>
              <div className="detail-value">MC-99420-ORTO</div>
            </div>
          </div>

          <div className="detail-row">
            <Calendar className="detail-icon" size={20} />
            <div style={{ flex: 1 }}>
              <div className="detail-label">Member Since</div>
              <div className="detail-value">March 2024</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="info-card" style={{ padding: 24 }}>
            <h2 className="section-title" style={{ marginBottom: 16 }}><Activity size={18} color="var(--color-success)" /> Performance</h2>
            <div className="stats-mini-grid">
              <div className="mini-stat">
                <div className="mini-stat-val">124</div>
                <div className="mini-stat-label">Cases Analysed</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-val">98%</div>
                <div className="mini-stat-label">Accuracy</div>
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
              Your clinical adjustments have helped optimize the AI engine for the Steiner-V2 model.
            </p>
          </div>

          <div className="info-card" style={{ padding: 24, textAlign: 'center' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Security Center</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>Two-factor authentication is currently inactive.</p>
            <button style={{ 
              width: '100%', padding: '10px', borderRadius: '12px', background: 'var(--color-primary)', 
              color: 'white', border: 'none', fontWeight: 600, cursor: 'pointer' 
            }}>Enable 2FA</button>
          </div>
        </div>
      </div>
    </div>
  );
}
