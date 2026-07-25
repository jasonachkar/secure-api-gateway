/**
 * Implementation Status page - renders the backend capability registry
 * (single source of truth: GET /admin/security/capabilities/list) so what
 * the UI claims can never drift from what is actually implemented, wired,
 * and tested. See src/modules/security/capability-registry.ts.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, FlaskConical, Clock } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { SectionHeader } from '../components/SectionHeader';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { adminApi } from '../api/admin';
import type { CapabilityDefinition, CapabilityStatus, CapabilityCategory } from '../types';

const STATUS_META: Record<CapabilityStatus, { label: string; variant: 'success' | 'warning' | 'info' | 'neutral'; icon: typeof CheckCircle2 }> = {
  implemented: { label: 'Implemented', variant: 'success', icon: CheckCircle2 },
  partial: { label: 'Partial', variant: 'warning', icon: Clock },
  simulated: { label: 'Simulated', variant: 'info', icon: FlaskConical },
  planned: { label: 'Planned', variant: 'neutral', icon: CircleDashed },
};

const CATEGORY_LABELS: Record<CapabilityCategory, string> = {
  'gateway-protection': 'Gateway protection',
  'cloud-ingestion': 'Cloud ingestion',
  detection: 'Detection & investigation',
  response: 'Response',
  evidence: 'Evidence',
  'platform-security': 'Platform security',
};

function groupByCategory(capabilities: CapabilityDefinition[]): Map<CapabilityCategory, CapabilityDefinition[]> {
  const groups = new Map<CapabilityCategory, CapabilityDefinition[]>();
  for (const cap of capabilities) {
    const list = groups.get(cap.category) ?? [];
    list.push(cap);
    groups.set(cap.category, list);
  }
  return groups;
}

export function ImplementationStatus() {
  const [capabilities, setCapabilities] = useState<CapabilityDefinition[]>([]);
  const [counts, setCounts] = useState<Record<CapabilityStatus, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const summary = await adminApi.getCapabilitySummary();
        if (cancelled) return;
        setCapabilities(summary.capabilities);
        setCounts(summary.counts);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load capability registry');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Layout>
        <PageLoadingSkeleton cardCount={4} />
      </Layout>
    );
  }

  const groups = groupByCategory(capabilities);

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Implementation status"
          subtitle="Every capability below is read directly from the backend's capability registry - the single source of truth for what is genuinely implemented, wired, and tested versus simulated or planned."
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {counts && (
          <div className="page-grid page-grid--cards">
            {(Object.keys(STATUS_META) as CapabilityStatus[]).map((status) => {
              const meta = STATUS_META[status];
              const Icon = meta.icon;
              return (
                <Card key={status}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Icon size={16} aria-hidden="true" />
                    <span className="text-sm text-muted">{meta.label}</span>
                  </div>
                  <div className="metric-card__value">{counts[status]}</div>
                </Card>
              );
            })}
          </div>
        )}

        {Array.from(groups.entries()).map(([category, items]) => (
          <div key={category} className="page-stack">
            <h2 className="section-title">{CATEGORY_LABELS[category]}</h2>
            <div className="page-stack">
              {items.map((cap) => {
                const meta = STATUS_META[cap.status];
                return (
                  <Card key={cap.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{cap.name}</strong>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                          {cap.provenance && <Badge variant="neutral">{cap.provenance}</Badge>}
                        </div>
                        <p className="text-sm text-muted" style={{ marginTop: 6, maxWidth: 720 }}>
                          {cap.summary}
                        </p>
                      </div>
                    </div>

                    {cap.limitations && cap.limitations.length > 0 && (
                      <ul className="text-sm text-muted" style={{ marginTop: 10, paddingLeft: 18 }}>
                        {cap.limitations.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    )}

                    {(cap.implementationPaths.length > 0 || cap.testPaths.length > 0) && (
                      <div className="text-sm text-muted" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {cap.implementationPaths.length > 0 && (
                          <div>
                            <span className="text-muted">Implementation: </span>
                            {cap.implementationPaths.map((p) => (
                              <code key={p} className="text-mono" style={{ marginRight: 8 }}>
                                {p}
                              </code>
                            ))}
                          </div>
                        )}
                        {cap.testPaths.length > 0 && (
                          <div>
                            <span className="text-muted">Tests: </span>
                            {cap.testPaths.map((p) => (
                              <code key={p} className="text-mono" style={{ marginRight: 8 }}>
                                {p}
                              </code>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
