/**
 * Threat Intelligence Service
 * IP reputation scoring, GeoIP lookup, and threat analysis
 */

import Redis from 'ioredis';
import geoip from 'geoip-lite';
import { logger } from '../../lib/logger.js';
import { AbuseIPDBService } from './abuseipdb.service.js';

/**
 * Threat severity levels
 */
export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * IP threat information
 */
export interface IPThreatInfo {
  ip: string;
  threatScore: number;
  threatLevel: ThreatLevel;
  firstSeen: number;
  lastSeen: number;
  totalEvents: number;
  eventTypes: {
    failedLogins: number;
    rateLimitViolations: number;
    suspiciousActivity: number;
    accountLockouts: number;
  };
  geo: {
    country?: string;
    region?: string;
    city?: string;
    ll?: [number, number]; // latitude, longitude
    timezone?: string;
  } | null;
  isBlocked: boolean;
  abuseScore?: number; // External reputation from AbuseIPDB
}

/**
 * Attack pattern detection
 */
export interface AttackPattern {
  type: 'brute_force' | 'credential_stuffing' | 'rate_limit_abuse' | 'suspicious_behavior';
  severity: ThreatLevel;
  ipAddresses: string[];
  eventCount: number;
  timeWindow: number;
  description: string;
}

/**
 * Threat Intelligence Service
 */
export class ThreatIntelService {
  private readonly THREAT_KEY_PREFIX = 'threat:ip:';
  private readonly BLOCKED_IPS_KEY = 'threat:blocked_ips';
  private readonly ATTACK_PATTERNS_KEY = 'threat:attack_patterns';
  private readonly INCIDENT_CREATED_KEY_PREFIX = 'threat:incident_created:';
  private readonly THREAT_RETENTION = 7 * 24 * 60 * 60; // 7 days
  private abuseIPDB: AbuseIPDBService;
  private incidentService?: any; // IncidentResponseService (optional to avoid circular dependency)

  constructor(private redis: Redis, incidentService?: any) {
    this.abuseIPDB = new AbuseIPDBService();
    this.incidentService = incidentService;
  }

  /**
   * Record security event for an IP address
   */
  async recordEvent(
    ip: string,
    eventType: 'failed_login' | 'rate_limit' | 'suspicious' | 'lockout'
  ): Promise<void> {
    const key = `${this.THREAT_KEY_PREFIX}${ip}`;
    const now = Date.now();

    try {
      // Get or create IP threat record
      const existing = await this.redis.get(key);
      let threat: Partial<IPThreatInfo> = existing
        ? JSON.parse(existing)
        : {
            ip,
            threatScore: 0,
            firstSeen: now,
            totalEvents: 0,
            eventTypes: {
              failedLogins: 0,
              rateLimitViolations: 0,
              suspiciousActivity: 0,
              accountLockouts: 0,
            },
            isBlocked: false,
          };

      // Update event counts
      threat.lastSeen = now;
      threat.totalEvents = (threat.totalEvents || 0) + 1;

      switch (eventType) {
        case 'failed_login':
          threat.eventTypes!.failedLogins++;
          break;
        case 'rate_limit':
          threat.eventTypes!.rateLimitViolations++;
          break;
        case 'suspicious':
          threat.eventTypes!.suspiciousActivity++;
          break;
        case 'lockout':
          threat.eventTypes!.accountLockouts++;
          break;
      }

      // Add GeoIP data if not already present
      if (!threat.geo) {
        threat.geo = this.lookupGeoIP(ip);
      }

      // Enrich with AbuseIPDB data if available (async, non-blocking)
      this.enrichWithAbuseIPDB(ip).catch(err => {
        logger.debug({ error: err, ip }, 'AbuseIPDB enrichment failed (non-critical)');
      });

      // Recalculate threat score (will include AbuseIPDB if available)
      const abuseData = await this.getAbuseIPDBCache(ip);
      threat.threatScore = this.calculateThreatScore(threat.eventTypes!, abuseData?.abuseConfidencePercentage);
      threat.threatLevel = this.getThreatLevel(threat.threatScore!);
      
      // Store AbuseIPDB score if available
      if (abuseData) {
        threat.abuseScore = abuseData.abuseConfidencePercentage;
      }

      // Save updated threat data
      await this.redis.setex(key, this.THREAT_RETENTION, JSON.stringify(threat));

      // Auto-block if threat score is critical
      if (threat.threatScore! >= 90) {
        await this.blockIP(ip, 'automatic', `Critical threat score: ${threat.threatScore}`);
      }

      // Auto-create incident for high/critical threats (if incident service is available)
      if (this.incidentService && (threat.threatLevel === 'high' || threat.threatLevel === 'critical')) {
        await this.autoCreateIncidentIfNeeded(threat as IPThreatInfo);
      }

      logger.debug({ ip, eventType, threatScore: threat.threatScore }, 'Recorded security event');
    } catch (error) {
      logger.error({ error, ip, eventType }, 'Failed to record threat event');
    }
  }

