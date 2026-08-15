import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { AuthUser } from '../types/index.js';

/**
 * True only for the public, read-only reviewer identity. Administrators keep the
 * complete operator view even if they also happen to carry another role.
 */
export function isReadOnlyReviewer(request: FastifyRequest): boolean {
  const user = (request as any).user as AuthUser | undefined;
  return Boolean(user?.roles.includes('reviewer') && !user.roles.includes('admin'));
}

/**
 * Stable RFC 5737 documentation address used in public reviewer responses.
 * Stability preserves filtering/correlation without disclosing the source IP.
 */
export function reviewerIpAlias(ip: string): string {
  const digest = createHash('sha256').update(`reviewer-ip:${ip}`).digest();
  return `192.0.2.${(digest[0] % 254) + 1}`;
}

/** Stable, non-reversible display identifier for a sensitive session token ID. */
export function reviewerSessionAlias(jti: string): string {
  const digest = createHash('sha256').update(`reviewer-session:${jti}`).digest('hex');
  return `reviewer-session-${digest.slice(0, 12)}`;
}
