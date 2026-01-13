/**
 * Threat Intelligence page
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { adminApi } from '../api/admin';
import type { IPThreatInfo, ThreatStatistics, AttackPattern, ThreatLevel } from '../types';

const threatLevelBadgeClass: Record<ThreatLevel, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
};

const threatScoreClass: Record<ThreatLevel, string> = {
  critical: 'threat-score--critical',
  high: 'threat-score--high',
  medium: 'threat-score--medium',
  low: 'threat-score--low',
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
      <div className="page-stack">
        <SectionHeader
          title="Threat Intelligence"
          subtitle="IP reputation tracking and attack pattern detection"
          actions={
            <Button variant="primary" onClick={fetchData} isLoading={loading}>
              Refresh
            </Button>
          }
        />

        {loading && !error && <div className="empty-state">Loading threat intelligence...</div>}

        {error && <div className="alert alert--danger">{error}</div>}

        {!loading && !error && statistics && (
          <div className="page-stack">
            <div className="page-grid page-grid--cards">
              <MetricCard title="Total Threats" value={statistics.totalThreats} color="blue" />
              <MetricCard title="Blocked IPs" value={statistics.blockedIPs} color="red" />
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
              <MetricCard title="Medium Threats" value={statistics.mediumThreats} color="blue" />
              <MetricCard title="Low Threats" value={statistics.lowThreats} color="green" />
            </div>

            {patterns.length > 0 && (
              <div className="page-stack">
                <div className="section-title">Active Attack Patterns</div>
                <div className="page-stack">
                  {patterns.map((pattern, index) => {
                    const cardClass = `threat-card threat-card--${pattern.severity}`;
                    return (
                      <Card key={index} className={cardClass}>
                        <div className="threat-card__header">
                          <div className="threat-card__identity">
                            <div className="section-title">{pattern.type.replace(/_/g, ' ').toUpperCase()}</div>
                            <Badge className={threatLevelBadgeClass[pattern.severity]}>
                              {pattern.severity.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="threat-pattern__description">{pattern.description}</p>
                        </div>
                        <div className="section-subtitle">{pattern.description}</div>
                        <div className="incident-meta">
                          <span>
                            <strong>{pattern.ipAddresses.length}</strong> IP addresses
                          </span>
                          <span>
                            <strong>{pattern.eventCount}</strong> events
                          </span>
                          <span>
                            Last <strong>{Math.round(pattern.timeWindow / 60000)}min</strong>
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="page-stack">
              <div className="section-title">Top Threats (by Score)</div>
              {threats.length === 0 ? (
                <Card className="empty-state">No threats detected</Card>
              ) : (
                <div className="page-stack">
                  {threats.map((threat) => {
                    const threatCardClass = [
                      'threat-card',
                      `threat-card--${threat.threatLevel}`,
                      threat.isBlocked ? 'threat-card--blocked' : null,
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <Card key={threat.ip} className={threatCardClass}>
                        <div className="threat-card__header">
                          <div className="threat-card__identity">
                            <div className="text-mono section-title">{threat.ip}</div>
                            {threat.isBlocked && <Badge className="badge-critical">🚫 BLOCKED</Badge>}
                            <Badge className={threatLevelBadgeClass[threat.threatLevel]}>
                              {threat.threatLevel.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="incident-actions">
                            {threat.isBlocked ? (
                              <Button
                                variant="success"
                                size="sm"
                                className="button-nowrap"
                                onClick={() => handleUnblockIP(threat.ip)}
                              >
                                Unblock IP
                              </Button>
                            ) : (
                              <Button
                                variant="danger"
                                size="sm"
                                className="button-nowrap"
                                onClick={() => handleBlockIP(threat.ip)}
                              >
                                Block IP
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="threat-card__meta-grid">
                          <div>
                            <div className="threat-card__meta-label">Threat Score</div>
                            <div className={`threat-score ${threatScoreClass[threat.threatLevel]}`}>
                              {threat.threatScore}/100
                            </div>
                            {threat.abuseScore !== undefined && (
                              <div className="text-xs text-muted">AbuseIPDB: {threat.abuseScore}%</div>
                            )}
                          </div>

                          <div>
                            <div className="threat-card__meta-label">Total Events</div>
                            <div className="threat-card__meta-value">{threat.totalEvents}</div>
                          </div>

                          {threat.geo && (
                            <div>
                              <div className="threat-card__meta-label">Location</div>
                              <div className="threat-card__meta-value">
                                {threat.geo.city && `${threat.geo.city}, `}
                                {threat.geo.country || 'Unknown'}
                              </div>
                            </div>
                          )}

                          <div>
                            <div className="threat-card__meta-label">First/Last Seen</div>
                            <div className="text-sm">
                              {format(new Date(threat.firstSeen), 'MMM dd, HH:mm')}
                              <br />
                              {format(new Date(threat.lastSeen), 'MMM dd, HH:mm')}
                            </div>
                          </div>
                        </div>

                        <div className="inline-grid-4">
                          <div className="inline-stat">
                            <div className="inline-stat__label">Failed Logins</div>
                            <div className="inline-stat__value text-danger">
                              {threat.eventTypes.failedLogins}
                            </div>
                          </div>
                          <div className="inline-stat">
                            <div className="inline-stat__label">Rate Limits</div>
                            <div className="inline-stat__value text-warning">
                              {threat.eventTypes.rateLimitViolations}
                            </div>
                          </div>
                          <div className="inline-stat">
                            <div className="inline-stat__label">Suspicious</div>
                            <div className="inline-stat__value text-danger">
                              {threat.eventTypes.suspiciousActivity}
                            </div>
                          </div>
                          <div className="inline-stat">
                            <div className="inline-stat__label">Lockouts</div>
                            <div className="inline-stat__value text-danger">
                              {threat.eventTypes.accountLockouts}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

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
          </div>
        )}
      </div>
    </Layout>
  );
}
