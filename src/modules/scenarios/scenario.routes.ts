/**
 * Guided scenario API. All three scenarios are safe for the reviewer role
 * (see reviewer-demo-mode): they only ever touch the dedicated demo account/IP
 * or replay a checked-in fixture, never an arbitrary target.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Redis from 'ioredis';
import { requireAuth } from '../../middleware/auth.js';
import { requireAnyRole } from '../../middleware/rbac.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { NotFoundError } from '../../lib/errors.js';
import { ScenarioService, SCENARIO_DEFINITIONS } from './scenario.service.js';
import type { ScenarioId } from './types.js';

const SCENARIO_IDS: ScenarioId[] = SCENARIO_DEFINITIONS.map((d) => d.id);

export async function registerScenarioRoutes(
  app: FastifyInstance,
  redis: Redis,
  scenarioService: ScenarioService
): Promise<void> {
  const auth = [requireAuth, requireAnyRole(['admin', 'reviewer', 'security_analyst'])];
  const runRateLimit = createRateLimiter(redis, 10, 60_000);

  app.get(
    '/admin/scenarios',
    { schema: { description: 'List guided scenarios', tags: ['Scenarios'], security: [{ bearerAuth: [] }] }, preHandler: auth },
    async () => ({ scenarios: scenarioService.getDefinitions() })
  );

  app.post(
    '/admin/scenarios/:id/run',
    {
      schema: {
        description: 'Run a guided scenario (safe for reviewer role)',
        tags: ['Scenarios'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      },
      preHandler: [...auth, runRateLimit],
    },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const { id } = request.params;
      if (!SCENARIO_IDS.includes(id as ScenarioId)) {
        throw new NotFoundError('Scenario');
      }
      const user = (request as unknown as { user: { username: string } }).user;
      const result = await scenarioService.run(id as ScenarioId, user.username);
      return { result };
    }
  );

  app.post(
    '/admin/scenarios/gw-credential-attack/reset',
    {
      schema: {
        description: 'Reset the gateway-credential-attack scenario (unblocks the demo IP, clears lockout)',
        tags: ['Scenarios'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [...auth, runRateLimit],
    },
    async () => {
      await scenarioService.resetGatewayScenario();
      return { reset: true };
    }
  );
}
