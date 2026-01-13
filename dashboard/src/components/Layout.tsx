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
    <div className="app-shell">
      {/* Enhanced Sidebar */}
      <aside className="app-shell__sidebar">
        <div className="app-shell__sidebar-brand">
          <div className="app-shell__title">
            <span role="img" aria-label="lock">
              🔒
            </span>{' '}
            Security Dashboard
          </div>
          <div className="app-shell__subtitle">
            Enterprise security hub
          </div>
        </div>

        <nav className="app-shell__nav">
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

        <div className="app-shell__footer">
          <Button
            variant="danger"
            size="md"
            onClick={handleLogout}
            className="button-full"
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* Enhanced Main Content */}
      <main className="app-shell__main">
        <div className="app-shell__content">
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
  const classes = [
    'nav-link',
    active ? 'nav-link--active' : 'nav-link--inactive',
  ].join(' ');

  return (
    <Link
      to={to}
      className={classes}
    >
      {icon && <span className="nav-link__icon">{icon}</span>}
      <span>{children}</span>
    </Link>
  );
}
