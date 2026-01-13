/**
 * Threat Intelligence page
 */

import { useState, useEffect, type CSSProperties } from 'react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { adminApi } from '../api/admin';
import type { IPThreatInfo, ThreatStatistics, AttackPattern, ThreatLevel } from '../types';
import { format } from 'date-fns';

const threatLevelColors: Record<ThreatLevel, { bg: string; text: string; badge: string }> = {
  critical: { bg: 'var(--color-error-50)', text: 'var(--color-error-800)', badge: 'var(--color-error-600)' },
  high: { bg: 'var(--color-warning-50)', text: 'var(--color-warning-800)', badge: 'var(--color-warning-600)' },
  medium: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)', badge: 'var(--color-warning-500)' },
  low: { bg: 'var(--color-success-50)', text: 'var(--color-success-800)', badge: 'var(--color-success-600)' },
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
      <div className="page">
        <SectionHeader
          title="Threat Intelligence"
          subtitle="IP reputation tracking and attack pattern detection"
          actions={(
            <Button variant="primary" onClick={fetchData} isLoading={loading}>
              Refresh
            </Button>
          )}
        />

        {loading && !error && (
          <div className="loading-state">Loading threat intelligence...</div>
        )}

        {error && (
          <div className="alert">{error}</div>
        )}

        {!loading && !error && statistics && (
          <>
            {/* Statistics Cards */}
            <div className="grid grid--metrics">
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
              <section className="section-block">
                <SectionHeader title="Active Attack Patterns" />
                <div className="stack">
                  {patterns.map((pattern, index) => {
                    const colors = threatLevelColors[pattern.severity];
                    return (
                      <Card
                        key={index}
                        className="threat-pattern"
                        style={{ '--pattern-accent': colors.badge } as CSSProperties}
                      >
                        <div className="threat-pattern__header">
                          <div className="threat-pattern__title-row">
                            <h3 className="threat-pattern__title">
                              {pattern.type.replace(/_/g, ' ').toUpperCase()}
                            </h3>
                            <Badge
                              tone="custom"
                              style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                            >
                              {pattern.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="threat-pattern__description">{pattern.description}</p>
                        </div>
                        <div className="threat-pattern__meta">
                          <span><strong>{pattern.ipAddresses.length}</strong> IP addresses</span>
                          <span><strong>{pattern.eventCount}</strong> events</span>
                          <span>Last <strong>{Math.round(pattern.timeWindow / 60000)}min</strong></span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Top Threats */}
            <section className="section-block">
              <SectionHeader title="Top Threats (by Score)" />
              {threats.length === 0 ? (
                <Card className="empty-state">No threats detected</Card>
              ) : (
                <div className="stack">
                  {threats.map((threat) => {
                    const colors = threatLevelColors[threat.threatLevel];
                    return (
                      <Card
                        key={threat.ip}
                        className={['threat-card', threat.isBlocked ? 'threat-card--blocked' : ''].join(' ')}
                        style={{ '--threat-accent': colors.badge } as CSSProperties}
                      >
                        <div className="threat-card__layout">
                          <div>
                            <div className="threat-card__header">
                              <h3 className="threat-card__ip">{threat.ip}</h3>
                              {threat.isBlocked && (
                                <Badge tone="danger">🚫 BLOCKED</Badge>
                              )}
                              <Badge
                                tone="custom"
                                style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                              >
                                {threat.threatLevel.toUpperCase()}
                              </Badge>
                            </div>

                            <div className="threat-card__stats">
                              <div>
                                <div className="stat-caption">Threat Score</div>
                                <div className="threat-card__score" style={{ color: colors.badge }}>
                                  {threat.threatScore}/100
                                </div>
                                {threat.abuseScore !== undefined && (
                                  <div className="stat-caption">AbuseIPDB: {threat.abuseScore}%</div>
                                )}
                              </div>

                              <div>
                                <div className="stat-caption">Total Events</div>
                                <div className="stat-value">{threat.totalEvents}</div>
                              </div>

                              {threat.geo && (
                                <div>
                                  <div className="stat-caption">Location</div>
                                  <div className="threat-card__location">
                                    {threat.geo.city && `${threat.geo.city}, `}
                                    {threat.geo.country || 'Unknown'}
                                  </div>
                                </div>
                              )}

                              <div>
                                <div className="stat-caption">First/Last Seen</div>
                                <div className="threat-card__times">
                                  {format(new Date(threat.firstSeen), 'MMM dd, HH:mm')}
                                  <br />
                                  {format(new Date(threat.lastSeen), 'MMM dd, HH:mm')}
                                </div>
                              </div>
                            </div>

                            <div className="threat-card__event-grid">
                              <div className="threat-event">
                                <div className="stat-caption">Failed Logins</div>
                                <div className="threat-event__value threat-event__value--error">
                                  {threat.eventTypes.failedLogins}
                                </div>
                              </div>
                              <div className="threat-event">
                                <div className="stat-caption">Rate Limits</div>
                                <div className="threat-event__value threat-event__value--warning">
                                  {threat.eventTypes.rateLimitViolations}
                                </div>
                              </div>
                              <div className="threat-event">
                                <div className="stat-caption">Suspicious</div>
                                <div className="threat-event__value threat-event__value--critical">
                                  {threat.eventTypes.suspiciousActivity}
                                </div>
                              </div>
                              <div className="threat-event">
                                <div className="stat-caption">Lockouts</div>
                                <div className="threat-event__value threat-event__value--danger">
                                  {threat.eventTypes.accountLockouts}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="threat-card__actions">
                            {threat.isBlocked ? (
                              <Button variant="success" onClick={() => handleUnblockIP(threat.ip)}>
                                Unblock IP
                              </Button>
                            ) : (
                              <Button variant="danger" onClick={() => handleBlockIP(threat.ip)}>
                                Block IP
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Top Countries */}
            {statistics.topCountries.length > 0 && (
              <section className="section-block">
                <SectionHeader title="Threats by Country" />
                <Card>
                  <div className="country-list">
                    {statistics.topCountries.map((country, index) => (
                      <div key={country.country} className="country-item">
                        <div className="inline-row">
                          <span className="rank-pill">{index + 1}</span>
                          <span className="country-name">{country.country}</span>
                        </div>
                        <Badge tone="primary">{country.count} threats</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
