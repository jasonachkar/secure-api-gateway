/**
 * Compliance Dashboard
 * Security posture scoring and compliance metrics
 */

import { useState, useEffect, type CSSProperties } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { adminApi } from '../api/admin';
import type { SecurityPosture, ComplianceMetrics } from '../types';
import { format } from 'date-fns';

const gradeColors: Record<string, { bg: string; text: string }> = {
  A: { bg: 'var(--color-success-100)', text: 'var(--color-success-800)' },
  B: { bg: 'var(--color-primary-100)', text: 'var(--color-primary-800)' },
  C: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)' },
  D: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)' },
  F: { bg: 'var(--color-error-100)', text: 'var(--color-error-800)' },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  excellent: { bg: 'var(--color-success-100)', text: 'var(--color-success-800)' },
  good: { bg: 'var(--color-primary-100)', text: 'var(--color-primary-800)' },
  fair: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)' },
  poor: { bg: 'var(--color-error-100)', text: 'var(--color-error-800)' },
};

const complianceColors: Record<string, { bg: string; text: string }> = {
  compliant: { bg: 'var(--color-success-100)', text: 'var(--color-success-800)' },
  partial: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)' },
  'non-compliant': { bg: 'var(--color-error-100)', text: 'var(--color-error-800)' },
  mitigated: { bg: 'var(--color-success-100)', text: 'var(--color-success-800)' },
  vulnerable: { bg: 'var(--color-error-100)', text: 'var(--color-error-800)' },
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
        adminApi.getSecurityPosture().catch(err => {
          console.error('Error fetching posture:', err);
          return null;
        }),
        adminApi.getComplianceMetrics().catch(err => {
          console.error('Error fetching metrics:', err);
          return null;
        }),
      ]);
      
      // Log the actual data received for debugging
      console.log('Posture data received:', postureResponse);
      console.log('Metrics data received:', metricsResponse);
      
      // Defensive checks - ensure data structure is valid
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
      
      // Ensure all required framework sections exist
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
      
      // Ensure arrays are initialized (defensive check)
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
      // Set empty state to prevent rendering errors
      setPosture(null);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="page">
        <SectionHeader
          title="Compliance & Security Posture"
          subtitle="Security posture scoring and compliance metrics for industry standards"
          actions={(
            <Button variant="primary" onClick={fetchData}>
              Refresh
            </Button>
          )}
        />

        {loading && <div className="loading-state">Loading compliance data...</div>}

        {error && <div className="alert">{error}</div>}

        {!loading && !error && posture && metrics && (
          <>
            {/* Compliance Frameworks Tabs */}
            <section>
              <div className="tabs">
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
                    className={['tab-button', activeTab === tab.id ? 'tab-button--active' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Security Posture Tab */}
              {activeTab === 'posture' && (
                <div>
                  {/* Security Posture Overview */}
                  <div className="section-block">
                    <Card className="posture-overview">
                      <div className="posture-label">Overall Security Posture</div>
                      <div className="posture-score">
                        <div
                          className="posture-grade"
                          style={{
                            '--posture-bg': gradeColors[posture.grade].bg,
                            '--posture-color': gradeColors[posture.grade].text,
                          } as CSSProperties}
                        >
                          {posture.grade}
                        </div>
                        <div>
                          <div className="posture-value">{posture.overallScore}</div>
                          <div className="posture-caption">out of 100</div>
                        </div>
                      </div>
                      {posture.lastUpdated && (
                        <div className="posture-updated">
                          Last updated: {format(new Date(posture.lastUpdated), 'MMM dd, yyyy HH:mm:ss')}
                        </div>
                      )}
                    </Card>
                  </div>

                  {/* Security Factors */}
                  <section className="section-block">
                    <SectionHeader title="Security Factors" />
                    <div className="grid grid--cards">
                      {Object.entries(posture.factors).map(([key, factor]) => {
                        const colors = statusColors[factor.status];
                        return (
                          <Card
                            key={key}
                            className="factor-card"
                            style={{ '--factor-accent': colors.text } as CSSProperties}
                          >
                            <div className="factor-card__header">
                              <h3 className="factor-card__title">
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                              </h3>
                              <Badge
                                tone="custom"
                                style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                              >
                                {factor.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="factor-card__score">{factor.score}</div>
                            <div className="factor-card__details">
                              {Object.entries(factor.details).map(([k, v]) => (
                                <div key={k} className="factor-card__detail">
                                  {k.replace(/([A-Z])/g, ' $1').trim()}: <strong>{String(v)}</strong>
                                </div>
                              ))}
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </section>

                  {/* Recommendations */}
                  {posture.recommendations.length > 0 && (
                    <section className="section-block">
                      <SectionHeader title="Recommendations" />
                      <Card>
                        <ul className="recommendation-list">
                          {posture.recommendations.map((rec, idx) => (
                            <li key={idx} className="recommendation-item">
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </Card>
                    </section>
                  )}
                </div>
              )}

              {/* NIST Tab */}
              {activeTab === 'nist' && (
                <Card className="framework-card">
                  <div className="framework-header">
                    <h3 className="framework-title">NIST Cybersecurity Framework</h3>
                    <div className="framework-subtitle">
                      Overall Score: <strong>{metrics.nist?.score ?? 0}%</strong>
                    </div>
                  </div>
                  <div className="framework-list">
                    {(!metrics.nist?.controls || metrics.nist.controls.length === 0) ? (
                      <div className="framework-empty">No NIST controls data available</div>
                    ) : (
                      metrics.nist.controls.map((control) => {
                        const colors = complianceColors[control.status];
                        return (
                          <div
                            key={control.id}
                            className="framework-item"
                            style={{ '--framework-accent': colors.text } as CSSProperties}
                          >
                            <div className="framework-item__header">
                              <div className="framework-item__title">
                                {control.id}: {control.name}
                              </div>
                              <Badge
                                tone="custom"
                                style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                              >
                                {control.status.toUpperCase()}
                              </Badge>
                            </div>
                            {control.evidence.length > 0 && (
                              <div className="framework-item__body">
                                <strong>Evidence:</strong>
                                <ul className="framework-evidence">
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

              {/* OWASP Tab */}
              {activeTab === 'owasp' && (
                <Card className="framework-card">
                  <div className="framework-header">
                    <h3 className="framework-title">OWASP Top 10</h3>
                    <div className="framework-subtitle">
                      Overall Score: <strong>{metrics.owasp?.score ?? 0}%</strong>
                    </div>
                  </div>
                  <div className="framework-list">
                    {(!metrics.owasp?.top10 || metrics.owasp.top10.length === 0) ? (
                      <div className="framework-empty">No OWASP Top 10 data available</div>
                    ) : (
                      metrics.owasp.top10.map((risk, idx) => {
                        const colors = complianceColors[risk.status];
                        return (
                          <div
                            key={idx}
                            className="framework-item"
                            style={{ '--framework-accent': colors.text } as CSSProperties}
                          >
                            <div className="framework-item__header">
                              <div className="framework-item__title">{risk.risk}</div>
                              <Badge
                                tone="custom"
                                style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                              >
                                {risk.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="framework-item__description">{risk.description}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              )}

              {/* PCI DSS Tab */}
              {activeTab === 'pci' && (
                <Card className="framework-card">
                  <div className="framework-header">
                    <h3 className="framework-title">PCI DSS Requirements</h3>
                    <div className="framework-subtitle">
                      Overall Score: <strong>{metrics.pci?.score ?? 0}%</strong>
                    </div>
                  </div>
                  <div className="framework-list">
                    {(!metrics.pci?.requirements || metrics.pci.requirements.length === 0) ? (
                      <div className="framework-empty">No PCI DSS requirements data available</div>
                    ) : (
                      metrics.pci.requirements.map((req) => {
                        const colors = complianceColors[req.status];
                        return (
                          <div
                            key={req.id}
                            className="framework-item"
                            style={{ '--framework-accent': colors.text } as CSSProperties}
                          >
                            <div className="framework-item__header">
                              <div className="framework-item__title">
                                {req.id}: {req.name}
                              </div>
                              <Badge
                                tone="custom"
                                style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                              >
                                {req.status.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              )}

              {/* GDPR Tab */}
              {activeTab === 'gdpr' && (
                <Card className="framework-card">
                  <div className="framework-header">
                    <h3 className="framework-title">GDPR Principles</h3>
                    <div className="framework-subtitle">
                      Overall Score: <strong>{metrics.gdpr?.score ?? 0}%</strong>
                    </div>
                  </div>
                  <div className="framework-list">
                    {(!metrics.gdpr?.principles || metrics.gdpr.principles.length === 0) ? (
                      <div className="framework-empty">No GDPR principles data available</div>
                    ) : (
                      metrics.gdpr.principles.map((principle, idx) => {
                        const colors = complianceColors[principle.status];
                        return (
                          <div
                            key={idx}
                            className="framework-item"
                            style={{ '--framework-accent': colors.text } as CSSProperties}
                          >
                            <div className="framework-item__header">
                              <div className="framework-item__title">{principle.principle}</div>
                              <Badge
                                tone="custom"
                                style={{ '--badge-bg': colors.bg, '--badge-color': colors.text } as CSSProperties}
                              >
                                {principle.status.toUpperCase()}
                              </Badge>
                            </div>
                            <div className="framework-item__description">{principle.description}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
