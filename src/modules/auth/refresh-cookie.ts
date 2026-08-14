import type { CookieSerializeOptions } from '@fastify/cookie';
import { env } from '../../config/index.js';

export const REFRESH_COOKIE_NAME = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/auth';

function parseDurationSeconds(value: string): number {
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60;

  const amount = Number(match[1]);
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 } as const;
  return amount * multipliers[match[2] as keyof typeof multipliers];
}

export function getRefreshCookieOptions(
  isProduction = env.server.isProduction
): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: parseDurationSeconds(env.auth.jwt.refreshTokenExpiresIn),
  };
}

export function getRefreshCookieClearOptions(
  isProduction = env.server.isProduction
): CookieSerializeOptions {
  const { maxAge: _maxAge, ...options } = getRefreshCookieOptions(isProduction);
  return options;
}
