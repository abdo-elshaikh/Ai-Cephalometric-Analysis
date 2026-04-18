import { useState, useEffect } from 'react';
import { Outlet, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Brain, FileText, Settings,
  Activity, LogOut, Menu, ChevronLeft, ChevronRight,
  Search, Bell, HelpCircle, User, Sun, Moon
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore } from '../store/useThemeStore';
import aiApi from '../api/aiApi';

/**
 * Navigation configuration for better maintainability
 */
const NAVIGATION_CONFIG = {
  main: [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Patients', to: '/patients', icon: Users },
  ],
  workspace: [
    { label: 'Case History', to: '/history', icon: Brain },
    { label: 'Reports', to: '/reports', icon: FileText },
  ],
  support: [
    { label: 'Documentation', to: '/docs', icon: HelpCircle },
    { label: 'Help & Support', to: '/support', icon: Bell },
    { label: 'Settings', to: '/settings', icon: Settings },
  ]
};

export default function AppLayout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  // State management
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isAiOnline, setIsAiOnline] = useState(true);

  // Handle scroll for header effects
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      setScrolled(target.scrollTop > 20);
    };
    const mainContent = document.getElementById('main-content-area');
    mainContent?.addEventListener('scroll', handleScroll);
    return () => mainContent?.removeEventListener('scroll', handleScroll);
  }, []);

  // Check AI Health globally
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await aiApi.get('/health');
        setIsAiOnline(res.data?.status === 'healthy');
      } catch {
        setIsAiOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Poll every 30s for sidebar
    return () => clearInterval(interval);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsProfileOpen(false);
  }, [location.pathname]);

  // Auth Guard
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Breadcrumb generator
  const getBreadcrumbs = () => {
    const paths = location.pathname.split('/').filter(p => p);
    return paths.map((path, index) => {
      const to = `/${paths.slice(0, index + 1).join('/')}`;
      const isLast = index === paths.length - 1;
      const label = path.charAt(0).toUpperCase() + path.slice(1);
      return (
        <span key={to} style={{ display: 'flex', alignItems: 'center' }}>
          {index > 0 && <ChevronRight size={14} style={{ margin: '0 8px', color: 'var(--color-text-muted)' }} />}
          <span style={{ 
            color: isLast ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            fontWeight: isLast ? 700 : 500
          }}>
            {label}
          </span>
        </span>
      );
    });
  };

  return (
    <div className={`app-container ${theme}-theme`}>
      <style dangerouslySetInnerHTML={{
        __html: `
        :root {
          --sidebar-width: 280px;
          --sidebar-collapsed-width: 88px;
          --header-height: 72px;
          --primary: #6366f1;
          --transition-smooth: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .app-container {
          display: flex;
          height: 100vh;
          width: 100vw;
          overflow: hidden;
          background-color: var(--color-bg-primary);
          color: var(--color-text-primary);
          transition: background 0.4s ease, color 0.4s ease;
        }

        /* --- Sidebar --- */
        .sidebar {
          width: var(--sidebar-width);
          background: var(--color-bg-secondary);
          backdrop-filter: var(--glass-blur);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          transition: var(--transition-smooth);
          position: relative;
          z-index: 100;
        }
        .sidebar.collapsed { width: var(--sidebar-collapsed-width); }

        .sidebar-header {
          height: var(--header-height);
          padding: 0 24px;
          display: flex;
          align-items: center;
          gap: 14px;
          border-bottom: 1px solid var(--color-border);
        }
        .logo-box {
          width: 40px; height: 40px; border-radius: 12px;
          background: var(--gradient-brand);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 16px rgba(99, 102, 241, 0.2);
          flex-shrink: 0;
        }
        .logo-text { font-weight: 800; font-size: 1.25rem; letter-spacing: -0.03em; color: var(--color-text-primary); white-space: nowrap; }
        .collapsed .logo-text { opacity: 0; visibility: hidden; width: 0; }

        .sidebar-content { flex: 1; padding: 24px 16px; overflow-y: auto; }
        .nav-group { margin-bottom: 32px; }
        .nav-group-label {
          padding: 0 12px; font-size: 0.7rem; font-weight: 700; color: var(--color-text-muted);
          text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 12px;
        }
        .collapsed .nav-group-label { opacity: 0; text-align: center; }

        .nav-link {
          display: flex; align-items: center; gap: 12px; padding: 12px; margin-bottom: 4px;
          border-radius: 12px; color: var(--color-text-secondary); text-decoration: none;
          font-size: 0.95rem; font-weight: 500; transition: var(--transition-smooth);
        }
        .nav-link:hover { background: var(--color-bg-card-hover); color: var(--color-text-primary); transform: translateX(4px); }
        .nav-link.active { background: rgba(99, 102, 241, 0.08); color: var(--color-primary); box-shadow: inset 2px 0 0 var(--color-primary); }
        .collapsed .nav-link { justify-content: center; padding: 12px 0; }
        .collapsed .nav-link:hover { transform: scale(1.1); }
        .collapsed .nav-link span { display: none; }

        .sidebar-footer { padding: 16px; border-top: 1px solid var(--color-border); }
        .status-pill {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.75rem;
          color: var(--color-text-secondary);
        }
        .collapsed .status-pill { justify-content: center; padding: 12px 0; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-success); box-shadow: 0 0 8px var(--color-success); }
        .collapsed .status-text { display: none; }

        /* --- Top Nav --- */
        .top-nav {
          height: var(--header-height);
          padding: 0 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: transparent;
          z-index: 90;
          transition: var(--transition-smooth);
        }
        .top-nav.scrolled {
          background: var(--color-bg-primary);
          backdrop-filter: var(--glass-blur);
          border-bottom: 1px solid var(--color-border);
        }
        .breadcrumb { display: flex; align-items: center; font-size: 0.9rem; }
        
        .top-actions { display: flex; align-items: center; gap: 16px; }
        .action-btn {
          width: 42px; height: 42px; border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          color: var(--color-text-secondary);
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          cursor: pointer; transition: all 0.2s;
        }
        .action-btn:hover { background: var(--color-bg-card-hover); color: var(--color-text-primary); transform: translateY(-2px); }
        
        .profile-container { position: relative; }
        .profile-trigger {
          display: flex; align-items: center; gap: 10px; padding: 6px;
          border-radius: 14px; border: 1px solid var(--color-border);
          cursor: pointer; transition: all 0.2s;
        }
        .profile-trigger:hover { background: var(--color-bg-card-hover); }
        .avatar-box {
          width: 32px; height: 32px; border-radius: 8px;
          background: var(--gradient-brand); color: white;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700; font-size: 0.8rem;
        }
        
        .profile-menu {
          position: absolute; right: 0; top: 110%; width: 220px;
          background: var(--color-bg-secondary);
          backdrop-filter: var(--glass-blur);
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 12px;
          box-shadow: var(--shadow-card);
          z-index: 200;
          animation: slideUp 0.2s ease;
        }
        .menu-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px;
          border-radius: 8px; color: var(--color-text-secondary);
          font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.2s;
        }
        .menu-item:hover { background: var(--color-bg-card-hover); color: var(--color-text-primary); }
        .menu-item.danger { color: var(--color-error); }
        .menu-item.danger:hover { background: rgba(239, 68, 68, 0.1); }
        
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

        .content-area { flex: 1; overflow-y: auto; padding: 32px; }
        .collapse-toggle {
          position: absolute; right: -12px; top: 24px; width: 24px; height: 24px;
          background: var(--color-primary); border-radius: 6px; color: white;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: none;
        }
      `}} />

      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''} ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <button className="collapse-toggle" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}>
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="sidebar-header">
          <div className="logo-box"><Activity size={22} color="white" /></div>
          <span className="logo-text">CephAnalysis</span>
        </div>

        <div className="sidebar-content">
          <div className="nav-group">
            <div className="nav-group-label">Core</div>
            {NAVIGATION_CONFIG.main.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Intelligence</div>
            {NAVIGATION_CONFIG.workspace.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Support</div>
            {NAVIGATION_CONFIG.support.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="status-pill">
            <div className="status-dot" style={{ 
              background: isAiOnline ? 'var(--color-success)' : 'var(--color-error)',
              boxShadow: isAiOnline ? '0 0 8px var(--color-success)' : '0 0 8px var(--color-error)'
            }} />
            <span className="status-text">AI Engine: <strong>{isAiOnline ? 'Healthy' : 'Offline'}</strong></span>
          </div>
        </div>
      </aside>

      <div className="main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className={`top-nav ${scrolled ? 'scrolled' : ''}`}>
          <div className="breadcrumb">
            {getBreadcrumbs()}
          </div>

          <div className="top-actions">
            <button className="action-btn" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="action-btn"><Bell size={20} /></button>
            
            <div className="profile-container">
              <div className="profile-trigger" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <div className="avatar-box">{user?.fullName?.charAt(0) || 'D'}</div>
                {!isSidebarCollapsed && (
                  <div style={{ paddingRight: 8 }}><ChevronRight size={14} style={{ transform: isProfileOpen ? 'rotate(90deg)' : 'none', transition: '0.2s' }} /></div>
                )}
              </div>
              
              {isProfileOpen && (
                <div className="profile-menu">
                  <div style={{ padding: '0 12px 12px', borderBottom: '1px solid var(--color-border)', marginBottom: 8 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{user?.fullName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{user?.email}</div>
                  </div>
                  <div className="menu-item"><User size={16} /> My Profile</div>
                  <div className="menu-item"><Settings size={16} /> Settings</div>
                  <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0' }} />
                  <div className="menu-item danger" onClick={handleLogout}><LogOut size={16} /> Logout</div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="content-area" id="main-content-area">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
