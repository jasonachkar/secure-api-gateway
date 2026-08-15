import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Cloud,
  Command,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Gauge,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { HealthCheckPill } from './HealthCheckPill';
import { ThemeToggle } from './ThemeToggle';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: LucideIcon;
  external?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const DOCS_URL = 'https://jasonachkar.github.io/secure-api-gateway/';

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Observe',
    items: [
      {
        path: '/',
        label: 'Overview',
        description: 'Security posture and active risk',
        icon: Gauge,
      },
      {
        path: '/traffic',
        label: 'Traffic Explorer',
        description: 'Inspect gateway requests and decisions',
        icon: Activity,
      },
    ],
  },
  {
    label: 'Detect',
    items: [
      {
        path: '/detections',
        label: 'Detections',
        description: 'Rule coverage and match health',
        icon: Radar,
      },
      {
        path: '/investigations',
        label: 'Investigations',
        description: 'Correlated incidents and evidence',
        icon: ShieldAlert,
      },
      {
        path: '/threats',
        label: 'Threat intelligence',
        description: 'Source reputation and enforcement',
        icon: AlertTriangle,
      },
    ],
  },
  {
    label: 'Respond',
    items: [
      {
        path: '/security-lab',
        label: 'Security Lab',
        description: 'Safe, guided detection scenarios',
        icon: FlaskConical,
      },
      {
        path: '/sessions',
        label: 'Sessions',
        description: 'Review and revoke active sessions',
        icon: KeyRound,
      },
    ],
  },
  {
    label: 'Govern',
    items: [
      {
        path: '/cloud',
        label: 'Cloud',
        description: 'Provider ingestion and pipeline health',
        icon: Cloud,
      },
      {
        path: '/compliance',
        label: 'Control evidence',
        description: 'Framework mapping and evidence',
        icon: FileCheck2,
      },
      {
        path: '/audit',
        label: 'Audit trail',
        description: 'Tamper-evident operator activity',
        icon: ScrollText,
      },
      {
        path: '/identities',
        label: 'Identities',
        description: 'Users, roles, and lockouts',
        icon: Users,
      },
    ],
  },
  {
    label: 'System',
    items: [
      {
        path: '/architecture',
        label: 'Architecture',
        description: 'Trust boundaries and data flow',
        icon: BookOpen,
      },
      {
        path: '/implementation-status',
        label: 'Implementation',
        description: 'Verified capability registry',
        icon: ListChecks,
      },
      {
        path: DOCS_URL,
        label: 'API documentation',
        description: 'Open the technical reference',
        icon: ExternalLink,
        external: true,
      },
    ],
  },
];

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function pageForPath(pathname: string): NavItem | undefined {
  return ALL_NAV_ITEMS.find((item) => !item.external && item.path === pathname);
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { identity, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('control-plane-sidebar') === 'collapsed'
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const activePage = pageForPath(location.pathname);

  useEffect(() => {
    localStorage.setItem('control-plane-sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setMobileOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navigateTo = (path: string) => {
    setCommandOpen(false);
    navigate(path);
  };

  return (
    <div className={`app-shell ${collapsed ? 'app-shell--collapsed' : ''}`}>
      {mobileOpen && (
        <button
          className="app-shell__scrim"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        className={`app-shell__sidebar ${mobileOpen ? 'app-shell__sidebar--open' : ''}`}
        aria-label="Application sidebar"
      >
        <div className="app-shell__brand-row">
          <Link to="/" className="app-shell__brand" aria-label="SecureOps overview">
            <span className="app-shell__brand-mark">
              <ShieldCheck size={18} aria-hidden="true" />
            </span>
            <span className="app-shell__brand-copy">
              <strong>SecureOps</strong>
              <small>Control Plane</small>
            </span>
          </Link>
          <button
            className="icon-button app-shell__mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="app-shell__nav" aria-label="Primary navigation">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group__label">{group.label}</div>
              {group.items.map((item) => (
                <NavigationLink
                  key={item.path}
                  item={item}
                  active={location.pathname === item.path}
                  collapsed={collapsed}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="app-shell__sidebar-footer">
          <div
            className="app-shell__environment"
            title={`${import.meta.env.MODE === 'production' ? 'Production' : 'Local development'} environment`}
          >
            <span className="status-dot status-dot--healthy" aria-hidden="true" />
            <span className="app-shell__environment-copy">
              {import.meta.env.MODE === 'production' ? 'Production' : 'Development'}
            </span>
            <span className="provenance-chip provenance-chip--synthetic">Demo</span>
          </div>
          <button
            type="button"
            className="nav-link app-shell__collapse"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span>Collapse</span>
          </button>
        </div>
      </aside>

      <div className="app-shell__workspace">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="icon-button topbar__menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={19} aria-hidden="true" />
            </button>
            <div className="breadcrumbs" aria-label="Breadcrumb">
              <span>SecureOps</span>
              <ChevronLeft size={13} className="breadcrumbs__separator" aria-hidden="true" />
              <strong>{activePage?.label ?? 'Control Plane'}</strong>
            </div>
          </div>
          <div className="topbar__actions">
            <button
              className="command-trigger"
              type="button"
              onClick={() => setCommandOpen(true)}
              aria-label="Search control plane"
            >
              <Search size={15} aria-hidden="true" />
              <span>Search control plane</span>
              <kbd>⌘K</kbd>
            </button>
            <HealthCheckPill />
            <ThemeToggle compact />
            <div className="profile-menu">
              <button
                className="profile-trigger"
                onClick={() => setProfileOpen((value) => !value)}
                aria-expanded={profileOpen}
              >
                <span className="avatar">
                  {(identity?.username ?? 'U').slice(0, 2).toUpperCase()}
                </span>
                <span className="profile-trigger__copy">
                  <strong>{identity?.username ?? 'User'}</strong>
                  <small>{identity?.roles[0] ?? 'authenticated'}</small>
                </span>
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <div className="profile-popover__identity">
                    <strong>{identity?.username ?? 'Authenticated user'}</strong>
                    <span>{identity?.id}</span>
                  </div>
                  <button onClick={() => logout()}>
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-shell__main">
          <div className="app-shell__main-inner">{children}</div>
        </main>
      </div>

      {commandOpen && (
        <CommandPalette
          items={ALL_NAV_ITEMS}
          onClose={() => setCommandOpen(false)}
          onNavigate={navigateTo}
        />
      )}
    </div>
  );
}

function NavigationLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const className = `nav-link ${active ? 'nav-link--active' : 'nav-link--inactive'}`;
  const content = (
    <>
      <span className="nav-link__icon">
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="nav-link__label">{item.label}</span>
      {item.external && !collapsed && (
        <ExternalLink size={12} className="nav-link__external" aria-hidden="true" />
      )}
    </>
  );
  return item.external ? (
    <a
      href={item.path}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? item.label : undefined}
    >
      {content}
    </a>
  ) : (
    <Link
      to={item.path}
      className={className}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {content}
    </Link>
  );
}

function CommandPalette({
  items,
  onClose,
  onNavigate,
}: {
  items: NavItem[];
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        !item.external &&
        (!term || `${item.label} ${item.description}`.toLowerCase().includes(term))
    );
  }, [items, query]);

  return (
    <div
      className="command-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search control plane"
      >
        <div className="command-palette__input-row">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to traffic, investigations, evidence…"
            aria-label="Search pages"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-palette__results">
          {filtered.length === 0 ? (
            <div className="command-palette__empty">No matching destination</div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.path} onClick={() => onNavigate(item.path)}>
                  <span className="command-palette__result-icon">
                    <Icon size={17} />
                  </span>
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <CheckCircle2 size={14} className="command-palette__arrow" />
                </button>
              );
            })
          )}
        </div>
        <div className="command-palette__footer">
          <Command size={13} /> Navigate the security workflow from one place
        </div>
      </div>
    </div>
  );
}
