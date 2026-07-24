/**
 * Navbar health indicator - pings GET /healthz every 30s (unauthenticated, so it works
 * even before login) and shows a popover with the last check time and response latency.
 */

import { useEffect, useRef, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const CHECK_INTERVAL_MS = 30000;

export function HealthCheckPill() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [responseTimeMs, setResponseTimeMs] = useState<number | null>(null);
  const [showPopover, setShowPopover] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const start = performance.now();
      try {
        const response = await fetch(`${API_URL}/healthz`);
        if (cancelled) return;
        setResponseTimeMs(Math.round(performance.now() - start));
        setHealthy(response.ok);
      } catch {
        if (cancelled) return;
        setResponseTimeMs(Math.round(performance.now() - start));
        setHealthy(false);
      } finally {
        if (!cancelled) setLastCheckedAt(new Date());
      }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!showPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPopover]);

  return (
    <div className="health-pill-container" ref={containerRef}>
      <button
        type="button"
        className={`health-pill health-pill--${healthy === null ? 'checking' : healthy ? 'healthy' : 'unhealthy'}`}
        onClick={() => setShowPopover((prev) => !prev)}
        aria-expanded={showPopover}
        aria-label="API health status"
      >
        <span className="health-pill__dot" aria-hidden="true" />
        {healthy === null ? 'Checking…' : healthy ? 'API Healthy' : 'API Unreachable'}
      </button>

      {showPopover && (
        <div className="health-pill__popover" role="tooltip">
          <div className="health-pill__popover-row">
            <span>Last check</span>
            <span className="text-mono">{lastCheckedAt ? lastCheckedAt.toLocaleTimeString() : '—'}</span>
          </div>
          <div className="health-pill__popover-row">
            <span>Response time</span>
            <span className="text-mono">{responseTimeMs !== null ? `${responseTimeMs}ms` : '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
