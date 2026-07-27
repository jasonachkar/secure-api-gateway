/**
 * Enhanced Dashboard Layout with Navigation
 * Improved sidebar, navigation, and main content area styling
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Sun,
  Moon,
  ExternalLink,
  ShieldCheck,
  LayoutGrid,
  PlayCircle,
  ShieldAlert,
  Cloud,
  BookOpen,
  MoreHorizontal,
  ClipboardCheck,
  ScrollText,
  KeyRound,
  Users as UsersIcon,
  ListChecks,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './Button';
import { HealthCheckPill } from './HealthCheckPill';
import { theme } from '../styles/theme';

interface LayoutProps {
  children: React.ReactNode;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const primaryNavItems = [
  { path: '/', label: 'Overview', icon: LayoutGrid },
  { path: '/guided-scenarios', label: 'Guided Scenarios', icon: PlayCircle },
  { path: '/investigations', label: 'Investigations', icon: ShieldAlert },
  { path: '/cloud-coverage', label: 'Cloud Coverage', icon: Cloud },
  { path: '/about', label: 'Architecture & Evidence', icon: BookOpen },
];

const moreNavItems = [
  { path: '/compliance', label: 'Control Evidence', icon: ClipboardCheck },
  { path: '/threats', label: 'Threats', icon: AlertTriangle },
  { path: '/audit-logs', label: 'Audit Logs', icon: ScrollText },
  { path: '/sessions', label: 'Sessions', icon: KeyRound },
  { path: '/users', label: 'Identity & Access', icon: UsersIcon },
  { path: '/implementation-status', label: 'Implementation Status', icon: ListChecks },
];

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const { theme: activeTheme, toggleTheme } = useTheme();
  const [demoMode, setDemoMode] = React.useState(false);
  const [demoModeLoaded, setDemoModeLoaded] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
        const config = await adminApi.getRuntimeConfig();
        if (isMounted) {
          setDemoMode(config.demoMode);
        }
      } catch (error: any) {
        // Expected for the read-only reviewer role - /admin/config is admin-only,
        // and the demo-mode indicator just isn't shown for reviewers. Only log
        // anything unexpected (non-403) to the console.
        if (error?.response?.status !== 403) {
          console.error('Failed to load runtime config:', error);
        }
      } finally {
        if (isMounted) {
          setDemoModeLoaded(true);
        }
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

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
  const isMoreActive = moreNavItems.some((item) => isActive(item.path));
  const [moreOpen, setMoreOpen] = React.useState(isMoreActive);

  React.useEffect(() => {
    if (isMoreActive) setMoreOpen(true);
  }, [isMoreActive]);

  return (
    <div className="app-shell">
      {/* Enhanced Sidebar */}
      <aside className="app-shell__sidebar">
        <div className="app-shell__sidebar-brand">
          <div className="app-shell__sidebar-brand-row">
            <div className="app-shell__title">
              <ShieldCheck size={18} aria-hidden="true" /> Secure API Gateway
            </div>
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {activeTheme === 'dark' ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            </button>
          </div>
          <div className="app-shell__subtitle">
            Multi-cloud API security control plane
          </div>
          <div className="app-shell__health">
            <HealthCheckPill />
          </div>
        </div>

        <nav className="app-shell__nav">
          {primaryNavItems.map((item) => (
            <NavLink key={item.path} to={item.path} active={isActive(item.path)} icon={item.icon}>
              {item.label}
            </NavLink>
          ))}

          <button
            type="button"
            className={`nav-link ${isMoreActive ? 'nav-link--active' : 'nav-link--inactive'}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span className="nav-link__icon" aria-hidden="true">
              <MoreHorizontal size={16} />
            </span>
            <span>More</span>
          </button>
          {moreOpen && (
            <div style={{ paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {moreNavItems.map((item) => (
                <NavLink key={item.path} to={item.path} active={isActive(item.path)} icon={item.icon}>
                  {item.label}
                </NavLink>
              ))}
              <a
                href={`${API_URL}/docs`}
                target="_blank"
                rel="noopener noreferrer"
                className="nav-link nav-link--inactive"
              >
                <span className="nav-link__icon" aria-hidden="true">
                  <BookOpen size={16} />
                </span>
                <span>API Documentation</span>
                <ExternalLink size={12} style={{ marginLeft: 'auto' }} aria-hidden="true" />
              </a>
            </div>
          )}
        </nav>

        <div style={{
          paddingTop: theme.spacing.lg,
          borderTop: `1px solid ${theme.colors.neutral[700]}`,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: theme.spacing.sm,
            marginBottom: theme.spacing.md,
            borderRadius: theme.borderRadius.md,
            backgroundColor: theme.colors.neutral[700],
            fontSize: theme.typography.fontSize.sm,
          }}>
            <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
              Demo Mode
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
              <input
                type="checkbox"
                checked={demoMode}
                disabled
                aria-label="Demo mode enabled"
                style={{ accentColor: theme.colors.warning[400] }}
              />
              <span>
                {demoModeLoaded ? (demoMode ? 'On' : 'Off') : '...'}
              </span>
            </label>
          </div>
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
      <main style={{
        flex: 1,
        backgroundColor: theme.colors.background.secondary,
        padding: theme.spacing.xl,
        minHeight: '100vh',
        maxWidth: '100%',
        overflowX: 'hidden',
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {demoMode && (
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: theme.spacing.md,
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: theme.spacing.xs,
                padding: `${theme.spacing.xs} ${theme.spacing.md}`,
                backgroundColor: theme.colors.warning[100],
                color: theme.colors.warning[800],
                border: `1px solid ${theme.colors.warning[300]}`,
                borderRadius: theme.borderRadius.full,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.semibold,
                letterSpacing: '0.2px',
              }}>
                Demo Data
              </span>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

interface NavLinkProps {
  to: string;
  active: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
}

function NavLink({ to, active, icon: Icon, children }: NavLinkProps) {
  const classes = [
    'nav-link',
    active ? 'nav-link--active' : 'nav-link--inactive',
  ].join(' ');

  return (
    <Link
      to={to}
      className={classes}
    >
      {Icon && (
        <span className="nav-link__icon" aria-hidden="true">
          <Icon size={16} />
        </span>
      )}
      <span>{children}</span>
    </Link>
  );
}
