/**
 * Compliance Dashboard
 * Security posture scoring and compliance metrics
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
import type { SecurityPosture, ComplianceMetrics } from '../types';

const factorBadgeClass: Record<string, string> = {
  excellent: 'badge-excellent',
  good: 'badge-good',
  fair: 'badge-fair',
  poor: 'badge-poor',
};

const factorCardClass: Record<string, string> = {
  excellent: 'factor-card--excellent',
  good: 'factor-card--good',
  fair: 'factor-card--fair',
  poor: 'factor-card--poor',
};

const complianceBadgeClass: Record<string, string> = {
  compliant: 'badge-compliant',
  partial: 'badge-partial',
  'non-compliant': 'badge-noncompliant',
  mitigated: 'badge-mitigated',
  vulnerable: 'badge-vulnerable',
};

export function Compliance() {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [metrics, setMetrics] = useState<ComplianceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'posture' | 'nist' | 'owasp' | 'pci' | 'gdpr'>('posture');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [postureResponse, metricsResponse] = await Promise.all([
        adminApi.getSecurityPosture().catch((err) => {
          console.error('Error fetching posture:', err);
          return null;
        }),
        adminApi.getComplianceMetrics().catch((err) => {
          console.error('Error fetching metrics:', err);
          return null;
        }),
      ]);

      console.log('Posture data received:', postureResponse);
      console.log('Metrics data received:', metricsResponse);

      if (!postureResponse) {
        throw new Error('Failed to fetch security posture data');
      }

      if (!postureResponse.factors) {
        console.warn('Posture data missing factors, initializing...');
        postureResponse.factors = {
          authentication: {
            score: 0,
            status: 'poor' as const,
            details: { failedLoginRate: 0, accountLockouts: 0, mfaEnabled: false, sessionSecurity: 0 },
          },
          threatIntelligence: {
            score: 0,
            status: 'poor' as const,
            details: { criticalThreats: 0, blockedIPs: 0, threatResponseTime: 0 },
          },
          rateLimiting: {
            score: 0,
            status: 'poor' as const,
            details: { violations: 0, coverage: 0 },
          },
          auditLogging: {
            score: 0,
            status: 'poor' as const,
            details: { logCoverage: 0, retentionDays: 0 },
          },
          incidentResponse: {
            score: 0,
            status: 'poor' as const,
            details: { openIncidents: 0, avgResponseTime: 0, avgResolutionTime: 0 },
          },
        };
      }

      if (!postureResponse.recommendations) {
        postureResponse.recommendations = [];
      }

      if (!metricsResponse) {
        throw new Error('Failed to fetch compliance metrics data');
      }

      if (!metricsResponse.nist) {
        metricsResponse.nist = { score: 0, controls: [] };
      }
      if (!metricsResponse.owasp) {
        metricsResponse.owasp = { score: 0, top10: [] };
      }
      if (!metricsResponse.pci) {
        metricsResponse.pci = { score: 0, requirements: [] };
      }
      if (!metricsResponse.gdpr) {
        metricsResponse.gdpr = { score: 0, principles: [] };
      }

      if (!metricsResponse.nist.controls) {
        metricsResponse.nist.controls = [];
      }
      if (!metricsResponse.owasp.top10) {
        metricsResponse.owasp.top10 = [];
      }
      if (!metricsResponse.pci.requirements) {
        metricsResponse.pci.requirements = [];
      }
      if (!metricsResponse.gdpr.principles) {
        metricsResponse.gdpr.principles = [];
      }

      setPosture(postureResponse);
      setMetrics(metricsResponse);
      setError('');
    } catch (err: any) {
      console.error('Compliance data fetch error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        response: (err as any).response,
      });
      setError(err.message || 'Failed to fetch compliance data');
      setPosture(null);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

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
          title="Compliance & Security Posture"
          subtitle="Security posture scoring and compliance metrics for industry standards"
          actions={<Button onClick={fetchData}>Refresh</Button>}
        />

        {loading && <div className="empty-state">Loading compliance data...</div>}

        {error && <div className="alert alert--danger">{error}</div>}

        {!loading && !error && posture && metrics && (
          <div className="page-stack">
            <div className="tab-list">
              {[
                { id: 'posture' as const, label: 'Security Posture' },
                { id: 'nist' as const, label: `NIST (${metrics.nist?.score ?? 0}%)` },
                { id: 'owasp' as const, label: `OWASP (${metrics.owasp?.score ?? 0}%)` },
                { id: 'pci' as const, label: `PCI DSS (${metrics.pci?.score ?? 0}%)` },
                { id: 'gdpr' as const, label: `GDPR (${metrics.gdpr?.score ?? 0}%)` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`tab-button ${activeTab === tab.id ? 'tab-button--active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'posture' && (
              <div className="page-stack">
                <Card className="page-stack">
                  <div className="section-subtitle">Overall Security Posture</div>
                  <div className="compliance-score">
                    <div className={`posture-grade posture-grade--xl ${gradeClass}`}>{posture.grade}</div>
                    <div>
                      <div className="compliance-score__value">{posture.overallScore}</div>
                      <div className="section-subtitle">out of 100</div>
                    </div>
                  </div>
                  {posture.lastUpdated && (
                    <div className="helper-text">
                      Last updated: {format(new Date(posture.lastUpdated), 'MMM dd, yyyy HH:mm:ss')}
                    </div>
                  )}
                </Card>

                <div className="page-stack">
                  <div className="section-title">Security Factors</div>
                  <div className="page-grid page-grid--columns-2">
                    {Object.entries(posture.factors).map(([key, factor]) => {
                      const statusClass = factorCardClass[factor.status];
                      const badgeClass = factorBadgeClass[factor.status];
                      return (
                        <Card key={key} className={`factor-card ${statusClass}`}>
                          <div className="card-header">
                            <div className="section-title">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </div>
                            <Badge className={badgeClass}>{factor.status.toUpperCase()}</Badge>
                          </div>
                          <div className="factor-card__score">{factor.score}</div>
                          <div className="factor-card__details">
                            {Object.entries(factor.details).map(([detailKey, value]) => (
                              <div key={detailKey}>
                                {detailKey.replace(/([A-Z])/g, ' $1').trim()}: <strong>{String(value)}</strong>
                              </div>
                            ))}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {posture.recommendations.length > 0 && (
                  <div className="page-stack">
                    <div className="section-title">Recommendations</div>
                    <Card>
                      <ul className="recommendation-list">
                        {posture.recommendations.map((rec, idx) => (
                          <li key={idx} className="recommendation-item">
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'nist' && (
              <Card className="compliance-card">
                <div>
                  <div className="section-card__title">NIST Cybersecurity Framework</div>
                  <div className="section-card__subtitle">
                    Overall Score: <strong>{metrics.nist?.score ?? 0}%</strong>
                  </div>
                </div>
                <div className="page-stack">
                  {!metrics.nist?.controls || metrics.nist.controls.length === 0 ? (
                    <div className="empty-state">No NIST controls data available</div>
                  ) : (
                    metrics.nist.controls.map((control) => {
                      const badgeClass = complianceBadgeClass[control.status];
                      const itemClass = `compliance-item compliance-item--${control.status}`;
                      return (
                        <div key={control.id} className={itemClass}>
                          <div className="compliance-item__header">
                            <div className="compliance-item__title">
                              {control.id}: {control.name}
                            </div>
                            <Badge className={badgeClass}>{control.status.toUpperCase()}</Badge>
                          </div>
                          {control.evidence.length > 0 && (
                            <div className="compliance-item__description">
                              <strong>Evidence:</strong>
                              <ul className="stat-list">
                                {control.evidence.map((ev, idx) => (
                                  <li key={idx}>{ev}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'owasp' && (
              <Card className="compliance-card">
                <div>
                  <div className="section-card__title">OWASP Top 10</div>
                  <div className="section-card__subtitle">
                    Overall Score: <strong>{metrics.owasp?.score ?? 0}%</strong>
                  </div>
                </div>
                <div className="page-stack">
                  {!metrics.owasp?.top10 || metrics.owasp.top10.length === 0 ? (
                    <div className="empty-state">No OWASP Top 10 data available</div>
                  ) : (
                    metrics.owasp.top10.map((risk, idx) => {
                      const badgeClass = complianceBadgeClass[risk.status];
                      const itemClass = `compliance-item compliance-item--${risk.status}`;
                      return (
                        <div key={idx} className={itemClass}>
                          <div className="compliance-item__header">
                            <div className="compliance-item__title">{risk.risk}</div>
                            <Badge className={badgeClass}>{risk.status.toUpperCase()}</Badge>
                          </div>
                          <div className="compliance-item__description">{risk.description}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'pci' && (
              <Card className="compliance-card">
                <div>
                  <div className="section-card__title">PCI DSS Requirements</div>
                  <div className="section-card__subtitle">
                    Overall Score: <strong>{metrics.pci?.score ?? 0}%</strong>
                  </div>
                </div>
                <div className="page-stack">
                  {!metrics.pci?.requirements || metrics.pci.requirements.length === 0 ? (
                    <div className="empty-state">No PCI DSS requirements data available</div>
                  ) : (
                    metrics.pci.requirements.map((req) => {
                      const badgeClass = complianceBadgeClass[req.status];
                      const itemClass = `compliance-item compliance-item--${req.status}`;
                      return (
                        <div key={req.id} className={itemClass}>
                          <div className="compliance-item__header">
                            <div className="compliance-item__title">
                              {req.id}: {req.name}
                            </div>
                            <Badge className={badgeClass}>{req.status.toUpperCase()}</Badge>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'gdpr' && (
              <Card className="compliance-card">
                <div>
                  <div className="section-card__title">GDPR Principles</div>
                  <div className="section-card__subtitle">
                    Overall Score: <strong>{metrics.gdpr?.score ?? 0}%</strong>
                  </div>
                </div>
                <div className="page-stack">
                  {!metrics.gdpr?.principles || metrics.gdpr.principles.length === 0 ? (
                    <div className="empty-state">No GDPR principles data available</div>
                  ) : (
                    metrics.gdpr.principles.map((principle, idx) => {
                      const badgeClass = complianceBadgeClass[principle.status];
                      const itemClass = `compliance-item compliance-item--${principle.status}`;
                      return (
                        <div key={idx} className={itemClass}>
                          <div className="compliance-item__header">
                            <div className="compliance-item__title">{principle.principle}</div>
                            <Badge className={badgeClass}>{principle.status.toUpperCase()}</Badge>
                          </div>
                          <div className="compliance-item__description">{principle.description}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
