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
   * Feed every failed login attempt - not just the final lockout - through the live
   * detection pipeline (GW-AUTH-001), with the real measured failure count and distinct
   * source-IP count for this account (gateway-auth-tracker.ts), not a hardcoded
   * threshold value. This is what lets GW-AUTH-001 actually detect a concentrated attack
   * before lockout is reached, and a distributed attack (many source IPs against one
   * account) at all - a rule that only ever saw a single post-lockout event with a fixed
   * failedLoginCount could never legitimately claim either. Optional pipeline so
   * AuthController keeps working in any context that doesn't construct the security
   * control plane (e.g. tests).
   */
  private async evaluateGatewayCredentialAttack(params: {
    username: string;
    ip: string;
    lockedOut: boolean;
  }): Promise<void> {
    if (!this.securityPipeline?.gatewayAuthTracker) return;
    const signal = await this.securityPipeline.gatewayAuthTracker.recordFailure(params.username, params.ip);
    await evaluateGatewayCredentialAttack(this.securityPipeline, {
      username: params.username,
      ip: params.ip,
      failedLoginCount: signal.failedLoginCount,
      distinctSourceIps: signal.distinctSourceIps,
      action: params.lockedOut ? 'gateway.account_lockout' : 'gateway.login_failed',
      title: params.lockedOut ? 'Gateway account lockout' : 'Gateway authentication failure',
      summary: params.lockedOut
        ? `Account "${params.username}" locked after ${signal.failedLoginCount} failed logins across ${signal.distinctSourceIps} source IP(s)`
        : `Failed login attempt against account "${params.username}" (${signal.failedLoginCount} in the current window across ${signal.distinctSourceIps} source IP(s))`,
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
      // Clean slate for the GW-AUTH-001 detection signal, mirroring the lockout
      // counter's own reset-on-success behavior (auth.service.ts) - proven legitimate
      // access shouldn't leave a stale failure count primed to fire on a later,
      // unrelated failed attempt.
      await this.securityPipeline?.gatewayAuthTracker?.reset(username);

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
        await this.evaluateGatewayCredentialAttack({ username, ip, lockedOut: true });
      } else if (error instanceof InvalidCredentialsError) {
        await this.auditService.logLoginFailure({
          username,
          ip,
          requestId,
          reason: 'Invalid credentials',
        });
        await this.evaluateGatewayCredentialAttack({ username, ip, lockedOut: false });
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
