import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/index.js';
import { ForbiddenError } from '../../lib/errors.js';

export async function requireTrustedAuthOrigin(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const origin = request.headers.origin;
  if (!origin || !env.security.corsOrigins.includes(origin)) {
    throw new ForbiddenError('Request origin is not allowed');
  }
}
