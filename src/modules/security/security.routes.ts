/**
 * Security control-plane API: capabilities, pipeline metrics, normalized events,
 * detections, investigations, fixture replay, and response actions.
 *
 * Replay only ever accepts a known fixture id from the allowlisted fixture
 * catalog (never an arbitrary payload) - see fixture-loader.ts.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requireAnyRole, requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validation.js';
import { getCapabilities, getCapabilitySummary } from './capability-registry.js';
import { env } from '../../config/index.js';
import { listFixtures } from '../ingestion/fixture-loader.js';
import { replayFixtureThroughPipeline } from '../ingestion/replay.js';
import { NotFoundError } from '../../lib/errors.js';
import { getRequestId } from '../../lib/requestContext.js';
import type { InvestigationService } from '../investigations/investigation.service.js';
import type { SecurityEventStore } from '../ingestion/security-event.store.js';
import type { DetectionEngine } from '../detection/engine.js';
import type { DetectionStore } from '../detection/detection.store.js';
import type { PipelineMetrics } from './pipeline-metrics.js';
import type { ResponseService } from '../response/response.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { buildEvidencePackage } from '../investigations/evidence-export.js';

const replayBodySchema = z.object({
  fixtureId: z.string().min(1),
});

const blockIpSchema = z.object({
  ip: z.string().min(1),
  reason: z.string().min(1),
  investigationId: z.string().optional(),
});

const unblockIpSchema = z.object({
  ip: z.string().min(1),
  reason: z.string().min(1),
});

const revokeSessionsSchema = z.object({
  userId: z.string().min(1),
  username: z.string().optional(),
  reason: z.string().min(1),
  investigationId: z.string().optional(),
});

const openTicketSchema = z.object({
  reason: z.string().min(1),
  title: z.string().optional(),
  investigationId: z.string().optional(),
});

export async function registerSecurityRoutes(
  app: FastifyInstance,
  deps: {
    investigationService: InvestigationService;
    securityEventStore: SecurityEventStore;
    detectionEngine: DetectionEngine;
    detectionStore: DetectionStore;
    pipelineMetrics: PipelineMetrics;
    responseService: ResponseService;
    auditService: AuditService;
  }
): Promise<void> {
  const { investigationService, securityEventStore, detectionEngine, detectionStore, pipelineMetrics, responseService, auditService } = deps;

  const readAuth = [requireAuth, requireAnyRole(['admin', 'security_analyst', 'incident_responder', 'reviewer'])];
  const writeAuth = [requireAuth, requireRole('admin')];

  app.get(
    '/admin/security/capabilities',
    { schema: { description: 'Get capability registry summary (honesty status)', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: readAuth },
    async () => getCapabilitySummary()
  );

  app.get(
    '/admin/security/capabilities/list',
    { schema: { description: 'Get raw capability definitions', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: readAuth },
    async () => ({ capabilities: getCapabilities() })
  );

  app.get(
    '/admin/security/pipeline-metrics',
    { schema: { description: 'Get pipeline observability metrics', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: readAuth },
    async () =>
      pipelineMetrics.getSnapshot({
        awsConfigured: Boolean(env.ingestion.cloudwatchLogGroup),
        gcpConfigured: Boolean(env.ingestion.gcpLoggingProject),
        azureMode: 'replay',
      })
  );

  app.get(
    '/admin/security/fixtures',
    { schema: { description: 'List available replay fixtures', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: readAuth },
    async () => ({ fixtures: listFixtures() })
  );

  app.get(
    '/admin/security/events',
    {
      schema: {
        description: 'List normalized security events',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['aws', 'gcp', 'azure', 'gateway'] },
            limit: { type: 'number', minimum: 1, maximum: 200, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: readAuth,
    },
    async (request: FastifyRequest) => {
      const { provider, limit, offset } = request.query as {
        provider?: 'aws' | 'gcp' | 'azure' | 'gateway';
        limit?: number;
        offset?: number;
      };
      const events = await securityEventStore.listEvents({ provider, limit, offset });
      return { events };
    }
  );

  app.get(
    '/admin/security/events/:id',
    {
      schema: {
        description: 'Get a normalized security event by id',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      preHandler: readAuth,
    },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const event = await securityEventStore.getEvent(id);
      if (!event) throw new NotFoundError('Normalized security event');
      return { event };
    }
  );

  app.get(
    '/admin/security/investigations',
    {
      schema: {
        description: 'List security investigations',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['open', 'investigating', 'contained', 'resolved', 'closed'] },
            limit: { type: 'number', minimum: 1, maximum: 200, default: 50 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: readAuth,
    },
    async (request: FastifyRequest) => {
      const { status, limit, offset } = request.query as {
        status?: 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
        limit?: number;
        offset?: number;
      };
      const investigations = await investigationService.listInvestigations({ status, limit, offset });
      return { investigations };
    }
  );

  app.get(
    '/admin/security/investigations/:id',
    {
      schema: {
        description: 'Get a security investigation by id',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      preHandler: readAuth,
    },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const investigation = await investigationService.getInvestigation(id);
      if (!investigation) throw new NotFoundError('Investigation');
      const [events, detections] = await Promise.all([
        securityEventStore.getEventsByIds(investigation.eventIds),
        detectionStore.getByIds(investigation.detectionIds),
      ]);
      return { investigation, events, detections };
    }
  );

  app.get(
    '/admin/security/investigations/:id/evidence-export',
    {
      schema: {
        description: 'Export a redacted evidence package (JSON bundle) for an investigation',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      preHandler: readAuth,
    },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      return buildEvidencePackage(id, { investigationService, securityEventStore, detectionStore, auditService });
    }
  );

  app.get(
    '/admin/security/detections/:id',
    {
      schema: {
        description: 'Get a detection result by id',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      preHandler: readAuth,
    },
    async (request: FastifyRequest) => {
      const { id } = request.params as { id: string };
      const detection = await detectionStore.get(id);
      if (!detection) throw new NotFoundError('Detection');
      return { detection };
    }
  );

  /**
   * POST /admin/security/replay
   * Replays a single sanitized fixture through the real parse -> normalize ->
   * detect -> correlate pipeline. fixtureId must match a known catalog entry
   * from fixture-loader.ts - arbitrary payloads are never accepted here.
   */
  app.post(
    '/admin/security/replay',
    {
      schema: {
        description: 'Replay a known fixture through the detection pipeline',
        tags: ['Security'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [...writeAuth, validate(replayBodySchema, 'body')],
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof replayBodySchema> }>) => {
      return replayFixtureThroughPipeline(
        { securityEventStore, detectionEngine, detectionStore, investigationService, pipelineMetrics },
        request.body.fixtureId
      );
    }
  );

  app.post(
    '/admin/security/response/block-ip',
    { schema: { description: 'Enforce an IP block', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: [...writeAuth, validate(blockIpSchema, 'body')] },
    async (request: FastifyRequest<{ Body: z.infer<typeof blockIpSchema> }>) => {
      const user = (request as unknown as { user: { username: string } }).user;
      const record = await responseService.blockIp({
        ip: request.body.ip,
        actor: user.username,
        reason: request.body.reason,
        investigationId: request.body.investigationId,
        correlationId: getRequestId(request),
      });
      if (request.body.investigationId) {
        await investigationService.attachResponseAction(request.body.investigationId, record);
      }
      return { action: record };
    }
  );

  app.post(
    '/admin/security/response/unblock-ip',
    { schema: { description: 'Remove an IP block', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: [...writeAuth, validate(unblockIpSchema, 'body')] },
    async (request: FastifyRequest<{ Body: z.infer<typeof unblockIpSchema> }>) => {
      const user = (request as unknown as { user: { username: string } }).user;
      const record = await responseService.unblockIp({
        ip: request.body.ip,
        actor: user.username,
        reason: request.body.reason,
        correlationId: getRequestId(request),
      });
      return { action: record };
    }
  );

  app.post(
    '/admin/security/response/revoke-sessions',
    { schema: { description: 'Enforce session revocation for a user', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: [...writeAuth, validate(revokeSessionsSchema, 'body')] },
    async (request: FastifyRequest<{ Body: z.infer<typeof revokeSessionsSchema> }>) => {
      const user = (request as unknown as { user: { username: string } }).user;
      const record = await responseService.revokeSessions({
        userId: request.body.userId,
        username: request.body.username,
        actor: user.username,
        reason: request.body.reason,
        investigationId: request.body.investigationId,
        correlationId: getRequestId(request),
      });
      if (request.body.investigationId) {
        await investigationService.attachResponseAction(request.body.investigationId, record);
      }
      return { action: record };
    }
  );

  app.post(
    '/admin/security/response/open-ticket',
    { schema: { description: 'Simulate opening an external ticket (no ITSM integration configured)', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: [...writeAuth, validate(openTicketSchema, 'body')] },
    async (request: FastifyRequest<{ Body: z.infer<typeof openTicketSchema> }>) => {
      const user = (request as unknown as { user: { username: string } }).user;
      const record = await responseService.openTicket({
        actor: user.username,
        reason: request.body.reason,
        title: request.body.title,
        investigationId: request.body.investigationId,
        correlationId: getRequestId(request),
      });
      if (request.body.investigationId) {
        await investigationService.attachResponseAction(request.body.investigationId, record);
      }
      return { action: record };
    }
  );

  app.get(
    '/admin/security/response/actions',
    { schema: { description: 'List recent response actions', tags: ['Security'], security: [{ bearerAuth: [] }] }, preHandler: readAuth },
    async () => ({ actions: await responseService.listActions() })
  );
}
