/**
 * Secure HTTP client for upstream service communication
 * Implements timeout, retry logic, DNS-pinned SSRF protection, and a circuit breaker
 */

import { Agent, type Dispatcher } from 'undici';
import { env } from '../config/index.js';
import { SSRFError, ServiceUnavailableError } from './errors.js';
import { logger } from './logger.js';
import { CircuitBreaker } from './circuitBreaker.js';
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
 * Shared circuit breaker across all upstream calls made through this client
 */
export const upstreamCircuitBreaker = new CircuitBreaker({
  failureThreshold: env.upstream.circuitBreaker.failureThreshold,
  cooldownMs: env.upstream.circuitBreaker.cooldownMs,
});

/**
 * Resolve and validate a hostname for SSRF protection.
 * Checks against the allowlist and rejects hostnames that resolve to private/internal IPs.
 *
 * @param hostname - Target hostname
 * @returns Validated IP addresses (empty if DNS resolution itself failed - caller lets the
 *   request fail naturally in that case, same as before)
 * @throws SSRFError if the host is not allowlisted or resolves to a private IP
 */
async function resolveAndValidateHostname(hostname: string): Promise<string[]> {
  // Check allowlist
  const isAllowed = env.upstream.allowedHosts.some((allowed) => {
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
  } catch {
    // If IPv4 fails, try IPv6
    try {
      addresses = await dns.resolve6(hostname);
    } catch {
      // Can't resolve - let the request fail naturally
      logger.warn({ hostname }, 'Failed to resolve hostname for SSRF check');
      return [];
    }
  }

  // Check for private/internal IP addresses. Skipped only when SSRF_ALLOW_PRIVATE_IPS
  // is set (local Docker Compose dev, where the upstream legitimately lives on a
  // private container-network IP) - env.ts refuses this flag outright in production.
  if (!env.upstream.allowPrivateIps) {
    for (const ip of addresses) {
      if (isPrivateIp(ip)) {
        logger.warn({ hostname, ip }, 'SSRF attempt blocked: resolves to private IP');
        throw new SSRFError(`Host resolves to private IP: ${ip}`);
      }
    }
  }

  return addresses;
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
 * Build a dispatcher that pins the TCP connection to the already-validated IP
 * addresses for `hostname`, instead of letting undici re-resolve DNS itself.
 *
 * Without this, the SSRF check above and the actual outbound connection race
 * independently: an attacker controlling DNS for an allowlisted hostname could
 * answer safely for our validation lookup and then rebind to a private IP for
 * the real connection a moment later (DNS-rebinding TOCTOU). Pinning closes
 * that window entirely - only the IP(s) we already vetted are ever dialed.
 * The original hostname is still used for the Host header / TLS SNI.
 */
function createPinnedDispatcher(hostname: string, validatedAddresses: string[]): Dispatcher {
  return new Agent({
    connect: {
      // undici's LookupFunction type is stricter than we need here; the shape below
      // matches Node's dns.lookup callback contract that undici actually calls.
      lookup: ((host: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
        if (host !== hostname) {
          callback(new Error(`Refusing DNS lookup for unexpected host "${host}"`));
          return;
        }

        const results = validatedAddresses.map((address) => ({
          address,
          family: address.includes(':') ? 6 : 4,
        }));

        if (options?.all) {
          callback(null, results);
        } else {
          callback(null, results[0].address, results[0].family);
        }
      }) as any,
    },
  });
}

/**
 * Resolve + validate a hostname and build a pinned dispatcher for it in one step.
 * Returns undefined when DNS couldn't be resolved at all (validateHost=false skips
 * this entirely and undici falls back to its normal resolution behavior).
 */
async function buildRequestDispatcher(hostname: string, validateHost: boolean): Promise<Dispatcher | undefined> {
  if (!validateHost) {
    return undefined;
  }

  const validatedAddresses = await resolveAndValidateHostname(hostname);
  if (validatedAddresses.length === 0) {
    return undefined;
  }

  return createPinnedDispatcher(hostname, validatedAddresses);
}

interface ExecuteRequestParams {
  url: string;
  parsedUrl: URL;
  init: RequestInit & { dispatcher?: Dispatcher };
  timeout: number;
  retries: number;
}

/**
 * Shared fetch-with-retry-and-circuit-breaker execution used by both httpGet and httpPost
 */
async function executeRequest<T>({ url, parsedUrl, init, timeout, retries }: ExecuteRequestParams): Promise<HttpResponse<T>> {
  const host = parsedUrl.hostname;

  if (!upstreamCircuitBreaker.canRequest(host)) {
    logger.warn({ host }, 'Circuit breaker open - short-circuiting upstream request');
    throw new ServiceUnavailableError('Upstream service unavailable (circuit open)', host);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // A response - even an error one - means the upstream is reachable.
      // Only 5xx counts as a circuit-breaker failure; 4xx is the client's fault.
      if (response.status >= 500) {
        upstreamCircuitBreaker.recordFailure(host);
      } else {
        upstreamCircuitBreaker.recordSuccess(host);
      }

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
  upstreamCircuitBreaker.recordFailure(host);
  logger.error({ url, error: lastError }, 'Upstream request failed after retries');
  throw new ServiceUnavailableError('Upstream service unavailable', host);
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
  const { timeout = env.upstream.timeoutMs, retries = env.upstream.retryAttempts, headers = {}, validateHost = true } = options;

  const parsedUrl = new URL(url);
  const dispatcher = await buildRequestDispatcher(parsedUrl.hostname, validateHost);

  return executeRequest<T>({
    url,
    parsedUrl,
    timeout,
    retries,
    init: {
      method: 'GET',
      headers: {
        'User-Agent': 'SecureAPIGateway/1.0',
        ...headers,
      },
      ...(dispatcher ? { dispatcher } : {}),
    },
  });
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
  const { timeout = env.upstream.timeoutMs, retries = env.upstream.retryAttempts, headers = {}, validateHost = true } = options;

  const parsedUrl = new URL(url);
  const dispatcher = await buildRequestDispatcher(parsedUrl.hostname, validateHost);

  return executeRequest<T>({
    url,
    parsedUrl,
    timeout,
    retries,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SecureAPIGateway/1.0',
        ...headers,
      },
      body: JSON.stringify(body),
      ...(dispatcher ? { dispatcher } : {}),
    },
  });
}
