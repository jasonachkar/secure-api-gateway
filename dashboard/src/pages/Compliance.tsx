/**
 * Compliance Dashboard
 * Security posture scoring and compliance metrics
 */

import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { adminApi } from '../api/admin';
import type { SecurityPosture, ComplianceMetrics } from '../types';
import { format } from 'date-fns';

const gradeColors: Record<string, { bg: string; text: string }> = {
  A: { bg: '#d1fae5', text: '#065f46' },
  B: { bg: '#dbeafe', text: '#1e40af' },
  C: { bg: '#fef3c7', text: '#92400e' },
  D: { bg: '#fed7aa', text: '#9a3412' },
  F: { bg: '#fee2e2', text: '#991b1b' },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  excellent: { bg: '#d1fae5', text: '#065f46' },
  good: { bg: '#dbeafe', text: '#1e40af' },
  fair: { bg: '#fef3c7', text: '#92400e' },
  poor: { bg: '#fee2e2', text: '#991b1b' },
};

const complianceColors: Record<string, { bg: string; text: string }> = {
  compliant: { bg: '#d1fae5', text: '#065f46' },
  partial: { bg: '#fef3c7', text: '#92400e' },
  'non-compliant': { bg: '#fee2e2', text: '#991b1b' },
  mitigated: { bg: '#d1fae5', text: '#065f46' },
  vulnerable: { bg: '#fee2e2', text: '#991b1b' },
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
      const [postureData, metricsData] = await Promise.all([
        adminApi.getSecurityPosture(),
        adminApi.getComplianceMetrics(),
      ]);
      setPosture(postureData);
      setMetrics(metricsData);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch compliance data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px' }}>
              Compliance & Security Posture
            </h1>
            <p style={{ color: '#64748b' }}>
              Security posture scoring and compliance metrics for industry standards
            </p>
          </div>
          <button
            onClick={fetchData}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              padding: '10px 16px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Loading compliance data...
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && posture && metrics && (
          <>
            {/* Security Posture Overview */}
            <div style={{ marginBottom: '30px' }}>
              <div style={{
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '10px' }}>
                  Overall Security Posture
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '20px' }}>
                  <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    backgroundColor: gradeColors[posture.grade].bg,
                    color: gradeColors[posture.grade].text,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                    fontWeight: 'bold',
                    border: `4px solid ${gradeColors[posture.grade].text}`,
                  }}>
                    {posture.grade}
                  </div>
                  <div>
                    <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#1e293b' }}>
                      {posture.overallScore}
                    </div>
                    <div style={{ fontSize: '18px', color: '#64748b' }}>out of 100</div>
                  </div>
                </div>
                {posture.lastUpdated && (
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Last updated: {format(new Date(posture.lastUpdated), 'MMM dd, yyyy HH:mm:ss')}
                  </div>
                )}
              </div>
            </div>

            {/* Security Factors */}
            <section style={{ marginBottom: '30px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '15px' }}>
                Security Factors
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '15px' }}>
                {Object.entries(posture.factors).map(([key, factor]) => {
                  const colors = statusColors[factor.status];
                  return (
                    <div
                      key={key}
                      style={{
                        backgroundColor: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: `4px solid ${colors.text}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '600', textTransform: 'capitalize' }}>
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </h3>
                        <span style={{
                          padding: '4px 8px',
                          backgroundColor: colors.bg,
                          color: colors.text,
                          fontSize: '12px',
                          borderRadius: '4px',
                          fontWeight: '600',
                        }}>
                          {factor.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#1e293b', marginBottom: '12px' }}>
                        {factor.score}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {Object.entries(factor.details).map(([k, v]) => (
                          <div key={k} style={{ marginBottom: '4px' }}>
                            {k.replace(/([A-Z])/g, ' $1').trim()}: <strong>{String(v)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Recommendations */}
            {posture.recommendations.length > 0 && (
              <section style={{ marginBottom: '30px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '15px' }}>
                  Recommendations
                </h2>
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {posture.recommendations.map((rec, idx) => (
                      <li
                        key={idx}
                        style={{
                          padding: '12px',
                          marginBottom: '8px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '6px',
                          borderLeft: '3px solid #3b82f6',
                        }}
                      >
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* Compliance Frameworks Tabs */}
            <section>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0' }}>
                {[
                  { id: 'posture' as const, label: 'Security Posture' },
                  { id: 'nist' as const, label: `NIST (${metrics.nist.score}%)` },
                  { id: 'owasp' as const, label: `OWASP (${metrics.owasp.score}%)` },
                  { id: 'pci' as const, label: `PCI DSS (${metrics.pci.score}%)` },
                  { id: 'gdpr' as const, label: `GDPR (${metrics.gdpr.score}%)` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '12px 20px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      color: activeTab === tab.id ? '#3b82f6' : '#64748b',
                      fontSize: '14px',
                      fontWeight: activeTab === tab.id ? '600' : '400',
                      cursor: 'pointer',
                      borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                      marginBottom: '-2px',
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* NIST Tab */}
              {activeTab === 'nist' && (
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>NIST Cybersecurity Framework</h3>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      Overall Score: <strong>{metrics.nist.score}%</strong>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {metrics.nist.controls.map((control) => {
                      const colors = complianceColors[control.status];
                      return (
                        <div
                          key={control.id}
                          style={{
                            padding: '16px',
                            backgroundColor: '#f8fafc',
                            borderRadius: '6px',
                            borderLeft: `4px solid ${colors.text}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                                {control.id}: {control.name}
                              </div>
                            </div>
                            <span style={{
                              padding: '4px 8px',
                              backgroundColor: colors.bg,
                              color: colors.text,
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              {control.status.toUpperCase()}
                            </span>
                          </div>
                          {control.evidence.length > 0 && (
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              <strong>Evidence:</strong>
                              <ul style={{ margin: '4px 0 0 20px', padding: 0 }}>
                                {control.evidence.map((ev, idx) => (
                                  <li key={idx}>{ev}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* OWASP Tab */}
              {activeTab === 'owasp' && (
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>OWASP Top 10</h3>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      Overall Score: <strong>{metrics.owasp.score}%</strong>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {metrics.owasp.top10.map((risk, idx) => {
                      const colors = complianceColors[risk.status];
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '16px',
                            backgroundColor: '#f8fafc',
                            borderRadius: '6px',
                            borderLeft: `4px solid ${colors.text}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                            <div style={{ fontSize: '14px', fontWeight: '600' }}>
                              {risk.risk}
                            </div>
                            <span style={{
                              padding: '4px 8px',
                              backgroundColor: colors.bg,
                              color: colors.text,
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              {risk.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                            {risk.description}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* PCI DSS Tab */}
              {activeTab === 'pci' && (
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>PCI DSS Requirements</h3>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      Overall Score: <strong>{metrics.pci.score}%</strong>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {metrics.pci.requirements.map((req) => {
                      const colors = complianceColors[req.status];
                      return (
                        <div
                          key={req.id}
                          style={{
                            padding: '16px',
                            backgroundColor: '#f8fafc',
                            borderRadius: '6px',
                            borderLeft: `4px solid ${colors.text}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                                {req.id}: {req.name}
                              </div>
                            </div>
                            <span style={{
                              padding: '4px 8px',
                              backgroundColor: colors.bg,
                              color: colors.text,
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              {req.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* GDPR Tab */}
              {activeTab === 'gdpr' && (
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '8px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>GDPR Principles</h3>
                    <div style={{ fontSize: '14px', color: '#64748b' }}>
                      Overall Score: <strong>{metrics.gdpr.score}%</strong>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {metrics.gdpr.principles.map((principle, idx) => {
                      const colors = complianceColors[principle.status];
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '16px',
                            backgroundColor: '#f8fafc',
                            borderRadius: '6px',
                            borderLeft: `4px solid ${colors.text}`,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                            <div style={{ fontSize: '14px', fontWeight: '600' }}>
                              {principle.principle}
                            </div>
                            <span style={{
                              padding: '4px 8px',
                              backgroundColor: colors.bg,
                              color: colors.text,
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              {principle.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                            {principle.description}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}

