/**
 * Enhanced Dashboard Layout with Navigation
 * Improved sidebar, navigation, and main content area styling
 */

import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
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
import { Button } from './Button';
import { HealthCheckPill } from './HealthCheckPill';
import { ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

// Swagger UI (${API_URL}/docs) is deliberately disabled in production (see
// ENABLE_SWAGGER in src/config/env.ts) so the interactive API schema isn't public
// by default. The MkDocs site (mkdocs.yml, deployed by .github/workflows/docs.yml)
// is the production-appropriate API reference instead.
const DOCS_URL = 'https://jasonachkar.github.io/secure-api-gateway/';

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
            <ThemeToggle variant="inverse" />
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
                href={DOCS_URL}
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

        <div className="app-shell__demo-section">
          <div className="app-shell__demo-row">
            <span className="app-shell__demo-label">Demo Mode</span>
            <label className="app-shell__demo-toggle">
              <input
                type="checkbox"
                checked={demoMode}
                disabled
                aria-label="Demo mode enabled"
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
      <main className="app-shell__main">
        <div className="app-shell__main-inner">
          {demoMode && (
            <div className="app-shell__demo-badge-row">
              <span className="ui-badge ui-badge--warning app-shell__demo-badge">Demo Data</span>
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
