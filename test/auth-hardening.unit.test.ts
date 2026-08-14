import { describe, expect, it } from '@jest/globals';
import { getRefreshCookieOptions, REFRESH_COOKIE_PATH } from '../src/modules/auth/refresh-cookie.js';
import { getSeedUserDefinitions, ROLES } from '../src/modules/auth/auth.service.js';

describe('authentication hardening policies', () => {
  it('uses cross-site-compatible production refresh cookies scoped to /auth', () => {
    expect(getRefreshCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: REFRESH_COOKIE_PATH,
      maxAge: 7 * 24 * 60 * 60,
    });
  });

  it('uses non-secure Lax refresh cookies outside production', () => {
    expect(getRefreshCookieOptions(false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/auth',
    });
  });

  it('seeds only a passwordless reviewer in production', () => {
    expect(getSeedUserDefinitions('production')).toEqual([
      {
        userId: 'user-5',
        username: 'reviewer',
        password: undefined,
        roles: ['reviewer'],
      },
    ]);
  });

  it('keeps privileged fixtures in development and test only', () => {
    const usernames = getSeedUserDefinitions('test').map((user) => user.username);
    expect(usernames).toEqual(['admin', 'user', 'service', 'sim-target', 'reviewer']);
    expect(ROLES.reviewer.permissions).toEqual(['read:admin']);
  });
});
