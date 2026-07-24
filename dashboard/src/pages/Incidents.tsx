/**
 * Incident Response page
 * Manage security incidents, track response times, and generate reports
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ConfirmModal } from '../components/ConfirmModal';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import type { Incident, IncidentStatistics, IncidentStatus, IncidentSeverity, IncidentType, IncidentTimelineEntry, IncidentTimelineEntryType } from '../types';
import { format, formatDistanceToNow } from 'date-fns';

const severityBadgeClass: Record<IncidentSeverity, string> = {
  critical: 'badge-critical',
  high: 'badge-high',
  medium: 'badge-medium',
  low: 'badge-low',
};

const statusBadgeClass: Record<IncidentStatus, string> = {
  open: 'badge-status-open',
  investigating: 'badge-status-investigating',
  contained: 'badge-status-contained',
  resolved: 'badge-status-resolved',
  closed: 'badge-status-closed',
};

const timelineTypeStyles: Record<IncidentTimelineEntryType, { label: string; className: string }> = {
  note: { label: 'Note', className: 'timeline-dot--note' },
  status_change: { label: 'Status', className: 'timeline-dot--status' },
  assignment: { label: 'Assignment', className: 'timeline-dot--assignment' },
  action: { label: 'Action', className: 'timeline-dot--action' },
};

const playbookActions = [
  {
    key: 'disable_user',
    label: 'Disable user',
    description: 'Suspend account access and revoke active sessions.',
    promptLabel: 'User or email',
  },
  {
    key: 'block_ip',
    label: 'Block IP',
    description: 'Add the IP address to the block list.',
    promptLabel: 'IP address',
  },
  {
    key: 'open_ticket',
    label: 'Open ticket',
    description: 'Create a follow-up ticket in the tracking system.',
    promptLabel: 'Ticket reference',
  },
];

const normalizeNoteToTimeline = (content: string): { type: IncidentTimelineEntryType; metadata?: Record<string, unknown> } => {
  if (content.startsWith('Status changed to ')) {
    return {
      type: 'status_change',
      metadata: {
        status: content.replace('Status changed to ', ''),
      },
    };
  }
  if (content.startsWith('Assigned to ')) {
    return {
      type: 'assignment',
      metadata: {
        assignedTo: content.replace('Assigned to ', ''),
      },
    };
  }
  return { type: 'note' };
};

const buildTimelineEntries = (incident: Incident): IncidentTimelineEntry[] => {
  if (incident.timeline?.length) {
    return [...incident.timeline].sort((a, b) => a.timestamp - b.timestamp);
  }

  const fallback: IncidentTimelineEntry[] = [
    {
      id: `created-${incident.id}`,
      type: 'note',
      timestamp: incident.createdAt,
      actor: incident.reportedBy || 'system',
      summary: 'Incident created',
    },
  ];

  incident.notes.forEach((note, idx) => {
    const normalized = normalizeNoteToTimeline(note.content);
    fallback.push({
      id: `note-${incident.id}-${idx}`,
      type: normalized.type,
      timestamp: note.timestamp,
      actor: note.author,
      summary: note.content,
      metadata: normalized.metadata,
    });
  });

  return fallback.sort((a, b) => a.timestamp - b.timestamp);
};

type TextPromptMode =
  | { kind: 'assign'; incidentId: string }
  | { kind: 'note'; incidentId: string }
  | { kind: 'playbook'; incidentId: string; action: (typeof playbookActions)[number] };

export function Incidents() {
  const [searchParams] = useSearchParams();
  const incidentIdParam = searchParams.get('incidentId');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [statistics, setStatistics] = useState<IncidentStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<IncidentStatus | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<IncidentSeverity | 'all'>('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(new Set());
  const [textPrompt, setTextPrompt] = useState<TextPromptMode | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    fetchData();
  }, [filterStatus, filterSeverity]);

  useEffect(() => {
    if (!incidentIdParam || incidents.length === 0) {
      return;
    }

    const incident = incidents.find((item) => item.id === incidentIdParam);
    if (incident) {
      setSelectedIncident(incident);
    }
  }, [incidentIdParam, incidents]);

  const fetchData = async () => {
    try {
      const [incidentsData, statsData] = await Promise.all([
        adminApi.getIncidents({
          status: filterStatus !== 'all' ? filterStatus : undefined,
          severity: filterSeverity !== 'all' ? filterSeverity : undefined,
          limit: 100,
        }),
        adminApi.getIncidentStatistics(),
      ]);
      setIncidents(incidentsData);
      setStatistics(statsData);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch incident data');
    } finally {
      setLoading(false);
    }
  };

  const toggleTimeline = (incidentId: string) => {
    setExpandedTimelines((prev) => {
      const next = new Set(prev);
      if (next.has(incidentId)) {
        next.delete(incidentId);
      } else {
        next.add(incidentId);
      }
      return next;
    });
  };

  const handleStatusChange = async (id: string, newStatus: IncidentStatus) => {
    try {
      await adminApi.updateIncidentStatus(id, newStatus);
      await fetchData();
      if (selectedIncident?.id === id) {
        const updated = await adminApi.getIncident(id);
        setSelectedIncident(updated);
      }
    } catch (err: any) {
      showToast('Failed to update status: ' + err.message, 'error');
    }
  };

  const handleTextPromptConfirm = async (value?: string) => {
    if (!textPrompt || !value) {
      setTextPrompt(null);
      return;
    }
    const { kind, incidentId } = textPrompt;
    setTextPrompt(null);

    try {
      if (kind === 'assign') {
        await adminApi.assignIncident(incidentId, value);
      } else if (kind === 'note') {
        await adminApi.addIncidentNote(incidentId, value);
      } else if (kind === 'playbook') {
        setActionInProgress(textPrompt.action.key);
        await adminApi.runIncidentAction(incidentId, textPrompt.action.key, value);
      }
      await fetchData();
      if (selectedIncident?.id === incidentId) {
        const updated = await adminApi.getIncident(incidentId);
        setSelectedIncident(updated);
      }
      showToast(kind === 'assign' ? 'Incident assigned' : kind === 'note' ? 'Note added' : 'Playbook action executed', 'success');
    } catch (err: any) {
      showToast(`Failed to ${kind === 'assign' ? 'assign incident' : kind === 'note' ? 'add note' : 'execute playbook action'}: ${err.message}`, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePlaybookActionNoInput = async (id: string, action: (typeof playbookActions)[number]) => {
    try {
      setActionInProgress(action.key);
      await adminApi.runIncidentAction(id, action.key);
      await fetchData();
      if (selectedIncident?.id === id) {
        const updated = await adminApi.getIncident(id);
        setSelectedIncident(updated);
      }
      showToast('Playbook action executed', 'success');
    } catch (err: any) {
      showToast('Failed to execute playbook action: ' + err.message, 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const formatDuration = (ms: number): string => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  };

  const timelineEntries = selectedIncident ? buildTimelineEntries(selectedIncident) : [];

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Incident Response"
          subtitle="Track and manage security incidents with response time metrics"
          actions={
            <>
              <Button onClick={() => setShowCreateModal(true)}>+ New Incident</Button>
              <Button variant="secondary" onClick={fetchData}>
                Refresh
              </Button>
            </>
          }
        />

        {loading && <PageLoadingSkeleton cardCount={4} />}

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {!loading && !error && statistics && (
          <div className="page-stack">
            <div className="page-grid page-grid--cards">
              <MetricCard title="Total Incidents" value={statistics.totalIncidents} color="blue" />
              <MetricCard
                title="Open Incidents"
                value={statistics.openIncidents}
                color={statistics.openIncidents > 0 ? 'red' : 'green'}
              />
              <MetricCard title="Resolved" value={statistics.resolvedIncidents} color="green" />
              <MetricCard
                title="Avg Response Time"
                value={statistics.averageResponseTime > 0 ? formatDuration(statistics.averageResponseTime) : 'N/A'}
                color="blue"
              />
              <MetricCard
                title="Avg Resolution Time"
                value={statistics.averageResolutionTime > 0 ? formatDuration(statistics.averageResolutionTime) : 'N/A'}
                color="green"
              />
              <MetricCard
                title="Critical"
                value={statistics.bySeverity.critical}
                color={statistics.bySeverity.critical > 0 ? 'red' : 'green'}
              />
            </div>

            <div className="filter-row">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as IncidentStatus | 'all')}
                className="form-control"
                aria-label="Filter by status"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="contained">Contained</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value as IncidentSeverity | 'all')}
                className="form-control"
                aria-label="Filter by severity"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="page-stack">
              {incidents.length === 0 ? (
                <Card className="empty-state">No incidents found</Card>
              ) : (
                incidents.map((incident) => {
                  const severityClass = severityBadgeClass[incident.severity];
                  const statusClass = statusBadgeClass[incident.status];
                  const cardClass = `incident-card incident-card--${incident.severity}`;
                  const isTimelineExpanded = expandedTimelines.has(incident.id);
                  const cardTimeline = buildTimelineEntries(incident);

                  return (
                    <Card key={incident.id} className={cardClass}>
                      <div
                        className="page-stack flex-1"
                        onClick={() => setSelectedIncident(incident)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setSelectedIncident(incident);
                        }}
                      >
                        <div className="card-header">
                          <div>
                            <div className="section-title">{incident.title}</div>
                            <div className="tag-group">
                              <Badge className={severityClass}>{incident.severity.toUpperCase()}</Badge>
                              <Badge className={statusClass}>{incident.status.toUpperCase()}</Badge>
                            </div>
                          </div>
                        </div>
                        <p className="incident-description">
                          {incident.description.substring(0, 150)}...
                        </p>
                        <div className="incident-meta">
                          <span>
                            Type: <strong>{incident.type.replace(/_/g, ' ')}</strong>
                          </span>
                          <span>
                            Reported: <strong>{format(new Date(incident.createdAt), 'MMM dd, yyyy HH:mm')}</strong>
                          </span>
                          {incident.assignedTo && (
                            <span>
                              Assigned: <strong>{incident.assignedTo}</strong>
                            </span>
                          )}
                          {incident.responseTime && (
                            <span>
                              Response: <strong>{formatDuration(incident.responseTime)}</strong>
                            </span>
                          )}
                          {incident.resolutionTime && (
                            <span>
                              Resolution: <strong>{formatDuration(incident.resolutionTime)}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="incident-card__timeline-toggle"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTimeline(incident.id);
                        }}
                        aria-expanded={isTimelineExpanded}
                        aria-controls={`timeline-${incident.id}`}
                      >
                        {isTimelineExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                        Timeline ({cardTimeline.length})
                      </button>

                      {isTimelineExpanded && (
                        <div id={`timeline-${incident.id}`} className="commit-timeline">
                          {cardTimeline.map((entry) => (
                            <div key={entry.id} className="commit-timeline__entry">
                              <span className={`commit-timeline__dot ${timelineTypeStyles[entry.type].className}`} aria-hidden="true" />
                              <div className="commit-timeline__content">
                                <div className="commit-timeline__header">
                                  <span className="commit-timeline__type">{timelineTypeStyles[entry.type].label}</span>
                                  <span className="commit-timeline__time text-mono">
                                    {format(new Date(entry.timestamp), 'MMM dd HH:mm:ss')}
                                  </span>
                                </div>
                                <div className="commit-timeline__summary">{entry.summary}</div>
                                <div className="commit-timeline__actor text-mono">actor: {entry.actor}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="incident-actions">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIncident(incident);
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}

        {selectedIncident && (
          <div className="modal-overlay" onClick={() => setSelectedIncident(null)}>
            <div
              className="modal modal__content modal__scroll"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__header">
                <div>
                  <div className="modal__title">{selectedIncident.title}</div>
                  <div className="tag-group">
                    <Badge className={severityBadgeClass[selectedIncident.severity]}>
                      {selectedIncident.severity.toUpperCase()}
                    </Badge>
                    <Badge className={statusBadgeClass[selectedIncident.status]}>
                      {selectedIncident.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <button className="modal__close" onClick={() => setSelectedIncident(null)} aria-label="Close incident details">
                  ×
                </button>
              </div>

              <div className="page-stack">
                <div>
                  <div className="section-title">Description</div>
                  <p className="section-subtitle text-prewrap">
                    {selectedIncident.description}
                  </p>
                </div>

                <div className="detail-grid">
                  <div>
                    <div className="text-xs text-muted">Type</div>
                    <div className="font-semibold">{selectedIncident.type.replace(/_/g, ' ')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Reported By</div>
                    <div className="font-semibold">{selectedIncident.reportedBy}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Created</div>
                    <div className="font-semibold">
                      {format(new Date(selectedIncident.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                    </div>
                  </div>
                  {selectedIncident.assignedTo && (
                    <div>
                      <div className="text-xs text-muted">Assigned To</div>
                      <div className="font-semibold">{selectedIncident.assignedTo}</div>
                    </div>
                  )}
                  {selectedIncident.responseTime && (
                    <div>
                      <div className="text-xs text-muted">Response Time</div>
                      <div className="font-semibold">{formatDuration(selectedIncident.responseTime)}</div>
                    </div>
                  )}
                  {selectedIncident.resolutionTime && (
                    <div>
                      <div className="text-xs text-muted">Resolution Time</div>
                      <div className="font-semibold">{formatDuration(selectedIncident.resolutionTime)}</div>
                    </div>
                  )}
                </div>

                {selectedIncident.affectedIPs.length > 0 && (
                  <div>
                    <div className="section-title">Affected IPs</div>
                    <div className="tag-group">
                      {selectedIncident.affectedIPs.map((ip) => (
                        <Badge key={ip} className="text-mono ui-badge--neutral">
                          {ip}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="incident-modal-section">
                <h3 className="subsection-title">Playbook Actions</h3>
                <div className="incident-playbook-list">
                  {playbookActions.map((action) => (
                    <div key={action.key} className="incident-playbook-item">
                      <div>
                        <div className="incident-playbook-item__label">{action.label}</div>
                        <div className="incident-playbook-item__description">{action.description}</div>
                      </div>
                      <button
                        className="ui-button ui-button--sm ui-button--secondary"
                        onClick={() =>
                          action.promptLabel
                            ? setTextPrompt({ kind: 'playbook', incidentId: selectedIncident.id, action })
                            : handlePlaybookActionNoInput(selectedIncident.id, action)
                        }
                        disabled={actionInProgress === action.key}
                      >
                        {actionInProgress === action.key ? 'Running…' : 'Run'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="incident-modal-section">
                <h3 className="subsection-title">Timeline</h3>
                <div className="commit-timeline commit-timeline--scroll">
                  {timelineEntries.length === 0 ? (
                    <div className="empty-text">No timeline events yet</div>
                  ) : (
                    timelineEntries.map((entry) => (
                      <div key={entry.id} className="commit-timeline__entry">
                        <span className={`commit-timeline__dot ${timelineTypeStyles[entry.type].className}`} aria-hidden="true" />
                        <div className="commit-timeline__content">
                          <div className="commit-timeline__header">
                            <span className="commit-timeline__type">{timelineTypeStyles[entry.type].label}</span>
                            <span className="commit-timeline__time text-mono">
                              {format(new Date(entry.timestamp), 'MMM dd, HH:mm')} · {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          <div className="commit-timeline__summary">{entry.summary}</div>
                          <div className="commit-timeline__actor text-mono">
                            actor: {entry.actor}
                            {entry.type === 'action' && <span className="text-success"> · audit logged</span>}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="action-row">
                  <select
                    value={selectedIncident.status}
                    onChange={(e) => handleStatusChange(selectedIncident.id, e.target.value as IncidentStatus)}
                    className="form-control"
                    aria-label="Change incident status"
                  >
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="contained">Contained</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <Button variant="secondary" onClick={() => setTextPrompt({ kind: 'assign', incidentId: selectedIncident.id })}>
                    Assign
                  </Button>
                  <Button onClick={() => setTextPrompt({ kind: 'note', incidentId: selectedIncident.id })}>Add Note</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div
              className="modal modal__content modal__content--compact"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal__title">Create New Incident</div>
              <CreateIncidentForm
                onSuccess={() => {
                  setShowCreateModal(false);
                  fetchData();
                }}
                onCancel={() => setShowCreateModal(false)}
              />
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={textPrompt !== null}
        title={
          textPrompt?.kind === 'assign'
            ? 'Assign incident'
            : textPrompt?.kind === 'note'
              ? 'Add note'
              : textPrompt?.kind === 'playbook'
                ? textPrompt.action.label
                : ''
        }
        reasonLabel={
          textPrompt?.kind === 'assign'
            ? 'Assign to (username)'
            : textPrompt?.kind === 'note'
              ? 'Note'
              : textPrompt?.kind === 'playbook'
                ? textPrompt.action.promptLabel
                : undefined
        }
        confirmLabel={textPrompt?.kind === 'playbook' ? 'Run' : 'Save'}
        onConfirm={handleTextPromptConfirm}
        onCancel={() => setTextPrompt(null)}
      />
    </Layout>
  );
}

function CreateIncidentForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<IncidentType>('suspicious_activity');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [affectedIPs, setAffectedIPs] = useState('');
  const [tags, setTags] = useState('');
  const { showToast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createIncident({
        title,
        description,
        type,
        severity,
        affectedIPs: affectedIPs.split(',').map((ip) => ip.trim()).filter(Boolean),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onSuccess();
    } catch (err: any) {
      showToast('Failed to create incident: ' + err.message, 'error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="page-stack">
      <div className="form-field">
        <label className="form-label" htmlFor="incident-title">Title *</label>
        <input
          id="incident-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="form-control"
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="incident-description">Description *</label>
        <textarea
          id="incident-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="form-control"
        />
      </div>
      <div className="form-grid">
        <div>
          <label className="form-label" htmlFor="incident-type">Type *</label>
          <select
            id="incident-type"
            value={type}
            onChange={(e) => setType(e.target.value as IncidentType)}
            required
            className="form-control"
          >
            <option value="brute_force">Brute Force</option>
            <option value="credential_stuffing">Credential Stuffing</option>
            <option value="rate_limit_abuse">Rate Limit Abuse</option>
            <option value="account_lockout">Account Lockout</option>
            <option value="suspicious_activity">Suspicious Activity</option>
            <option value="data_breach">Data Breach</option>
            <option value="ddos">DDoS</option>
            <option value="malware">Malware</option>
            <option value="unauthorized_access">Unauthorized Access</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="incident-severity">Severity *</label>
          <select
            id="incident-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            required
            className="form-control"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="incident-ips">Affected IPs (comma-separated)</label>
        <input
          id="incident-ips"
          type="text"
          value={affectedIPs}
          onChange={(e) => setAffectedIPs(e.target.value)}
          placeholder="192.168.1.1, 10.0.0.1"
          className="form-control"
        />
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor="incident-tags">Tags (comma-separated)</label>
        <input
          id="incident-tags"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="urgent, production"
          className="form-control"
        />
      </div>
      <div className="modal__footer">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create Incident</Button>
      </div>
    </form>
  );
}
