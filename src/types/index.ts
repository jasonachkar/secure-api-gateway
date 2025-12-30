/**
 * Shared TypeScript type definitions
 */

import { FastifyRequest } from 'fastify';

/**
 * User object attached to request after authentication
 */
export interface AuthUser {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  jti?: string; // JWT ID for token revocation
}

/**
 * JWT payload structure
 */
export interface JWTPayload {
  sub: string; // Subject (userId)
  username: string;
  roles: string[];
  permissions: string[];
  jti: string; // JWT ID
  type: 'access' | 'refresh';
  iat: number; // Issued at
  exp: number; // Expiration
}

/**
 * Refresh token metadata stored in Redis
 */
export interface RefreshTokenMetadata {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  jti: string;
  tokenHash: string; // SHA-256 hash of token
  family?: string; // Token family for rotation tracking
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

/**
 * Extended Fastify request with authenticated user
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: AuthUser;
}

/**
 * Permission configuration
 */
export interface PermissionConfig {
  resource: string;
  action: string;
}

/**
 * Role definition with permissions
 */
export interface Role {
  name: string;
  permissions: string[];
  description?: string;
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  max: number; // Maximum requests
  window: number; // Time window in ms
  keyGenerator?: (request: FastifyRequest) => string;
}
