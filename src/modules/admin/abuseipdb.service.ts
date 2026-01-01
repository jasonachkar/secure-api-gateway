/**
 * AbuseIPDB Service
 * External IP reputation lookup via AbuseIPDB API
 */

import { logger } from '../../lib/logger.js';
import { env } from '../../config/index.js';

export interface AbuseIPDBResponse {
  data: {
    ipAddress: string;
    isPublic: boolean;
    ipVersion: number;
    isWhitelisted: boolean;
    abuseConfidencePercentage: number;
    countryCode: string;
    usageType: string;
    isp: string;
    domain: string;
    hostnames: string[];
    isTor: boolean;
    totalReports: number;
    numDistinctUsers: number;
    lastReportedAt: string;
  };
}

export interface AbuseIPDBCheckResult {
  ip: string;
  abuseConfidencePercentage: number;
  isWhitelisted: boolean;
  totalReports: number;
  countryCode: string;
  isp?: string;
  usageType?: string;
  isTor: boolean;
  lastReportedAt?: string;
  error?: string;
}

/**
 * AbuseIPDB Service
 * Provides IP reputation data from AbuseIPDB
 */
export class AbuseIPDBService {
  private readonly API_BASE = 'https://api.abuseipdb.com/api/v2';
  private readonly API_KEY: string | null;
  private readonly ENABLED: boolean;
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache

  constructor() {
    this.API_KEY = process.env.ABUSEIPDB_API_KEY || null;
    this.ENABLED = !!this.API_KEY;

    if (!this.ENABLED) {
      logger.warn('AbuseIPDB API key not configured. External IP reputation lookup disabled.');
    } else {
      logger.info('AbuseIPDB service initialized');
    }
  }

  /**
   * Check IP reputation
   */
  async checkIP(ip: string): Promise<AbuseIPDBCheckResult | null> {
    if (!this.ENABLED) {
      return null;
    }

    // Skip private/local IPs
    if (this.isPrivateIP(ip)) {
      return {
        ip,
        abuseConfidencePercentage: 0,
        isWhitelisted: true,
        totalReports: 0,
        countryCode: 'LOCAL',
        isTor: false,
      };
    }

    try {
      const url = `${this.API_BASE}/check`;
      const params = new URLSearchParams({
        ipAddress: ip,
        maxAgeInDays: '90',
        verbose: '',
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Key': this.API_KEY!,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          logger.warn({ ip }, 'AbuseIPDB rate limit exceeded');
          return null;
        }
        throw new Error(`AbuseIPDB API error: ${response.status}`);
      }

      const jsonData = await response.json();
      const data = jsonData as AbuseIPDBResponse;

      if (!data.data) {
        throw new Error('Invalid AbuseIPDB response format');
      }

      return {
        ip: data.data.ipAddress,
        abuseConfidencePercentage: data.data.abuseConfidencePercentage,
        isWhitelisted: data.data.isWhitelisted,
        totalReports: data.data.totalReports,
        countryCode: data.data.countryCode,
        isp: data.data.isp,
        usageType: data.data.usageType,
        isTor: data.data.isTor,
        lastReportedAt: data.data.lastReportedAt,
      };
    } catch (error: any) {
      logger.error({ error, ip }, 'Failed to check IP with AbuseIPDB');
      return {
        ip,
        abuseConfidencePercentage: 0,
        isWhitelisted: false,
        totalReports: 0,
        countryCode: 'UNKNOWN',
        isTor: false,
        error: error.message,
      };
    }
  }

  /**
   * Batch check multiple IPs (with rate limiting)
   */
  async checkIPs(ips: string[]): Promise<Map<string, AbuseIPDBCheckResult>> {
    const results = new Map<string, AbuseIPDBCheckResult>();

    if (!this.ENABLED) {
      return results;
    }

    // Process in batches to respect rate limits
    const batchSize = 5;
    const delayBetweenBatches = 1000; // 1 second

    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (ip) => {
          const result = await this.checkIP(ip);
          if (result) {
            results.set(ip, result);
          }
        })
      );

      // Rate limiting: wait between batches
      if (i + batchSize < ips.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    return results;
  }

  /**
   * Check if IP is private/local
   */
  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    if (ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        ip.startsWith('172.16.') || ip.startsWith('172.17.') ||
        ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
        ip.startsWith('172.20.') || ip.startsWith('172.21.') ||
        ip.startsWith('172.22.') || ip.startsWith('172.23.') ||
        ip.startsWith('172.24.') || ip.startsWith('172.25.') ||
        ip.startsWith('172.26.') || ip.startsWith('172.27.') ||
        ip.startsWith('172.28.') || ip.startsWith('172.29.') ||
        ip.startsWith('172.30.') || ip.startsWith('172.31.')) {
      return true;
    }

    // Localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }

    return false;
  }
}

