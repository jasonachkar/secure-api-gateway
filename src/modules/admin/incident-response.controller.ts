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
}

