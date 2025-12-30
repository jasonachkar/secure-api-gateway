/**
 * JWT authentication middleware
 * Validates JWT tokens and attaches user to request
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt, { type Algorithm, type SignOptions, type Secret } from 'jsonwebtoken';
import { env } from '../config/index.js';
import {
  UnauthorizedError,
  TokenExpiredError,
  TokenInvalidError,
  TokenRevokedError,
} from '../lib/errors.js';
import { JWTPayload, AuthUser } from '../types/index.js';
import { logger } from '../lib/logger.js';

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
    const secret = env.jwt.algorithm === 'RS256' ? env.jwt.publicKey! : env.jwt.secret!;

    const decoded = jwt.verify(token, secret, {
      algorithms: [env.jwt.algorithm],
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
  const secret = (env.jwt.algorithm === 'RS256'
    ? env.jwt.privateKey!
    : env.jwt.secret!) as Secret;
  const expiresIn = env.jwt.accessTokenExpiresIn as SignOptions['expiresIn'];

  return jwt.sign(payload, secret, {
    algorithm: env.jwt.algorithm,
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

  const secret = (env.jwt.algorithm === 'RS256'
    ? env.jwt.privateKey!
    : env.jwt.secret!) as Secret;
  const expiresIn = env.jwt.refreshTokenExpiresIn as SignOptions['expiresIn'];

  return jwt.sign(payload, secret, {
    algorithm: env.jwt.algorithm,
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
  const payload = verifyToken(token);

  // Check token type
  if (payload.type !== 'access') {
    throw new TokenInvalidError('Invalid token type');
  }

  // TODO: Check if token is revoked (implement token revocation store)
  // For now, we rely on expiration only

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
