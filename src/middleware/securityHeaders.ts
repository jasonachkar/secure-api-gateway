/**
 * Security headers middleware
 * Implements secure HTTP headers following OWASP recommendations
 * Uses @fastify/helmet for comprehensive header management
 */

import { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import { env } from '../config/index.js';

/**
 * Register security headers plugin
 * Configured for production security with development overrides
 */
export async function registerSecurityHeaders(app: FastifyInstance) {
  await app.register(helmet, {
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline for Swagger UI in dev
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },

    // HTTP Strict Transport Security (HSTS)
    // Force HTTPS for 1 year in production
    hsts: env.isProduction
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false, // Disabled in dev (no HTTPS)

    // Prevent MIME type sniffing
    noSniff: true,

    // X-Frame-Options: prevent clickjacking
    frameguard: {
      action: 'deny',
    },

    // Referrer Policy: control referrer information
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin',
    },

    // Permissions Policy (formerly Feature Policy)
    // Note: Commented out due to API changes in newer helmet versions
    // permissionsPolicy: {
    //   features: {
    //     camera: ["'none'"],
    //     microphone: ["'none'"],
    //     geolocation: ["'none'"],
    //     payment: ["'none'"],
    //   },
    // },

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Download-Options for IE8+
    ieNoOpen: true,

    // Remove X-Powered-By header
    hidePoweredBy: true,
  });
}
