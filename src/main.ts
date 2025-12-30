/**
 * Application entry point
 * Starts the Fastify server
 */

import { createApp } from './app.js';
import { env } from './config/index.js';
import { logger } from './lib/logger.js';

/**
 * Start server
 */
async function start() {
  try {
    // Create app
    const app = await createApp();

    // Start listening
    await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    logger.info(
      {
        port: env.PORT,
        host: env.HOST,
        env: env.NODE_ENV,
        swagger: env.ENABLE_SWAGGER ? `http://localhost:${env.PORT}/docs` : 'disabled',
      },
      'Server started successfully'
    );

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      try {
        await app.close();
        logger.info('Server closed gracefully');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
start();
