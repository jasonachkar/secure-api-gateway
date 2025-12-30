/**
 * Metrics collection service
 * Collects and aggregates request metrics in Redis for the security dashboard
 */

import Redis from 'ioredis';
import { logger } from '../../lib/logger.js';
import type { MetricsSummary, RealtimeMetrics } from './admin.schemas.js';

/**
 * Metrics service for collecting real-time API gateway metrics
 */
export class MetricsService {
  private readonly METRICS_PREFIX = 'metrics';
  private readonly RETENTION_SECONDS = 900; // 15 minutes

  constructor(private redis: Redis) {}

  /**
   * Record a request
   */
  async recordRequest(params: {
    method: string;
    path: string;
    statusCode: number;
    responseTime: number;
    userId?: string;
    ip: string;
  }): Promise<void> {
    const now = Date.now();
    const second = Math.floor(now / 1000);
    const minute = Math.floor(now / 60000);

    try {
      const pipeline = this.redis.pipeline();

      // Increment request counter for this second
      pipeline.incr(`${this.METRICS_PREFIX}:requests:${second}`);
      pipeline.expire(`${this.METRICS_PREFIX}:requests:${second}`, this.RETENTION_SECONDS);

      // Track errors
      if (params.statusCode >= 400) {
        pipeline.incr(`${this.METRICS_PREFIX}:errors:${minute}`);
        pipeline.expire(`${this.METRICS_PREFIX}:errors:${minute}`, this.RETENTION_SECONDS);
      }

      // Track response times (store in sorted set for percentile calculations)
      pipeline.zadd(
        `${this.METRICS_PREFIX}:response_times:${minute}`,
        params.responseTime,
        `${now}:${Math.random()}`
      );
      pipeline.expire(`${this.METRICS_PREFIX}:response_times:${minute}`, this.RETENTION_SECONDS);

      await pipeline.exec();
    } catch (error) {
      logger.error({ error }, 'Failed to record request metrics');
    }
  }

  /**
   * Record authentication event
   */
  async recordAuthEvent(params: {
    type: 'login_success' | 'login_failure' | 'logout' | 'account_locked';
    userId?: string;
    username: string;
    ip: string;
  }): Promise<void> {
    const minute = Math.floor(Date.now() / 60000);

    try {
      const pipeline = this.redis.pipeline();

      if (params.type === 'login_failure') {
        pipeline.incr(`${this.METRICS_PREFIX}:auth:failed:${minute}`);
        pipeline.expire(`${this.METRICS_PREFIX}:auth:failed:${minute}`, this.RETENTION_SECONDS);
      } else if (params.type === 'login_success') {
        pipeline.incr(`${this.METRICS_PREFIX}:auth:success:${minute}`);
        pipeline.expire(`${this.METRICS_PREFIX}:auth:success:${minute}`, this.RETENTION_SECONDS);
      } else if (params.type === 'account_locked') {
        pipeline.incr(`${this.METRICS_PREFIX}:auth:lockouts:${minute}`);
        pipeline.expire(`${this.METRICS_PREFIX}:auth:lockouts:${minute}`, this.RETENTION_SECONDS);
      }

      await pipeline.exec();
    } catch (error) {
      logger.error({ error }, 'Failed to record auth event');
    }
  }

  /**
   * Record rate limit violation
   */
  async recordRateLimitViolation(params: { ip: string; path: string }): Promise<void> {
    const minute = Math.floor(Date.now() / 60000);

    try {
      const pipeline = this.redis.pipeline();

      // Increment total violations
      pipeline.incr(`${this.METRICS_PREFIX}:ratelimit:total:${minute}`);
      pipeline.expire(`${this.METRICS_PREFIX}:ratelimit:total:${minute}`, this.RETENTION_SECONDS);

      // Track by IP (sorted set for top violators)
      pipeline.zincrby(`${this.METRICS_PREFIX}:ratelimit:by_ip:${minute}`, 1, params.ip);
      pipeline.expire(`${this.METRICS_PREFIX}:ratelimit:by_ip:${minute}`, this.RETENTION_SECONDS);

      await pipeline.exec();
    } catch (error) {
      logger.error({ error }, 'Failed to record rate limit violation');
    }
  }

  /**
   * Get current metrics summary
   */
  async getSummary(): Promise<MetricsSummary> {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    const currentMinute = Math.floor(now / 60000);

    try {
      // Get requests per second (average of last 10 seconds)
      const requestCounts = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          this.redis.get(`${this.METRICS_PREFIX}:requests:${currentSecond - i}`)
        )
      );
      const totalRecentRequests = requestCounts.reduce((sum, count) => sum + (parseInt(count || '0', 10)), 0);
      const requestsPerSecond = totalRecentRequests / 10;

