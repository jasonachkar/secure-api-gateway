/**
 * Incident Response Controller
 * HTTP handlers for incident management
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { IncidentResponseService, type Incident, type IncidentStatistics } from './incident-response.service.js';

export class IncidentResponseController {
  constructor(private incidentService: IncidentResponseService) {}

  /**
   * POST /admin/incidents
   * Create a new incident
   */
  async createIncident(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const body = request.body as any;

    const incident = await this.incidentService.createIncident({
      title: body.title,
      description: body.description,
      type: body.type,
      severity: body.severity,
      reportedBy: user.username,
      affectedIPs: body.affectedIPs || [],
      affectedUsers: body.affectedUsers || [],
      tags: body.tags || [],
      metadata: body.metadata,
    });

    (request as any).adminAuditContext = {
      action: 'incident.create',
      incidentId: incident.id,
    };

    reply.code(201).send({ incident });
  }

  /**
   * GET /admin/incidents
   * Get all incidents with optional filters
   */
  async getIncidents(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as any;

    const incidents = await this.incidentService.getIncidents({
      status: query.status,
      severity: query.severity,
      type: query.type,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    });

    reply.send({ incidents });
  }

  /**
   * GET /admin/incidents/:id
   * Get a specific incident
   */
  async getIncident(request: FastifyRequest, reply: FastifyReply) {
    const params = request.params as any;
    const incident = await this.incidentService.getIncident(params.id);

    (request as any).adminAuditContext = {
      action: 'incident.view',
      incidentId: params.id,
    };

    if (!incident) {
      return reply.code(404).send({ error: 'Incident not found' });
    }

    return reply.send({ incident });
  }

  /**
   * PATCH /admin/incidents/:id/status
   * Update incident status
   */
  async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const params = request.params as any;
    const body = request.body as any;

    (request as any).adminAuditContext = {
      action: 'incident.update_status',
      incidentId: params.id,
    };

    const incident = await this.incidentService.updateIncidentStatus(
      params.id,
      body.status,
      user.username
    );

    if (!incident) {
      return reply.code(404).send({ error: 'Incident not found' });
    }

    return reply.send({ incident });
  }

  /**
   * PATCH /admin/incidents/:id/assign
   * Assign incident to user
   */
  async assignIncident(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const params = request.params as any;
    const body = request.body as any;

    (request as any).adminAuditContext = {
      action: 'incident.assign',
      incidentId: params.id,
    };

    const incident = await this.incidentService.assignIncident(
      params.id,
      body.assignedTo,
      user.username
    );

    if (!incident) {
      return reply.code(404).send({ error: 'Incident not found' });
    }

    return reply.send({ incident });
  }

  /**
   * POST /admin/incidents/:id/notes
   * Add note to incident
   */
  async addNote(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const params = request.params as any;
    const body = request.body as any;

    (request as any).adminAuditContext = {
      action: 'incident.add_note',
      incidentId: params.id,
    };

    const incident = await this.incidentService.addNote(
      params.id,
      user.username,
      body.content
    );

    if (!incident) {
      return reply.code(404).send({ error: 'Incident not found' });
    }

    return reply.send({ incident });
  }

  /**
   * PATCH /admin/incidents/:id
   * Update incident details
   */
  async updateIncident(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const params = request.params as any;
    const body = request.body as any;

    (request as any).adminAuditContext = {
      action: 'incident.update',
      incidentId: params.id,
    };

    const incident = await this.incidentService.updateIncident(
      params.id,
      {
        title: body.title,
        description: body.description,
        severity: body.severity,
        tags: body.tags,
        affectedIPs: body.affectedIPs,
        affectedUsers: body.affectedUsers,
      },
      user.username
    );

    if (!incident) {
      return reply.code(404).send({ error: 'Incident not found' });
    }

    return reply.send({ incident });
  }

  /**
   * GET /admin/incidents/statistics
   * Get incident statistics
   */
  async getStatistics(request: FastifyRequest, reply: FastifyReply) {
    const statistics = await this.incidentService.getStatistics();
    reply.send({ statistics });
  }

  /**
   * POST /admin/incidents/:id/actions
   * Execute a playbook action (mocked)
   */
  async executePlaybookAction(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    const params = request.params as any;
    const body = request.body as any;

    const incident = await this.incidentService.executePlaybookAction(
      params.id,
      body.action,
      user.username,
      body.target
    );

    if (!incident) {
      return reply.code(404).send({ error: 'Incident not found' });
    }

    return reply.send({ incident });
  }

  /**
   * POST /admin/incidents/seed-test-data
   * Seed test incidents for development/demo purposes
   */
  async seedTestIncidents(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;
    
    try {
      const testIncidents = [
        {
          title: 'CRITICAL: Brute Force Attack Detected',
          description: 'Multiple failed login attempts from IP 192.168.1.100. Detected 25 failed login attempts within 5 minutes. Account lockout triggered.',
          type: 'brute_force' as const,
          severity: 'critical' as const,
          affectedIPs: ['192.168.1.100'],
          tags: ['auto-generated', 'threat-intelligence', 'brute-force'],
        },
        {
          title: 'HIGH: Rate Limit Violations from Multiple IPs',
          description: 'Excessive API requests detected. 15+ rate limit violations from IP 10.0.0.50 in the last hour. Possible DDoS attempt.',
          type: 'rate_limit_abuse' as const,
          severity: 'high' as const,
          affectedIPs: ['10.0.0.50', '10.0.0.51'],
          tags: ['auto-generated', 'rate-limiting'],
        },
        {
          title: 'MEDIUM: Suspicious Activity Pattern',
          description: 'Unusual access pattern detected. User account showing activity from multiple geographic locations within short time window.',
          type: 'suspicious_activity' as const,
          severity: 'medium' as const,
          affectedIPs: ['203.0.113.45', '198.51.100.22'],
          tags: ['suspicious', 'investigation'],
        },
        {
          title: 'HIGH: Credential Stuffing Attempt',
          description: 'Distributed login attempts detected across multiple IP addresses. Pattern suggests credential stuffing attack.',
          type: 'credential_stuffing' as const,
          severity: 'high' as const,
          affectedIPs: ['172.16.0.10', '172.16.0.11', '172.16.0.12'],
          tags: ['auto-generated', 'credential-stuffing'],
        },
      ];

      const createdIncidents = [];
      for (const incident of testIncidents) {
        const created = await this.incidentService.createIncident({
          ...incident,
          reportedBy: user.username,
        });
        createdIncidents.push(created);
      }

      reply.code(201).send({
        message: `Created ${createdIncidents.length} test incidents`,
        incidents: createdIncidents,
      });
    } catch (error: any) {
      reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message || 'Failed to seed test incidents',
        },
      });
    }
  }
}
