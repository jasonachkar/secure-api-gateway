/**
 * Secure HTTP client for upstream service communication
 * Implements timeout, retry logic, and SSRF protection
 */

import { env } from '../config/index.js';
import { SSRFError, ServiceUnavailableError } from './errors.js';
import { logger } from './logger.js';
import dns from 'dns/promises';

/**
 * HTTP client options
 */
export interface HttpClientOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  validateHost?: boolean;
}

/**
 * HTTP request result
 */
export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

/**
 * Validate that a hostname is allowed for SSRF protection
 * Checks against allowlist and prevents private IP access
 * @param hostname - Target hostname
 * @throws SSRFError if host is not allowed
 */
async function validateHostname(hostname: string): Promise<void> {
  // Check allowlist
  const isAllowed = env.ALLOWED_UPSTREAM_HOSTS.some((allowed) => {
    return hostname === allowed || hostname.endsWith(`.${allowed}`);
  });

  if (!isAllowed) {
    logger.warn({ hostname }, 'SSRF attempt blocked: host not in allowlist');
    throw new SSRFError(`Host not allowed: ${hostname}`);
  }

  // Resolve hostname to IP addresses
  let addresses: string[];
  try {
    addresses = await dns.resolve4(hostname);
  } catch (error) {
    // If IPv4 fails, try IPv6
    try {
      addresses = await dns.resolve6(hostname);
    } catch {
      // Can't resolve - let the request fail naturally
      logger.warn({ hostname }, 'Failed to resolve hostname for SSRF check');
      return;
    }
  }

  // Check for private/internal IP addresses
  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      logger.warn({ hostname, ip }, 'SSRF attempt blocked: resolves to private IP');
      throw new SSRFError(`Host resolves to private IP: ${ip}`);
    }
  }
}

/**
 * Check if an IP address is private/internal
 * Blocks RFC 1918, loopback, link-local, and other special ranges
 * @param ip - IP address string
 * @returns True if IP is private/internal
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  const privateRanges = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^127\./, // 127.0.0.0/8 (loopback)
    /^169\.254\./, // 169.254.0.0/16 (link-local)
    /^0\./, // 0.0.0.0/8
    /^224\./, // 224.0.0.0/4 (multicast)
    /^255\.255\.255\.255/, // broadcast
  ];

  // Check IPv6 private/special ranges
  if (ip.includes(':')) {
    return (
      ip.startsWith('::1') || // loopback
      ip.startsWith('fe80:') || // link-local
      ip.startsWith('fc00:') || // unique local
      ip.startsWith('fd00:') // unique local
    );
  }

  return privateRanges.some((range) => range.test(ip));
}

/**
 * Secure HTTP GET request
 * @param url - Target URL
 * @param options - Request options
 * @returns HTTP response
 */
export async function httpGet<T = unknown>(
  url: string,
  options: HttpClientOptions = {}
): Promise<HttpResponse<T>> {
  const { timeout = env.UPSTREAM_TIMEOUT, retries = env.UPSTREAM_RETRY_ATTEMPTS, headers = {}, validateHost = true } = options;

  // Parse URL
  const parsedUrl = new URL(url);

  // SSRF protection: validate hostname
  if (validateHost) {
    await validateHostname(parsedUrl.hostname);
  }

  // Implement retry logic with exponential backoff
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'SecureAPIGateway/1.0',
          ...headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Parse response
      const contentType = response.headers.get('content-type');
      const data = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();

      // Convert headers to object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        data: data as T,
        headers: responseHeaders,
      };
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn({ url, attempt, timeout }, 'Upstream request timeout');
        break;
      }

      // Exponential backoff before retry
      if (attempt < retries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.info({ url, attempt, backoff }, 'Retrying upstream request');
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  // All retries exhausted
  logger.error({ url, error: lastError }, 'Upstream request failed after retries');
  throw new ServiceUnavailableError('Upstream service unavailable', parsedUrl.hostname);
}

/**
 * Secure HTTP POST request
 * @param url - Target URL
 * @param body - Request body
 * @param options - Request options
 * @returns HTTP response
 */
export async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  options: HttpClientOptions = {}
): Promise<HttpResponse<T>> {
  const { timeout = env.UPSTREAM_TIMEOUT, retries = env.UPSTREAM_RETRY_ATTEMPTS, headers = {}, validateHost = true } = options;

  // Parse URL
  const parsedUrl = new URL(url);

  // SSRF protection: validate hostname
  if (validateHost) {
    await validateHostname(parsedUrl.hostname);
  }

  // Implement retry logic
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'SecureAPIGateway/1.0',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      const data = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        status: response.status,
        data: data as T,
        headers: responseHeaders,
      };
    } catch (error) {
      lastError = error as Error;

      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn({ url, attempt, timeout }, 'Upstream request timeout');
        break;
      }

      if (attempt < retries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 5000);
        logger.info({ url, attempt, backoff }, 'Retrying upstream request');
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  logger.error({ url, error: lastError }, 'Upstream request failed after retries');
  throw new ServiceUnavailableError('Upstream service unavailable', parsedUrl.hostname);
}
