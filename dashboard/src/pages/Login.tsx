import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';
import { environment } from '../config/environment';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'Admin123!', label: 'Administrator' },
  { username: 'user', password: 'User123!', label: 'Read-only user' },
];
const COLD_START_HINT_DELAY_MS = 4_000;

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showColdStartHint, setShowColdStartHint] = useState(false);
  const coldStartTimer = useRef<ReturnType<typeof setTimeout>>();
  const { login } = useAuth();
  const navigate = useNavigate();
  const isBusy = loading || demoLoading;

  useEffect(() => {
    if (isBusy)
      coldStartTimer.current = setTimeout(
        () => setShowColdStartHint(true),
        COLD_START_HINT_DELAY_MS
      );
    else setShowColdStartHint(false);
    return () => clearTimeout(coldStartTimer.current);
  }, [isBusy]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await adminApi.login({ username, password });
      login(response.accessToken);
      navigate('/', { replace: true });
    } catch (cause) {
      setError(getErrorMessage(cause, 'Sign-in failed. Check the supplied credentials.'));
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
    } catch (cause) {
      setError(getErrorMessage(cause, 'Could not start the reviewer session.'));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="auth-page auth-page--control-plane">
      <header className="auth-topbar">
        <Link to="/landing" className="product-brand">
          <span>
            <ShieldCheck size={18} />
          </span>
          <strong>SecureOps</strong>
          <small>Control Plane</small>
        </Link>
        <ThemeToggle />
      </header>
      <main className="auth-layout">
        <section className="auth-context">
          <Link to="/landing" className="auth-back">
            <ArrowLeft size={13} /> Back to product overview
          </Link>
          <div>
            <span className="eyebrow">Reviewer workspace</span>
            <h1>Follow a security signal from request to evidence.</h1>
            <p>
              The live demo grants read-only access to the operational control plane and safe,
              allowlisted scenarios.
            </p>
          </div>
          <div className="auth-journey">
            <div>
              <span>
                <Workflow size={15} />
              </span>
              <p>
                <strong>Inspect the pipeline</strong>
                <small>Traffic, normalization, detection, and correlation health.</small>
              </p>
            </div>
            <div>
              <span>
                <Eye size={15} />
              </span>
              <p>
                <strong>Review the evidence</strong>
                <small>Raw context, canonical events, rules, timelines, and audit artifacts.</small>
              </p>
            </div>
            <div>
              <span>
                <LockKeyhole size={15} />
              </span>
              <p>
                <strong>Stay within safe bounds</strong>
                <small>No arbitrary IP blocks, session revocations, or cloud mutations.</small>
              </p>
            </div>
          </div>
          <div className="auth-trust">
            <CheckCircle2 size={14} />
            <span>
              <strong>Reviewer role</strong> is enforced by backend RBAC—not just hidden UI
              controls.
            </span>
          </div>
        </section>

        <section className="auth-card auth-card--redesigned">
          <div className="auth-card__heading">
            <span className="auth-card__icon">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h2>Access the control plane</h2>
              <p>Choose reviewer access or sign in as an operator.</p>
            </div>
          </div>

          {showColdStartHint && (
            <div className="alert alert--info" role="status">
              The backend scales to zero when idle. The first connection can take up to 30 seconds.
            </div>
          )}
          {error && (
            <div className="alert alert--danger" role="alert">
              {error}
            </div>
          )}

          <button
            className="reviewer-access"
            type="button"
            onClick={handleDemoLogin}
            disabled={isBusy}
          >
            <span>
              <Eye size={18} />
            </span>
            <span>
              <strong>{demoLoading ? 'Starting reviewer session…' : 'Enter read-only demo'}</strong>
              <small>No credentials · safe scenario access · evidence export</small>
            </span>
            <ArrowRight size={16} />
          </button>

          <div className="auth-divider">
            <span>Operator sign in</span>
          </div>

          {environment.showFixtureCredentials && (
            <div className="demo-credentials" role="note">
              <KeyRound size={15} />
              <div>
                <strong>Local development accounts</strong>
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.username}
                    type="button"
                    onClick={() => {
                      setUsername(account.username);
                      setPassword(account.password);
                      setError('');
                    }}
                  >
                    <span>{account.label}</span>
                    <code>
                      {account.username} / {account.password}
                    </code>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              <span>Username</span>
              <input
                id="login-username"
                aria-label="Username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="operator"
                required
              />
            </label>
            <label>
              <span>Password</span>
              <input
                id="login-password"
                aria-label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                required
              />
            </label>
            <Button
              type="submit"
              variant="secondary"
              disabled={isBusy}
              isLoading={loading}
              className="button-full"
            >
              {loading ? 'Signing in…' : 'Sign in'} <ArrowRight size={14} />
            </Button>
          </form>
          <p className="auth-security-note">
            <LockKeyhole size={12} />
            Access tokens remain in memory; refresh sessions use protected cookies.
          </p>
        </section>
      </main>
    </div>
  );
}
