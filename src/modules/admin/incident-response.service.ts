/**
 * Incident Response Service
 * Manages security incidents, tracks response times, and generates reports
 */

import Redis from 'ioredis';
import { nanoid } from 'nanoid';
import { logger } from '../../lib/logger.js';

export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType = 
  | 'brute_force'
  | 'credential_stuffing'
  | 'rate_limit_abuse'
  | 'account_lockout'
  | 'suspicious_activity'
  | 'data_breach'
  | 'ddos'
  | 'malware'
  | 'unauthorized_access'
  | 'other';
export type IncidentTimelineEntryType = 'created' | 'note' | 'status_change' | 'assignment' | 'action' | 'update';
export type IncidentPlaybookAction = 'disable_user' | 'block_ip' | 'open_ticket';

export interface IncidentTimelineEntry {
  id: string;
  timestamp: number;
  type: IncidentTimelineEntryType;
  author: string;
  summary: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export type IncidentTimelineEntryType = 'note' | 'status_change' | 'assignment' | 'action';

export interface IncidentTimelineEntry {
  id: string;
  type: IncidentTimelineEntryType;
  timestamp: number;
  actor: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  reportedBy: string;
  assignedTo?: string;
  affectedIPs: string[];
  affectedUsers?: string[];
  responseTime?: number; // Time to first response in ms
  resolutionTime?: number; // Time to resolution in ms
  notes: Array<{
    timestamp: number;
    author: string;
    content: string;
  }>;
  timeline: IncidentTimelineEntry[];
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface IncidentStatistics {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  averageResponseTime: number; // ms
  averageResolutionTime: number; // ms
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byType: Record<IncidentType, number>;
  byStatus: Record<IncidentStatus, number>;
  recentTrends: Array<{
    date: string;
    opened: number;
    resolved: number;
  }>;
}

export class IncidentResponseService {
  private readonly INCIDENT_KEY_PREFIX = 'incident:';
  private readonly INCIDENT_INDEX_KEY = 'incidents:index';
  private readonly INCIDENT_RETENTION = 90 * 24 * 60 * 60 * 1000; // 90 days

  constructor(private redis: Redis) {}

  private addTimelineEntry(
    incident: Incident,
    entry: Omit<IncidentTimelineEntry, 'id'>
  ): IncidentTimelineEntry {
    const timelineEntry: IncidentTimelineEntry = {
      id: nanoid(),
      ...entry,
    };
    incident.timeline.push(timelineEntry);
    return timelineEntry;
  }

  private ensureTimeline(incident: Incident): boolean {
    if (incident.timeline && incident.timeline.length > 0) {
      return false;
    }

    incident.timeline = incident.timeline || [];
    incident.timeline.push({
      id: nanoid(),
      timestamp: incident.createdAt,
      type: 'created',
      author: incident.reportedBy,
      summary: 'Incident created',
    });

    for (const note of incident.notes || []) {
      let type: IncidentTimelineEntryType = 'note';
      let summary = 'Note added';

      if (note.content.startsWith('Status changed to ')) {
        type = 'status_change';
        summary = note.content;
      } else if (note.content.startsWith('Assigned to ')) {
        type = 'assignment';
        summary = note.content;
      } else if (note.content === 'Incident details updated') {
        type = 'update';
        summary = note.content;
      }

      incident.timeline.push({
        id: nanoid(),
        timestamp: note.timestamp,
        type,
        author: note.author,
        summary,
        details: type === 'note' ? note.content : undefined,
      });
    }

    incident.timeline.sort((a, b) => a.timestamp - b.timestamp);
    return true;
  }

