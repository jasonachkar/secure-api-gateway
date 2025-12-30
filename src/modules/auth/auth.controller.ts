/**
 * Authentication controller
 * Handles HTTP requests for auth endpoints
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from './auth.service.js';
import { LoginRequest } from './auth.schemas.js';
import { getClientIp } from '../../lib/requestContext.js';
import { env } from '../../config/index.js';
import { UnauthorizedError } from '../../lib/errors.js';

/**
 * Authentication controller
 */
export class AuthController {
  constructor(private authService: AuthService) {}

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

    // Authenticate user
    const { accessToken, refreshToken, expiresIn } = await this.authService.login(
      username,
      password,
      ip
    );

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
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token from cookie
   */
  async refresh(request: FastifyRequest, reply: FastifyReply) {
    // Extract refresh token from cookie
    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token not found');
    }

    // Refresh tokens
    const { accessToken, refreshToken: newRefreshToken, expiresIn } =
      await this.authService.refresh(refreshToken);

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
  }

  /**
   * POST /auth/logout
   * Revoke refresh token and clear cookie
   */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const refreshToken = request.cookies.refreshToken;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    // Clear refresh token cookie
    reply.clearCookie('refreshToken', {
      path: '/auth/refresh',
    });

    return {
      message: 'Logged out successfully',
    };
  }
}
