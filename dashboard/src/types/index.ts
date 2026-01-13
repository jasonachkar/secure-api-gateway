/**
 * Dashboard TypeScript types
 */

export interface MetricsSummary {
  requestsPerSecond: number;
  totalRequests: number;
  activeConnections: number;
  errorRate: number;
  authStats: {
    failedLogins: number;
    successfulLogins: number;
    accountLockouts: number;
    activeSessions: number;
  };
  rateLimitStats: {
    violations: number;
    topViolators: Array<{ ip: string; count: number }>;
  };
  responseTimeStats: {
    p50: number;
    p95: number;
    p99: number;
  };
  systemHealth: {
    redisConnected: boolean;
    uptime: number;
  };
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  eventType: string;
  userId?: string;
  username?: string;
  ip: string;
  requestId: string;
  resource?: string;
  action?: string;
  success: boolean;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionInfo {
  jti: string;
  userId: string;
  username: string;
  roles: string[];
  createdAt: number;
  expiresAt: number;
  lastUsedAt?: number;
}

export interface UserInfo {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  lockout?: {
    isLocked: boolean;
    attempts: number;
    expiresAt?: number;
  };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RuntimeConfig {
  demoMode: boolean;
}

// Threat Intelligence Types

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

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
    ll?: [number, number];
    timezone?: string;
  } | null;
  isBlocked: boolean;
  abuseScore?: number;
}

export interface AttackPattern {
  type: 'brute_force' | 'credential_stuffing' | 'rate_limit_abuse' | 'suspicious_behavior';
  severity: ThreatLevel;
  ipAddresses: string[];
  eventCount: number;
  timeWindow: number;
  description: string;
}

export interface ThreatStatistics {
  totalThreats: number;
  blockedIPs: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  lowThreats: number;
  topCountries: Array<{ country: string; count: number }>;
}

// Incident Response Types

export type IncidentStatus = 'open' | 'investigating' | 'contained' | 'resolved' | 'closed';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentType = 
  | 'brute_force'
  | 'credential_stuffing'
  | 'rate_limit_abuse'
  | 'account_lockout'
  | 'suspicious_activity'
  | 'data_breach'
  | 'ddos'
  | 'malware'
  | 'unauthorized_access'
  | 'other';

export interface Incident {
  id: string;
  title: string;
  description: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
  reportedBy: string;
  assignedTo?: string;
  affectedIPs: string[];
  affectedUsers?: string[];
  responseTime?: number;
  resolutionTime?: number;
  notes: Array<{
    timestamp: number;
    author: string;
    content: string;
  }>;
  tags: string[];
  metadata?: Record<string, unknown>;
}

export interface IncidentStatistics {
  totalIncidents: number;
  openIncidents: number;
  resolvedIncidents: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  byType: Record<IncidentType, number>;
  byStatus: Record<IncidentStatus, number>;
  recentTrends: Array<{
    date: string;
    opened: number;
    resolved: number;
  }>;
}

// Compliance Types

export interface SecurityPosture {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  factors: {
    authentication: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        failedLoginRate: number;
        accountLockouts: number;
        mfaEnabled: boolean;
        sessionSecurity: number;
      };
    };
    threatIntelligence: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        criticalThreats: number;
        blockedIPs: number;
        threatResponseTime: number;
      };
    };
    rateLimiting: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        violations: number;
        coverage: number;
      };
    };
    auditLogging: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        logCoverage: number;
        retentionDays: number;
      };
    };
    incidentResponse: {
      score: number;
      status: 'excellent' | 'good' | 'fair' | 'poor';
      details: {
        openIncidents: number;
        avgResponseTime: number;
        avgResolutionTime: number;
      };
    };
  };
  recommendations: string[];
  lastUpdated: number;
}

export interface ComplianceMetrics {
  nist: {
    score: number;
    controls: Array<{
      id: string;
      name: string;
      status: 'compliant' | 'partial' | 'non-compliant';
      evidence: string[];
    }>;
  };
  owasp: {
    score: number;
    top10: Array<{
      risk: string;
      status: 'mitigated' | 'partial' | 'vulnerable';
      description: string;
    }>;
  };
  pci: {
    score: number;
    requirements: Array<{
      id: string;
      name: string;
      status: 'compliant' | 'non-compliant';
    }>;
  };
  gdpr: {
    score: number;
    principles: Array<{
      principle: string;
      status: 'compliant' | 'partial' | 'non-compliant';
      description: string;
    }>;
  };
}
