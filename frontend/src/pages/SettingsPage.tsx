import { Settings, Sliders, Globe, Bell, Shield, Cpu, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="settings-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        .settings-wrapper { padding: 40px; max-width: 900px; margin: 0 auto; }
        .settings-header { margin-bottom: 48px; }
        .settings-header h1 { font-size: 2.25rem; font-weight: 800; color: var(--color-text-primary); margin-bottom: 8px; }
        .settings-header p { color: var(--color-text-secondary); }
        
        .settings-section { 
          background: var(--color-bg-secondary); border: 1px solid var(--color-border);
          border-radius: 20px; padding: 24px; margin-bottom: 32px; box-shadow: var(--shadow-card);
        }
        
        .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .section-header h2 { font-size: 1.1rem; font-weight: 700; color: var(--color-text-primary); }
        .section-header svg { color: var(--color-primary); }
        
        .setting-item { display: flex; justify-content: space-between; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--color-border); }
        .setting-item:last-child { border-bottom: none; }
        
        .setting-info { flex: 1; }
        .setting-label { font-size: 1rem; font-weight: 600; color: var(--color-text-primary); margin-bottom: 4px; }
        .setting-desc { font-size: 0.85rem; color: var(--color-text-muted); }
        
        .setting-control { min-width: 140px; display: flex; justify-content: flex-end; }
        
        /* Custom Toggle mock */
        .toggle {
          width: 44px; height: 24px; background: rgba(99, 102, 241, 0.2);
          border-radius: 100px; position: relative; cursor: pointer; transition: 0.2s;
        }
        .toggle-on { background: var(--color-primary); }
        .toggle::after {
          content: ''; position: absolute; left: 4px; top: 4px; width: 16px; height: 16px;
          background: white; border-radius: 50%; transition: 0.2s;
        }
        .toggle-on::after { left: 24px; }
        
        select {
          background: var(--color-bg-primary); color: var(--color-text-primary);
          border: 1px solid var(--color-border); padding: 8px 12px; border-radius: 8px; font-weight: 500;
        }
      `}} />

      <header className="settings-header">
        <h1>Preferences</h1>
        <p>Configure your workspace and AI analysis engine defaults.</p>
      </header>

      <div className="settings-section">
        <div className="section-header">
          <Globe size={20} />
          <h2>General Display</h2>
        </div>
        
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Interface Language</div>
            <div className="setting-desc">Primary language for clinical reports and interface labels.</div>
          </div>
          <div className="setting-control">
            <select><option>English (US)</option><option>Spanish</option><option>French</option></select>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Measurement Units</div>
            <div className="setting-desc">Preferred system for linear and angular measurements.</div>
          </div>
          <div className="setting-control">
            <select><option>Millimeters (mm)</option><option>Pixels (px)</option></select>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-header">
          <Cpu size={20} />
          <h2>AI Inference Engine</h2>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Automatic Tracing</div>
            <div className="setting-desc">Begin AI landmark detection immediately after image upload.</div>
          </div>
          <div className="setting-control">
            <div className="toggle toggle-on"></div>
          </div>
        </div>

        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Point Sensitivity</div>
            <div className="setting-desc">Adjust the AI's confidence threshold for landmark prediction.</div>
          </div>
          <div className="setting-control">
            <input type="range" style={{ width: 120, accentColor: 'var(--color-primary)' }} />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <div className="section-header">
          <Bell size={20} />
          <h2>Notifications</h2>
        </div>
        
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">Analysis Competed</div>
            <div className="setting-desc">Notify via browser when a background AI study is finalized.</div>
          </div>
          <div className="setting-control">
            <div className="toggle toggle-on"></div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'right', marginTop: -16 }}>
        <button style={{ 
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', 
          borderRadius: '12px', background: 'var(--color-primary)', color: 'white', 
          border: 'none', fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)'
        }}>
          <RefreshCw size={18} /> Save All Changes
        </button>
      </div>
    </div>
  );
}
