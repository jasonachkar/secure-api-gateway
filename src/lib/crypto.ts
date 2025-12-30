/**
 * Cryptographic utilities for password hashing and token generation
 * Implements secure defaults with bcrypt and crypto randomness
 */

import bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { env } from '../config/index.js';

/**
 * Hash a password using bcrypt
 * Uses configurable rounds from environment (default: 12)
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

/**
 * Verify a password against a hash
 * Constant-time comparison to prevent timing attacks
 * @param password - Plain text password
 * @param hash - Bcrypt hash
 * @returns True if password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically secure random token
 * Used for refresh tokens, session IDs, etc.
 * @param bytes - Number of random bytes (default: 32)
 * @returns Hex-encoded random string
 */
export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Hash a token for storage
 * Prevents token exposure if database is compromised
 * @param token - Plain token
 * @returns SHA-256 hash of token
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a unique JTI (JWT ID) for token revocation
 * @returns Unique token identifier
 */
export function generateJti(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Constant-time string comparison
 * Prevents timing attacks when comparing secrets
 * @param a - First string
 * @param b - Second string
 * @returns True if strings match
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
