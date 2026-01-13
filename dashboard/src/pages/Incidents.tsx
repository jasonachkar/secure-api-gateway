/**
 * Incident Response page
 * Manage security incidents, track response times, and generate reports
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
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

const timelineTypeStyles: Record<IncidentTimelineEntryType, { label: string; bg: string; text: string; border: string }> = {
  note: { label: 'Note', bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' },
  status_change: { label: 'Status', bg: '#fef9c3', text: '#92400e', border: '#facc15' },
  assignment: { label: 'Assignment', bg: '#ede9fe', text: '#6d28d9', border: '#c4b5fd' },
  action: { label: 'Action', bg: '#dcfce7', text: '#166534', border: '#86efac' },
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

  const handleStatusChange = async (id: string, newStatus: IncidentStatus) => {
    try {
      await adminApi.updateIncidentStatus(id, newStatus);
      await fetchData();
      if (selectedIncident?.id === id) {
        const updated = await adminApi.getIncident(id);
        setSelectedIncident(updated);
      }
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    }
  };

  const handleAssign = async (id: string) => {
    const assignedTo = prompt('Assign to (username):');
    if (!assignedTo) return;

    try {
      await adminApi.assignIncident(id, assignedTo);
      await fetchData();
      if (selectedIncident?.id === id) {
        const updated = await adminApi.getIncident(id);
        setSelectedIncident(updated);
      }
    } catch (err: any) {
      alert('Failed to assign incident: ' + err.message);
    }
  };

  const handleAddNote = async (id: string) => {
    const content = prompt('Add note:');
    if (!content) return;

    try {
      await adminApi.addIncidentNote(id, content);
      await fetchData();
      if (selectedIncident?.id === id) {
        const updated = await adminApi.getIncident(id);
        setSelectedIncident(updated);
      }
    } catch (err: any) {
      alert('Failed to add note: ' + err.message);
    }
  };

  const handlePlaybookAction = async (id: string, action: typeof playbookActions[number]) => {
    const target = action.promptLabel ? prompt(`${action.promptLabel}:`) : '';
    if (action.promptLabel && !target) return;

    try {
      setActionInProgress(action.key);
      await adminApi.runIncidentAction(id, action.key, target || undefined);
      await fetchData();
      if (selectedIncident?.id === id) {
        const updated = await adminApi.getIncident(id);
        setSelectedIncident(updated);
      }
    } catch (err: any) {
      alert('Failed to execute playbook action: ' + err.message);
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

        {loading && <div className="empty-state">Loading incidents...</div>}

        {error && <div className="alert alert--danger">{error}</div>}

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

                  return (
                    <Card
                      key={incident.id}
                      className={cardClass}
                      onClick={() => setSelectedIncident(incident)}
                      role="button"
                    >
                      <div className="page-stack flex-1">
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
                <button className="modal__close" onClick={() => setSelectedIncident(null)}>
                  ×
                </Button>
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

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Playbook Actions</h3>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {playbookActions.map((action) => (
                    <div
                      key={action.key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>{action.label}</div>
                        <div style={{ color: '#64748b', fontSize: '13px' }}>{action.description}</div>
                      </div>
                      <button
                        onClick={() => handlePlaybookAction(selectedIncident.id, action)}
                        disabled={actionInProgress === action.key}
                        style={{
                          backgroundColor: actionInProgress === action.key ? '#94a3b8' : '#0f172a',
                          color: 'white',
                          padding: '8px 14px',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: actionInProgress === action.key ? 'wait' : 'pointer',
                          fontSize: '12px',
                          fontWeight: '600',
                        }}
                      >
                        {actionInProgress === action.key ? 'Running...' : 'Run'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Timeline</h3>
                <div style={{ maxHeight: '260px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {timelineEntries.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '14px' }}>No timeline events yet</div>
                  ) : (
                    timelineEntries.map((entry) => {
                      const style = timelineTypeStyles[entry.type];
                      return (
                        <div
                          key={entry.id}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: `1px solid ${style.border}`,
                            backgroundColor: 'white',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: style.bg,
                                  color: style.text,
                                  fontSize: '11px',
                                  fontWeight: '600',
                                }}
                              >
                                {style.label}
                              </span>
                              <span style={{ fontWeight: '600', fontSize: '14px' }}>{entry.summary}</span>
                            </div>
                            <span style={{ color: '#64748b', fontSize: '12px' }}>
                              {format(new Date(entry.timestamp), 'MMM dd, HH:mm')} · {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '12px' }}>
                            <span>Actor: <strong style={{ color: '#0f172a' }}>{entry.actor}</strong></span>
                            {entry.type === 'action' && (
                              <span style={{ color: '#16a34a', fontWeight: '600' }}>Audit logged</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="action-row">
                  <select
                    value={selectedIncident.status}
                    onChange={(e) => handleStatusChange(selectedIncident.id, e.target.value as IncidentStatus)}
                    className="form-control"
                  >
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="contained">Contained</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                  <Button variant="secondary" onClick={() => handleAssign(selectedIncident.id)}>
                    Assign
                  </Button>
                  <Button onClick={() => handleAddNote(selectedIncident.id)}>Add Note</Button>
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
      alert('Failed to create incident: ' + err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="page-stack">
      <div className="form-field">
        <label className="form-label">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="form-control"
        />
      </div>
      <div className="form-field">
        <label className="form-label">Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="form-control"
        />
      </div>
      <div className="form-grid">
        <div>
          <label className="form-label">Type *</label>
          <select
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
          <label className="form-label">Severity *</label>
          <select
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
        <label className="form-label">Affected IPs (comma-separated)</label>
        <input
          type="text"
          value={affectedIPs}
          onChange={(e) => setAffectedIPs(e.target.value)}
          placeholder="192.168.1.1, 10.0.0.1"
          className="form-control"
        />
      </div>
      <div className="form-field">
        <label className="form-label">Tags (comma-separated)</label>
        <input
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
