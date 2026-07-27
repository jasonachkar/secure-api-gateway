/**
 * Tracks failed gateway login attempts per username for GW-AUTH-001 detection - a
 * failure count and a distinct-source-IP set within a configurable sliding window.
 *
 * Deliberately separate from AuthService's LockoutManager (`lockout:<username>:<ip>`):
 * that one gates actual access (scoped per username+IP pair, so a locked-out IP doesn't
 * block the same user logging in from a different, legitimate location) and is not
 * configurable independently of this detection signal. This tracker exists purely to
 * measure the signal GW-AUTH-001 needs - concentrated attempts (high count) and
 * distributed attempts (high count *and* high IP diversity) - regardless of how access
 * control chooses to respond to them.
 */
import Redis from 'ioredis';

const COUNT_KEY_PREFIX = 'gw-auth-detect:count:';
const IPS_KEY_PREFIX = 'gw-auth-detect:ips:';

export interface CredentialAttackSignal {
  failedLoginCount: number;
  distinctSourceIps: number;
}

export class GatewayAuthTracker {
  constructor(
    private readonly redis: Redis,
    private readonly windowMs: number
  ) {}

  /** Record one failed attempt against `username` from `ip` and return the current window's signal. */
  async recordFailure(username: string, ip: string): Promise<CredentialAttackSignal> {
    const countKey = `${COUNT_KEY_PREFIX}${username}`;
    const ipsKey = `${IPS_KEY_PREFIX}${username}`;
    const windowSeconds = Math.max(1, Math.ceil(this.windowMs / 1000));

    const failedLoginCount = await this.redis.incr(countKey);
    if (failedLoginCount === 1) {
      // Only set expiry on the first hit in a window, mirroring LockoutManager's
      // fixed-window pattern - concurrent increments can't each reset the window.
      await this.redis.expire(countKey, windowSeconds);
    }

    await this.redis.sadd(ipsKey, ip);
    await this.redis.expire(ipsKey, windowSeconds);
    const distinctSourceIps = await this.redis.scard(ipsKey);

    return { failedLoginCount, distinctSourceIps };
  }

  /** Clear the window's tracking for `username` (called on a subsequent successful login). */
  async reset(username: string): Promise<void> {
    await this.redis.del(`${COUNT_KEY_PREFIX}${username}`, `${IPS_KEY_PREFIX}${username}`);
  }
}
