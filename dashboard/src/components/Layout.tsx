/**
 * Enhanced Dashboard Layout with Navigation
 * Improved sidebar, navigation, and main content area styling
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/about', label: 'About', icon: 'ℹ️' },
  { path: '/threats', label: 'Threats', icon: '🛡️' },
  { path: '/incidents', label: 'Incidents', icon: '🚨' },
  { path: '/compliance', label: 'Compliance', icon: '✅' },
  { path: '/audit-logs', label: 'Audit Logs', icon: '📋' },
  { path: '/sessions', label: 'Sessions', icon: '🔐' },
  { path: '/users', label: 'Users', icon: '👥' },
];

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
      navigate('/login', { replace: true });
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="layout">
      {/* Enhanced Sidebar */}
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1 className="sidebar__title">
            <span>🔒</span>
            <span>Security Dashboard</span>
          </h1>
        </div>

        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink 
              key={item.path} 
              to={item.path} 
              active={isActive(item.path)}
              icon={item.icon}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <Button
            variant="danger"
            size="md"
            onClick={handleLogout}
            fullWidth
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* Enhanced Main Content */}
      <main className="main">
        <div className="main__inner">
          {children}
        </div>
      </main>
    </div>
  );
}

interface NavLinkProps {
  to: string;
  active: boolean;
  icon?: string;
  children: React.ReactNode;
}

function NavLink({ to, active, icon, children }: NavLinkProps) {
  return (
    <Link
      to={to}
      className={['nav-link', active ? 'nav-link--active' : ''].filter(Boolean).join(' ')}
    >
      {icon && <span className="nav-icon">{icon}</span>}
      <span>{children}</span>
    </Link>
  );
}
