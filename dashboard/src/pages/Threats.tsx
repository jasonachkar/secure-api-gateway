/**
 * Threat Intelligence page
 */

import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { Button } from '../components/Button';
import { adminApi } from '../api/admin';
import { theme } from '../styles/theme';
import type { IPThreatInfo, ThreatStatistics, AttackPattern, ThreatLevel } from '../types';
import { format } from 'date-fns';

const threatLevelColors: Record<ThreatLevel, { bg: string; text: string; badge: string }> = {
  critical: { bg: theme.colors.error[50], text: theme.colors.error[800], badge: theme.colors.error[600] },
  high: { bg: theme.colors.warning[50], text: theme.colors.warning[800], badge: theme.colors.warning[600] },
  medium: { bg: theme.colors.warning[100], text: theme.colors.warning[700], badge: theme.colors.warning[500] },
  low: { bg: theme.colors.success[50], text: theme.colors.success[800], badge: theme.colors.success[600] },
};

export function Threats() {
  const [threats, setThreats] = useState<IPThreatInfo[]>([]);
  const [statistics, setStatistics] = useState<ThreatStatistics | null>(null);
  const [patterns, setPatterns] = useState<AttackPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [threatsData, statsData, patternsData] = await Promise.all([
        adminApi.getTopThreats(20),
        adminApi.getThreatStatistics(),
        adminApi.getAttackPatterns(),
      ]);
      setThreats(threatsData);
      setStatistics(statsData);
      setPatterns(patternsData);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch threat data');
    } finally {
      setLoading(false);
    }
  };

  const handleBlockIP = async (ip: string) => {
    const reason = prompt(`Enter reason for blocking ${ip}:`);
    if (!reason) return;

    try {
      await adminApi.blockIP(ip, reason);
      await fetchData();
      alert('IP blocked successfully');
    } catch (err: any) {
      alert('Failed to block IP: ' + err.message);
    }
  };

  const handleUnblockIP = async (ip: string) => {
    if (!confirm(`Unblock IP ${ip}?`)) return;

    try {
      await adminApi.unblockIP(ip);
      await fetchData();
      alert('IP unblocked successfully');
    } catch (err: any) {
      alert('Failed to unblock IP: ' + err.message);
    }
  };

  return (
    <Layout>
      <div>
        {/* Header */}
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
              Threat Intelligence
            </h1>
            <p style={{ 
              ...theme.typography.body,
              color: theme.colors.text.secondary,
            }}>
              IP reputation tracking and attack pattern detection
            </p>
          </div>
          <Button variant="primary" onClick={fetchData} isLoading={loading}>
            Refresh
          </Button>
        </div>

        {loading && !error && (
          <div style={{ 
            textAlign: 'center', 
            padding: theme.spacing['2xl'], 
            color: theme.colors.text.tertiary 
          }}>
            Loading threat intelligence...
          </div>
        )}

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
            {error}
          </div>
        )}

        {!loading && !error && statistics && (
          <>
            {/* Statistics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
              <MetricCard
                title="Total Threats"
                value={statistics.totalThreats}
                color="blue"
              />
              <MetricCard
                title="Blocked IPs"
                value={statistics.blockedIPs}
                color="red"
              />
              <MetricCard
                title="Critical Threats"
                value={statistics.criticalThreats}
                color={statistics.criticalThreats > 0 ? 'red' : 'green'}
              />
              <MetricCard
                title="High Threats"
                value={statistics.highThreats}
                color={statistics.highThreats > 0 ? 'yellow' : 'green'}
              />
              <MetricCard
                title="Medium Threats"
                value={statistics.mediumThreats}
                color="blue"
              />
              <MetricCard
                title="Low Threats"
                value={statistics.lowThreats}
                color="green"
              />
            </div>

            {/* Attack Patterns */}
            {patterns.length > 0 && (
              <section style={{ marginBottom: '30px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>
                  Active Attack Patterns
                </h2>
                <div style={{ display: 'grid', gap: '15px' }}>
                  {patterns.map((pattern, index) => {
                    const colors = threatLevelColors[pattern.severity];
                    return (
                      <div
                        key={index}
                        style={{
                          backgroundColor: 'white',
                          padding: '20px',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          borderLeft: `4px solid ${colors.badge}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                              <h3 style={{ fontSize: '16px', fontWeight: '600' }}>
                                {pattern.type.replace(/_/g, ' ').toUpperCase()}
                              </h3>
                              <span style={{
                                padding: '4px 8px',
                                backgroundColor: colors.bg,
                                color: colors.text,
                                fontSize: '12px',
                                borderRadius: '4px',
                                fontWeight: '600',
                              }}>
                                {pattern.severity.toUpperCase()}
                              </span>
                            </div>
                            <p style={{ color: '#64748b', fontSize: '14px' }}>
                              {pattern.description}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#64748b' }}>
                          <span><strong>{pattern.ipAddresses.length}</strong> IP addresses</span>
                          <span><strong>{pattern.eventCount}</strong> events</span>
                          <span>Last <strong>{Math.round(pattern.timeWindow / 60000)}min</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Top Threats */}
            <section style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>
                Top Threats (by Score)
              </h2>
              {threats.length === 0 ? (
                <div style={{
                  backgroundColor: 'white',
                  padding: '40px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#94a3b8',
                }}>
                  No threats detected
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '15px' }}>
                  {threats.map((threat) => {
                    const colors = threatLevelColors[threat.threatLevel];
                    return (
                      <div
                        key={threat.ip}
                        style={{
                          backgroundColor: 'white',
                          padding: '20px',
                          borderRadius: '8px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          border: threat.isBlocked ? '2px solid #ef4444' : '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                              <h3 style={{ fontSize: '18px', fontWeight: '600', fontFamily: 'monospace' }}>
                                {threat.ip}
                              </h3>
                              {threat.isBlocked && (
                                <span style={{
                                  padding: '4px 8px',
                                  backgroundColor: '#fee2e2',
                                  color: '#991b1b',
                                  fontSize: '12px',
                                  borderRadius: '4px',
                                  fontWeight: '600',
                                }}>
                                  🚫 BLOCKED
                                </span>
                              )}
                              <span style={{
                                padding: '4px 8px',
                                backgroundColor: colors.bg,
                                color: colors.text,
                                fontSize: '12px',
                                borderRadius: '4px',
                                fontWeight: '600',
                              }}>
                                {threat.threatLevel.toUpperCase()}
                              </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                              <div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                  Threat Score
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: colors.badge }}>
                                  {threat.threatScore}/100
                                </div>
                                {threat.abuseScore !== undefined && (
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                    AbuseIPDB: {threat.abuseScore}%
                                  </div>
                                )}
                              </div>

                              <div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                  Total Events
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: '600' }}>
                                  {threat.totalEvents}
                                </div>
                              </div>

                              {threat.geo && (
                                <div>
                                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                    Location
                                  </div>
                                  <div style={{ fontSize: '14px', fontWeight: '500' }}>
                                    {threat.geo.city && `${threat.geo.city}, `}
                                    {threat.geo.country || 'Unknown'}
                                  </div>
                                </div>
                              )}

                              <div>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                                  First/Last Seen
                                </div>
                                <div style={{ fontSize: '12px' }}>
                                  {format(new Date(threat.firstSeen), 'MMM dd, HH:mm')}
                                  <br />
                                  {format(new Date(threat.lastSeen), 'MMM dd, HH:mm')}
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                              <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Failed Logins</div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444' }}>
                                  {threat.eventTypes.failedLogins}
                                </div>
                              </div>
                              <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Rate Limits</div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#f59e0b' }}>
                                  {threat.eventTypes.rateLimitViolations}
                                </div>
                              </div>
                              <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Suspicious</div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#dc2626' }}>
                                  {threat.eventTypes.suspiciousActivity}
                                </div>
                              </div>
                              <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', textAlign: 'center' }}>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Lockouts</div>
                                <div style={{ fontSize: '16px', fontWeight: '600', color: '#991b1b' }}>
                                  {threat.eventTypes.accountLockouts}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {threat.isBlocked ? (
                              <button
                                onClick={() => handleUnblockIP(threat.ip)}
                                style={{
                                  backgroundColor: '#22c55e',
                                  color: 'white',
                                  padding: '10px 16px',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Unblock IP
                              </button>
                            ) : (
                              <button
                                onClick={() => handleBlockIP(threat.ip)}
                                style={{
                                  backgroundColor: '#ef4444',
                                  color: 'white',
                                  padding: '10px 16px',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Block IP
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Top Countries */}
            {statistics.topCountries.length > 0 && (
              <section>
                <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>
                  Threats by Country
                </h2>
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {statistics.topCountries.map((country, index) => (
                      <div
                        key={country.country}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            borderRadius: '50%',
                            fontSize: '12px',
                            fontWeight: 'bold',
                          }}>
                            {index + 1}
                          </span>
                          <span style={{ fontSize: '16px', fontWeight: '600' }}>
                            {country.country}
                          </span>
                        </div>
                        <span style={{
                          padding: '4px 12px',
                          backgroundColor: '#dbeafe',
                          color: '#1e40af',
                          fontSize: '14px',
                          borderRadius: '12px',
                          fontWeight: '600',
                        }}>
                          {country.count} threats
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
