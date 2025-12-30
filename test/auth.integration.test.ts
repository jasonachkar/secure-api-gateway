/**
 * Authentication Integration Tests
 * Tests full auth flow: login -> access protected resource -> refresh -> logout
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { createApp } from '../src/app.js';

describe('Authentication Flow (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Arrange: Create app
    app = await createApp();
    await app.ready();
  });

  afterAll(async () => {
    // Cleanup
    await app.close();
  });

  it('should complete full auth flow: login -> access resource -> refresh -> logout', async () => {
    // ========================================
    // Step 1: Login
    // ========================================
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'admin',
        password: 'Admin123!',
      },
    });

    // Assert: Login successful
    expect(loginResponse.statusCode).toBe(200);

    const loginBody = JSON.parse(loginResponse.body);
    expect(loginBody).toHaveProperty('accessToken');
    expect(loginBody).toHaveProperty('expiresIn');
    expect(loginBody.tokenType).toBe('Bearer');

    // Extract tokens
    const accessToken = loginBody.accessToken;
    const cookies = loginResponse.cookies;
    const refreshTokenCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(refreshTokenCookie).toBeDefined();

    // ========================================
    // Step 2: Access protected resource
    // ========================================
    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs?limit=10',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    // Assert: Access granted
    expect(protectedResponse.statusCode).toBe(200);

    const auditBody = JSON.parse(protectedResponse.body);
    expect(auditBody).toHaveProperty('logs');
    expect(auditBody).toHaveProperty('count');

    // ========================================
    // Step 3: Refresh access token
    // ========================================
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        refreshToken: refreshTokenCookie!.value,
      },
    });

    // Assert: Refresh successful
    expect(refreshResponse.statusCode).toBe(200);

    const refreshBody = JSON.parse(refreshResponse.body);
    expect(refreshBody).toHaveProperty('accessToken');
    expect(refreshBody.accessToken).not.toBe(accessToken); // New token

    const newAccessToken = refreshBody.accessToken;

    // ========================================
    // Step 4: Use new access token
    // ========================================
    const newProtectedResponse = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs?limit=10',
      headers: {
        authorization: `Bearer ${newAccessToken}`,
      },
    });

    // Assert: New token works
    expect(newProtectedResponse.statusCode).toBe(200);

    // ========================================
    // Step 5: Logout
    // ========================================
    const newRefreshCookie = refreshResponse.cookies.find((c) => c.name === 'refreshToken');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: {
        refreshToken: newRefreshCookie!.value,
      },
    });

    // Assert: Logout successful
    expect(logoutResponse.statusCode).toBe(200);

    const logoutBody = JSON.parse(logoutResponse.body);
    expect(logoutBody.message).toContain('Logged out');

    // ========================================
    // Step 6: Verify old refresh token no longer works
    // ========================================
    const expiredRefreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        refreshToken: newRefreshCookie!.value,
      },
    });

    // Assert: Refresh fails (token revoked)
    expect(expiredRefreshResponse.statusCode).toBe(401);
  });

  it('should reject invalid credentials', async () => {
    // Act
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'admin',
        password: 'WrongPassword!',
      },
    });

    // Assert
    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should reject access without token', async () => {
    // Act
    const response = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs',
    });

    // Assert
    expect(response.statusCode).toBe(401);

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('should enforce RBAC permissions', async () => {
    // Arrange: Login as regular user
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        username: 'user',
        password: 'User123!',
      },
    });

    const loginBody = JSON.parse(loginResponse.body);
    const accessToken = loginBody.accessToken;

    // Act: Try to access admin endpoint
    const response = await app.inject({
      method: 'GET',
      url: '/admin/audit-logs',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    // Assert: Access denied
    expect(response.statusCode).toBe(403);

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});
