/**
 * Admin API calls
 */

import { apiClient } from './client';
import type {
  MetricsSummary,
  AuditLogEntry,
  SessionInfo,
  UserInfo,
  LoginRequest,
  LoginResponse,
  IPThreatInfo,
  AttackPattern,
  ThreatStatistics,
  Incident,
  IncidentStatistics,
  IncidentStatus,
  IncidentSeverity,
  IncidentType,
  IncidentPlaybookAction,
  SecurityPosture,
  ComplianceMetrics,
} from '../types';

export const adminApi = {
  // Auth
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    const { data } = await apiClient.post('/auth/login', credentials);
    return data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  // Metrics
  getMetricsSummary: async (): Promise<MetricsSummary> => {
    const { data } = await apiClient.get('/admin/metrics/summary');
    return data;
  },

  // Audit Logs
  getAuditLogs: async (params?: {
    userId?: string;
    eventType?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> => {
    const { data } = await apiClient.get('/admin/audit/logs', { params });
    return data.logs;
  },

  // Sessions
  getActiveSessions: async (): Promise<SessionInfo[]> => {
    const { data } = await apiClient.get('/admin/sessions/active');
    return data.sessions;
  },

  revokeSession: async (jti: string): Promise<void> => {
    await apiClient.post(`/admin/sessions/${jti}/revoke`);
  },

  // Users
  getUsers: async (): Promise<UserInfo[]> => {
    const { data } = await apiClient.get('/admin/users');
    return data.users;
  },

  unlockUser: async (userId: string): Promise<void> => {
    await apiClient.post(`/admin/users/${userId}/unlock`);
  },

  // Health
  getHealth: async () => {
    const { data } = await apiClient.get('/admin/health');
    return data;
  },

  // Threat Intelligence
  getAllThreats: async (limit?: number): Promise<IPThreatInfo[]> => {
    const { data } = await apiClient.get('/admin/threats', { params: { limit } });
    return data.threats;
  },

  getTopThreats: async (limit?: number, includeAbuseIPDB?: boolean): Promise<IPThreatInfo[]> => {
    const { data } = await apiClient.get('/admin/threats/top', { 
      params: { limit, includeAbuseIPDB } 
    });
    return data.threats;
  },

  getIPThreat: async (ip: string, includeAbuseIPDB?: boolean): Promise<IPThreatInfo> => {
    const { data } = await apiClient.get(`/admin/threats/ip/${ip}`, {
      params: { includeAbuseIPDB }
    });
    return data.threat;
  },

  getThreatStatistics: async (): Promise<ThreatStatistics> => {
    const { data } = await apiClient.get('/admin/threats/statistics');
    return data.statistics;
  },

  getAttackPatterns: async (): Promise<AttackPattern[]> => {
    const { data } = await apiClient.get('/admin/threats/patterns');
    return data.patterns;
  },

  blockIP: async (ip: string, reason: string): Promise<void> => {
    await apiClient.post(`/admin/threats/ip/${ip}/block`, { reason });
  },

  unblockIP: async (ip: string): Promise<void> => {
    await apiClient.post(`/admin/threats/ip/${ip}/unblock`);
  },

  getBlockedIPs: async (): Promise<string[]> => {
    const { data } = await apiClient.get('/admin/threats/blocked');
    return data.blockedIPs;
  },

  // Incident Response
  createIncident: async (incident: {
    title: string;
    description: string;
    type: IncidentType;
    severity: IncidentSeverity;
    affectedIPs?: string[];
    affectedUsers?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Incident> => {
    const { data } = await apiClient.post('/admin/incidents', incident);
    return data.incident;
  },

  getIncidents: async (params?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    type?: IncidentType;
    limit?: number;
    offset?: number;
  }): Promise<Incident[]> => {
    const { data } = await apiClient.get('/admin/incidents', { params });
    return data.incidents;
  },

  getIncident: async (id: string): Promise<Incident> => {
    const { data } = await apiClient.get(`/admin/incidents/${id}`);
    return data.incident;
  },

  updateIncidentStatus: async (id: string, status: IncidentStatus): Promise<Incident> => {
    const { data } = await apiClient.patch(`/admin/incidents/${id}/status`, { status });
    return data.incident;
  },

  assignIncident: async (id: string, assignedTo: string): Promise<Incident> => {
    const { data } = await apiClient.patch(`/admin/incidents/${id}/assign`, { assignedTo });
    return data.incident;
  },

  addIncidentNote: async (id: string, content: string): Promise<Incident> => {
    const { data } = await apiClient.post(`/admin/incidents/${id}/notes`, { content });
    return data.incident;
  },

  runIncidentPlaybookAction: async (id: string, action: IncidentPlaybookAction, target?: string): Promise<Incident> => {
    const { data } = await apiClient.post(`/admin/incidents/${id}/playbook`, { action, target });
    return data.incident;
  },

  updateIncident: async (id: string, updates: Partial<Incident>): Promise<Incident> => {
    const { data } = await apiClient.patch(`/admin/incidents/${id}`, updates);
    return data.incident;
  },

  getIncidentStatistics: async (): Promise<IncidentStatistics> => {
    const { data } = await apiClient.get('/admin/incidents/statistics');
    return data.statistics;
  },

  // Compliance
  getSecurityPosture: async (): Promise<SecurityPosture> => {
    const { data } = await apiClient.get('/admin/compliance/posture');
    if (data.error) {
      throw new Error(data.error.message || 'Failed to fetch security posture');
    }
    if (!data.posture) {
      console.error('No posture data in response:', data);
      throw new Error('Invalid response: missing posture data');
    }
    return data.posture;
  },

  getComplianceMetrics: async (): Promise<ComplianceMetrics> => {
    const { data } = await apiClient.get('/admin/compliance/metrics');
    if (data.error) {
      throw new Error(data.error.message || 'Failed to fetch compliance metrics');
    }
    if (!data.metrics) {
      console.error('No metrics data in response:', data);
      throw new Error('Invalid response: missing metrics data');
    }
    return data.metrics;
  },
};