      // Get total requests (last 15 minutes)
      const totalKeys = await this.redis.keys(`${this.METRICS_PREFIX}:requests:*`);
      const totalCounts = await Promise.all(totalKeys.map(key => this.redis.get(key)));
      const totalRequests = totalCounts.reduce((sum, count) => sum + (parseInt(count || '0', 10)), 0);

      // Get error count (last 5 minutes)
      const errorCounts = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          this.redis.get(`${this.METRICS_PREFIX}:errors:${currentMinute - i}`)
        )
      );
      const totalErrors = errorCounts.reduce((sum, count) => sum + (parseInt(count || '0', 10)), 0);
      const errorRate = totalRecentRequests > 0 ? (totalErrors / totalRecentRequests) * 100 : 0;

      // Get auth stats (last 5 minutes)
      const failedLogins = await this.getCountSum(`${this.METRICS_PREFIX}:auth:failed`, currentMinute, 5);
      const successfulLogins = await this.getCountSum(`${this.METRICS_PREFIX}:auth:success`, currentMinute, 5);
      const accountLockouts = await this.getCountSum(`${this.METRICS_PREFIX}:auth:lockouts`, currentMinute, 5);

      // Get active sessions count
      const sessionKeys = await this.redis.keys('token:*');
      const activeSessions = sessionKeys.filter(key => !key.includes('blacklist') && !key.includes('family')).length;

      // Get rate limit stats
      const violations = await this.getCountSum(`${this.METRICS_PREFIX}:ratelimit:total`, currentMinute, 5);
      const topViolatorsData = await this.redis.zrevrange(
        `${this.METRICS_PREFIX}:ratelimit:by_ip:${currentMinute}`,
        0,
        4,
        'WITHSCORES'
      );
      const topViolators = [];
      for (let i = 0; i < topViolatorsData.length; i += 2) {
        topViolators.push({
          ip: topViolatorsData[i],
          count: parseInt(topViolatorsData[i + 1], 10),
        });
      }

      // Get response time stats
      const responseTimes = await this.redis.zrange(
        `${this.METRICS_PREFIX}:response_times:${currentMinute}`,
        0,
        -1,
        'WITHSCORES'
      );
      const times = [];
      for (let i = 1; i < responseTimes.length; i += 2) {
        times.push(parseFloat(responseTimes[i]));
      }
      times.sort((a, b) => a - b);

      const p50 = times.length > 0 ? times[Math.floor(times.length * 0.5)] : 0;
      const p95 = times.length > 0 ? times[Math.floor(times.length * 0.95)] : 0;
      const p99 = times.length > 0 ? times[Math.floor(times.length * 0.99)] : 0;

      // Check Redis health
      const pingResult = await this.redis.ping();
      const redisConnected = pingResult === 'PONG';

      return {
        requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
        totalRequests,
        activeConnections: 0, // Fastify doesn't easily expose this
        errorRate: Math.round(errorRate * 100) / 100,
        authStats: {
          failedLogins,
          successfulLogins,
          accountLockouts,
          activeSessions,
        },
        rateLimitStats: {
          violations,
          topViolators,
        },
        responseTimeStats: {
          p50: Math.round(p50),
          p95: Math.round(p95),
          p99: Math.round(p99),
        },
        systemHealth: {
          redisConnected,
          uptime: Math.floor(process.uptime()),
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get metrics summary');
      throw error;
    }
  }

  /**
   * Get realtime metrics for streaming
   */
  async getRealtimeMetrics(): Promise<RealtimeMetrics> {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);

    // Get last second's request count
    const requestCount = await this.redis.get(`${this.METRICS_PREFIX}:requests:${currentSecond - 1}`);
    const requestsPerSecond = parseInt(requestCount || '0', 10);

    // Get recent events (mock for now - would integrate with audit log)
    const recentEvents = [];

    return {
      timestamp: now,
      requestsPerSecond,
      errorRate: 0,
      avgResponseTime: 0,
      recentEvents,
    };
  }

  /**
   * Helper: Get sum of counts over time range
   */
  private async getCountSum(prefix: string, currentMinute: number, minutes: number): Promise<number> {
    const counts = await Promise.all(
      Array.from({ length: minutes }, (_, i) => this.redis.get(`${prefix}:${currentMinute - i}`))
    );
    return counts.reduce((sum, count) => sum + (parseInt(count || '0', 10)), 0);
  }
}
