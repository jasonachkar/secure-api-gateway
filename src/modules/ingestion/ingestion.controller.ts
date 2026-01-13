/**
 * Ingestion Controller
 * HTTP handlers for ingestion status
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import type { IngestionService } from './ingestion.service.js';

export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await this.ingestionService.getStatus();
    reply.send({ status });
  }
}
