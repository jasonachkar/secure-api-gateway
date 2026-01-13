/**
 * Main dashboard page with metrics
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { RequestRateChart } from '../components/RequestRateChart';
import { ErrorRateChart } from '../components/ErrorRateChart';
import { ResponseTimeChart } from '../components/ResponseTimeChart';
import { LiveEventFeed } from '../components/LiveEventFeed';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { useSSE } from '../hooks/useSSE';
import { adminApi } from '../api/admin';
import type { SecurityPosture } from '../types';

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

interface SecurityEvent {
  timestamp: number;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  userId?: string;
  username?: string;
}

const MAX_HISTORY = 30; // Keep 30 data points (1 minute at 2-second intervals)

export function Dashboard() {
  const [requestRateHistory, setRequestRateHistory] = useState<Array<{ timestamp: number; requests: number }>>([]);
  const [errorRateHistory, setErrorRateHistory] = useState<Array<{ timestamp: number; errors4xx: number; errors5xx: number }>>([]);
  const [responseTimeHistory, setResponseTimeHistory] = useState<Array<{ timestamp: number; p50: number; p95: number; p99: number }>>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<RealtimeMetrics | null>(null);
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [infoBannerDismissed, setInfoBannerDismissed] = useState(() => {
    return localStorage.getItem('dashboard-info-banner-dismissed') === 'true';
  });

  const { data, isConnected, error } = useSSE<any>({
    url: `${API_URL}/admin/metrics/realtime`,
    enabled: true,
  });

  useEffect(() => {
    adminApi
      .getSecurityPosture()
      .then(setPosture)
      .catch(() => {
        // Silently fail - posture is optional
      });
  }, []);

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

  const gradeClass = posture
    ? posture.grade === 'A'
      ? 'posture-grade--A'
      : posture.grade === 'B'
        ? 'posture-grade--B'
        : posture.grade === 'C'
          ? 'posture-grade--C'
          : 'posture-grade--D'
    : '';

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

        {error && (
          <div className="alert alert--danger">
            <strong>Connection Error:</strong> {error}
          </div>
        )}

        {!infoBannerDismissed && (
          <div className="alert alert--info info-banner">
            <div className="flex-1">
              <div className="info-banner__title">👋 New to this dashboard?</div>
              <div className="info-banner__text">
                This is a live demonstration of a production-grade API Gateway security monitoring dashboard. Learn
                more about what each section shows in the{' '}
                <Link to="/about" className="info-banner__link">
                  About page
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

        {posture && (
          <Card className="posture-card">
            <div className={`posture-grade ${gradeClass}`}>{posture.grade}</div>
            <div className="flex-1">
              <div className="section-subtitle">Security Posture Score</div>
              <div className="summary-value">{posture.overallScore}/100</div>
              <div className="section-subtitle">
                {posture.recommendations.length > 0 && `${posture.recommendations.length} recommendation(s)`}
              </div>
            </div>
            <Link to="/compliance">
              <Button variant="primary" rightIcon="→">
                View Details
              </Button>
            </Link>
          </Card>
        )}

        {currentMetrics && (
          <div className="page-grid page-grid--cards">
            <MetricCard title="Requests/sec" value={currentMetrics.requestsPerSecond.toFixed(2)} color="blue" />
            <MetricCard
              title="Error Rate"
              value={`${currentMetrics.errorRate.toFixed(2)}%`}
              color={currentMetrics.errorRate > 5 ? 'red' : 'green'}
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
          <LiveEventFeed events={securityEvents} maxEvents={15} />
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
    </Layout>
  );
}
