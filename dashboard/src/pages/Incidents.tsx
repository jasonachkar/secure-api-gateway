/**
 * Incident Response page
 * Manage security incidents, track response times, and generate reports
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
import type { Incident, IncidentStatistics, IncidentStatus, IncidentSeverity, IncidentType } from '../types';

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

export function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [statistics, setStatistics] = useState<IncidentStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<IncidentStatus | 'all'>('all');
  const [filterSeverity, setFilterSeverity] = useState<IncidentSeverity | 'all'>('all');

  useEffect(() => {
    fetchData();
  }, [filterStatus, filterSeverity]);

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

  const formatDuration = (ms: number): string => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  };

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

                <div>
                  <div className="section-title">Notes</div>
                  <div className="note-list">
                    {selectedIncident.notes.length === 0 ? (
                      <div className="helper-text">No notes yet</div>
                    ) : (
                      selectedIncident.notes.map((note, idx) => (
                        <div key={idx} className="note-card">
                          <div className="note-card__header">
                            <span className="font-semibold">{note.author}</span>
                            <span className="note-card__meta">
                              {format(new Date(note.timestamp), 'MMM dd, HH:mm')}
                            </span>
                          </div>
                          <div className="note-card__content">{note.content}</div>
                        </div>
                      ))
                    )}
                  </div>
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
