import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Users, FolderOpen, FlaskConical,
  FileText, LogOut, Scan, History,
} from 'lucide-react';

const navItems = [
  { section: 'Overview', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]},
  { section: 'Clinical', items: [
    { to: '/patients',  label: 'Patients',  icon: Users },
    { to: '/studies',   label: 'Studies',   icon: FolderOpen },
    { to: '/analysis',  label: 'Analysis',  icon: FlaskConical },
    { to: '/history',   label: 'History',   icon: History },
  ]},
  { section: 'Output', items: [
    { to: '/reports',   label: 'Reports',   icon: FileText },
  ]},
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'DR';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Scan size={20} color="white" />
        </div>
        <div>
          <div className="sidebar-logo-text">CephAI</div>
          <div className="sidebar-logo-sub">Cephalometric Platform</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map(section => (
          <React.Fragment key={section.section}>
            <div className="nav-section-label">{section.section}</div>
            {section.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <item.icon className="nav-item-icon" size={18} />
                {item.label}
              </NavLink>
            ))}
          </React.Fragment>
        ))}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name truncate">{user?.email ?? 'Doctor'}</div>
            <div className="user-role">{user?.role ?? 'Clinician'}</div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={handleLogout}
            title="Logout"
            style={{ marginLeft: 'auto' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
