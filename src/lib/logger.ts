/**
 * Structured logging with Pino
 * Implements log redaction for sensitive data (tokens, passwords, etc.)
 * and request correlation via request IDs
 */

import pino from 'pino';
import { env } from '../config/index.js';

/**
 * Paths to redact from logs to prevent credential leakage
 * Covers common patterns for tokens, passwords, and secrets
 */
const REDACT_PATHS = [
  // Request headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  // Request body fields
  'req.body.password',
  'req.body.newPassword',
  'req.body.oldPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.secret',
  'req.body.apiKey',
  // Response body fields
  'res.body.password',
  'res.body.token',
  'res.body.refreshToken',
  'res.body.accessToken',
  'res.body.secret',
  // Query params
  'req.query.token',
  'req.query.apiKey',
  // User object (be careful not to log tokens)
  'user.password',
  'user.refreshToken',
  // Error stack traces in production (log them, but sanitize in output)
];

/**
 * Base logger instance with redaction and formatting
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  // Pretty print in development for readability
  transport: env.isDevelopment && env.LOG_PRETTY
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  // Production: JSON for log aggregation systems
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  // Redact sensitive fields
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  // Base fields
  base: {
    pid: process.pid,
    env: env.NODE_ENV,
  },
  // Timestamp
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with additional context
 * @param context - Additional fields to include in all log entries
 * @returns Child logger instance
 *
 * @example
 * const reqLogger = createLogger({ requestId: '123', userId: 'user-456' });
 * reqLogger.info('Processing request');
 */
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/**
 * Log request start
 * @param req - Request object
 */
export function logRequest(req: {
  method: string;
  url: string;
  headers: Record<string, unknown>;
  requestId: string;
}) {
  logger.info(
    {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'],
    },
    'Incoming request'
  );
}

/**
 * Log request completion
 * @param req - Request object
 * @param res - Response object
 * @param duration - Request duration in ms
 */
export function logResponse(
  req: { method: string; url: string; requestId: string },
  res: { statusCode: number },
  duration: number
) {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

  logger[level](
    {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
    },
    'Request completed'
  );
}

/**
 * Log application errors with context
 * @param error - Error object
 * @param context - Additional context
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error(
    {
      err: {
        message: error.message,
        name: error.name,
        // Only log stack traces in development
        stack: env.isDevelopment ? error.stack : undefined,
      },
      ...context,
    },
    'Error occurred'
  );
}

export default logger;
