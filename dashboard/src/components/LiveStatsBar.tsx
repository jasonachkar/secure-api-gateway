/**
 * Thin "live terminal readout" strip below the Dashboard hero - 4 counters that animate
 * on change. Requests/rate-limit-violations come from the SSE feed already flowing into
 * Dashboard.tsx; threats-blocked and uptime are polled independently here since they
 * change far less often and don't need a dedicated SSE connection.
 */

import { useEffect, useState } from 'react';
import { adminApi } from '../api/admin';
import { useCountUp } from '../hooks/useCountUp';

interface LiveStatsBarProps {
  totalRequests: number;
  rateLimitViolations: number;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
}

export function LiveStatsBar({ totalRequests, rateLimitViolations }: LiveStatsBarProps) {
  const [threatsBlocked, setThreatsBlocked] = useState(0);
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [stats, health] = await Promise.all([adminApi.getThreatStatistics(), adminApi.getHealth()]);
        if (cancelled) return;
        setThreatsBlocked(stats.blockedIPs);
        if (typeof health.uptimeSeconds === 'number') {
          setUptimeSeconds(health.uptimeSeconds);
        }
      } catch {
        // Non-critical - keep the last known values on a transient failure
      }
    };

    poll();
    const interval = setInterval(poll, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Tick uptime locally every second between polls so it reads as a live counter;
  // the 10s poll re-syncs it with the authoritative server value.
  useEffect(() => {
    const tick = setInterval(() => {
      setUptimeSeconds((prev) => (prev > 0 ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const animatedRequests = useCountUp(totalRequests);
  const animatedThreats = useCountUp(threatsBlocked);
  const animatedViolations = useCountUp(rateLimitViolations);

  return (
    <div className="live-stats-bar">
      <LiveStat label="Requests Proxied" value={animatedRequests.toLocaleString()} />
      <div className="live-stats-bar__divider" />
      <LiveStat label="Threats Blocked" value={animatedThreats.toLocaleString()} />
      <div className="live-stats-bar__divider" />
      <LiveStat label="Rate Limit Violations (5m)" value={animatedViolations.toLocaleString()} />
      <div className="live-stats-bar__divider" />
      <LiveStat label="Gateway Uptime" value={uptimeSeconds > 0 ? formatUptime(uptimeSeconds) : '—'} />
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="live-stats-bar__stat">
      <span className="live-stats-bar__value">{value}</span>
      <span className="live-stats-bar__label">{label}</span>
    </div>
  );
}
