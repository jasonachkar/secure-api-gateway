/**
 * Incident Response page
 * Manage security incidents, track response times, and generate reports
 */

import { useState, useEffect, type CSSProperties } from 'react';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { adminApi } from '../api/admin';
import type { Incident, IncidentStatistics, IncidentStatus, IncidentSeverity, IncidentType } from '../types';
import { format } from 'date-fns';

const severityColors: Record<IncidentSeverity, { bg: string; text: string; badge: string }> = {
  critical: { bg: 'var(--color-error-100)', text: 'var(--color-error-800)', badge: 'var(--color-error-600)' },
  high: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)', badge: 'var(--color-warning-600)' },
  medium: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)', badge: 'var(--color-warning-500)' },
  low: { bg: 'var(--color-success-100)', text: 'var(--color-success-800)', badge: 'var(--color-success-600)' },
};

const statusColors: Record<IncidentStatus, { bg: string; text: string }> = {
  open: { bg: 'var(--color-primary-100)', text: 'var(--color-primary-800)' },
  investigating: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)' },
  contained: { bg: 'var(--color-warning-100)', text: 'var(--color-warning-800)' },
  resolved: { bg: 'var(--color-success-100)', text: 'var(--color-success-800)' },
  closed: { bg: 'var(--color-neutral-200)', text: 'var(--color-neutral-700)' },
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
      <div className="page">
        <SectionHeader
          title="Incident Response"
          subtitle="Track and manage security incidents with response time metrics"
          actions={(
            <div className="section-actions">
              <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                + New Incident
              </Button>
              <Button variant="secondary" onClick={fetchData}>
                Refresh
              </Button>
            </div>
          )}
        />

        {loading && (
          <div className="loading-state">Loading incidents...</div>
        )}

        {error && (
          <div className="alert">{error}</div>
        )}

        {!loading && !error && statistics && (
          <>
            {/* Statistics Cards */}
            <div className="grid grid--metrics">
              <MetricCard
                title="Total Incidents"
                value={statistics.totalIncidents}
                color="blue"
              />
              <MetricCard
                title="Open Incidents"
                value={statistics.openIncidents}
                color={statistics.openIncidents > 0 ? 'red' : 'green'}
              />
              <MetricCard
                title="Resolved"
                value={statistics.resolvedIncidents}
                color="green"
              />
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

            {/* Filters */}
            <div className="filters">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as IncidentStatus | 'all')}
                className="form-select"
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
                className="form-select"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Incidents List */}
            <div className="stack incidents-list">
              {incidents.length === 0 ? (
                <Card className="empty-state">No incidents found</Card>
              ) : (
                incidents.map((incident) => {
                  const sevColors = severityColors[incident.severity];
                  const statColors = statusColors[incident.status];
                  return (
                    <Card
                      key={incident.id}
                      className="incident-card"
                      style={{ '--incident-accent': sevColors.badge } as CSSProperties}
                      onClick={() => setSelectedIncident(incident)}
                    >
                      <div className="incident-card__header">
                        <div className="incident-card__content">
                          <div className="incident-card__title-row">
                            <h3 className="incident-card__title">{incident.title}</h3>
                            <Badge
                              tone="custom"
                              style={{ '--badge-bg': sevColors.bg, '--badge-color': sevColors.text } as CSSProperties}
                            >
                              {incident.severity.toUpperCase()}
                            </Badge>
                            <Badge
                              tone="custom"
                              style={{ '--badge-bg': statColors.bg, '--badge-color': statColors.text } as CSSProperties}
                            >
                              {incident.status.toUpperCase()}
                            </Badge>
                          </div>
                          <p className="incident-card__description">
                            {incident.description.substring(0, 150)}...
                          </p>
                          <div className="incident-card__meta">
                            <span>Type: <strong>{incident.type.replace(/_/g, ' ')}</strong></span>
                            <span>Reported: <strong>{format(new Date(incident.createdAt), 'MMM dd, yyyy HH:mm')}</strong></span>
                            {incident.assignedTo && <span>Assigned: <strong>{incident.assignedTo}</strong></span>}
                            {incident.responseTime && <span>Response: <strong>{formatDuration(incident.responseTime)}</strong></span>}
                            {incident.resolutionTime && <span>Resolution: <strong>{formatDuration(incident.resolutionTime)}</strong></span>}
                          </div>
                        </div>
                        <div className="incident-card__actions">
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
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Incident Detail Modal */}
        {selectedIncident && (
          <div className="modal-backdrop" onClick={() => setSelectedIncident(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">{selectedIncident.title}</h2>
                  <div className="inline-row">
                    <Badge
                      tone="custom"
                      style={{
                        '--badge-bg': severityColors[selectedIncident.severity].bg,
                        '--badge-color': severityColors[selectedIncident.severity].text,
                      } as CSSProperties}
                    >
                      {selectedIncident.severity.toUpperCase()}
                    </Badge>
                    <Badge
                      tone="custom"
                      style={{
                        '--badge-bg': statusColors[selectedIncident.status].bg,
                        '--badge-color': statusColors[selectedIncident.status].text,
                      } as CSSProperties}
                    >
                      {selectedIncident.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIncident(null)}>
                  ×
                </Button>
              </div>

              <div className="stack">
                <div>
                  <h3 className="subsection-title">Description</h3>
                  <p className="subsection-body">{selectedIncident.description}</p>
                </div>

                <div className="metadata-list">
                  <div>
                    <div className="metadata-label">Type</div>
                    <div className="metadata-value">{selectedIncident.type.replace(/_/g, ' ')}</div>
                  </div>
                  <div>
                    <div className="metadata-label">Reported By</div>
                    <div className="metadata-value">{selectedIncident.reportedBy}</div>
                  </div>
                  <div>
                    <div className="metadata-label">Created</div>
                    <div className="metadata-value">{format(new Date(selectedIncident.createdAt), 'MMM dd, yyyy HH:mm:ss')}</div>
                  </div>
                  {selectedIncident.assignedTo && (
                    <div>
                      <div className="metadata-label">Assigned To</div>
                      <div className="metadata-value">{selectedIncident.assignedTo}</div>
                    </div>
                  )}
                  {selectedIncident.responseTime && (
                    <div>
                      <div className="metadata-label">Response Time</div>
                      <div className="metadata-value">{formatDuration(selectedIncident.responseTime)}</div>
                    </div>
                  )}
                  {selectedIncident.resolutionTime && (
                    <div>
                      <div className="metadata-label">Resolution Time</div>
                      <div className="metadata-value">{formatDuration(selectedIncident.resolutionTime)}</div>
                    </div>
                  )}
                </div>

                {selectedIncident.affectedIPs.length > 0 && (
                  <div>
                    <h3 className="subsection-title">Affected IPs</h3>
                    <div className="inline-row inline-row--wrap">
                      {selectedIncident.affectedIPs.map((ip) => (
                        <span key={ip} className="pill">
                          {ip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="subsection-title">Notes</h3>
                  <div className="notes-list">
                    {selectedIncident.notes.length === 0 ? (
                      <div className="empty-text">No notes yet</div>
                    ) : (
                      selectedIncident.notes.map((note, idx) => (
                        <div key={idx} className="note-card">
                          <div className="note-card__meta">
                            <span className="note-card__author">{note.author}</span>
                            <span className="note-card__timestamp">
                              {format(new Date(note.timestamp), 'MMM dd, HH:mm')}
                            </span>
                          </div>
                          <div className="note-card__content">{note.content}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="inline-row inline-row--wrap">
                  <select
                    value={selectedIncident.status}
                    onChange={(e) => handleStatusChange(selectedIncident.id, e.target.value as IncidentStatus)}
                    className="form-select"
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
                  <Button variant="primary" onClick={() => handleAddNote(selectedIncident.id)}>
                    Add Note
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Incident Modal */}
        {showCreateModal && (
          <div className="modal-backdrop" onClick={() => setShowCreateModal(false)}>
            <div className="modal modal--sm" onClick={(e) => e.stopPropagation()}>
              <h2 className="subsection-title">Create New Incident</h2>
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
        affectedIPs: affectedIPs.split(',').map(ip => ip.trim()).filter(Boolean),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      onSuccess();
    } catch (err: any) {
      alert('Failed to create incident: ' + err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-field">
        <label className="form-label">Title *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="form-input"
        />
      </div>
      <div className="form-field">
        <label className="form-label">Description *</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          className="form-textarea"
        />
      </div>
      <div className="form-grid form-grid--two">
        <div className="form-field">
          <label className="form-label">Type *</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as IncidentType)}
            required
            className="form-select"
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
        <div className="form-field">
          <label className="form-label">Severity *</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            required
            className="form-select"
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
          className="form-input"
        />
      </div>
      <div className="form-field">
        <label className="form-label">Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="urgent, production"
          className="form-input"
        />
      </div>
      <div className="inline-row inline-row--end">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Create Incident
        </Button>
      </div>
    </form>
  );
}
