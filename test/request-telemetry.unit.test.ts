import Fastify from 'fastify';
import { getRecentRequests, registerRequestTelemetry } from '../src/lib/requestTelemetry.js';
import { requestIdHook } from '../src/middleware/requestId.js';

describe('request telemetry evidence identifiers', () => {
  it('captures the gateway request ID and trusted client IP for Traffic Explorer evidence', async () => {
    const app = Fastify();
    registerRequestTelemetry(app);
    app.addHook('onRequest', requestIdHook);
    app.get('/telemetry-evidence', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/telemetry-evidence',
      remoteAddress: '203.0.113.24',
    });

    const captured = getRecentRequests(20).find((entry) => entry.path === '/telemetry-evidence');
    expect(captured).toMatchObject({
      requestId: response.headers['x-request-id'],
      sourceIp: '203.0.113.24',
      method: 'GET',
      statusCode: 200,
    });

    await app.close();
  });
});