  /**
   * Create a new incident
   */
  async createIncident(params: {
    title: string;
    description: string;
    type: IncidentType;
    severity: IncidentSeverity;
    reportedBy: string;
    affectedIPs?: string[];
    affectedUsers?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Incident> {
    const now = Date.now();
    const incident: Incident = {
      id: nanoid(),
      title: params.title,
      description: params.description,
      type: params.type,
      severity: params.severity,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      reportedBy: params.reportedBy,
      affectedIPs: params.affectedIPs || [],
      affectedUsers: params.affectedUsers || [],
      notes: [],
      timeline: [
        {
          id: nanoid(),
          type: 'note',
          timestamp: now,
          actor: params.reportedBy,
          summary: 'Incident created',
          metadata: {
            severity: params.severity,
            type: params.type,
          },
        },
      ],
      tags: params.tags || [],
      metadata: params.metadata,
    };

    this.addTimelineEntry(incident, {
      timestamp: incident.createdAt,
      type: 'created',
      author: params.reportedBy,
      summary: 'Incident created',
    });

    const key = `${this.INCIDENT_KEY_PREFIX}${incident.id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));
    await this.redis.zadd(this.INCIDENT_INDEX_KEY, incident.createdAt, incident.id);

    logger.info({ incidentId: incident.id, type: incident.type, severity: incident.severity }, 'Incident created');

    return incident;
  }

  /**
   * Get incident by ID
   */
  async getIncident(id: string): Promise<Incident | null> {
    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    const data = await this.redis.get(key);
    if (!data) return null;
    const incident = JSON.parse(data) as Incident;
    const hadTimeline = Boolean(incident.timeline?.length);
    const normalized = this.ensureTimeline(incident);
    if (!hadTimeline && normalized.timeline?.length) {
      await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(normalized));
    }
    return normalized;
  }

  /**
   * Get all incidents with filters
   */
  async getIncidents(params?: {
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    type?: IncidentType;
    limit?: number;
    offset?: number;
  }): Promise<Incident[]> {
    const limit = params?.limit || 100;
    const offset = params?.offset || 0;

    // Get all incident IDs sorted by creation time (newest first)
    const ids = await this.redis.zrevrange(this.INCIDENT_INDEX_KEY, offset, offset + limit - 1);

    // Fetch all incidents
    const pipeline = this.redis.pipeline();
    ids.forEach(id => {
      pipeline.get(`${this.INCIDENT_KEY_PREFIX}${id}`);
    });
    const results = await pipeline.exec();

    const incidents: Incident[] = [];
    if (results) {
      for (const [err, data] of results) {
        if (!err && data) {
          const incident = JSON.parse(data as string) as Incident;
          
          // Apply filters
          if (params?.status && incident.status !== params.status) continue;
          if (params?.severity && incident.severity !== params.severity) continue;
          if (params?.type && incident.type !== params.type) continue;

          incidents.push(this.ensureTimeline(incident));
        }
      }
    }

    return incidents;
  }

  /**
   * Update incident status
   */
  async updateIncidentStatus(
    id: string,
    status: IncidentStatus,
    updatedBy: string
  ): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    const now = Date.now();
    const previousStatus = incident.status;
    incident.status = status;
    incident.updatedAt = now;

    if (status === 'resolved' || status === 'closed') {
      incident.resolvedAt = now;
      incident.resolutionTime = now - incident.createdAt;
    }

    this.addTimelineEntry(incident, {
      type: 'status_change',
      timestamp: now,
      actor: updatedBy,
      summary: `Status changed to ${status}`,
      metadata: {
        status,
      },
    });

    // Add note about status change
    incident.notes.push({
      timestamp: now,
      author: updatedBy,
      content: `Status changed to ${status}`,
    });
    this.addTimelineEntry(incident, {
      timestamp: now,
      type: 'status_change',
      author: updatedBy,
      summary: `Status changed to ${status}`,
      metadata: { previousStatus, newStatus: status },
    });

    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));

    logger.info({ incidentId: id, status, updatedBy }, 'Incident status updated');

    return incident;
  }

  /**
   * Assign incident to user
   */
  async assignIncident(id: string, assignedTo: string, updatedBy: string): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    const now = Date.now();
    incident.assignedTo = assignedTo;
    incident.updatedAt = now;

    // Track response time if this is first assignment
    if (!incident.responseTime && incident.status === 'open') {
      incident.responseTime = now - incident.createdAt;
    }

    this.addTimelineEntry(incident, {
      type: 'assignment',
      timestamp: now,
      actor: updatedBy,
      summary: `Assigned to ${assignedTo}`,
      metadata: {
        assignedTo,
      },
    });

    incident.notes.push({
      timestamp: now,
      author: updatedBy,
      content: `Assigned to ${assignedTo}`,
    });
    this.addTimelineEntry(incident, {
      timestamp: now,
      type: 'assignment',
      author: updatedBy,
      summary: `Assigned to ${assignedTo}`,
      metadata: { assignedTo },
    });

    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));

    return incident;
  }

  /**
   * Add note to incident
   */
  async addNote(id: string, author: string, content: string): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    const now = Date.now();
    incident.notes.push({
      timestamp: now,
      author,
      content,
    });
    incident.updatedAt = now;
    this.addTimelineEntry(incident, {
      type: 'note',
      timestamp: now,
      actor: author,
      summary: content,
    });

    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));

    return incident;
  }

  /**
   * Update incident details
   */
  async updateIncident(
    id: string,
    updates: Partial<Pick<Incident, 'title' | 'description' | 'severity' | 'tags' | 'affectedIPs' | 'affectedUsers'>>,
    updatedBy: string
  ): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    Object.assign(incident, updates);
    const now = Date.now();
    incident.updatedAt = now;

    incident.notes.push({
      timestamp: now,
      author: updatedBy,
      content: 'Incident details updated',
    });
    this.addTimelineEntry(incident, {
      type: 'note',
      timestamp: now,
      actor: updatedBy,
      summary: 'Incident details updated',
    });

    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));

    return incident;
  }

  /**
   * Execute a playbook action (mocked)
   */
  async executePlaybookAction(
    id: string,
    action: string,
    actor: string,
    target?: string
  ): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    const now = Date.now();
    const actionLabel = action
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    const summary = `Playbook action: ${actionLabel}${target ? ` (${target})` : ''}`;

    this.addTimelineEntry(incident, {
      type: 'action',
      timestamp: now,
      actor,
      summary,
      metadata: {
        action,
        target,
        status: 'completed',
        result: 'mocked',
      },
    });

    incident.updatedAt = now;

    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));

    logger.info({ incidentId: id, action, actor, target }, 'Incident playbook action executed');

    return incident;
  }

  private addTimelineEntry(
    incident: Incident,
    entry: Omit<IncidentTimelineEntry, 'id'>
  ) {
    if (!incident.timeline) {
      incident.timeline = [];
    }
    incident.timeline.push({
      id: nanoid(),
      ...entry,
    });
  }

  private ensureTimeline(incident: Incident): Incident {
    if (incident.timeline && incident.timeline.length > 0) {
      return incident;
    }

    const timeline: IncidentTimelineEntry[] = [];
    if (incident.createdAt) {
      timeline.push({
        id: nanoid(),
        type: 'note',
        timestamp: incident.createdAt,
        actor: incident.reportedBy || 'system',
        summary: 'Incident created',
      });
    }

    if (incident.notes?.length) {
      incident.notes.forEach(note => {
        const normalized = this.normalizeNoteToTimeline(note.content);
        timeline.push({
          id: nanoid(),
          type: normalized.type,
          timestamp: note.timestamp,
          actor: note.author,
          summary: note.content,
          metadata: normalized.metadata,
        });
      });
    }

    incident.timeline = timeline.sort((a, b) => a.timestamp - b.timestamp);
    return incident;
  }

  private normalizeNoteToTimeline(content: string): {
    type: IncidentTimelineEntryType;
    metadata?: Record<string, unknown>;
  } {
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
  }

  /**
   * Get incident statistics
   */
  async getStatistics(): Promise<IncidentStatistics> {
    const allIncidents = await this.getIncidents({ limit: 10000 });

    const stats: IncidentStatistics = {
      totalIncidents: allIncidents.length,
      openIncidents: allIncidents.filter(i => i.status === 'open' || i.status === 'investigating').length,
      resolvedIncidents: allIncidents.filter(i => i.status === 'resolved' || i.status === 'closed').length,
      averageResponseTime: 0,
      averageResolutionTime: 0,
      bySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      },
      byType: {} as Record<IncidentType, number>,
      byStatus: {
        open: 0,
        investigating: 0,
        contained: 0,
        resolved: 0,
        closed: 0,
      },
      recentTrends: [],
    };

    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let totalResolutionTime = 0;
    let resolutionTimeCount = 0;

    for (const incident of allIncidents) {
      // Count by severity
      stats.bySeverity[incident.severity]++;

      // Count by type
      stats.byType[incident.type] = (stats.byType[incident.type] || 0) + 1;

      // Count by status
      stats.byStatus[incident.status]++;

      // Calculate averages
      if (incident.responseTime) {
        totalResponseTime += incident.responseTime;
        responseTimeCount++;
      }
      if (incident.resolutionTime) {
        totalResolutionTime += incident.resolutionTime;
        resolutionTimeCount++;
      }
    }

    stats.averageResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
    stats.averageResolutionTime = resolutionTimeCount > 0 ? totalResolutionTime / resolutionTimeCount : 0;

    // Calculate recent trends (last 7 days)
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const trendsMap = new Map<string, { opened: number; resolved: number }>();

    for (const incident of allIncidents) {
      if (incident.createdAt >= sevenDaysAgo) {
        const date = new Date(incident.createdAt).toISOString().split('T')[0];
        if (!trendsMap.has(date)) {
          trendsMap.set(date, { opened: 0, resolved: 0 });
        }
        trendsMap.get(date)!.opened++;
      }

      if (incident.resolvedAt && incident.resolvedAt >= sevenDaysAgo) {
        const date = new Date(incident.resolvedAt).toISOString().split('T')[0];
        if (!trendsMap.has(date)) {
          trendsMap.set(date, { opened: 0, resolved: 0 });
        }
        trendsMap.get(date)!.resolved++;
      }
    }

    stats.recentTrends = Array.from(trendsMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return stats;
  }

  /**
   * Run a playbook action (mocked for workflow visibility)
   */
  async runPlaybookAction(
    id: string,
    action: IncidentPlaybookAction,
    updatedBy: string,
    target?: string
  ): Promise<Incident | null> {
    const incident = await this.getIncident(id);
    if (!incident) return null;

    const now = Date.now();
    const actionLabels: Record<IncidentPlaybookAction, string> = {
      disable_user: 'Disable user',
      block_ip: 'Block IP',
      open_ticket: 'Open ticket',
    };

    let details = actionLabels[action];
    if (target) {
      details = `${details} (${target})`;
    }

    const metadata: Record<string, unknown> = {
      action,
      target,
      status: 'completed',
    };

    if (action === 'open_ticket') {
      metadata.ticketId = `INC-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    this.addTimelineEntry(incident, {
      timestamp: now,
      type: 'action',
      author: updatedBy,
      summary: `Playbook action executed: ${actionLabels[action]}`,
      details,
      metadata,
    });

    incident.updatedAt = now;

    const key = `${this.INCIDENT_KEY_PREFIX}${id}`;
    await this.redis.setex(key, this.INCIDENT_RETENTION, JSON.stringify(incident));

    logger.info({ incidentId: id, action, updatedBy }, 'Incident playbook action executed');

    return incident;
  }

  /**
   * Auto-create incident from threat intelligence
   */
  async createIncidentFromThreat(
    threatInfo: {
      ip: string;
      threatScore: number;
      threatLevel: string;
      eventTypes: {
        failedLogins: number;
        rateLimitViolations: number;
        suspiciousActivity: number;
        accountLockouts: number;
      };
    },
    reportedBy: string = 'system'
  ): Promise<Incident | null> {
    // Only create incidents for high/critical threats
    if (threatInfo.threatLevel !== 'high' && threatInfo.threatLevel !== 'critical') {
      return null;
    }

    // Determine incident type
    let type: IncidentType = 'suspicious_activity';
    if (threatInfo.eventTypes.failedLogins > 10) {
      type = 'brute_force';
    } else if (threatInfo.eventTypes.rateLimitViolations > 5) {
      type = 'rate_limit_abuse';
    } else if (threatInfo.eventTypes.accountLockouts > 0) {
      type = 'account_lockout';
    }

    const severity = threatInfo.threatLevel === 'critical' ? 'critical' : 'high';

    return this.createIncident({
      title: `${severity.toUpperCase()}: Suspicious activity from ${threatInfo.ip}`,
      description: `Threat score: ${threatInfo.threatScore}/100\n\nFailed logins: ${threatInfo.eventTypes.failedLogins}\nRate limit violations: ${threatInfo.eventTypes.rateLimitViolations}\nSuspicious activity: ${threatInfo.eventTypes.suspiciousActivity}\nAccount lockouts: ${threatInfo.eventTypes.accountLockouts}`,
      type,
      severity: severity as IncidentSeverity,
      reportedBy,
      affectedIPs: [threatInfo.ip],
      tags: ['auto-generated', 'threat-intelligence'],
    });
  }
}
