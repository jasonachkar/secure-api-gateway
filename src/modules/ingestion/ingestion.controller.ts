/**
 * Ingestion Controller
 * HTTP handlers for ingestion status
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import type { IngestionService } from './ingestion.service.js';
import { isReadOnlyReviewer } from '../../lib/reviewerProjection.js';

export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await this.ingestionService.getStatus();
    if (!isReadOnlyReviewer(request)) {
      return reply.send({ status });
    }

    return reply.send({
      status: {
        ...status,
        adapters: status.adapters.map((adapter) => ({
          ...adapter,
          cursor: undefined,
          detail: !adapter.configured
            ? 'Not configured'
            : adapter.healthy
              ? 'Configured and healthy'
              : 'Configured; provider polling is degraded',
        })),
      },
    });
  }
}
