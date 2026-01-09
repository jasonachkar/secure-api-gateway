/**
 * Role-Based Access Control (RBAC) middleware
 * Enforces role and permission-based authorization
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { AuthUser } from '../types/index.js';
import { logger } from '../lib/logger.js';
import { getClientIp, getRequestId } from '../lib/requestContext.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { AuditEventType } from '../modules/audit/audit.types.js';

/**
 * Helper to log permission denied to audit service
 */
async function logPermissionDenied(
  request: FastifyRequest,
  user: AuthUser,
  requiredPermission?: string,
  resource?: string
) {
  const auditService = (request.server as any).audit as AuditService | undefined;
  if (!auditService) return;

  try {
    await auditService.logPermissionDenied({
      userId: user.userId,
      username: user.username,
      ip: getClientIp(request),
      requestId: getRequestId(request),
      resource: resource || request.url,
      action: request.method,
      requiredPermission,
    });
  } catch (error) {
    // Don't fail the request if audit logging fails
    logger.error({ error }, 'Failed to log permission denied to audit service');
  }
}

/**
 * Check if user has required role
 * @param user - Authenticated user
 * @param requiredRole - Required role
 * @returns True if user has role
 */
export function hasRole(user: AuthUser, requiredRole: string): boolean {
  return user.roles.includes(requiredRole);
}

/**
 * Check if user has any of the required roles
 * @param user - Authenticated user
 * @param requiredRoles - Array of acceptable roles
 * @returns True if user has at least one role
 */
export function hasAnyRole(user: AuthUser, requiredRoles: string[]): boolean {
  return requiredRoles.some((role) => user.roles.includes(role));
}

/**
 * Check if user has all required roles
 * @param user - Authenticated user
 * @param requiredRoles - Array of required roles
 * @returns True if user has all roles
 */
export function hasAllRoles(user: AuthUser, requiredRoles: string[]): boolean {
  return requiredRoles.every((role) => user.roles.includes(role));
}

/**
 * Check if user has required permission
 * @param user - Authenticated user
 * @param requiredPermission - Required permission (e.g., "read:reports")
 * @returns True if user has permission
 */
export function hasPermission(user: AuthUser, requiredPermission: string): boolean {
  return user.permissions.includes(requiredPermission);
}

/**
 * Check if user has any of the required permissions
 * @param user - Authenticated user
 * @param requiredPermissions - Array of acceptable permissions
 * @returns True if user has at least one permission
 */
export function hasAnyPermission(user: AuthUser, requiredPermissions: string[]): boolean {
  return requiredPermissions.some((permission) => user.permissions.includes(permission));
}

/**
 * Check if user has all required permissions
 * @param user - Authenticated user
 * @param requiredPermissions - Array of required permissions
 * @returns True if user has all permissions
 */
export function hasAllPermissions(user: AuthUser, requiredPermissions: string[]): boolean {
  return requiredPermissions.every((permission) => user.permissions.includes(permission));
}

/**
 * Middleware to require specific role
 * Use after authentication middleware
 *
 * @param requiredRole - Required role name
 * @returns Fastify preHandler hook
 *
 * @example
 * app.get('/admin/users', {
 *   preHandler: [requireAuth, requireRole('admin')]
 * }, handler);
 */
export function requireRole(requiredRole: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as AuthUser | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasRole(user, requiredRole)) {
      logger.warn(
        {
          requestId: (request as any).requestId,
          userId: user.userId,
          requiredRole,
          userRoles: user.roles,
        },
        'Access denied: insufficient role'
      );

      await logPermissionDenied(request, user, `role:${requiredRole}`);

      throw new ForbiddenError(`Required role: ${requiredRole}`);
    }
  };
}

/**
 * Middleware to require any of the specified roles
 *
 * @param requiredRoles - Array of acceptable roles
 * @returns Fastify preHandler hook
 *
 * @example
 * app.get('/reports', {
 *   preHandler: [requireAuth, requireAnyRole(['admin', 'user'])]
 * }, handler);
 */
export function requireAnyRole(requiredRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as AuthUser | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasAnyRole(user, requiredRoles)) {
      logger.warn(
        {
          requestId: (request as any).requestId,
          userId: user.userId,
          requiredRoles,
          userRoles: user.roles,
        },
        'Access denied: insufficient role'
      );

      throw new ForbiddenError(`Required one of roles: ${requiredRoles.join(', ')}`);
    }
  };
}

/**
 * Middleware to require specific permission
 * Use after authentication middleware
 *
 * @param requiredPermission - Required permission (e.g., "read:reports")
 * @returns Fastify preHandler hook
 *
 * @example
 * app.get('/reports/:id', {
 *   preHandler: [requireAuth, requirePermission('read:reports')]
 * }, handler);
 */
export function requirePermission(requiredPermission: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as AuthUser | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasPermission(user, requiredPermission)) {
      logger.warn(
        {
          requestId: (request as any).requestId,
          userId: user.userId,
          requiredPermission,
          userPermissions: user.permissions,
        },
        'Access denied: insufficient permission'
      );

      await logPermissionDenied(request, user, requiredPermission);

      throw new ForbiddenError(`Required permission: ${requiredPermission}`, requiredPermission);
    }
  };
}

/**
 * Middleware to require any of the specified permissions
 *
 * @param requiredPermissions - Array of acceptable permissions
 * @returns Fastify preHandler hook
 *
 * @example
 * app.post('/reports', {
 *   preHandler: [requireAuth, requireAnyPermission(['write:reports', 'manage:reports'])]
 * }, handler);
 */
export function requireAnyPermission(requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as AuthUser | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasAnyPermission(user, requiredPermissions)) {
      logger.warn(
        {
          requestId: (request as any).requestId,
          userId: user.userId,
          requiredPermissions,
          userPermissions: user.permissions,
        },
        'Access denied: insufficient permission'
      );

      await logPermissionDenied(request, user, requiredPermissions[0]);

      throw new ForbiddenError(
        `Required one of permissions: ${requiredPermissions.join(', ')}`,
        requiredPermissions[0]
      );
    }
  };
}

/**
 * Middleware to require all specified permissions
 *
 * @param requiredPermissions - Array of required permissions
 * @returns Fastify preHandler hook
 */
export function requireAllPermissions(requiredPermissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user as AuthUser | undefined;

    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!hasAllPermissions(user, requiredPermissions)) {
      logger.warn(
        {
          requestId: (request as any).requestId,
          userId: user.userId,
          requiredPermissions,
          userPermissions: user.permissions,
        },
        'Access denied: insufficient permissions'
      );

      await logPermissionDenied(request, user, requiredPermissions[0]);

      throw new ForbiddenError(
        `Required all permissions: ${requiredPermissions.join(', ')}`,
        requiredPermissions[0]
      );
    }
  };
}
