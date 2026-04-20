import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Users, Activity,
  FileText, History, LogOut, Brain
} from 'lucide-react'

const navItems = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard',        end: true },
  { to: '/patients',  icon: Users,           label: 'Patients' },
  { to: '/history',   icon: History,         label: 'Analysis History' },
  { to: '/reports',   icon: FileText,        label: 'Reports' },
]

function AvatarInitials({ name, email }) {
  const src = name || email || 'U'
  const initials = src.split(/[@.\s]/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('')
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      background: 'linear-gradient(135deg, #00c2e0, #6366f1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
      boxShadow: '0 0 0 2px rgba(0,194,224,0.25)',
    }}>
      {initials}
    </div>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName ?? ''}`.trim()
    : user?.email?.split('@')[0] ?? 'Doctor'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Brain size={18} color="#000" />
          </div>
          <div>
            <div className="sidebar-logo-text">CephAnalysis</div>
            <div className="sidebar-logo-sub">AI Clinical Platform</div>
          </div>
        </div>

        {/* Nav */}
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

        {/* Footer — user card */}
        <div className="sidebar-footer">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', marginBottom: 4,
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
          }}>
            <AvatarInitials name={displayName} email={user?.email} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', marginTop: 1 }}>
                {user?.role ?? 'Clinician'}
              </div>
            </div>
          </div>
          <button className="sidebar-link" onClick={handleLogout} style={{ width: '100%', color: 'var(--danger)', gap: 8 }}>
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>
    </div>
  )
}
