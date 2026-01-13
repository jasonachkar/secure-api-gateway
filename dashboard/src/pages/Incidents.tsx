/**
 * Incident Response page
 * Manage security incidents, track response times, and generate reports
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { MetricCard } from '../components/MetricCard';
import { adminApi } from '../api/admin';
import type { Incident, IncidentStatistics, IncidentStatus, IncidentSeverity, IncidentType } from '../types';
import { format, formatDistanceToNow } from 'date-fns';

const severityColors: Record<IncidentSeverity, { bg: string; text: string; badge: string }> = {
  critical: { bg: '#fee2e2', text: '#991b1b', badge: '#dc2626' },
  high: { bg: '#fed7aa', text: '#9a3412', badge: '#ea580c' },
  medium: { bg: '#fef3c7', text: '#92400e', badge: '#f59e0b' },
  low: { bg: '#d1fae5', text: '#065f46', badge: '#10b981' },
};

const statusColors: Record<IncidentStatus, { bg: string; text: string }> = {
  open: { bg: '#dbeafe', text: '#1e40af' },
  investigating: { bg: '#fef3c7', text: '#92400e' },
  contained: { bg: '#fde68a', text: '#78350f' },
  resolved: { bg: '#d1fae5', text: '#065f46' },
  closed: { bg: '#e5e7eb', text: '#374151' },
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

  const formatDuration = (ms: number): string => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)}h`;
    return `${Math.round(ms / 86400000)}d`;
  };

  return (
    <Layout>
      <div>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px' }}>
              Incident Response
            </h1>
            <p style={{ color: '#64748b' }}>
              Track and manage security incidents with response time metrics
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setShowCreateModal(true)}
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
              + New Incident
            </button>
            <button
              onClick={fetchData}
              style={{
                backgroundColor: '#f1f5f9',
                color: '#475569',
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
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Loading incidents...
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

        {!loading && !error && statistics && (
          <>
            {/* Statistics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '30px' }}>
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
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as IncidentStatus | 'all')}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
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
                style={{
                  padding: '8px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Incidents List */}
            <div style={{ display: 'grid', gap: '15px', marginBottom: '30px' }}>
              {incidents.length === 0 ? (
                <div style={{
                  backgroundColor: 'white',
                  padding: '40px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#94a3b8',
                }}>
                  No incidents found
                </div>
              ) : (
                incidents.map((incident) => {
                  const sevColors = severityColors[incident.severity];
                  const statColors = statusColors[incident.status];
                  return (
                    <div
                      key={incident.id}
                      style={{
                        backgroundColor: 'white',
                        padding: '20px',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        borderLeft: `4px solid ${sevColors.badge}`,
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedIncident(incident)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>
                              {incident.title}
                            </h3>
                            <span style={{
                              padding: '4px 8px',
                              backgroundColor: sevColors.bg,
                              color: sevColors.text,
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              {incident.severity.toUpperCase()}
                            </span>
                            <span style={{
                              padding: '4px 8px',
                              backgroundColor: statColors.bg,
                              color: statColors.text,
                              fontSize: '12px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}>
                              {incident.status.toUpperCase()}
                            </span>
                          </div>
                          <p style={{ color: '#64748b', marginBottom: '12px', fontSize: '14px' }}>
                            {incident.description.substring(0, 150)}...
                          </p>
                          <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#64748b' }}>
                            <span>Type: <strong>{incident.type.replace(/_/g, ' ')}</strong></span>
                            <span>Reported: <strong>{format(new Date(incident.createdAt), 'MMM dd, yyyy HH:mm')}</strong></span>
                            {incident.assignedTo && <span>Assigned: <strong>{incident.assignedTo}</strong></span>}
                            {incident.responseTime && <span>Response: <strong>{formatDuration(incident.responseTime)}</strong></span>}
                            {incident.resolutionTime && <span>Resolution: <strong>{formatDuration(incident.resolutionTime)}</strong></span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedIncident(incident);
                            }}
                            style={{
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              padding: '8px 12px',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '500',
                            }}
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Incident Detail Modal */}
        {selectedIncident && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '20px',
            }}
            onClick={() => setSelectedIncident(null)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '30px',
                maxWidth: '800px',
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>
                    {selectedIncident.title}
                  </h2>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: severityColors[selectedIncident.severity].bg,
                      color: severityColors[selectedIncident.severity].text,
                      fontSize: '12px',
                      borderRadius: '4px',
                      fontWeight: '600',
                    }}>
                      {selectedIncident.severity.toUpperCase()}
                    </span>
                    <span style={{
                      padding: '4px 8px',
                      backgroundColor: statusColors[selectedIncident.status].bg,
                      color: statusColors[selectedIncident.status].text,
                      fontSize: '12px',
                      borderRadius: '4px',
                      fontWeight: '600',
                    }}>
                      {selectedIncident.status.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedIncident(null)}
                  style={{
                    backgroundColor: '#f1f5f9',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Description</h3>
                <p style={{ color: '#64748b', whiteSpace: 'pre-wrap' }}>{selectedIncident.description}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '15px', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Type</div>
                  <div style={{ fontWeight: '600' }}>{selectedIncident.type.replace(/_/g, ' ')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Reported By</div>
                  <div style={{ fontWeight: '600' }}>{selectedIncident.reportedBy}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Created</div>
                  <div style={{ fontWeight: '600' }}>{format(new Date(selectedIncident.createdAt), 'MMM dd, yyyy HH:mm:ss')}</div>
                </div>
                {selectedIncident.assignedTo && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Assigned To</div>
                    <div style={{ fontWeight: '600' }}>{selectedIncident.assignedTo}</div>
                  </div>
                )}
                {selectedIncident.responseTime && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Response Time</div>
                    <div style={{ fontWeight: '600' }}>{formatDuration(selectedIncident.responseTime)}</div>
                  </div>
                )}
                {selectedIncident.resolutionTime && (
                  <div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Resolution Time</div>
                    <div style={{ fontWeight: '600' }}>{formatDuration(selectedIncident.resolutionTime)}</div>
                  </div>
                )}
              </div>

              {selectedIncident.affectedIPs.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>Affected IPs</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedIncident.affectedIPs.map((ip) => (
                      <span
                        key={ip}
                        style={{
                          padding: '4px 8px',
                          backgroundColor: '#f1f5f9',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: 'monospace',
                        }}
                      >
                        {ip}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Notes</h3>
                <div style={{ maxHeight: '200px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedIncident.notes.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '14px' }}>No notes yet</div>
                  ) : (
                    selectedIncident.notes.map((note, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600' }}>{note.author}</span>
                          <span style={{ color: '#64748b', fontSize: '12px' }}>
                            {format(new Date(note.timestamp), 'MMM dd, HH:mm')}
                          </span>
                        </div>
                        <div style={{ color: '#475569' }}>{note.content}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <select
                  value={selectedIncident.status}
                  onChange={(e) => handleStatusChange(selectedIncident.id, e.target.value as IncidentStatus)}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  <option value="open">Open</option>
                  <option value="investigating">Investigating</option>
                  <option value="contained">Contained</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <button
                  onClick={() => handleAssign(selectedIncident.id)}
                  style={{
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Assign
                </button>
                <button
                  onClick={() => handleAddNote(selectedIncident.id)}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Incident Modal */}
        {showCreateModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowCreateModal(false)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '30px',
                maxWidth: '600px',
                width: '100%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>Create New Incident</h2>
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
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
          Title *
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
          Description *
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={4}
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'inherit',
          }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
            Type *
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as IncidentType)}
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
            }}
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
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
            Severity *
          </label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
          Affected IPs (comma-separated)
        </label>
        <input
          type="text"
          value={affectedIPs}
          onChange={(e) => setAffectedIPs(e.target.value)}
          placeholder="192.168.1.1, 10.0.0.1"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
          Tags (comma-separated)
        </label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="urgent, production"
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            backgroundColor: '#f1f5f9',
            color: '#475569',
            padding: '10px 16px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
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
          Create Incident
        </button>
      </div>
    </form>
  );
}
