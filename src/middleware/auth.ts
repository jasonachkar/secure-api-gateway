/**
 * JWT authentication middleware
 * Validates JWT tokens and attaches user to request
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { type SignOptions, type Secret } from 'jsonwebtoken';
import { env } from '../config/index.js';
import {
  UnauthorizedError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
} from '../lib/errors.js';
import { JWTPayload, AuthUser } from '../types/index.js';
import { logger } from '../lib/logger.js';
import { getClientIp } from '../lib/requestContext.js';
import { parseGatewayEvent } from '../modules/ingestion/parsers/gateway.parser.js';
import type { SecurityIngestionPipelineDeps } from '../modules/ingestion/security-ingestion.pipeline.js';

/**
 * Feed a real JWT verification failure (GW-TOKEN-001) through the canonical pipeline.
 * Best-effort: errors are logged, never thrown, so this can never turn a 401 into a 500.
 * Never includes the raw token or any header content - only route/method/error-class
 * metadata, matching parser/rule expectations that gateway events carry no credentials.
 * The canonical pipeline deps are read off `request.server` (decorated once in app.ts,
 * shared with every other route) rather than threaded through every requireAuth call
 * site, so this stays a drop-in preHandler with an unchanged signature.
 */
async function evaluateTokenFailure(
  request: FastifyRequest,
  params: { action: string; title: string; summary: string }
): Promise<void> {
  const server = request.server as unknown as Partial<SecurityIngestionPipelineDeps>;
  if (
    !server.securityEventStore ||
    !server.detectionEngine ||
    !server.detectionStore ||
    !server.investigationService ||
    !server.pipelineMetrics
  ) {
    return; // no security control plane wired (e.g. some test contexts) - skip silently
  }

  try {
    const routePath = request.routeOptions?.url ?? request.url;
    // Routine expiry never gets the privileged-route escalation, on any route - it's
    // benign/expected regardless of route sensitivity (see gw-token-001.ts's own
    // exclusion of plain expiry), so tagging it 'privileged_jwt_failure' here would
    // silently defeat that exclusion for every admin-route request with a stale token.
    const isPrivilegedRoute = params.action !== 'jwt.expired' && routePath.startsWith('/admin/');
    const action = isPrivilegedRoute ? `privileged_jwt_failure:${params.action}` : params.action;

    const event = parseGatewayEvent(
      {
        action,
        providerEventId: `gw-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        occurredAt: new Date().toISOString(),
        outcome: 'failure',
        category: 'authentication',
        severity: isPrivilegedRoute ? 'critical' : 'high',
        title: params.title,
        summary: `${params.summary} (${request.method} ${routePath})`,
        sourceIp: getClientIp(request),
      },
      'live'
    );

    const { event: saved, duplicate } = await server.securityEventStore.saveEvent(event);
    await server.pipelineMetrics.recordIngested('gateway');
    if (duplicate) {
      await server.pipelineMetrics.recordDuplicate();
      return;
    }

    const detections = await server.detectionEngine.evaluate(saved, {});
    await server.detectionStore.saveAll(detections);
    for (const detection of detections) {
      await server.investigationService.correlate(saved, detection);
    }
  } catch (error) {
    logger.error({ error }, 'Failed to evaluate gateway token-failure detection');
  }
}

/**
 * Extract JWT token from Authorization header
 * Supports "Bearer <token>" format
 * @param request - Fastify request
 * @returns JWT token string or null
 */
function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return null;
  }

  // Check for Bearer scheme
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Verify and decode JWT token
 * @param token - JWT token string
 * @returns Decoded payload
 * @throws TokenExpiredError, TokenInvalidError
 */
export function verifyToken(token: string): JWTPayload {
  try {
    // Choose verification key based on algorithm
    const secret = env.auth.jwt.algorithm === 'RS256' ? env.auth.jwt.publicKey! : env.auth.jwt.secret!;

    const decoded = jwt.verify(token, secret, {
      algorithms: [env.auth.jwt.algorithm],
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenExpiredError();
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new TokenInvalidError(error.message);
    }
    throw new TokenInvalidError();
  }
}

/**
 * Generate JWT access token
 * @param user - User data
 * @param jti - JWT ID for revocation
 * @returns Signed JWT token
 */
export function generateAccessToken(user: Omit<AuthUser, 'jti'>, jti: string): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: user.userId,
    username: user.username,
    roles: user.roles,
    permissions: user.permissions,
    jti,
    type: 'access',
  };

  // Choose signing key based on algorithm
  const secret = (env.auth.jwt.algorithm === 'RS256'
    ? env.auth.jwt.privateKey!
    : env.auth.jwt.secret!) as Secret;
  const expiresIn = env.auth.jwt.accessTokenExpiresIn as SignOptions['expiresIn'];

  return jwt.sign(payload, secret, {
    algorithm: env.auth.jwt.algorithm,
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Generate JWT refresh token
 * @param user - User data
 * @param jti - JWT ID for revocation
 * @returns Signed JWT token
 */
export function generateRefreshToken(user: Omit<AuthUser, 'jti'>, jti: string): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    sub: user.userId,
    username: user.username,
    roles: user.roles,
    permissions: user.permissions,
    jti,
    type: 'refresh',
  };

  const secret = (env.auth.jwt.algorithm === 'RS256'
    ? env.auth.jwt.privateKey!
    : env.auth.jwt.secret!) as Secret;
  const expiresIn = env.auth.jwt.refreshTokenExpiresIn as SignOptions['expiresIn'];

  return jwt.sign(payload, secret, {
    algorithm: env.auth.jwt.algorithm,
    expiresIn,
  } as jwt.SignOptions);
}

/**
 * Authentication middleware (required)
 * Validates JWT token and attaches user to request
 * Returns 401 if token is missing or invalid
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request);

  if (!token) {
    throw new UnauthorizedError('Missing authentication token');
  }

  // Verify token
  let payload: JWTPayload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      // Generates a canonical event (pipeline evidence) but deliberately does not match
      // GW-TOKEN-001 - see the rule's own comment for why routine expiry isn't alerted on.
      // Awaited (not fire-and-forget): the detection write must land before the 401 is
      // sent, so evidence is never racing the response - a failed/incomplete write is
      // swallowed internally by evaluateTokenFailure's own try/catch either way.
      await evaluateTokenFailure(request, {
        action: 'jwt.expired',
        title: 'Expired JWT presented',
        summary: 'Access token verification failed: expired',
      });
    } else {
      const message = error instanceof TokenInvalidError ? error.message : '';
      const tampered = /signature/i.test(message);
      await evaluateTokenFailure(request, {
        action: tampered ? 'jwt.tampered' : 'jwt.invalid',
        title: tampered ? 'Tampered JWT (invalid signature) presented' : 'Invalid or malformed JWT presented',
        summary: `Access token verification failed: ${message || 'invalid token'}`,
      });
    }
    throw error;
  }

  // Check token type
  if (payload.type !== 'access') {
    await evaluateTokenFailure(request, {
      action: 'token.invalid_type',
      title: 'Invalid JWT token type presented',
      summary: `A "${payload.type}" token was presented where an access token is required`,
    });
    throw new TokenInvalidError('Invalid token type');
  }

  // Check if token was explicitly revoked (logout, or reuse-detection blacklisting
  // its whole token family) - short-lived access tokens otherwise rely on expiry alone
  const tokenStore = request.server.tokenStore;
  if (tokenStore && (await tokenStore.isRevoked(payload.jti))) {
    logger.warn({ jti: payload.jti }, 'Attempted to use revoked access token');
    // jti (JWT ID) is a random identifier, not the token itself - safe to record, same
    // as the existing logger.warn above.
    await evaluateTokenFailure(request, {
      action: 'token.revoked',
      title: 'Revoked access token reuse attempt',
      summary: `A revoked access token (jti ${payload.jti}) was presented`,
    });
    throw new TokenRevokedError();
  }

  // Attach user to request
  const user: AuthUser = {
    userId: payload.sub,
    username: payload.username,
    roles: payload.roles,
    permissions: payload.permissions,
    jti: payload.jti,
  };

  (request as any).user = user;

  // Log authentication for audit trail
  logger.debug(
    {
      requestId: (request as any).requestId,
      userId: user.userId,
      username: user.username,
    },
    'User authenticated'
  );
}

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't require it
 * Useful for endpoints that have different behavior for authenticated users
 */
export async function optionalAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = extractToken(request);

  if (!token) {
    // No token provided, continue without user
    return;
  }

  try {
    const payload = verifyToken(token);

    if (payload.type === 'access') {
      const user: AuthUser = {
        userId: payload.sub,
        username: payload.username,
        roles: payload.roles,
        permissions: payload.permissions,
        jti: payload.jti,
      };

      (request as any).user = user;
    }
  } catch (error) {
    // Invalid token, but since it's optional, we continue without user
    logger.debug({ error }, 'Optional auth failed, continuing without user');
  }
}
