/**
 * Authentication service
 * Handles user authentication, token generation, and account security
 */

import { hashPassword, verifyPassword, generateSecureToken, hashToken, generateJti } from '../../lib/crypto.js';
import { generateAccessToken, generateRefreshToken } from '../../middleware/auth.js';
import { TokenStore } from './token.store.js';
import { InvalidCredentialsError, AccountLockedError, TokenRevokedError, TokenInvalidError } from '../../lib/errors.js';
import { RefreshTokenMetadata, AuthUser } from '../../types/index.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/index.js';
import Redis from 'ioredis';

/**
 * User data structure (in-memory demo store)
 */
interface User {
  userId: string;
  username: string;
  passwordHash: string;
  roles: string[];
  permissions: string[];
}

/**
 * Role definitions with permissions
 * This demonstrates RBAC configuration
 */
const ROLES = {
  admin: {
    name: 'admin',
    permissions: [
      'read:reports',
      'write:reports',
      'delete:reports',
      'read:admin',
      'write:admin',
      'manage:users',
    ],
  },
  user: {
    name: 'user',
    permissions: ['read:reports'],
  },
  service: {
    name: 'service',
    permissions: ['read:reports', 'write:reports'],
  },
};

/**
 * Get permissions for roles
 */
function getPermissionsForRoles(roles: string[]): string[] {
  const permissions = new Set<string>();

  for (const roleName of roles) {
    const role = ROLES[roleName as keyof typeof ROLES];
    if (role) {
      role.permissions.forEach((p) => permissions.add(p));
    }
  }

  return Array.from(permissions);
}

/**
 * Demo user store (in-memory)
 * In production, this would be a database
 */
class UserStore {
  private users: Map<string, User> = new Map();

  async initialize() {
    // Seed demo users for development
    const demoUsers = [
      {
        userId: 'user-1',
        username: 'admin',
        password: 'Admin123!',
        roles: ['admin', 'user'],
      },
      {
        userId: 'user-2',
        username: 'user',
        password: 'User123!',
        roles: ['user'],
      },
      {
        userId: 'user-3',
        username: 'service',
        password: 'Service123!',
        roles: ['service'],
      },
    ];

    for (const user of demoUsers) {
      const passwordHash = await hashPassword(user.password);
      const permissions = getPermissionsForRoles(user.roles);

      this.users.set(user.username, {
        userId: user.userId,
        username: user.username,
        passwordHash,
        roles: user.roles,
        permissions,
      });
    }

    logger.info({ count: this.users.size }, 'Demo users initialized');
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.users.get(username) || null;
  }
}

/**
 * Account lockout tracking
 */
class LockoutManager {
  private readonly PREFIX = 'lockout';

  constructor(private redis: Redis) {}

  /**
   * Get failed login attempts for username/IP
   */
  async getAttempts(identifier: string): Promise<number> {
    const key = `${this.PREFIX}:${identifier}`;
    const attempts = await this.redis.get(key);
    return attempts ? parseInt(attempts, 10) : 0;
  }

  /**
   * Increment failed login attempts
   */
  async incrementAttempts(identifier: string): Promise<number> {
    const key = `${this.PREFIX}:${identifier}`;
    const attempts = await this.redis.incr(key);

    // Set expiration on first attempt
    if (attempts === 1) {
      await this.redis.expire(key, Math.ceil(env.LOCKOUT_DURATION / 1000));
    }

    return attempts;
  }

  /**
   * Reset failed login attempts
   */
  async resetAttempts(identifier: string): Promise<void> {
    const key = `${this.PREFIX}:${identifier}`;
    await this.redis.del(key);
  }

  /**
   * Check if account is locked
   */
  async isLocked(identifier: string): Promise<boolean> {
    const attempts = await this.getAttempts(identifier);
    return attempts >= env.MAX_LOGIN_ATTEMPTS;
  }

  /**
   * Get remaining lockout time in seconds
   */
  async getLockoutTTL(identifier: string): Promise<number> {
    const key = `${this.PREFIX}:${identifier}`;
    const ttl = await this.redis.ttl(key);
    return Math.max(0, ttl);
  }
}

/**
 * Authentication service
 */
export class AuthService {
  private userStore: UserStore;
  private tokenStore: TokenStore;
  private lockoutManager: LockoutManager;

  constructor(private redis: Redis) {
    this.userStore = new UserStore();
    this.tokenStore = new TokenStore(redis);
    this.lockoutManager = new LockoutManager(redis);
  }

  /**
   * Initialize service (seed demo users)
   */
  async initialize() {
    await this.userStore.initialize();
  }

