/**
 * Investigations page - master-detail view over real SecurityInvestigation
 * records (correlated detections, not raw alerts). Detail drawer shows
 * summary, timeline, detections, normalized events, raw evidence, and
 * response actions, plus a real evidence export.
 */
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, ShieldAlert } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { SectionHeader } from '../components/SectionHeader';
import { DataTable } from '../components/DataTable';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import type { SecurityInvestigation, NormalizedSecurityEvent, DetectionResult, SecuritySeverity, InvestigationStatus } from '../types';

const SEVERITY_VARIANT: Record<SecuritySeverity, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  critical: 'error',
  high: 'warning',
  medium: 'warning',
  low: 'info',
  informational: 'neutral',
};

const STATUS_VARIANT: Record<InvestigationStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  open: 'error',
  investigating: 'warning',
  contained: 'info',
  resolved: 'success',
  closed: 'neutral',
};

export function Investigations() {
  const [investigations, setInvestigations] = useState<SecurityInvestigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SecurityInvestigation | null>(null);
  const [events, setEvents] = useState<NormalizedSecurityEvent[]>([]);
  const [detections, setDetections] = useState<DetectionResult[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getInvestigations({ limit: 100 });
      setInvestigations(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load investigations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const { investigation, events, detections } = await adminApi.getInvestigation(id);
      setSelected(investigation);
      setEvents(events);
      setDetections(detections);
    } catch (err: any) {
      showToast(err.message || 'Failed to load investigation detail', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) openDetail(id);
  }, [searchParams, openDetail]);

  const exportEvidence = async () => {
    if (!selected) return;
    try {
      const pkg = await adminApi.exportEvidence(selected.id);
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `investigation-${selected.id}-evidence.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Evidence package downloaded', 'success');
    } catch (err: any) {
      showToast(err.message || 'Evidence export failed', 'error');
    }
  };

  if (loading) {
    return (
      <Layout>
        <PageLoadingSkeleton cardCount={4} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Investigations"
          subtitle="Detections are correlated into investigations by principal, resource, source IP, account, and a fixed time window - deterministic grouping, not an opaque risk score."
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {investigations.length === 0 ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <ShieldAlert size={28} className="text-muted" aria-hidden="true" />
              <p className="text-muted" style={{ marginTop: 8 }}>
                No investigations yet. Run a guided scenario or replay a fixture to generate one.
              </p>
            </div>
          </Card>
        ) : (
          <DataTable>
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Provenance</th>
                  <th>Providers</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {investigations.map((inv) => (
                  <tr key={inv.id} onClick={() => openDetail(inv.id)} style={{ cursor: 'pointer' }}>
                    <td>{inv.title}</td>
                    <td>
                      <Badge variant={SEVERITY_VARIANT[inv.severity]}>{inv.severity}</Badge>
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                    </td>
                    <td>
                      <Badge variant="neutral">{inv.provenance}</Badge>
                    </td>
                    <td>{inv.providerScopes.join(', ')}</td>
                    <td>{new Date(inv.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </div>

      <Drawer
        isOpen={selected !== null}
        title={selected?.title ?? 'Investigation'}
        onClose={() => setSelected(null)}
        footer={
          <Button variant="secondary" onClick={exportEvidence}>
            <Download size={14} aria-hidden="true" style={{ marginRight: 6 }} />
            Export evidence
          </Button>
        }
      >
        {detailLoading || !selected ? (
          <p className="text-muted">Loading...</p>
        ) : (
          <div className="page-stack">
            <section>
              <h3 className="section-title">Summary</h3>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <Badge variant={SEVERITY_VARIANT[selected.severity]}>{selected.severity}</Badge>
                <Badge variant={STATUS_VARIANT[selected.status]}>{selected.status}</Badge>
                <Badge variant="neutral">{selected.provenance}</Badge>
              </div>
              <p className="text-sm">{selected.summary}</p>
              <p className="text-sm text-muted" style={{ marginTop: 8 }}>
                <strong>Why it matters:</strong> {selected.whyItMatters}
              </p>
              <p className="text-sm text-muted" style={{ marginTop: 8 }}>
                <strong>Correlation:</strong> {selected.correlationExplanation}
              </p>
            </section>

            <section>
              <h3 className="section-title">Timeline</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {selected.timeline.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <span className="text-muted">{new Date(entry.timestamp).toLocaleString()}</span> &middot;{' '}
                    <span style={{ fontWeight: 600 }}>{entry.type}</span> ({entry.actor}): {entry.summary}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="section-title">Detections ({detections.length})</h3>
              {detections.map((d) => (
                <div key={d.id} className="text-sm" style={{ marginBottom: 10 }}>
                  <div>
                    <code className="text-mono">{d.ruleId}</code> v{d.ruleVersion} - {d.title}
                  </div>
                  <div className="text-muted">{d.severityRationale}</div>
                </div>
              ))}
            </section>

            <section>
              <h3 className="section-title">Normalized events ({events.length})</h3>
              {events.map((e) => (
                <details key={e.id} style={{ marginBottom: 8 }}>
                  <summary className="text-sm" style={{ cursor: 'pointer' }}>
                    {e.title} <span className="text-muted">({e.provider}, {e.provenance})</span>
                  </summary>
                  <pre className="text-mono text-sm" style={{ overflowX: 'auto', padding: 8 }}>
                    {JSON.stringify(e.rawEvent, null, 2)}
                  </pre>
                </details>
              ))}
            </section>

            <section>
              <h3 className="section-title">Response actions ({selected.responseActions.length})</h3>
              {selected.responseActions.length === 0 ? (
                <p className="text-sm text-muted">No response actions taken yet.</p>
              ) : (
                selected.responseActions.map((action) => (
                  <div key={action.id} className="text-sm" style={{ marginBottom: 8 }}>
                    <Badge variant={action.mode === 'enforced' ? 'success' : action.mode === 'disabled' ? 'neutral' : 'info'}>
                      {action.mode}
                    </Badge>{' '}
                    {action.action} on <code className="text-mono">{action.target}</code> by {action.actor} - {action.result}
                  </div>
                ))
              )}
            </section>
          </div>
        )}
      </Drawer>
    </Layout>
  );
}
