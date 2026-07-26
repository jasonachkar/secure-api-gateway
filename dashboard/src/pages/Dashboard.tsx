/**
 * Main dashboard page with metrics
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, ListTree, Info } from 'lucide-react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { RequestRateChart } from '../components/RequestRateChart';
import { ErrorRateChart } from '../components/ErrorRateChart';
import { ResponseTimeChart } from '../components/ResponseTimeChart';
import { LiveEventFeed, type SecurityEvent } from '../components/LiveEventFeed';
import { LiveStatsBar } from '../components/LiveStatsBar';
import { AttackSimulator } from '../components/AttackSimulator';
import { RequestInspector } from '../components/RequestInspector';
import { Drawer } from '../components/Drawer';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { useSSE } from '../hooks/useSSE';
import { adminApi } from '../api/admin';
import { theme } from '../styles/theme';
import type { IngestionStatus, SecurityPosture } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface RealtimeMetrics {
  timestamp: number;
  requestsPerSecond: number;
  errorRate: number;
  errors4xx: number;
  errors5xx: number;
  totalRequests: number;
  authStats: {
    failedLogins: number;
    successfulLogins: number;
    accountLockouts: number;
    activeSessions: number;
  };
  rateLimitStats: {
    violations: number;
  };
  responseTimeStats: {
    p50: number;
    p95: number;
    p99: number;
  };
}

const EVENT_GUIDANCE: Record<string, { rule: string; remediation: string }> = {
  AUTH_FAILURE: {
    rule: 'High failed-login rate threshold (>5 in a 5-minute window)',
    remediation:
      'Threat intelligence scoring flags the source IP if failures continue; account lockout engages after 5 consecutive failures on one account (see the Users page).',
  },
  ACCOUNT_LOCKOUT: {
    rule: 'Account lockout threshold reached',
    remediation: 'The account is locked for the configured lockout window. An admin can unlock it from the Users page.',
  },
  RATE_LIMIT: {
    rule: 'Rate limit violation threshold',
    remediation: 'Requests from this source are being throttled. Sustained abuse raises the source IP\'s threat score (see the Threats page).',
  },
  HIGH_ERROR_RATE: {
    rule: 'Elevated 4xx/5xx error rate threshold (>10%)',
    remediation: 'Check the Error Rate chart and /admin/upstream-health for a failing upstream.',
  },
};

const MAX_HISTORY = 30; // Keep 30 data points (1 minute at 2-second intervals)

/**
 * Compares the average of the newest half of a history window against the average of
 * the oldest half, so metric cards can show a real trend instead of a decorative one.
 * Needs at least 6 points before it bothers (too little data makes the % swing wildly).
 */
function computeTrend(values: number[]): { direction: 'up' | 'down' | 'flat'; percentage: number } | undefined {
  if (values.length < 6) return undefined;

  const mid = Math.floor(values.length / 2);
  const older = values.slice(0, mid);
  const newer = values.slice(mid);
  const olderAvg = older.reduce((sum, v) => sum + v, 0) / older.length;
  const newerAvg = newer.reduce((sum, v) => sum + v, 0) / newer.length;

  if (olderAvg === 0) return undefined;

  const percentage = ((newerAvg - olderAvg) / olderAvg) * 100;
  if (Math.abs(percentage) < 2) return { direction: 'flat', percentage: 0 };
  return { direction: percentage > 0 ? 'up' : 'down', percentage };
}

