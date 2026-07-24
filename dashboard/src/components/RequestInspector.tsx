/**
 * "Request Inspector" - scrolling near-real-time table of the last requests through the
 * gateway, polling GET /admin/requests/live every 2s (see src/lib/requestTelemetry.ts on
 * the backend).
 */

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { adminApi } from '../api/admin';
import type { RequestLogEntry } from '../types';

const POLL_INTERVAL_MS = 2000;

function statusClass(status: number): string {
  if (status >= 500) return 'request-inspector__status--5xx';
  if (status >= 400) return 'request-inspector__status--4xx';
  return 'request-inspector__status--2xx';
}

export function RequestInspector() {
  const [entries, setEntries] = useState<RequestLogEntry[]>([]);
  const [newestKey, setNewestKey] = useState<string | null>(null);
  const previousNewestKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await adminApi.getRecentRequests(20);
        if (cancelled) return;
        setEntries(data);
        const key = data[0] ? `${data[0].timestamp}-${data[0].path}` : null;
        if (key && key !== previousNewestKey.current) {
          setNewestKey(key);
          previousNewestKey.current = key;
        }
      } catch {
        // Transient poll failures are fine to ignore - the next tick retries
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="request-inspector">
      {entries.length === 0 ? (
        <div className="empty-state">Waiting for requests…</div>
      ) : (
        <div className="request-inspector__scroll">
          <table className="request-inspector__table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>Path</th>
                <th>User</th>
                <th>RBAC</th>
                <th>Rate Limit</th>
                <th>Status</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const key = `${entry.timestamp}-${entry.path}-${entry.method}`;
                const isNewest = key === newestKey;
                return (
                  <tr key={key} className={isNewest ? 'request-inspector__row--flash' : ''}>
                    <td className="text-mono text-xs">{format(new Date(entry.timestamp), 'HH:mm:ss')}</td>
                    <td className="text-mono text-xs">{entry.method}</td>
                    <td className="text-mono text-xs">{entry.path}</td>
                    <td className="text-xs">{entry.user}</td>
                    <td>
                      <span className={`request-inspector__rbac request-inspector__rbac--${entry.rbacDecision}`}>
                        {entry.rbacDecision === 'allowed'
                          ? 'ALLOWED'
                          : entry.rbacDecision === 'denied'
                            ? 'DENIED'
                            : 'N/A'}
                      </span>
                    </td>
                    <td className="text-mono text-xs">
                      {entry.rateLimitRemaining !== null ? `${entry.rateLimitRemaining}` : '—'}
                    </td>
                    <td>
                      <span className={`request-inspector__status ${statusClass(entry.statusCode)}`}>
                        {entry.statusCode}
                      </span>
                    </td>
                    <td className="text-mono text-xs">{entry.latencyMs}ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
