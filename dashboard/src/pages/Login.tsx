/**
 * Login page
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck, Eye } from 'lucide-react';
import { adminApi } from '../api/admin';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin123!', label: 'admin (full access)' },
  { username: 'user', password: 'User123!', label: 'user (read-only)' },
];

// The backend runs on Azure Container Apps with min_replicas=0 (scale-to-zero to
// stay in the free tier - see terraform/variables.tf). After a period of no traffic
// the container is fully stopped, so the first request has to cold-start it, which
// can take much longer than a normal API call. Surface that after a delay instead of
// leaving the button spinning with no explanation.
const COLD_START_HINT_DELAY_MS = 4000;

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showColdStartHint, setShowColdStartHint] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const coldStartTimer = useRef<ReturnType<typeof setTimeout>>();

  const isBusy = loading || demoLoading;

  useEffect(() => {
    if (isBusy) {
      coldStartTimer.current = setTimeout(() => setShowColdStartHint(true), COLD_START_HINT_DELAY_MS);
    } else {
      setShowColdStartHint(false);
    }
    return () => clearTimeout(coldStartTimer.current);
  }, [isBusy]);

  const fillDemoCredentials = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setUsername(account.username);
    setPassword(account.password);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await adminApi.login({ username, password });
      login(response.accessToken);
      navigate('/', { replace: true });
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        err.message ||
        'Login failed. Please check your credentials.';

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setDemoLoading(true);
    try {
      const response = await adminApi.demoLogin();
      login(response.accessToken);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Could not start the reviewer demo session.');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-card__toggle-row">
            <ThemeToggle />
          </div>
          <h1 className="auth-card__title">
            <ShieldCheck size={22} aria-hidden="true" /> Secure API Gateway
          </h1>
          <p className="auth-card__subtitle">Sign in to access the admin panel</p>

          {showColdStartHint && (
            <div className="alert alert--info" role="status" style={{ marginBottom: 16 }}>
              Still connecting — the backend scales to zero when idle, so it can take up to
              30 seconds to wake up on the first request. Hang tight.
            </div>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={handleDemoLogin}
            disabled={demoLoading}
            isLoading={demoLoading}
            className="button-full"
          >
            <Eye size={16} aria-hidden="true" style={{ marginRight: 8 }} />
            {demoLoading ? 'Starting reviewer session...' : 'Enter read-only demo'}
          </Button>
          <p className="text-sm text-muted" style={{ marginTop: 8, marginBottom: 20 }}>
            No credentials needed. Read-only reviewer access: can view everything and run the guided
            scenarios, cannot block arbitrary IPs, revoke sessions, or change configuration.
          </p>

          <div className="demo-banner" role="note">
            <KeyRound size={18} className="demo-banner__icon" aria-hidden="true" />
            <div className="demo-banner__content">
              <div className="demo-banner__title">Or sign in with a demo account</div>
              <div className="demo-banner__accounts">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    className="demo-banner__fill"
                    onClick={() => fillDemoCredentials(account)}
                  >
                    <span className="text-mono">{account.username}</span> / <span className="text-mono">{account.password}</span>
                    <span className="demo-banner__fill-hint"> — click to fill</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="page-stack">
            <div className="form-field">
              <label className="form-label" htmlFor="login-username">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="form-control"
                placeholder="admin"
                autoComplete="username"
              />
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="form-control"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="alert alert--danger" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} isLoading={loading} className="button-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
