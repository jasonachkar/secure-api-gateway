/**
 * Zod schemas for auth endpoints
 * Provides type-safe validation with clear error messages
 */

import { z } from 'zod';

/**
 * Login request schema
 * Validates username/password format
 */
export const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be at most 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Login response schema
 */
export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(), // seconds
  tokenType: z.literal('Bearer'),
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Refresh token response schema
 */
export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
});

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