export function Dashboard() {
  const [requestRateHistory, setRequestRateHistory] = useState<Array<{ timestamp: number; requests: number }>>([]);
  const [errorRateHistory, setErrorRateHistory] = useState<Array<{ timestamp: number; errors4xx: number; errors5xx: number }>>([]);
  const [responseTimeHistory, setResponseTimeHistory] = useState<Array<{ timestamp: number; p50: number; p95: number; p99: number }>>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<RealtimeMetrics | null>(null);
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus | null>(null);
  const [infoBannerDismissed, setInfoBannerDismissed] = useState(() => {
    return localStorage.getItem('dashboard-info-banner-dismissed') === 'true';
  });
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);
  const [inspectorExpanded, setInspectorExpanded] = useState(false);

  const { data, isConnected, error } = useSSE<any>({
    url: `${API_URL}/admin/metrics/realtime`,
    enabled: true,
  });

  const formatTimestamp = (value?: number) => {
    if (!value) return 'No events yet';
    return new Date(value).toLocaleString();
  };

  // Load security posture on mount
  useEffect(() => {
    adminApi
      .getSecurityPosture()
      .then(setPosture)
      .catch(() => {
        // Silently fail - posture is optional
      });
  }, []);

  useEffect(() => {
    adminApi.getIngestionStatus().then(setIngestionStatus).catch(() => {
      // Silently fail - ingestion status is optional
    });
  }, []);

  // Update history and events when new data arrives
  useEffect(() => {
    if (!data) return;

    if (data.type === 'connected' || !data.requestsPerSecond) {
      return;
    }

    const metrics = data as unknown as RealtimeMetrics;
    setCurrentMetrics(metrics);

    setRequestRateHistory((prev) => {
      const newHistory = [
        ...prev,
        {
          timestamp: metrics.timestamp || Date.now(),
          requests: metrics.requestsPerSecond,
        },
      ];
      return newHistory.slice(-MAX_HISTORY);
    });

    setErrorRateHistory((prev) => {
      const newHistory = [
        ...prev,
        {
          timestamp: metrics.timestamp || Date.now(),
          errors4xx: metrics.errors4xx || 0,
          errors5xx: metrics.errors5xx || 0,
        },
      ];
      return newHistory.slice(-MAX_HISTORY);
    });

    setResponseTimeHistory((prev) => {
      const newHistory = [
        ...prev,
        {
          timestamp: metrics.timestamp || Date.now(),
          p50: metrics.responseTimeStats.p50,
          p95: metrics.responseTimeStats.p95,
          p99: metrics.responseTimeStats.p99,
        },
      ];
      return newHistory.slice(-MAX_HISTORY);
    });

    const events: SecurityEvent[] = [];

    if (metrics.authStats.failedLogins > 5) {
      events.push({
        timestamp: metrics.timestamp || Date.now(),
        type: 'AUTH_FAILURE',
        severity: 'warning',
        message: `High failed login attempts detected: ${metrics.authStats.failedLogins}`,
      });
    }

    if (metrics.authStats.accountLockouts > 0) {
      events.push({
        timestamp: metrics.timestamp || Date.now(),
        type: 'ACCOUNT_LOCKOUT',
        severity: 'critical',
        message: `${metrics.authStats.accountLockouts} account(s) locked due to failed login attempts`,
      });
    }

    if (metrics.rateLimitStats.violations > 0) {
      events.push({
        timestamp: metrics.timestamp || Date.now(),
        type: 'RATE_LIMIT',
        severity: 'warning',
        message: `${metrics.rateLimitStats.violations} rate limit violations detected`,
      });
    }

    if (metrics.errorRate > 10) {
      events.push({
        timestamp: metrics.timestamp || Date.now(),
        type: 'HIGH_ERROR_RATE',
        severity: 'critical',
        message: `Error rate elevated: ${metrics.errorRate.toFixed(2)}%`,
      });
    }

    if (events.length > 0) {
      setSecurityEvents((prev) => [...prev, ...events].slice(-50));
    }
  }, [data]);

  const statusClass = isConnected ? 'status-pill--success' : 'status-pill--danger';

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Security Monitoring"
          subtitle="Real-time security metrics and threat detection"
          actions={
            <div className={`status-pill ${statusClass}`}>
              <span className="status-pill__dot" />
              {isConnected ? 'LIVE' : 'DISCONNECTED'}
            </div>
          }
        />

        <LiveStatsBar
          totalRequests={currentMetrics?.totalRequests ?? 0}
          rateLimitViolations={currentMetrics?.rateLimitStats.violations ?? 0}
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            <strong>Connection Error:</strong> {error}
          </div>
        )}

        {!infoBannerDismissed && (
          <div className="alert alert--info info-banner">
            <div className="flex-1">
              <div className="info-banner__title">
                <Info size={16} aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                New to this dashboard?
              </div>
              <div className="info-banner__text">
                This is a live demonstration of a multi-cloud API security control plane. Learn more about
                what's genuinely implemented versus simulated in{' '}
                <Link to="/implementation-status" className="info-banner__link">
                  Implementation Status
                </Link>
                , or how it's built in{' '}
                <Link to="/about" className="info-banner__link">
                  Architecture & Evidence
                </Link>
                .
              </div>
            </div>
            <button
              className="info-banner__close"
              onClick={() => {
                setInfoBannerDismissed(true);
                localStorage.setItem('dashboard-info-banner-dismissed', 'true');
              }}
              aria-label="Dismiss banner"
            >
              ×
            </button>
          </div>
        )}

        <AttackSimulator />

        {posture && (
          <div style={{
            backgroundColor: theme.colors.background.primary,
            padding: theme.spacing.lg,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.md,
            marginBottom: theme.spacing.xl,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.lg,
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: posture.grade === 'A' ? theme.colors.success[100] : posture.grade === 'B' ? theme.colors.primary[100] : posture.grade === 'C' ? theme.colors.warning[100] : theme.colors.error[100],
              color: posture.grade === 'A' ? theme.colors.success[800] : posture.grade === 'B' ? theme.colors.primary[800] : posture.grade === 'C' ? theme.colors.warning[800] : theme.colors.error[800],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: theme.typography.fontSize['4xl'],
              fontWeight: theme.typography.fontWeight.bold,
              border: `3px solid ${posture.grade === 'A' ? theme.colors.success[500] : posture.grade === 'B' ? theme.colors.primary[500] : posture.grade === 'C' ? theme.colors.warning[500] : theme.colors.error[500]}`,
            }}>
              {posture.grade}
            </div>
            <div className="posture-summary__content">
              <div className="posture-summary__label">Security Posture Score</div>
              <div className="posture-summary__value">{posture.overallScore}/100</div>
              <div className="posture-summary__meta">
                {posture.recommendations.length > 0 && `${posture.recommendations.length} recommendation(s)`}
              </div>
            </div>
            <Link to="/compliance">
              <Button variant="primary" rightIcon="→">
                View Details
              </Button>
            </Link>
          </div>
        )}

        {ingestionStatus && (
          <section style={{ marginBottom: theme.spacing.xl }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: theme.spacing.md
            }}>
              <div>
                <h2 style={{ ...theme.typography.h3 }}>Ingestion Status</h2>
                <p style={{ ...theme.typography.small, color: theme.colors.text.secondary }}>
                  Normalized event pipeline health and adapter readiness
                </p>
              </div>
              <span style={{
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                borderRadius: theme.borderRadius.md,
                backgroundColor: ingestionStatus.storage.redisConnected
                  ? theme.colors.success[100]
                  : theme.colors.error[100],
                color: ingestionStatus.storage.redisConnected
                  ? theme.colors.success[800]
                  : theme.colors.error[800],
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
              }}>
                Redis {ingestionStatus.storage.redisConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: theme.spacing.lg,
              marginBottom: theme.spacing.lg
            }}>
              <MetricCard
                title="Normalized Events"
                value={ingestionStatus.storage.totalEvents}
                subtitle="Stored in Redis/Postgres"
                color="blue"
              />
              <MetricCard
                title="Last Event"
                value={formatTimestamp(ingestionStatus.storage.lastEventAt)}
                color="green"
              />
              <MetricCard
                title="Postgres Storage"
                value={ingestionStatus.storage.postgresConnected ? 'Connected' : 'Not Configured'}
                color={ingestionStatus.storage.postgresConnected ? 'green' : 'yellow'}
              />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: theme.spacing.md
            }}>
              {ingestionStatus.adapters.map(adapter => (
                <div key={adapter.provider} style={{
                  backgroundColor: theme.colors.background.primary,
                  padding: theme.spacing.md,
                  borderRadius: theme.borderRadius.lg,
                  boxShadow: theme.shadows.sm,
                  border: `1px solid ${theme.colors.border.light}`,
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: theme.spacing.xs
                  }}>
                    <div style={{ fontWeight: theme.typography.fontWeight.semibold }}>
                      {adapter.name}
                    </div>
                    <span style={{
                      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                      borderRadius: theme.borderRadius.md,
                      backgroundColor: adapter.healthy ? theme.colors.success[100] : theme.colors.warning[100],
                      color: adapter.healthy ? theme.colors.success[800] : theme.colors.warning[800],
                      fontSize: theme.typography.fontSize.xs,
                      fontWeight: theme.typography.fontWeight.medium,
                    }}>
                      {adapter.configured ? 'Configured' : 'Needs setup'}
                    </span>
                  </div>
                  <div style={{
                    ...theme.typography.small,
                    color: theme.colors.text.secondary,
                  }}>
                    {adapter.detail || 'Status unavailable'}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Key Metrics Cards */}
        {currentMetrics && (
          <div className="page-grid page-grid--cards">
            <MetricCard
              title="Requests/sec"
              value={currentMetrics.requestsPerSecond.toFixed(2)}
              color="blue"
              trend={computeTrend(requestRateHistory.map((p) => p.requests))}
            />
            <MetricCard
              title="Error Rate"
              value={`${currentMetrics.errorRate.toFixed(2)}%`}
              color={currentMetrics.errorRate > 5 ? 'red' : 'green'}
              trend={computeTrend(errorRateHistory.map((p) => p.errors4xx + p.errors5xx))}
              invertTrend
            />
            <MetricCard
              title="Failed Logins"
              value={currentMetrics.authStats.failedLogins}
              subtitle="Last 5 min"
              color={currentMetrics.authStats.failedLogins > 10 ? 'red' : 'yellow'}
            />
            <MetricCard title="Active Sessions" value={currentMetrics.authStats.activeSessions} color="blue" />
            <MetricCard
              title="Rate Limit Violations"
              value={currentMetrics.rateLimitStats.violations}
              subtitle="Last 5 min"
              color={currentMetrics.rateLimitStats.violations > 0 ? 'red' : 'green'}
            />
            <MetricCard
              title="P99 Response Time"
              value={`${currentMetrics.responseTimeStats.p99}ms`}
              color={currentMetrics.responseTimeStats.p99 > 1000 ? 'red' : 'green'}
            />
          </div>
        )}

        <div className="dashboard-grid">
          <div className="dashboard-grid__charts">
            <RequestRateChart data={requestRateHistory} title="Request Rate (Real-time)" />
            <ErrorRateChart data={errorRateHistory} title="Error Rate by Type" />
            {responseTimeHistory.length > 0 && (
              <ResponseTimeChart data={responseTimeHistory} title="Response Time Percentiles" />
            )}
          </div>
          <LiveEventFeed events={securityEvents} maxEvents={15} onSelectEvent={setSelectedEvent} />
        </div>

        <div className="simulator-panel">
          <button
            className="simulator-panel__toggle"
            onClick={() => setInspectorExpanded((prev) => !prev)}
            aria-expanded={inspectorExpanded}
            aria-controls="request-inspector-body"
          >
            <div className="simulator-panel__title">
              <ListTree size={18} aria-hidden="true" />
              Request Inspector — Live Log
            </div>
            {inspectorExpanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
          </button>
          {inspectorExpanded && (
            <div id="request-inspector-body" className="simulator-panel__body">
              <p className="section-subtitle">
                The last 20 requests through the gateway, refreshed every 2 seconds — method, path, authenticated
                user, RBAC decision, remaining rate-limit quota, response code, and latency.
              </p>
              <RequestInspector />
            </div>
          )}
        </div>

        <Card className="page-stack">
          <div className="section-title">Export Data</div>
          <div className="action-row">
            <Button
              variant="primary"
              onClick={() => {
                if (currentMetrics) {
                  const dataStr = JSON.stringify(
                    {
                      timestamp: new Date().toISOString(),
                      metrics: currentMetrics,
                      posture: posture,
                    },
                    null,
                    2
                  );
                  const blob = new Blob([dataStr], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `security-dashboard-${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              disabled={!currentMetrics}
            >
              Export Metrics (JSON)
            </Button>
            <Button
              variant="success"
              onClick={() => {
                if (securityEvents.length > 0) {
                  const csv = [
                    'Timestamp,Type,Severity,Message',
                    ...securityEvents.map(
                      (e) => `${new Date(e.timestamp).toISOString()},${e.type},${e.severity},"${e.message}"`
                    ),
                  ].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `security-events-${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              disabled={securityEvents.length === 0}
            >
              Export Events (CSV)
            </Button>
          </div>
        </Card>
      </div>

      <Drawer
        isOpen={selectedEvent !== null}
        title="Event Details"
        onClose={() => setSelectedEvent(null)}
      >
        {selectedEvent && (
          <>
            <DetailRow label="Timestamp" value={new Date(selectedEvent.timestamp).toLocaleString()} />
            <DetailRow label="Event Type" value={selectedEvent.type.replace(/_/g, ' ')} />
            <DetailRow
              label="Severity"
              value={<span className={`ui-badge ui-badge--${selectedEvent.severity === 'critical' ? 'error' : selectedEvent.severity === 'warning' ? 'warning' : 'info'}`}>{selectedEvent.severity.toUpperCase()}</span>}
            />
            <DetailRow label="Message" value={selectedEvent.message} />
            {selectedEvent.username && (
              <DetailRow label="User" value={`${selectedEvent.username} (${selectedEvent.userId})`} />
            )}
            <DetailRow
              label="Matched Security Rule"
              value={EVENT_GUIDANCE[selectedEvent.type]?.rule ?? 'General security threshold'}
            />
            <DetailRow
              label="Recommended Remediation"
              value={EVENT_GUIDANCE[selectedEvent.type]?.remediation ?? 'Review the relevant metric on this dashboard.'}
            />
            <div className="helper-text">
              This event is derived from an aggregate metric snapshot (a threshold crossed within a 2-second polling
              window), not a single captured request — so it has no per-request IP/user-agent/request-ID the way an
              audit log entry or Request Inspector row does. For that level of detail on an individual request, see
              the Request Inspector above or the Audit Logs page.
            </div>
          </>
        )}
      </Drawer>
    </Layout>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="threat-card__meta-label">{label}</div>
      <div className="section-subtitle">{value}</div>
    </div>
  );
}
