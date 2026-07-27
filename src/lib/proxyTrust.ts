/**
 * Resolves the Fastify `trustProxy` option from the explicit proxy trust configuration
 * (env.security.proxyTrust - see config/env.ts and docs/PROXY_TRUST.md).
 *
 * This is the ONLY place `trustProxy` is computed. Every security decision that needs a
 * client IP reads it back out via `request.ip` (see lib/requestContext.ts#getClientIp) -
 * never by re-reading `X-Forwarded-For` directly, since that would reintroduce exactly
 * the spoofing/poisoning risk this module exists to prevent.
 */
import type { FastifyServerOptions } from 'fastify';
import { env } from '../config/index.js';
import { logger } from './logger.js';

export function resolveTrustProxyOption(): FastifyServerOptions['trustProxy'] {
  const { mode, hopCount, cidrs } = env.security.proxyTrust;

  switch (mode) {
    case 'none':
      // No proxy is trusted: request.ip is always the direct TCP peer address, and any
      // X-Forwarded-For sent by that peer is ignored entirely by Fastify's IP resolution.
      return false;

    case 'hopcount':
      // Trust exactly `hopCount` entries, counted from the right (nearest) end of
      // X-Forwarded-For - i.e. from the socket peer backwards through that many known
      // reverse proxies. Anything beyond that hop count is untrusted client input.
      return hopCount;

    case 'cidr':
      // Trust only forwarders whose address falls within one of these CIDRs/addresses;
      // fastify/proxy-addr walks the chain from the right and stops at the first hop
      // that doesn't match.
      return cidrs;

    case 'azure':
      // Preset: Azure Container Apps' front-end ingress adds exactly one X-Forwarded-For
      // hop before the container ever sees the request, so this is a fixed-hop-count
      // trust identical to "hopcount" with hopCount defaulting to 1. If a CDN/Front Door
      // is placed in front of Container Apps too, set PROXY_TRUST_HOP_COUNT accordingly.
      return hopCount;

    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled PROXY_TRUST_MODE: ${exhaustive as string}`);
    }
  }
}

/** Human-readable summary for startup logs and the Architecture & Evidence / health surfaces. */
export function describeTrustProxyConfig(): string {
  const { mode, hopCount, cidrs } = env.security.proxyTrust;
  switch (mode) {
    case 'none':
      return 'none (direct client only - X-Forwarded-For is ignored)';
    case 'hopcount':
      return `hopcount:${hopCount} (trusts the ${hopCount} proxy hop(s) nearest the server)`;
    case 'cidr':
      return `cidr:${cidrs.join(',') || '(none configured)'}`;
    case 'azure':
      return `azure (hopcount:${hopCount} - Container Apps ingress)`;
    default:
      return mode;
  }
}

export function logTrustProxyConfig(): void {
  logger.info({ proxyTrust: env.security.proxyTrust }, `Proxy trust: ${describeTrustProxyConfig()}`);
}
