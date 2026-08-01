/**
 * Investigations page - master-detail view over real SecurityInvestigation
 * records (correlated detections, not raw alerts). The list pane supports
 * search plus severity/status/provenance filters; selecting a row loads the
 * detail pane in place (summary, timeline, detections, normalized events,
 * raw evidence, response actions) with a real evidence export - no modal,
 * so list and detail stay visible together.
 */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, ShieldAlert, Search } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
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

const SEVERITY_OPTIONS: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const STATUS_OPTIONS: InvestigationStatus[] = ['open', 'investigating', 'contained', 'resolved', 'closed'];

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

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | SecuritySeverity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | InvestigationStatus>('all');
  const [provenanceFilter, setProvenanceFilter] = useState<'all' | string>('all');

  const load = useCallback(async () => {
    try {
      const data = await adminApi.getInvestigations({ limit: 100 });
      setInvestigations(data);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load investigations'));
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
      showToast(getErrorMessage(err, 'Failed to load investigation detail'), 'error');
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
      showToast(getErrorMessage(err, 'Evidence export failed'), 'error');
    }
  };

  const provenanceOptions = useMemo(
    () => Array.from(new Set(investigations.map((inv) => inv.provenance))).sort(),
    [investigations]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return investigations.filter((inv) => {
      if (severityFilter !== 'all' && inv.severity !== severityFilter) return false;
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (provenanceFilter !== 'all' && inv.provenance !== provenanceFilter) return false;
      if (term && !inv.title.toLowerCase().includes(term) && !inv.summary?.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [investigations, search, severityFilter, statusFilter, provenanceFilter]);

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
          <div className="master-detail">
            <div className="master-detail__list-pane">
              <div className="master-detail__filters">
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    aria-hidden="true"
                    style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}
                  />
                  <input
                    className="master-detail__search"
                    style={{ paddingLeft: 30 }}
                    type="text"
                    placeholder="Search title or summary..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search investigations"
                  />
                </div>
                <div className="master-detail__filter-selects">
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
                    aria-label="Filter by severity"
                  >
                    <option value="all">All severities</option>
                    {SEVERITY_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    aria-label="Filter by status"
                  >
                    <option value="all">All statuses</option>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <select
                    value={provenanceFilter}
                    onChange={(e) => setProvenanceFilter(e.target.value)}
                    aria-label="Filter by provenance"
                  >
                    <option value="all">All provenance</option>
                    {provenanceOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div className="master-detail__count">
                  {filtered.length} of {investigations.length} investigation{investigations.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="master-detail__list">
                {filtered.length === 0 ? (
                  <p className="text-sm text-muted" style={{ padding: 8 }}>No investigations match these filters.</p>
                ) : (
                  filtered.map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      className={`master-detail__item ${selected?.id === inv.id ? 'master-detail__item--active' : ''}`}
                      onClick={() => openDetail(inv.id)}
                    >
                      <div className="master-detail__item-title">{inv.title}</div>
                      <div className="master-detail__item-badges">
                        <Badge variant={SEVERITY_VARIANT[inv.severity]}>{inv.severity}</Badge>
                        <Badge variant={STATUS_VARIANT[inv.status]}>{inv.status}</Badge>
                        <Badge variant="neutral">{inv.provenance}</Badge>
                      </div>
                      <div className="master-detail__item-meta">
                        {inv.providerScopes.join(', ')} &middot; updated {new Date(inv.updatedAt).toLocaleString()}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="master-detail__detail-pane">
              {!selected ? (
                <div className="master-detail__empty">
                  <ShieldAlert size={28} aria-hidden="true" />
                  <p className="text-sm">Select an investigation from the list to view its evidence.</p>
                </div>
              ) : detailLoading ? (
                <p className="text-muted">Loading...</p>
              ) : (
                <div className="page-stack">
                  <div className="card-header">
                    <div>
                      <h2 className="section-title" style={{ marginBottom: 4 }}>{selected.title}</h2>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Badge variant={SEVERITY_VARIANT[selected.severity]}>{selected.severity}</Badge>
                        <Badge variant={STATUS_VARIANT[selected.status]}>{selected.status}</Badge>
                        <Badge variant="neutral">{selected.provenance}</Badge>
                      </div>
                    </div>
                    <Button variant="secondary" onClick={exportEvidence}>
                      <Download size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                      Export evidence
                    </Button>
                  </div>

                  <section>
                    <h3 className="section-title">Summary</h3>
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
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