  /**
   * Calculate threat score based on event types and AbuseIPDB data (0-100)
   */
  private calculateThreatScore(events: IPThreatInfo['eventTypes'], abuseConfidence?: number): number {
    let score = 0;

    // Weight different event types
    score += events.failedLogins * 5; // 5 points per failed login
    score += events.rateLimitViolations * 3; // 3 points per rate limit hit
    score += events.suspiciousActivity * 10; // 10 points per suspicious activity
    score += events.accountLockouts * 15; // 15 points per lockout caused

    // Add AbuseIPDB confidence (weighted at 30% of total)
    if (abuseConfidence !== undefined && abuseConfidence > 0) {
      score += (abuseConfidence / 100) * 30; // AbuseIPDB contributes up to 30 points
    }

    // Cap at 100
    return Math.min(Math.round(score), 100);
  }

  /**
   * Determine threat level from score
   */
  private getThreatLevel(score: number): ThreatLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Lookup GeoIP information
   */
  private lookupGeoIP(ip: string): IPThreatInfo['geo'] {
    try {
      const geo = geoip.lookup(ip);
      if (!geo) return null;

      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        ll: geo.ll,
        timezone: geo.timezone,
      };
    } catch (error) {
      logger.warn({ error, ip }, 'GeoIP lookup failed');
      return null;
    }
  }

  /**
   * Enrich threat with AbuseIPDB data (async, non-blocking)
   */
  private async enrichWithAbuseIPDB(ip: string): Promise<void> {
    try {
      const abuseData = await this.abuseIPDB.checkIP(ip);
      if (abuseData && !abuseData.error) {
        // Cache AbuseIPDB data for 24 hours
        const cacheKey = `abuseipdb:${ip}`;
        await this.redis.setex(cacheKey, 24 * 60 * 60, JSON.stringify(abuseData));

        // Update threat record with AbuseIPDB score
        const threatKey = `${this.THREAT_KEY_PREFIX}${ip}`;
        const threatData = await this.redis.get(threatKey);
        if (threatData) {
          const threat: IPThreatInfo = JSON.parse(threatData);
          threat.abuseScore = abuseData.abuseConfidencePercentage;
          
          // Recalculate threat score with AbuseIPDB data
          threat.threatScore = this.calculateThreatScore(threat.eventTypes, abuseData.abuseConfidencePercentage);
          threat.threatLevel = this.getThreatLevel(threat.threatScore);
          
          await this.redis.setex(threatKey, this.THREAT_RETENTION, JSON.stringify(threat));
        }
      }
    } catch (error) {
      // Non-critical, just log
      logger.debug({ error, ip }, 'AbuseIPDB enrichment failed');
    }
  }

  /**
   * Get cached AbuseIPDB data
   */
  private async getAbuseIPDBCache(ip: string): Promise<any> {
    try {
      const cacheKey = `abuseipdb:${ip}`;
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get threat information for an IP (with AbuseIPDB enrichment)
   */
  async getIPThreat(ip: string, includeAbuseIPDB = false): Promise<IPThreatInfo | null> {
    const key = `${this.THREAT_KEY_PREFIX}${ip}`;
    const data = await this.redis.get(key);

    if (!data) return null;

    const threat: IPThreatInfo = JSON.parse(data);

    // Enrich with AbuseIPDB if requested and not already cached
    if (includeAbuseIPDB && !threat.abuseScore) {
      const abuseData = await this.getAbuseIPDBCache(ip);
      if (!abuseData) {
        // Fetch fresh data
        await this.enrichWithAbuseIPDB(ip);
        const updatedData = await this.redis.get(key);
        if (updatedData) {
          return JSON.parse(updatedData);
        }
      } else {
        threat.abuseScore = abuseData.abuseConfidencePercentage;
      }
    }

    return threat;
  }

  /**
   * Get all tracked threats (optionally enriched with AbuseIPDB)
   */
  async getAllThreats(limit = 100, includeAbuseIPDB = false): Promise<IPThreatInfo[]> {
    const pattern = `${this.THREAT_KEY_PREFIX}*`;
    const keys = await this.redis.keys(pattern);

    const threats: IPThreatInfo[] = [];
    for (const key of keys.slice(0, limit)) {
      const data = await this.redis.get(key);
      if (data) {
        const threat: IPThreatInfo = JSON.parse(data);
        
        // Enrich with cached AbuseIPDB data if requested
        if (includeAbuseIPDB && !threat.abuseScore) {
          const abuseData = await this.getAbuseIPDBCache(threat.ip);
          if (abuseData) {
            threat.abuseScore = abuseData.abuseConfidencePercentage;
          }
        }
        
        threats.push(threat);
      }
    }

    // Sort by threat score descending
    return threats.sort((a, b) => b.threatScore - a.threatScore);
  }

  /**
   * Get top threats by score
   */
  async getTopThreats(limit = 10, includeAbuseIPDB = false): Promise<IPThreatInfo[]> {
    const allThreats = await this.getAllThreats(200, includeAbuseIPDB);
    // Sort by threat score descending
    allThreats.sort((a, b) => b.threatScore - a.threatScore);
    return allThreats.slice(0, limit);
  }

  /**
   * Block an IP address
   */
  async blockIP(ip: string, blockedBy: string, reason: string): Promise<void> {
    const blockInfo = {
      ip,
      blockedAt: Date.now(),
      blockedBy,
      reason,
    };

    // Add to blocked IPs set
    await this.redis.sadd(this.BLOCKED_IPS_KEY, ip);

    // Store block details
    await this.redis.setex(
      `${this.BLOCKED_IPS_KEY}:${ip}`,
      this.THREAT_RETENTION,
      JSON.stringify(blockInfo)
    );

    // Update threat record
    const threat = await this.getIPThreat(ip);
    if (threat) {
      threat.isBlocked = true;
      await this.redis.setex(
        `${this.THREAT_KEY_PREFIX}${ip}`,
        this.THREAT_RETENTION,
        JSON.stringify(threat)
      );
    }

    logger.info({ ip, blockedBy, reason }, 'IP address blocked');
  }

  /**
   * Unblock an IP address
   */
  async unblockIP(ip: string): Promise<void> {
    await this.redis.srem(this.BLOCKED_IPS_KEY, ip);
    await this.redis.del(`${this.BLOCKED_IPS_KEY}:${ip}`);

    // Update threat record
    const threat = await this.getIPThreat(ip);
    if (threat) {
      threat.isBlocked = false;
      await this.redis.setex(
        `${this.THREAT_KEY_PREFIX}${ip}`,
        this.THREAT_RETENTION,
        JSON.stringify(threat)
      );
    }

    logger.info({ ip }, 'IP address unblocked');
  }

  /**
   * Check if IP is blocked
   */
  async isIPBlocked(ip: string): Promise<boolean> {
    const isMember = await this.redis.sismember(this.BLOCKED_IPS_KEY, ip);
    return isMember === 1;
  }

  /**
   * Get all blocked IPs
   */
  async getBlockedIPs(): Promise<string[]> {
    return this.redis.smembers(this.BLOCKED_IPS_KEY);
  }

  /**
   * Detect attack patterns
   */
  async detectAttackPatterns(): Promise<AttackPattern[]> {
    const threats = await this.getAllThreats(500);
    const patterns: AttackPattern[] = [];

    // Detect brute force attacks (multiple failed logins from same IP)
    const bruteForceIPs = threats.filter((t) => t.eventTypes.failedLogins >= 10);
    if (bruteForceIPs.length > 0) {
      patterns.push({
        type: 'brute_force',
        severity: 'high',
        ipAddresses: bruteForceIPs.map((t) => t.ip),
        eventCount: bruteForceIPs.reduce((sum, t) => sum + t.eventTypes.failedLogins, 0),
        timeWindow: 300000, // 5 minutes
        description: `${bruteForceIPs.length} IP(s) detected with brute force login attempts`,
      });
    }

    // Detect credential stuffing (distributed failed logins)
    const recentFailedLogins = threats.filter(
      (t) => t.eventTypes.failedLogins > 0 && Date.now() - t.lastSeen < 300000
    );
    if (recentFailedLogins.length >= 5) {
      patterns.push({
        type: 'credential_stuffing',
        severity: 'critical',
        ipAddresses: recentFailedLogins.map((t) => t.ip),
        eventCount: recentFailedLogins.reduce((sum, t) => sum + t.eventTypes.failedLogins, 0),
        timeWindow: 300000,
        description: `Potential credential stuffing attack from ${recentFailedLogins.length} IPs`,
      });
    }

    // Detect rate limit abuse
    const rateLimitAbusers = threats.filter((t) => t.eventTypes.rateLimitViolations >= 5);
    if (rateLimitAbusers.length > 0) {
      patterns.push({
        type: 'rate_limit_abuse',
        severity: 'medium',
        ipAddresses: rateLimitAbusers.map((t) => t.ip),
        eventCount: rateLimitAbusers.reduce((sum, t) => sum + t.eventTypes.rateLimitViolations, 0),
        timeWindow: 60000,
        description: `${rateLimitAbusers.length} IP(s) repeatedly hitting rate limits`,
      });
    }

    return patterns;
  }

  /**
   * Auto-create incident from threat if not already created
   * Uses deduplication to avoid creating multiple incidents for the same threat
   */
  private async autoCreateIncidentIfNeeded(threat: IPThreatInfo): Promise<void> {
    if (!this.incidentService) return;

    try {
      // Check if we've already created an incident for this IP in the last 24 hours
      const incidentKey = `${this.INCIDENT_CREATED_KEY_PREFIX}${threat.ip}`;
      const alreadyCreated = await this.redis.get(incidentKey);
      
      if (alreadyCreated) {
        logger.debug({ ip: threat.ip }, 'Incident already created for this threat, skipping');
        return;
      }

      // Create incident using the incident service
      const incident = await this.incidentService.createIncidentFromThreat(
        {
          ip: threat.ip,
          threatScore: threat.threatScore,
          threatLevel: threat.threatLevel,
          eventTypes: threat.eventTypes,
        },
        'system'
      );

      if (incident) {
        // Mark that we've created an incident for this IP (expires in 24 hours)
        await this.redis.setex(incidentKey, 24 * 60 * 60, '1');
        logger.info(
          { ip: threat.ip, incidentId: incident.id, threatLevel: threat.threatLevel },
          'Auto-created incident from threat intelligence'
        );
      }
    } catch (error) {
      // Non-critical - log but don't fail the threat recording
      logger.warn({ error, ip: threat.ip }, 'Failed to auto-create incident from threat');
    }
  }

  /**
   * Get threat statistics
   */
  async getStatistics(): Promise<{
    totalThreats: number;
    blockedIPs: number;
    criticalThreats: number;
    highThreats: number;
    mediumThreats: number;
    lowThreats: number;
    topCountries: Array<{ country: string; count: number }>;
  }> {
    const threats = await this.getAllThreats(1000);
    const blockedIPs = await this.getBlockedIPs();

    // Count by threat level
    const criticalThreats = threats.filter((t) => t.threatLevel === 'critical').length;
    const highThreats = threats.filter((t) => t.threatLevel === 'high').length;
    const mediumThreats = threats.filter((t) => t.threatLevel === 'medium').length;
    const lowThreats = threats.filter((t) => t.threatLevel === 'low').length;

    // Top countries
    const countryCount: Record<string, number> = {};
    threats.forEach((t) => {
      if (t.geo?.country) {
        countryCount[t.geo.country] = (countryCount[t.geo.country] || 0) + 1;
      }
    });

    const topCountries = Object.entries(countryCount)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalThreats: threats.length,
      blockedIPs: blockedIPs.length,
      criticalThreats,
      highThreats,
      mediumThreats,
      lowThreats,
      topCountries,
    };
  }
}
