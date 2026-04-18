import { useState, useEffect } from 'react';
import { Users, Activity, Brain, FileText, TrendingUp, Clock, Plus, ArrowUpRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/api';
import aiApi from '../api/aiApi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';

interface DashboardStats {
  totalPatients: number;
  activeStudies: number;
  totalAnalyses: number;
  reportsGenerated: number;
  recentActivity: Array<{
    type: string;
    title: string;
    detail: string;
    time: string;
  }>;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ping, setPing] = useState<number>(0);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get('/dashboard/stats');
      setStats(res.data);
    } catch (e) {
      toast.error('Failed to load dashboard metrics');
    }
    setLoading(false);
  };

  const fetchHealth = async () => {
    const startTime = Date.now();
    try {
      const res = await aiApi.get('/health');
      setHealth(res.data);
      setPing(Date.now() - startTime);
    } catch (e) {
      setHealth({ status: 'offline' });
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000); // Poll health every 10s
    return () => clearInterval(interval);
  }, []);

  const getTimeAgo = (dateStr: string) => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return then.toLocaleDateString();
  };

  const metricCards = [
    { label: 'Total Patients', value: stats?.totalPatients || 0, icon: Users, color: '#6366f1', link: '/patients' },
    { label: 'Active Cases', value: stats?.activeStudies || 0, icon: Activity, color: '#a855f7', link: '/history' },
    { label: 'AI Analyses', value: stats?.totalAnalyses || 0, icon: Brain, color: '#ec4899', link: '/history' },
    { label: 'Reports', value: stats?.reportsGenerated || 0, icon: FileText, color: '#10b981', link: '/reports' },
  ];

  return (
    <div className="dashboard-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        .dashboard-wrapper {
          padding: 40px;
          max-width: 1400px;
          margin: 0 auto;
        }
        .hero-section {
          margin-bottom: 48px;
        }
        .hero-title {
          font-size: 2.25rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
          color: var(--color-text-primary);
        }
        .hero-subtitle {
          color: var(--color-text-secondary);
          font-size: 1.1rem;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 24px;
          margin-bottom: 48px;
        }
        .metric-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 24px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: pointer;
          position: relative;
          overflow: hidden;
          box-shadow: var(--shadow-card);
          backdrop-filter: var(--glass-blur);
        }
        .metric-card:hover {
          transform: translateY(-8px);
          background: var(--color-bg-card-hover);
          border-color: var(--color-primary);
          box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.2);
        }
        .metric-icon-box {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        }
        .metric-value {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 4px;
          color: var(--color-text-primary);
        }
        .metric-label {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          font-weight: 500;
        }
        .metric-trend {
          position: absolute;
          top: 24px;
          right: 24px;
          color: var(--color-text-muted);
          opacity: 0.4;
        }
        .main-grid {
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 32px;
        }
        @media (max-width: 1100px) {
          .main-grid {
            grid-template-columns: 1fr;
          }
        }
        .content-card {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 24px;
          padding: 32px;
          box-shadow: var(--shadow-card);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .card-title {
          font-size: 1.35rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--color-text-primary);
        }
        .activity-item {
          display: flex;
          gap: 16px;
          padding: 16px 0;
          border-bottom: 1px solid var(--color-border);
        }
        .activity-item:last-child {
          border-bottom: none;
        }
        .activity-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          margin-top: 6px;
          flex-shrink: 0;
        }
        .quick-action {
          width: 100%;
          padding: 16px;
          border-radius: 16px;
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          color: var(--color-text-primary);
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 600;
          transition: all 0.2s;
          margin-bottom: 12px;
          text-decoration: none;
        }
        .quick-action:hover {
          background: var(--color-primary);
          color: white;
          transform: translateX(4px);
          border-color: var(--color-primary);
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.33); opacity: 1; }
          80%, 100% { opacity: 0; }
        }
        @keyframes pulse-dot {
          0% { transform: scale(0.8); }
          50% { transform: scale(1); }
          100% { transform: scale(0.8); }
        }
        .pulse-box {
          position: relative;
          width: 14px;
          height: 14px;
          display: inline-block;
          margin-right: 8px;
        }
        .pulse-ring {
          position: absolute;
          width: 300%;
          height: 300%;
          top: -100%;
          left: -100%;
          border-radius: 45px;
          animation: pulse-ring 3s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
        }
        .pulse-dot {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: pulse-dot 3s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite;
        }
      `}} />

      <header className="hero-section">
        <h1 className="hero-title">
          Welcome back, <span style={{ color: '#6366f1' }}>{user?.fullName?.split(' ')[0]}</span>
        </h1>
        <p className="hero-subtitle">
          Here's an overview of your clinical activity for {new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}.
        </p>
      </header>

      <div className="stats-grid">
        {metricCards.map(({ label, value, icon: Icon, color, link }) => (
          <div key={label} className="metric-card" onClick={() => navigate(link)}>
            <div className="metric-trend"><ArrowUpRight size={20} /></div>
            <div className="metric-icon-box" style={{ background: `${color}15`, color }}>
              <Icon size={24} />
            </div>
            <div className="metric-value">{loading ? '...' : value}</div>
            <div className="metric-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="main-grid">
        <div className="content-card">
          <div className="card-header">
            <h2 className="card-title">
              <Clock size={22} color="#f59e0b" />
              Recent Activity
            </h2>
          </div>
          
          <div className="activity-list">
            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>Loading activity...</div>
            ) : !stats?.recentActivity?.length ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: '#64748b' }}>No recent activity to show.</div>
            ) : (
              stats.recentActivity.map((item, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-indicator" style={{ background: '#6366f1', boxShadow: '0 0 12px rgba(99, 102, 241, 0.4)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{item.detail}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{getTimeAgo(item.time)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div className="content-card" style={{ padding: 24 }}>
            <h2 className="card-title" style={{ marginBottom: 20, fontSize: '1.1rem' }}>
              <TrendingUp size={18} color="#10b981" />
              Quick Actions
            </h2>
            <Link to="/patients" className="quick-action">
              <Plus size={18} /> Add Patient
            </Link>
            <Link to="/patients" className="quick-action" style={{ background: 'rgba(168, 85, 247, 0.05)', borderColor: 'rgba(168, 85, 247, 0.1)' }}>
              <Activity size={18} style={{ color: '#a855f7' }} /> New Analysis
            </Link>
            <Link to="/history" className="quick-action" style={{ background: 'rgba(236, 72, 153, 0.05)', borderColor: 'rgba(236, 72, 153, 0.1)' }}>
              <FileText size={18} style={{ color: '#ec4899' }} /> Manage Cases
            </Link>
          </div>

          <div className="content-card" style={{ padding: 24, background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <Brain size={24} color="#6366f1" />
              <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.75rem', fontWeight: 600, color: health?.status === 'healthy' ? '#10b981' : '#f59e0b' }}>
                <div className="pulse-box">
                  <div className="pulse-ring" style={{ background: health?.status === 'healthy' ? '#10b981' : '#f59e0b' }} />
                  <div className="pulse-dot" style={{ background: health?.status === 'healthy' ? '#10b981' : '#f59e0b' }} />
                </div>
                {health?.status === 'healthy' ? 'ACTIVE' : 'OFFLINE'}
              </div>
            </div>
            
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>AI System Health</h3>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
              {health?.status === 'healthy' ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Inference latency:</span>
                    <span style={{ color: '#6366f1' }}>{ping}ms</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>Primary API (OpenAI):</span>
                    <span style={{ color: health?.providers?.openai === 'available' ? '#10b981' : '#ef4444' }}>
                      {health?.providers?.openai === 'available' ? 'OPERATIONAL' : 'MISSING'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Fallback (Gemini):</span>
                    <span style={{ color: health?.providers?.gemini === 'available' ? '#10b981' : '#ef4444' }}>
                      {health?.providers?.gemini === 'available' ? 'OPERATIONAL' : 'MISSING'}
                    </span>
                  </div>
                </>
              ) : (
                "AI service is currently unresponsive. Some diagnostic features may be limited."
              )}
            </div>

            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 24 }}>
              {[1, 1, 1, 1, 1, 1, 0.9, 1, 1, 0.8, 1, 1, 1, 1, 1].map((v, i) => (
                <div 
                  key={i} 
                  style={{ 
                    height: `${v * 100}%`, 
                    flex: 1, 
                    background: health?.status === 'healthy' ? (v === 1 ? '#10b981' : '#f59e0b') : '#334155', 
                    borderRadius: 2,
                    opacity: 0.3 + (i / 15) * 0.7
                  }} 
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
