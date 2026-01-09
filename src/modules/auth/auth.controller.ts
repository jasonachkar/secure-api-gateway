/**
 * Authentication controller
 * Handles HTTP requests for auth endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditEventType } from '../audit/audit.types.js';
import { LoginRequest } from './auth.schemas.js';
import { getClientIp, getRequestId } from '../../lib/requestContext.js';
import { env } from '../../config/index.js';
import { UnauthorizedError, AccountLockedError, InvalidCredentialsError } from '../../lib/errors.js';

/**
 * Authentication controller
 */
export class AuthController {
  constructor(
    private authService: AuthService,
    private auditService: AuditService
  ) {}

  /**
   * POST /auth/login
   * Authenticate user and return access token + set refresh token cookie
   */
  async login(
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply
  ) {
    const { username, password } = request.body;
    const ip = getClientIp(request);
    const requestId = getRequestId(request);

    try {
      // Authenticate user
      const { accessToken, refreshToken, expiresIn, user } = await this.authService.login(
        username,
        password,
        ip
      );

      // Log successful login
      await this.auditService.logLoginSuccess({
        userId: user.userId,
        username: user.username,
        ip,
        requestId,
      });

      // Set refresh token as httpOnly cookie
      reply.setCookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: env.isProduction, // HTTPS only in production
        sameSite: 'strict',
        path: '/auth/refresh', // Only send to refresh endpoint
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      // Return access token in response body
      return {
        accessToken,
        expiresIn,
        tokenType: 'Bearer',
      };
    } catch (error) {
      // Log failed login attempt
      if (error instanceof AccountLockedError) {
        await this.auditService.log({
          eventType: AuditEventType.ACCOUNT_LOCKED,
          username,
          ip,
          requestId,
          success: false,
          message: 'Account locked due to too many failed login attempts',
        });
      } else if (error instanceof InvalidCredentialsError) {
        await this.auditService.logLoginFailure({
          username,
          ip,
          requestId,
          reason: 'Invalid credentials',
        });
      } else {
        await this.auditService.logLoginFailure({
          username,
          ip,
          requestId,
          reason: error instanceof Error ? error.message : 'Login failed',
        });
      }
      throw error;
    }
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token from cookie
   */
  async refresh(request: FastifyRequest, reply: FastifyReply) {
    const ip = getClientIp(request);
    const requestId = getRequestId(request);

    // Extract refresh token from cookie
    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token not found');
    }

    try {
      // Refresh tokens - this will decode the token and return user info if available
      const { accessToken, refreshToken: newRefreshToken, expiresIn, user } =
        await this.authService.refresh(refreshToken);

      // Log token refresh
      await this.auditService.log({
        eventType: AuditEventType.TOKEN_REFRESH,
        userId: user?.userId,
        username: user?.username,
        ip,
        requestId,
        success: true,
        message: 'Access token refreshed successfully',
      });

      // Set new refresh token cookie (rotation)
      reply.setCookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: 'strict',
        path: '/auth/refresh',
        maxAge: 60 * 60 * 24 * 7,
      });

      // Return new access token
      return {
        accessToken,
        expiresIn,
        tokenType: 'Bearer',
      };
    } catch (error) {
      // Try to extract user info from token if possible
      let userId: string | undefined;
      let username: string | undefined;
      try {
        const { verifyToken } = await import('../../middleware/auth.js');
        const payload = verifyToken(refreshToken);
        userId = payload.sub;
        username = payload.username;
      } catch {
        // Ignore - can't decode token
      }

      // Log failed token refresh
      await this.auditService.log({
        eventType: AuditEventType.TOKEN_REFRESH,
        userId,
        username,
        ip,
        requestId,
        success: false,
        message: error instanceof Error ? error.message : 'Token refresh failed',
      });
      throw error;
    }
  }

  /**
   * POST /auth/logout
   * Revoke refresh token and clear cookie
   */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const ip = getClientIp(request);
    const requestId = getRequestId(request);
    const user = (request as any).user;
    const refreshToken = request.cookies.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Log logout
    await this.auditService.log({
      eventType: AuditEventType.LOGOUT,
      userId: user?.userId,
      username: user?.username,
      ip,
      requestId,
      success: true,
      message: 'User logged out successfully',
    });

    // Clear refresh token cookie
    reply.clearCookie('refreshToken', {
      path: '/auth/refresh',
    });

    return {
      message: 'Logged out successfully',
    };
  }
}
