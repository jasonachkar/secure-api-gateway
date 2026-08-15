import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  Download,
  FileCheck2,
  Fingerprint,
  Network,
  Radar,
  Search,
  ShieldAlert,
  Sparkles,
  TerminalSquare,
  Workflow,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { JsonViewer } from '../components/JsonViewer';
import {
  InvestigationStatusBadge,
  ProvenanceBadge,
  SeverityBadge,
} from '../components/SecurityBadges';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type {
  DetectionResult,
  InvestigationStatus,
  NormalizedSecurityEvent,
  SecurityInvestigation,
  SecuritySeverity,
} from '../types';

const SEVERITIES: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'informational'];
const STATUSES: InvestigationStatus[] = [
  'open',
  'investigating',
  'contained',
  'resolved',
  'closed',
];

function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const onChange = () => setCompact(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return compact;
}

function shortTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function Investigations() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | SecuritySeverity>('all');
  const [status, setStatus] = useState<'all' | InvestigationStatus>('all');
  const [provenance, setProvenance] = useState('all');
  const [workspaceTab, setWorkspaceTab] = useState<'timeline' | 'evidence' | 'response'>(
    'timeline'
  );
  const [eventTab, setEventTab] = useState<'normalized' | 'raw' | 'detection'>('normalized');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const compact = useCompactLayout();
  const { showToast } = useToast();
  const selectedId = params.get('id');

  const investigations = useQuery({
    queryKey: ['investigations'],
    queryFn: () => adminApi.getInvestigations({ limit: 100 }),
    refetchInterval: 15_000,
  });
  const detail = useQuery({
    queryKey: ['investigation', selectedId],
    queryFn: () => adminApi.getInvestigation(selectedId!),
    enabled: Boolean(selectedId),
  });

  const filtered = useMemo(
    () =>
      (investigations.data ?? []).filter((item) => {
        const term = search.trim().toLowerCase();
        if (
          term &&
          !`${item.title} ${item.summary} ${item.correlationKey} ${item.sourceIps.join(' ')}`
            .toLowerCase()
            .includes(term)
        )
          return false;
        if (severity !== 'all' && item.severity !== severity) return false;
        if (status !== 'all' && item.status !== status) return false;
        if (provenance !== 'all' && item.provenance !== provenance) return false;
        return true;
      }),
    [investigations.data, search, severity, status, provenance]
  );

  useEffect(() => {
    if (!selectedId && filtered.length) setParams({ id: filtered[0].id }, { replace: true });
  }, [filtered, selectedId, setParams]);

  useEffect(() => {
    const first = detail.data?.events[0];
    setSelectedEventId(first?.id ?? null);
  }, [detail.data]);

  const exportEvidence = async () => {
    if (!selectedId) return;
    try {
      const evidence = await adminApi.exportEvidence(selectedId);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `investigation-${selectedId}-evidence.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast('Evidence package downloaded', 'success');
    } catch (error) {
      showToast(getErrorMessage(error, 'Evidence export failed'), 'error');
    }
  };

  const selectInvestigation = (id: string) => {
    setParams({ id });
    setWorkspaceTab('timeline');
  };

  return (
    <Layout>
      <div className="page-stack investigations-page">
        <SectionHeader
          title="Investigations"
          subtitle="Correlated security activity with transparent grouping logic, source evidence, response history, and portable audit artifacts."
          actions={
            <Button variant="secondary" size="sm" onClick={exportEvidence} disabled={!selectedId}>
              <Download size={14} /> Export evidence
            </Button>
          }
        />
        {investigations.isError && (
          <div className="alert alert--danger" role="alert">
            {getErrorMessage(investigations.error, 'Failed to load investigations.')}
          </div>
        )}

        <div className="investigation-toolbar">
          <div className="filter-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, IP, correlation key…"
              aria-label="Search investigations"
            />
          </div>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
            aria-label="Filter by severity"
          >
            <option value="all">All severities</option>
            {SEVERITIES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={provenance}
            onChange={(event) => setProvenance(event.target.value)}
            aria-label="Filter by provenance"
          >
            <option value="all">All evidence</option>
            <option value="live">Live</option>
            <option value="replay">Replay</option>
            <option value="synthetic">Synthetic</option>
          </select>
          <span className="master-detail__count">
            {filtered.length} of {investigations.data?.length ?? 0} investigations
          </span>
        </div>

        {investigations.isLoading ? (
          <div className="operational-loading">Loading investigations…</div>
        ) : filtered.length === 0 ? (
          <div className="investigations-empty">
            <EmptyState
              icon={ShieldAlert}
              title="No investigations found"
              description={
                investigations.data?.length
                  ? 'Adjust the filters to broaden the result set.'
                  : 'Run a guided scenario in Security Lab to create inspectable evidence.'
              }
            />
          </div>
        ) : (
          <PanelGroup
            direction={compact ? 'vertical' : 'horizontal'}
            className="master-detail investigation-workbench"
          >
            <Panel
              defaultSize={compact ? 35 : 28}
              minSize={compact ? 20 : 20}
              className="master-detail__list-pane"
            >
              <div className="master-detail__list">
                {filtered.map((item) => (
                  <InvestigationListItem
                    key={item.id}
                    item={item}
                    selected={selectedId === item.id}
                    onClick={() => selectInvestigation(item.id)}
                  />
                ))}
              </div>
            </Panel>
            <PanelResizeHandle className="resize-handle" aria-label="Resize investigation panels">
              <span />
            </PanelResizeHandle>
            <Panel
              defaultSize={compact ? 65 : 72}
              minSize={compact ? 35 : 45}
              className="master-detail__detail-pane"
            >
              {!selectedId ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="Select an investigation"
                  description="Choose an investigation to inspect its timeline and evidence."
                />
              ) : detail.isLoading ? (
                <div className="operational-loading">Loading correlated evidence…</div>
              ) : detail.isError ? (
                <div className="alert alert--danger">
                  {getErrorMessage(detail.error, 'Failed to load investigation detail.')}
                </div>
              ) : detail.data ? (
                <InvestigationWorkspace
                  data={detail.data}
                  activeTab={workspaceTab}
                  setActiveTab={setWorkspaceTab}
                  eventTab={eventTab}
                  setEventTab={setEventTab}
                  selectedEventId={selectedEventId}
                  setSelectedEventId={setSelectedEventId}
                />
              ) : null}
            </Panel>
          </PanelGroup>
        )}
      </div>
    </Layout>
  );
}

function InvestigationListItem({
  item,
  selected,
  onClick,
}: {
  item: SecurityInvestigation;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`master-detail__item ${selected ? 'master-detail__item--active' : ''}`}
      onClick={onClick}
    >
      <span
        className={`master-detail__severity-rail master-detail__severity-rail--${item.severity}`}
      />
      <span className="master-detail__item-top">
        <SeverityBadge value={item.severity} />
        <span>{shortTime(item.updatedAt)}</span>
      </span>
      <strong className="master-detail__item-title">{item.title}</strong>
      <span className="master-detail__item-summary">{item.summary}</span>
      <span className="master-detail__item-badges">
        <InvestigationStatusBadge value={item.status} />
        <ProvenanceBadge value={item.provenance} />
        {item.providerScopes.map((provider) => (
          <span className="provider-chip" key={provider}>
            {provider}
          </span>
        ))}
      </span>
      <span className="master-detail__item-meta">
        {item.eventIds.length} events · {item.detectionIds.length} detections ·{' '}
        {item.responseActions.length} actions
      </span>
    </button>
  );
}

function InvestigationWorkspace({
  data,
  activeTab,
  setActiveTab,
  eventTab,
  setEventTab,
  selectedEventId,
  setSelectedEventId,
}: {
  data: {
    investigation: SecurityInvestigation;
    events: NormalizedSecurityEvent[];
    detections: DetectionResult[];
  };
  activeTab: 'timeline' | 'evidence' | 'response';
  setActiveTab: (value: 'timeline' | 'evidence' | 'response') => void;
  eventTab: 'normalized' | 'raw' | 'detection';
  setEventTab: (value: 'normalized' | 'raw' | 'detection') => void;
  selectedEventId: string | null;
  setSelectedEventId: (value: string) => void;
}) {
  const { investigation, events, detections } = data;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? events[0];
  const selectedDetections = selectedEvent
    ? detections.filter((detection) => detection.evidenceEventIds.includes(selectedEvent.id))
    : [];
  const nextSteps = Array.from(new Set(detections.flatMap((detection) => detection.remediation)));

  return (
    <div className="investigation-detail">
      <header className="investigation-detail__header">
        <div>
          <div className="eyebrow">Investigation · {investigation.id}</div>
          <h2>{investigation.title}</h2>
          <div className="tag-group">
            <SeverityBadge value={investigation.severity} />
            <InvestigationStatusBadge value={investigation.status} />
            <ProvenanceBadge value={investigation.provenance} />
            {investigation.providerScopes.map((provider) => (
              <span className="provider-chip" key={provider}>
                {provider}
              </span>
            ))}
          </div>
        </div>
        <div className="investigation-detail__updated">
          <span>Last updated</span>
          <strong>{shortTime(investigation.updatedAt)}</strong>
        </div>
      </header>

      <div className="investigation-summary-grid">
        <div className="investigation-summary-grid__narrative">
          <h3>Analyst summary</h3>
          <p>{investigation.summary}</p>
          <div className="why-it-matters">
            <AlertTriangle size={15} />
            <span>
              <strong>Why it matters</strong>
              {investigation.whyItMatters}
            </span>
          </div>
        </div>
        <div className="investigation-facts">
          <div>
            <Fingerprint size={14} />
            <span>Principals</span>
            <strong>{investigation.affectedPrincipals.length}</strong>
          </div>
          <div>
            <Box size={14} />
            <span>Resources</span>
            <strong>{investigation.affectedResources.length}</strong>
          </div>
          <div>
            <Network size={14} />
            <span>Source IPs</span>
            <strong>{investigation.sourceIps.length}</strong>
          </div>
          <div>
            <Radar size={14} />
            <span>Detections</span>
            <strong>{detections.length}</strong>
          </div>
        </div>
      </div>

      <div className="workspace-tabs" role="tablist" aria-label="Investigation workspace">
        {(
          [
            ['timeline', Workflow, 'Timeline'],
            ['evidence', FileCheck2, 'Evidence'],
            ['response', CheckCircle2, 'Response'],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={activeTab === value}
            className={activeTab === value ? 'workspace-tab--active' : ''}
            onClick={() => setActiveTab(value)}
          >
            <Icon size={14} />
            {label}
            <span>
              {value === 'timeline'
                ? investigation.timeline.length
                : value === 'evidence'
                  ? events.length
                  : investigation.responseActions.length}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'timeline' && (
        <div className="investigation-timeline">
          <div className="timeline-track">
            {investigation.timeline.map((entry, index) => (
              <article key={entry.id} className="timeline-entry">
                <span className="timeline-entry__marker">{index + 1}</span>
                <div className="timeline-entry__content">
                  <header>
                    <strong>{entry.summary}</strong>
                    <time>{shortTime(entry.timestamp)}</time>
                  </header>
                  <div>
                    <span className="provider-chip">{entry.type}</span>
                    <ProvenanceBadge value={entry.provenance} />
                    <span className="timeline-entry__actor">Actor: {entry.actor}</span>
                  </div>
                  {entry.source && <code>{entry.source}</code>}
                </div>
              </article>
            ))}
          </div>
          {nextSteps.length > 0 && (
            <aside className="next-steps">
              <h3>
                <Sparkles size={15} /> Recommended next steps
              </h3>
              <ol>
                {nextSteps.slice(0, 5).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </aside>
          )}
        </div>
      )}

      {activeTab === 'evidence' && (
        <div className="evidence-workspace">
          <div className="evidence-event-list">
            <h3>Evidence events</h3>
            {events.map((event) => (
              <button
                key={event.id}
                className={selectedEvent?.id === event.id ? 'evidence-event--active' : ''}
                onClick={() => setSelectedEventId(event.id)}
              >
                <span>
                  <ProvenanceBadge value={event.provenance} />
                  <span className="provider-chip">{event.provider}</span>
                </span>
                <strong>{event.title}</strong>
                <small>
                  {shortTime(event.occurredAt)} · {event.sourceService}
                </small>
              </button>
            ))}
          </div>
          <div className="evidence-inspector">
            {selectedEvent ? (
              <>
                <header>
                  <div>
                    <div className="eyebrow">Provider event · {selectedEvent.providerEventId}</div>
                    <h3>{selectedEvent.title}</h3>
                  </div>
                  <SeverityBadge value={selectedEvent.severity} />
                </header>
                <div className="event-tabs" role="tablist">
                  {(['normalized', 'raw', 'detection'] as const).map((value) => (
                    <button
                      role="tab"
                      aria-selected={eventTab === value}
                      className={eventTab === value ? 'event-tab--active' : ''}
                      onClick={() => setEventTab(value)}
                      key={value}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                {eventTab === 'normalized' && (
                  <JsonViewer
                    value={{
                      id: selectedEvent.id,
                      schemaVersion: selectedEvent.schemaVersion,
                      provider: selectedEvent.provider,
                      sourceService: selectedEvent.sourceService,
                      occurredAt: selectedEvent.occurredAt,
                      principal: selectedEvent.principal,
                      resource: selectedEvent.resource,
                      action: selectedEvent.action,
                      outcome: selectedEvent.outcome,
                      sourceIp: selectedEvent.sourceIp,
                      severity: selectedEvent.severity,
                      category: selectedEvent.category,
                      provenance: selectedEvent.provenance,
                      correlationId: selectedEvent.correlationId,
                      evidence: selectedEvent.evidence,
                    }}
                    label="Canonical security event"
                  />
                )}
                {eventTab === 'raw' && (
                  <JsonViewer value={selectedEvent.rawEvent} label="Redacted provider event" />
                )}
                {eventTab === 'detection' &&
                  (selectedDetections.length ? (
                    <div className="matched-detections">
                      {selectedDetections.map((detection) => (
                        <article key={detection.id}>
                          <div>
                            <SeverityBadge value={detection.severity} />
                            <code>
                              {detection.ruleId}@{detection.ruleVersion}
                            </code>
                          </div>
                          <h4>{detection.title}</h4>
                          <p>{detection.description}</p>
                          <JsonViewer value={detection.matchedFields} label="Matched fields" />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Radar}
                      title="No direct rule match"
                      description="This event may be supporting evidence in the broader correlation window."
                    />
                  ))}
              </>
            ) : (
              <EmptyState
                icon={FileCheck2}
                title="No evidence events"
                description="This investigation does not reference a retained normalized event."
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'response' && (
        <div className="response-workspace">
          <section>
            <h3>Response history</h3>
            {investigation.responseActions.length ? (
              <div className="response-list">
                {investigation.responseActions.map((action) => (
                  <article key={action.id}>
                    <span className={`response-result response-result--${action.result}`}>
                      <TerminalSquare size={14} />
                    </span>
                    <div>
                      <header>
                        <strong>{action.action}</strong>
                        <span className="security-badge">{action.mode}</span>
                        <time>{shortTime(action.timestamp)}</time>
                      </header>
                      <p>{action.reason}</p>
                      <small>
                        {action.target ?? 'Control-plane target'} · actor {action.actor}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Clock3}
                title="No response actions recorded"
                description="The investigation is evidence-only until an authorized responder takes action."
              />
            )}
          </section>
          <section className="evidence-package">
            <h3>Evidence package contents</h3>
            {[
              'investigation.json',
              'normalized-events.json',
              'detections.json',
              'response-actions.json',
              'audit-verification.json',
              'README.txt',
            ].map((file) => (
              <div key={file}>
                <FileCheck2 size={14} />
                <code>{file}</code>
                <CheckCircle2 size={13} />
              </div>
            ))}
          </section>
        </div>
      )}

      <footer className="correlation-explanation">
        <Workflow size={15} />
        <span>
          <strong>Why these signals were grouped</strong>
          {investigation.correlationExplanation}
        </span>
        <code>{investigation.correlationKey}</code>
      </footer>
    </div>
  );
}
