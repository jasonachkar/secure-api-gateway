/**
 * Proxy service
 * Demonstrates secure proxying to upstream services with SSRF protection
 */

import { httpGet, httpPost } from '../../lib/httpClient.js';
import { env } from '../../config/index.js';
import { logger } from '../../lib/logger.js';

/**
 * Proxy service
 */
export class ProxyService {
  /**
   * Proxy GET request to upstream echo endpoint
   * Demonstrates SSRF protection and safe proxying
   */
  async echo(message: string): Promise<{ message: string; timestamp: number }> {
    logger.debug({ message }, 'Proxying to upstream echo service');

    // Call upstream service (SSRF protection applied in httpGet)
    const response = await httpGet<{ message: string; timestamp: number }>(
      `${env.UPSTREAM_REPORTS_URL}/echo?message=${encodeURIComponent(message)}`
    );

    return response.data;
  }

  /**
   * Proxy POST request to upstream
   * Demonstrates request transformation and header sanitization
   */
  async proxyPost(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
    // Sanitize headers: remove sensitive gateway headers before forwarding
    const sanitizedHeaders = this.sanitizeHeaders(headers);

    logger.debug({ path }, 'Proxying POST to upstream service');

    // Forward request to upstream
    const response = await httpPost(
      `${env.UPSTREAM_REPORTS_URL}${path}`,
      body,
      { headers: sanitizedHeaders }
    );

    return response.data;
  }

  /**
   * Sanitize headers before forwarding to upstream
   * Removes sensitive gateway-specific headers
   *
   * @param headers - Original headers
   * @returns Sanitized headers
   */
  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };

    // Remove sensitive headers that should not be forwarded
    const headersToRemove = [
      'authorization', // Don't forward gateway auth to upstream
      'cookie',
      'x-api-key',
      'x-forwarded-for',
      'x-real-ip',
      'host', // Set by httpClient
    ];

    headersToRemove.forEach((header) => {
      delete sanitized[header];
      delete sanitized[header.toLowerCase()];
    });

    return sanitized;
  }
}