  /**
   * Authenticate user with username/password
   * Implements account lockout after failed attempts
   */
  async login(username: string, password: string, ip: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      userId: string;
      username: string;
    };
  }> {
    // Check account lockout (by username and IP)
    const lockoutKey = `${username}:${ip}`;
    if (await this.lockoutManager.isLocked(lockoutKey)) {
      const ttl = await this.lockoutManager.getLockoutTTL(lockoutKey);
      logger.warn({ username, ip, ttl }, 'Login attempt on locked account');
      throw new AccountLockedError(ttl);
    }

    // Find user
    const user = await this.userStore.findByUsername(username);
    if (!user) {
      // Increment failed attempts (prevent username enumeration by same timing)
      await this.lockoutManager.incrementAttempts(lockoutKey);
      throw new InvalidCredentialsError();
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      // Increment failed attempts
      const attempts = await this.lockoutManager.incrementAttempts(lockoutKey);
      logger.warn({ username, ip, attempts }, 'Invalid password attempt');

      if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
        const ttl = await this.lockoutManager.getLockoutTTL(lockoutKey);
        throw new AccountLockedError(ttl);
      }

      throw new InvalidCredentialsError();
    }

    // Reset failed attempts on successful login
    await this.lockoutManager.resetAttempts(lockoutKey);

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = await this.generateTokenPair({
      userId: user.userId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
    });

    logger.info({ username, userId: user.userId }, 'User logged in successfully');

    return { 
      accessToken, 
      refreshToken, 
      expiresIn,
      user: {
        userId: user.userId,
        username: user.username,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   * Implements token rotation and reuse detection
   */
  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
      userId: string;
      username: string;
    };
  }> {
    // Verify refresh token (this will throw if invalid/expired)
    const { verifyToken } = await import('../../middleware/auth.js');
    const payload = verifyToken(refreshToken);

    // Check token type
    if (payload.type !== 'refresh') {
      throw new TokenInvalidError('Invalid token type');
    }

    // Check if token is revoked
    if (await this.tokenStore.isRevoked(payload.jti)) {
      logger.warn({ jti: payload.jti }, 'Attempted to use revoked refresh token');
      throw new TokenRevokedError();
    }

    // Verify token hash matches (prevent token substitution)
    const tokenHash = hashToken(refreshToken);
    const isValidHash = await this.tokenStore.verifyTokenHash(payload.jti, tokenHash);

    if (!isValidHash) {
      // Token reuse detected! Revoke entire token family
      const metadata = await this.tokenStore.get(payload.jti);
      if (metadata?.family) {
        await this.tokenStore.revokeFamily(metadata.family, 60 * 60 * 24 * 7); // 7 days
        logger.error({ family: metadata.family, jti: payload.jti }, 'Token reuse detected! Family revoked');
      }
      throw new TokenInvalidError('Token reuse detected');
    }

    // Update last used timestamp
    await this.tokenStore.updateLastUsed(payload.jti);

    // Revoke old refresh token (rotation)
    await this.tokenStore.revoke(payload.jti, 60 * 60); // Keep in blacklist for 1 hour

    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken, expiresIn } = await this.generateTokenPair({
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
    });

    logger.info({ userId: payload.sub, oldJti: payload.jti }, 'Refresh token rotated');

    return { 
      accessToken, 
      refreshToken: newRefreshToken, 
      expiresIn,
      user: {
        userId: payload.sub,
        username: payload.username,
      },
    };
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    try {
      const { verifyToken } = await import('../../middleware/auth.js');
      const payload = verifyToken(refreshToken);

      if (payload.type === 'refresh') {
        await this.tokenStore.revoke(payload.jti, 60 * 60 * 24 * 7); // 7 days
        logger.info({ userId: payload.sub, jti: payload.jti }, 'User logged out');
      }
    } catch (error) {
      // Ignore errors on logout (token might be expired/invalid)
      logger.debug({ error }, 'Logout with invalid token');
    }
  }

  /**
   * Generate access and refresh token pair
   */
  private async generateTokenPair(user: Omit<AuthUser, 'jti'>): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    // Generate JTIs
    const accessJti = generateJti();
    const refreshJti = generateJti();

    // Generate tokens
    const accessToken = generateAccessToken(user, accessJti);
    const refreshToken = generateRefreshToken(user, refreshJti);

    // Store refresh token metadata
    const refreshTokenHash = hashToken(refreshToken);
    const expiresIn = this.parseExpiration(env.jwt.refreshTokenExpiresIn);

    const metadata: RefreshTokenMetadata = {
      userId: user.userId,
      username: user.username,
      roles: user.roles,
      permissions: user.permissions,
      jti: refreshJti,
      tokenHash: refreshTokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + expiresIn * 1000,
    };

    await this.tokenStore.store(refreshJti, metadata, expiresIn);

    // Return access token expiration for client
    const accessExpiresIn = this.parseExpiration(env.jwt.accessTokenExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
    };
  }

  /**
   * Parse JWT expiration string to seconds
   */
  private parseExpiration(exp: string): number {
    const match = exp.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900; // Default 15 minutes
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900;
    }
  }
}
