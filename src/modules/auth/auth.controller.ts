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
import { verifyToken } from '../../middleware/auth.js';
import { env } from '../../config/index.js';
import { UnauthorizedError, AccountLockedError, InvalidCredentialsError } from '../../lib/errors.js';
import { evaluateGatewayCredentialAttack, type AuthSecurityPipeline } from '../security/gateway-detection.js';

export type { AuthSecurityPipeline } from '../security/gateway-detection.js';

/**
 * Authentication controller
 */
export class AuthController {
  constructor(
    private authService: AuthService,
    private auditService: AuditService,
    private securityPipeline?: AuthSecurityPipeline
  ) {}

  /**
   * Feed a real account-lockout event through the live detection pipeline
   * (GW-AUTH-001). Optional pipeline so AuthController keeps working in any
   * context that doesn't construct the security control plane (e.g. tests).
   */
  private async evaluateGatewayCredentialAttack(params: { username: string; ip: string }): Promise<void> {
    if (!this.securityPipeline) return;
    await evaluateGatewayCredentialAttack(this.securityPipeline, {
      username: params.username,
      ip: params.ip,
      failedLoginCount: env.auth.maxLoginAttempts,
    });
  }

  /**
   * POST /auth/demo-login
   * One-click read-only reviewer entry point: authenticates as the fixed
   * "reviewer" demo account server-side. The caller never sees or supplies
   * a password - the account itself carries no write privileges beyond
   * running the allowlisted guided scenarios (see ROLES.reviewer).
   */
  async demoLogin(request: FastifyRequest, reply: FastifyReply) {
    const ip = getClientIp(request);
    const requestId = getRequestId(request);

    const { accessToken, refreshToken, expiresIn, user } = await this.authService.login(
      'reviewer',
      'Reviewer123!',
      ip
    );

    await this.auditService.logLoginSuccess({
      userId: user.userId,
      username: user.username,
      ip,
      requestId,
    });

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.server.isProduction,
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 60 * 60 * 24 * 7,
    });

    return { accessToken, expiresIn, tokenType: 'Bearer' };
  }

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
        secure: env.server.isProduction, // HTTPS only in production
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
        await this.evaluateGatewayCredentialAttack({ username, ip });
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
        await this.authService.refresh(refreshToken, ip);

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
        secure: env.server.isProduction,
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

    // Also revoke the access token in hand (if any) so it can't be reused
    // for the remainder of its 15-minute lifetime after logout
    if (user?.jti) {
      await this.authService.revokeAccessToken(user.jti);
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
