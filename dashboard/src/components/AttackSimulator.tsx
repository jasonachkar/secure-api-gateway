/**
 * "Security Playground" panel on the Dashboard - fires real requests against the live
 * gateway so a viewer can watch its security controls react in real time. Uses plain
 * fetch() rather than the shared apiClient so these calls never touch (or overwrite) the
 * viewer's own access token, and brute-force always targets the dedicated `sim-target`
 * demo account (see src/modules/auth/auth.service.ts) so a viewer's own session can never
 * be locked out by clicking this.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Swords, Gauge, KeySquare, Loader2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type SimKey = 'bruteForce' | 'rateLimit' | 'jwtTamper';

interface SimState {
  running: boolean;
  progress: number;
  total: number;
  result?: string;
}

const INITIAL_STATE: SimState = { running: false, progress: 0, total: 0 };

export function AttackSimulator() {
  const [expanded, setExpanded] = useState(true);
  const [bruteForce, setBruteForce] = useState<SimState>(INITIAL_STATE);
  const [rateLimit, setRateLimit] = useState<SimState>(INITIAL_STATE);
  const [jwtTamper, setJwtTamper] = useState<SimState>(INITIAL_STATE);
  const { showToast } = useToast();

  const setState = (key: SimKey) => {
    if (key === 'bruteForce') return setBruteForce;
    if (key === 'rateLimit') return setRateLimit;
    return setJwtTamper;
  };

  const runBruteForce = async () => {
    const set = setState('bruteForce');
    set({ running: true, progress: 0, total: 20 });
    for (let i = 1; i <= 20; i++) {
      try {
        await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'sim-target', password: `wrong-password-${i}` }),
        });
      } catch {
        // Expected to fail (that's the point) - ignore network-level errors and keep going
      }
      set((prev) => ({ ...prev, progress: i }));
    }
    set((prev) => ({ ...prev, running: false, result: '20 failed login attempts sent against the sim-target demo account.' }));
    showToast('Brute force simulation complete - check Failed Logins and the Live Event Feed below', 'success');
  };

  const runRateLimit = async () => {
    const set = setState('rateLimit');
    set({ running: true, progress: 0, total: 60 });
    const BATCH_SIZE = 10;
    let completed = 0;
    let sawRateLimited = false;
    for (let batchStart = 0; batchStart < 60; batchStart += BATCH_SIZE) {
      const batch = Array.from({ length: Math.min(BATCH_SIZE, 60 - batchStart) }, () =>
        fetch(`${API_URL}/healthz`).then((r) => {
          if (r.status === 429) sawRateLimited = true;
        }).catch(() => {})
      );
      await Promise.all(batch);
      completed += batch.length;
      set((prev) => ({ ...prev, progress: completed }));
    }
    set((prev) => ({
      ...prev,
      running: false,
      result: sawRateLimited
        ? '60 requests sent - the gateway started returning 429 Too Many Requests partway through.'
        : '60 requests sent - all succeeded (under the configured rate limit threshold for this window).',
    }));
    showToast('Rate limit simulation complete - check Rate Limit Violations below', 'success');
  };

  const runJwtTamper = async () => {
    const set = setState('jwtTamper');
    set({ running: true, progress: 0, total: 1 });
    const tamperedToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0YW1wZXJlZCIsInJvbGVzIjpbImFkbWluIl19.not-a-valid-signature';
    try {
      const response = await fetch(`${API_URL}/admin/health`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      const body = await response.json().catch(() => ({}));
      set({
        running: false,
        progress: 1,
        total: 1,
        result: JSON.stringify({ status: response.status, body }, null, 2),
      });
      showToast(`Gateway rejected the tampered token with HTTP ${response.status}`, 'success');
    } catch (err: any) {
      set({ running: false, progress: 1, total: 1, result: `Request failed: ${err.message}` });
    }
  };

  return (
    <div className="simulator-panel">
      <button
        className="simulator-panel__toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="attack-simulator-body"
      >
        <div className="simulator-panel__title">
          <Swords size={18} aria-hidden="true" />
          Security Playground — Attack Simulator
        </div>
        {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>

      {expanded && (
        <div id="attack-simulator-body" className="simulator-panel__body">
          <p className="section-subtitle">
            These simulations fire real requests against the gateway. Metrics update within 2 seconds via SSE —
            watch the metric cards and Live Security Events feed above react as each one runs.
          </p>

          <div className="simulator-grid">
            <SimulatorCard
              icon={<Swords size={20} aria-hidden="true" />}
              title="Simulate Brute Force"
              description="Fires 20 failed logins against a dedicated demo account in rapid sequence."
              state={bruteForce}
              onRun={runBruteForce}
              runLabel="Simulate Brute Force"
            />
            <SimulatorCard
              icon={<Gauge size={20} aria-hidden="true" />}
              title="Trigger Rate Limit"
              description="Fires 60 rapid requests to trip the global rate limiter."
              state={rateLimit}
              onRun={runRateLimit}
              runLabel="Trigger Rate Limit"
            />
            <SimulatorCard
              icon={<KeySquare size={20} aria-hidden="true" />}
              title="Try JWT Tampering"
              description="Sends one request with a manually tampered token and shows the gateway's exact rejection."
              state={jwtTamper}
              onRun={runJwtTamper}
              runLabel="Try JWT Tampering"
              showResultAsCode
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface SimulatorCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  state: SimState;
  onRun: () => void;
  runLabel: string;
  showResultAsCode?: boolean;
}

function SimulatorCard({ icon, title, description, state, onRun, runLabel, showResultAsCode }: SimulatorCardProps) {
  const percent = state.total > 0 ? Math.round((state.progress / state.total) * 100) : 0;

  return (
    <div className="simulator-card">
      <div className="simulator-card__icon">{icon}</div>
      <div className="simulator-card__title">{title}</div>
      <p className="simulator-card__description">{description}</p>

      <button className="ui-button ui-button--secondary ui-button--sm" onClick={onRun} disabled={state.running}>
        {state.running ? (
          <>
            <Loader2 size={14} className="simulator-spin" aria-hidden="true" /> Running…
          </>
        ) : (
          runLabel
        )}
      </button>

      {state.running && (
        <div className="simulator-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="simulator-progress__bar" style={{ width: `${percent}%` }} />
        </div>
      )}

      {state.result &&
        !state.running &&
        (showResultAsCode ? (
          <pre className="simulator-card__result-code">{state.result}</pre>
        ) : (
          <div className="simulator-card__result">{state.result}</div>
        ))}
    </div>
  );
}
