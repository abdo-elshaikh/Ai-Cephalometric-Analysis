import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Users, FolderOpen, Activity,
  FileText, History, LogOut, Brain, ChevronRight
} from 'lucide-react'

const navItems = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',   end: true },
  { to: '/patients',  icon: Users,           label: 'Patients' },
  { to: '/history',   icon: History,         label: 'Analysis History' },
  { to: '/reports',   icon: FileText,        label: 'Reports' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="app-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Brain size={18} color="#000" />
          </div>
          <div>
            <div className="sidebar-logo-text">CephAnalysis</div>
            <div className="sidebar-logo-sub">AI Clinical Platform</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Navigation</div>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ padding: '8px 12px', marginBottom: 4 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Signed in as</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, marginTop: 2 }}>
              {user?.email || 'Doctor'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: 2 }}>
              {user?.role || 'Clinician'}
            </div>
          </div>
          <button className="sidebar-link" onClick={handleLogout} style={{ width: '100%', color: 'var(--danger)' }}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  )
}
