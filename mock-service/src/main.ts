/**
 * Mock upstream service
 * Simulates backend services for gateway testing
 */

import Fastify from 'fastify';
import pino from 'pino';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Logger
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
    },
  },
});

/**
 * Mock reports database
 */
const reports = new Map([
  [
    '123',
    {
      id: '123',
      title: 'Q4 Financial Report',
      content: 'Revenue increased by 25% compared to Q3...',
      createdAt: Date.now() - 86400000, // 1 day ago
      createdBy: 'user-1', // admin user
    },
  ],
  [
    '456',
    {
      id: '456',
      title: 'Security Audit Results',
      content: 'All systems passed security audit...',
      createdAt: Date.now() - 172800000, // 2 days ago
      createdBy: 'user-2', // regular user
    },
  ],
  [
    '789',
    {
      id: '789',
      title: 'Product Roadmap 2025',
      content: 'Planned features for next year...',
      createdAt: Date.now() - 259200000, // 3 days ago
      createdBy: 'user-1',
    },
  ],
]);

/**
 * Create mock service
 */
async function createMockService() {
  const app = Fastify({
    loggerInstance: logger,
  });

  /**
   * GET /healthz
   * Health check
   */
  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'mock-upstream',
    timestamp: Date.now(),
  }));

  /**
   * GET /echo
   * Echo endpoint for testing proxy
   */
  app.get<{ Querystring: { message?: string } }>('/echo', async (request) => {
    const message = request.query.message || 'Hello from upstream!';

    return {
      message,
      timestamp: Date.now(),
      upstream: 'mock-service',
    };
  });

  /**
   * GET /reports/:id
   * Get report by ID
   */
  app.get<{ Params: { id: string } }>('/reports/:id', async (request, reply) => {
    const { id } = request.params;

    const report = reports.get(id);

    if (!report) {
      return reply.status(404).send({
        error: 'Report not found',
      });
    }

    return report;
  });

  /**
   * GET /reports
   * List all reports (for testing)
   */
  app.get('/reports', async () => {
    return {
      reports: Array.from(reports.values()),
      count: reports.size,
    };
  });

  /**
   * Simulate slow endpoint (for timeout testing)
   */
  app.get('/slow', async () => {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 second delay
    return { message: 'Slow response' };
  });

  /**
   * Simulate error endpoint
   */
  app.get('/error', async (request, reply) => {
    return reply.status(500).send({
      error: 'Internal server error',
    });
  });

  return app;
}

/**
 * Start mock service
 */
async function start() {
  try {
    const app = await createMockService();

    await app.listen({
      port: PORT,
      host: HOST,
    });

    logger.info({ port: PORT, host: HOST }, 'Mock upstream service started');
  } catch (error) {
    logger.error({ error }, 'Failed to start mock service');
    process.exit(1);
  }
}

start();
