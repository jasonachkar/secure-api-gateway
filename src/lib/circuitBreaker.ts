/**
 * Per-host circuit breaker protecting upstream calls from cascading failures.
 *
 * closed -> (N consecutive failures) -> open -> (cooldown elapses) -> half-open
 * half-open allows exactly one trial request through: success closes the circuit,
 * failure reopens it and restarts the cooldown.
 */

import { logger } from './logger.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

interface BreakerRecord {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

export class CircuitBreaker {
  private readonly breakers = new Map<string, BreakerRecord>();

  constructor(private readonly options: CircuitBreakerOptions) {}

  private getRecord(host: string): BreakerRecord {
    let record = this.breakers.get(host);
    if (!record) {
      record = { state: 'closed', consecutiveFailures: 0, openedAt: 0 };
      this.breakers.set(host, record);
    }
    return record;
  }

  /**
   * Whether a request to this host is currently allowed.
   * Transitions open -> half-open once the cooldown window has elapsed.
   */
  canRequest(host: string): boolean {
    const record = this.getRecord(host);

    if (record.state === 'open') {
      const elapsed = Date.now() - record.openedAt;
      if (elapsed >= this.options.cooldownMs) {
        record.state = 'half-open';
        logger.info({ host }, 'Circuit breaker entering half-open state');
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(host: string): void {
    const record = this.getRecord(host);
    if (record.state !== 'closed') {
      logger.info({ host }, 'Circuit breaker closed after successful request');
    }
    record.state = 'closed';
    record.consecutiveFailures = 0;
  }

  recordFailure(host: string): void {
    const record = this.getRecord(host);
    record.consecutiveFailures += 1;

    if (record.state === 'half-open' || record.consecutiveFailures >= this.options.failureThreshold) {
      if (record.state !== 'open') {
        logger.warn(
          { host, consecutiveFailures: record.consecutiveFailures },
          'Circuit breaker tripped open for upstream host'
        );
      }
      record.state = 'open';
      record.openedAt = Date.now();
    }
  }

  getState(host: string): CircuitState {
    return this.getRecord(host).state;
  }

  /** Snapshot of every tracked host - feeds the security metrics/dashboard "upstream failures" stat */
  getSnapshot(): Array<{ host: string; state: CircuitState; consecutiveFailures: number }> {
    return Array.from(this.breakers.entries()).map(([host, record]) => ({
      host,
      state: record.state,
      consecutiveFailures: record.consecutiveFailures,
    }));
  }
}
