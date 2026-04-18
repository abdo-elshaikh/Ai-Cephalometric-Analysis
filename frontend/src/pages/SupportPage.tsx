import { MessageSquare, LifeBuoy, Zap, ShieldCheck, Mail, Send, Activity } from 'lucide-react';

export default function SupportPage() {
  const healthStats = [
    { label: 'Cloud API', status: 'Optimal', latency: '24ms' },
    { label: 'AI Inference Engine', status: 'Healthy', latency: '1.2s' },
    { label: 'Storage Cluster', status: 'Operational', latency: '15ms' },
  ];

  return (
    <div className="support-wrapper">
      <style dangerouslySetInnerHTML={{
        __html: `
        .support-wrapper { padding: 40px; max-width: 1000px; margin: 0 auto; }
        .support-header { margin-bottom: 48px; text-align: center; }
        .support-header h1 { font-size: 2.5rem; font-weight: 800; color: var(--color-text-primary); margin-bottom: 8px; }
        .support-header p { color: var(--color-text-secondary); font-size: 1.1rem; }
        
        .support-grid { display: grid; grid-template-columns: 1fr 360px; gap: 32px; }
        
        .ticket-box { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 24px; padding: 32px; box-shadow: var(--shadow-card);
        }
        
        .health-card { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 24px; padding: 24px; box-shadow: var(--shadow-card);
        }
        
        .form-group { margin-bottom: 20px; }
        .form-label { display: block; font-weight: 600; font-size: 0.9rem; margin-bottom: 8px; color: var(--color-text-primary); }
        .form-input, .form-textarea {
          width: 100%; background: var(--color-bg-primary); border: 1px solid var(--color-border);
          padding: 12px; border-radius: 12px; color: var(--color-text-primary); outline: none; transition: 0.2s;
        }
        .form-input:focus, .form-textarea:focus { border-color: var(--color-primary); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        
        .health-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--color-border); }
        .status-tag { padding: 4px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700; background: rgba(16, 185, 129, 0.1); color: #10b981; }
        
        .support-method {
          display: flex; align-items: center; gap: 16px; padding: 20px;
          background: var(--color-bg-primary); border: 1px solid var(--color-border);
          border-radius: 16px; margin-top: 24px; transition: 0.2s; cursor: pointer;
        }
        .support-method:hover { border-color: var(--color-primary); transform: translateY(-2px); }
      `}} />

      <header className="support-header">
        <LifeBuoy size={48} color="var(--color-primary)" style={{ marginBottom: 16 }} />
        <h1>Clinical Assistance</h1>
        <p>Expert support for our AI models and platform capabilities.</p>
      </header>

      <div className="support-grid">
        <div className="ticket-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <MessageSquare size={24} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Open Support Ticket</h2>
          </div>

          <div className="form-group">
            <label className="form-label">Issue Subject</label>
            <input className="form-input" placeholder="e.g., Landmark detection inaccuracy in Model B" />
          </div>

          <div className="form-group">
            <label className="form-label">Urgency Level</label>
            <select className="form-input" style={{ width: '100%' }}>
              <option>Normal (Patient Scheduled)</option>
              <option>High (Surgical Planning)</option>
              <option>Urgent (System Offline)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Clinical Details</label>
            <textarea className="form-textarea" rows={5} placeholder="Describe the behavior or pattern you observed..."></textarea>
          </div>

          <button style={{
            width: '100%', padding: '14px', borderRadius: '14px', background: 'var(--color-primary)',
            color: 'white', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: '10px', boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)'
          }}>
            <Send size={18} /> Submit Ticket
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div className="health-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <Zap size={20} color="var(--color-warning)" />
              <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>System Status</h3>
            </div>

            {healthStats.map(stat => (
              <div key={stat.label} className="health-item">
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{stat.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Ping: {stat.latency}</div>
                </div>
                <div className="status-tag">{stat.status}</div>
              </div>
            ))}
          </div>

          <div className="health-card">
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Direct Contact</h3>
            <div className="support-method">
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Mail size={20} color="var(--color-primary)" />
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>Email Excellence</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>clinicians@ceph.ai</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
