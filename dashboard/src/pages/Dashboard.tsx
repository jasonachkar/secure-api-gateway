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
import { useSSE } from '../hooks/useSSE';
import { adminApi } from '../api/admin';
import { theme } from '../styles/theme';
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

  // Load security posture on mount
  useEffect(() => {
    adminApi.getSecurityPosture().then(setPosture).catch(() => {
      // Silently fail - posture is optional
    });
  }, []);

  // Update history and events when new data arrives
  useEffect(() => {
    if (!data) return;
    
    // Skip connection messages and invalid data
    if (data.type === 'connected' || !data.requestsPerSecond) {
      return;
    }

    const metrics = data as unknown as RealtimeMetrics;
    setCurrentMetrics(metrics);

    // Update request rate history
    setRequestRateHistory(prev => {
      const newHistory = [...prev, {
        timestamp: metrics.timestamp || Date.now(),
        requests: metrics.requestsPerSecond,
      }];
      return newHistory.slice(-MAX_HISTORY);
    });

    // Update error rate history
    setErrorRateHistory(prev => {
      const newHistory = [...prev, {
        timestamp: metrics.timestamp || Date.now(),
        errors4xx: metrics.errors4xx || 0,
        errors5xx: metrics.errors5xx || 0,
      }];
      return newHistory.slice(-MAX_HISTORY);
    });

    // Update response time history
    setResponseTimeHistory(prev => {
      const newHistory = [...prev, {
        timestamp: metrics.timestamp || Date.now(),
        p50: metrics.responseTimeStats.p50,
        p95: metrics.responseTimeStats.p95,
        p99: metrics.responseTimeStats.p99,
      }];
      return newHistory.slice(-MAX_HISTORY);
    });

    // Generate security events from metrics
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
      setSecurityEvents(prev => [...prev, ...events].slice(-50));
    }
  }, [data]);

  return (
    <Layout>
      <div>
        {/* Header with connection status */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: theme.spacing.xl 
        }}>
          <div>
            <h1 style={{ 
              ...theme.typography.h1,
              fontSize: theme.typography.fontSize['3xl'],
              marginBottom: theme.spacing.sm,
            }}>
              Security Monitoring
            </h1>
            <p style={{ 
              ...theme.typography.body,
              color: theme.colors.text.secondary,
            }}>
              Real-time security metrics and threat detection
            </p>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: isConnected ? theme.colors.success[100] : theme.colors.error[100],
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            color: isConnected ? theme.colors.success[800] : theme.colors.error[800],
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              backgroundColor: isConnected ? theme.colors.success[500] : theme.colors.error[500],
              borderRadius: '50%',
            }} />
            {isConnected ? 'LIVE' : 'DISCONNECTED'}
          </div>
        </div>

        {error && (
          <div style={{
            backgroundColor: theme.colors.error[50],
            color: theme.colors.error[800],
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.lg,
            marginBottom: theme.spacing.lg,
            borderLeft: `4px solid ${theme.colors.error[500]}`,
            boxShadow: theme.shadows.sm,
          }}>
            <strong>Connection Error:</strong> {error}
          </div>
        )}

        {/* Info Banner */}
        {!infoBannerDismissed && (
          <div style={{
            backgroundColor: theme.colors.primary[50],
            border: `1px solid ${theme.colors.primary[200]}`,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: theme.spacing.md,
            boxShadow: theme.shadows.sm,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{
                ...theme.typography.body,
                fontWeight: theme.typography.fontWeight.medium,
                color: theme.colors.primary[900],
                marginBottom: theme.spacing.xs,
              }}>
                👋 New to this dashboard?
              </div>
              <div style={{
                ...theme.typography.body,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.primary[700],
              }}>
                This is a live demonstration of a production-grade API Gateway security monitoring dashboard. 
                Learn more about what each section shows in the{' '}
                <Link 
                  to="/about" 
                  style={{ 
                    color: theme.colors.primary[600], 
                    fontWeight: theme.typography.fontWeight.medium,
                    textDecoration: 'underline',
                  }}
                >
                  About page
                </Link>.
              </div>
            </div>
            <button
              onClick={() => {
                setInfoBannerDismissed(true);
                localStorage.setItem('dashboard-info-banner-dismissed', 'true');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: theme.colors.primary[600],
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.lg,
                padding: theme.spacing.xs,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Dismiss banner"
            >
              ×
            </button>
          </div>
        )}

        {/* Security Posture Card */}
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
            <div style={{ flex: 1 }}>
              <div style={{ 
                ...theme.typography.body,
                color: theme.colors.text.tertiary, 
                marginBottom: theme.spacing.xs 
              }}>
                Security Posture Score
              </div>
              <div style={{ 
                fontSize: theme.typography.fontSize['4xl'], 
                fontWeight: theme.typography.fontWeight.bold, 
                color: theme.colors.text.primary 
              }}>
                {posture.overallScore}/100
              </div>
              <div style={{ 
                ...theme.typography.small,
                color: theme.colors.text.tertiary, 
                marginTop: theme.spacing.xs 
              }}>
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

        {/* Key Metrics Cards */}
        {currentMetrics && (
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: theme.spacing.lg, 
            marginBottom: theme.spacing.xl 
          }}>
            <MetricCard
              title="Requests/sec"
              value={currentMetrics.requestsPerSecond.toFixed(2)}
              color="blue"
            />
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
            <MetricCard
              title="Active Sessions"
              value={currentMetrics.authStats.activeSessions}
              color="blue"
            />
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

        {/* Charts and Live Feed Layout */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '2fr 1fr', 
          gap: theme.spacing.lg, 
          marginBottom: theme.spacing.xl 
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <RequestRateChart data={requestRateHistory} title="Request Rate (Real-time)" />
            <ErrorRateChart data={errorRateHistory} title="Error Rate by Type" />
            {responseTimeHistory.length > 0 && (
              <ResponseTimeChart data={responseTimeHistory} title="Response Time Percentiles" />
            )}
          </div>
          <LiveEventFeed events={securityEvents} maxEvents={15} />
        </div>

        {/* Export Section */}
        <section style={{ 
          marginTop: theme.spacing.xl,
          backgroundColor: theme.colors.background.primary,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.md,
        }}>
          <h2 style={{ 
            ...theme.typography.h3,
            marginBottom: theme.spacing.md,
          }}>
            Export Data
          </h2>
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <Button
              variant="primary"
              onClick={() => {
                if (currentMetrics) {
                  const dataStr = JSON.stringify({
                    timestamp: new Date().toISOString(),
                    metrics: currentMetrics,
                    posture: posture,
                  }, null, 2);
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
                    ...securityEvents.map(e => 
                      `${new Date(e.timestamp).toISOString()},${e.type},${e.severity},"${e.message}"`
                    )
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
        </section>
      </div>
    </Layout>
  );
}
