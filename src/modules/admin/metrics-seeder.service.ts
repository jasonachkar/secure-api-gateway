/**
 * Metrics Seeder Service
 * Generates realistic metrics data for demonstration
 */

import Redis from 'ioredis';
import { MetricsService } from './metrics.service.js';
import { ThreatIntelService } from './threat-intel.service.js';
import { logger } from '../../lib/logger.js';

export class MetricsSeederService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private redis: Redis,
    private metricsService: MetricsService,
    private threatIntelService: ThreatIntelService
  ) {}

  /**
   * Start generating realistic metrics data
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('Starting metrics seeder - generating realistic data');

    // Generate data every 2-4 seconds for more frequent updates
    this.intervalId = setInterval(() => {
      this.generateMetrics();
    }, 2000 + Math.random() * 2000); // Random interval between 2-4 seconds

    // Generate initial batch of data immediately
    for (let i = 0; i < 5; i++) {
      setTimeout(() => this.generateMetrics(), i * 500);
    }
  }

  /**
   * Stop generating metrics
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Stopped metrics seeder');
  }

  /**
   * Generate realistic metrics data
   */
  private async generateMetrics() {
    try {
      const now = Date.now();
      const responseTime = 50 + Math.random() * 200; // 50-250ms
      const statusCode = this.getRandomStatusCode();

      // Simulate various request types
      const paths = [
        '/api/users',
        '/api/products',
        '/api/orders',
        '/api/auth/login',
        '/api/reports',
        '/admin/metrics/summary',
        '/admin/threats',
      ];
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];
      const ips = this.generateRandomIPs();

      const path = paths[Math.floor(Math.random() * paths.length)];
      const method = methods[Math.floor(Math.random() * methods.length)];
      const ip = ips[Math.floor(Math.random() * ips.length)];

      // Record request
      await this.metricsService.recordRequest({
        method,
        path,
        statusCode,
        responseTime: Math.round(responseTime),
        ip,
      });

      // Occasionally record auth events (more frequently)
      if (Math.random() < 0.15) {
        if (path.includes('/auth/login') || Math.random() < 0.3) {
          if (Math.random() < 0.4) {
            // Failed login
            await this.metricsService.recordAuthEvent({
              type: 'login_failure',
              username: `user${Math.floor(Math.random() * 10)}`,
              ip,
            });
            // Record threat event
            await this.threatIntelService.recordEvent(ip, 'failed_login');
          } else {
            // Successful login
            await this.metricsService.recordAuthEvent({
              type: 'login_success',
              username: `user${Math.floor(Math.random() * 10)}`,
              ip,
            });
          }
        }
      }

      // Occasionally record rate limit violations
      if (Math.random() < 0.05) {
        await this.metricsService.recordRateLimitViolation({
          ip,
          path,
        });
        await this.threatIntelService.recordEvent(ip, 'rate_limit');
      }

      // Occasionally record suspicious activity
      if (Math.random() < 0.02) {
        await this.threatIntelService.recordEvent(ip, 'suspicious');
      }
    } catch (error) {
      logger.debug({ error }, 'Error generating metrics data');
    }
  }

  /**
   * Get random status code (mostly 200, some errors)
   */
  private getRandomStatusCode(): number {
    const rand = Math.random();
    if (rand < 0.85) return 200; // 85% success
    if (rand < 0.95) return 400 + Math.floor(Math.random() * 100); // 10% 4xx
    return 500 + Math.floor(Math.random() * 100); // 5% 5xx
  }

  /**
   * Generate random IP addresses for simulation
   */
  private generateRandomIPs(): string[] {
    const ips: string[] = [];
    for (let i = 0; i < 20; i++) {
      ips.push(
        `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      );
    }
    return ips;
  }
}

