/**
 * Enhanced Dashboard Layout with Navigation
 * Improved sidebar, navigation, and main content area styling
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import { theme } from '../styles/theme';
import { Button } from './Button';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
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
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      fontFamily: theme.typography.fontFamily.sans,
      backgroundColor: theme.colors.background.secondary,
    }}>
      {/* Enhanced Sidebar */}
      <aside style={{
        width: '260px',
        backgroundColor: theme.colors.neutral[800],
        color: theme.colors.text.inverse,
        padding: theme.spacing.lg,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: theme.shadows.lg,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}>
        <div style={{ 
          marginBottom: theme.spacing['2xl'],
          paddingBottom: theme.spacing.lg,
          borderBottom: `1px solid ${theme.colors.neutral[700]}`,
        }}>
          <h1 style={{ 
            fontSize: theme.typography.fontSize.xl, 
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.inverse,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}>
            <span>🔒</span>
            <span>Security Dashboard</span>
          </h1>
        </div>

        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
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

        <div style={{ 
          paddingTop: theme.spacing.lg,
          borderTop: `1px solid ${theme.colors.neutral[700]}`,
        }}>
          <Button
            variant="danger"
            size="md"
            onClick={handleLogout}
            style={{ width: '100%' }}
          >
            Logout
          </Button>
        </div>
      </aside>

      {/* Enhanced Main Content */}
      <main style={{ 
        flex: 1, 
        backgroundColor: theme.colors.background.secondary, 
        padding: theme.spacing.xl,
        minHeight: '100vh',
        maxWidth: '100%',
        overflowX: 'hidden',
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
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
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.md,
        backgroundColor: active 
          ? theme.colors.primary[600] 
          : isHovered 
            ? theme.colors.neutral[700] 
            : 'transparent',
        color: theme.colors.text.inverse,
        textDecoration: 'none',
        fontSize: theme.typography.fontSize.base,
        fontWeight: active 
          ? theme.typography.fontWeight.semibold 
          : theme.typography.fontWeight.normal,
        transition: theme.transitions.normal,
        borderLeft: active ? `3px solid ${theme.colors.primary[400]}` : '3px solid transparent',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon && <span style={{ fontSize: '18px' }}>{icon}</span>}
      <span>{children}</span>
    </Link>
  );
}
