import { nanoid } from 'nanoid';
import type { DetectionRule } from '../types.js';

export const gwToken001: DetectionRule = {
  id: 'GW-TOKEN-001',
  name: 'Tampered or invalid privileged JWT attempt',
  description:
    'Detects invalid, expired, or structurally tampered JWT presentations targeting privileged routes.',
  version: '1.0.0',
  severity: 'high',
  providers: ['gateway'],
  categories: ['authentication', 'authorization', 'malicious-request'],
  enabled: true,
  supportedProvenance: ['live'],
  testPaths: ['test/gw-token-detection.integration.test.ts'],
  severityRationale:
    'Token tampering or privileged JWT misuse is a direct attempt to bypass gateway authorization.',
  falsePositiveNotes: [
    'Clock skew can produce expired-token noise; validate NTP and token TTL configuration.',
  ],
  remediation: [
    'Reject the token and leave it blacklisted if a jti is present',
    'Inspect Authorization header source IP and user agent',
    'Confirm RS256/HS256 configuration matches deployment expectations',
  ],
  evaluate(event) {
    if (event.provider !== 'gateway') return null;
    // Deliberately excludes plain 'jwt.expired' - routine token expiry is expected,
    // frequent, noisy signal (see falsePositiveNotes) and would otherwise open an
    // investigation on every normal client refresh cycle. The canonical event for an
    // expired token is still generated (see middleware/auth.ts) as pipeline evidence;
    // it simply never matches this rule.
    const signals = [
      'jwt.invalid',
      'jwt.tampered',
      'token.invalid',
      'token.revoked',
      'privileged_jwt_failure',
    ];
    const matched = signals.some(
      (s) => event.action.includes(s) || event.title.toLowerCase().includes('tampered')
    );
    if (!matched) return null;

    // A JWT failure against an admin route (middleware/auth.ts tags these
    // 'privileged_jwt_failure:...') is a materially bigger deal than the same failure
    // against an ordinary route - someone is specifically probing for privileged access,
    // not just presenting a stale token to a routine endpoint.
    const isPrivilegedRoute = event.action.includes('privileged_jwt_failure');
    const severity = isPrivilegedRoute ? 'critical' : this.severity;

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: isPrivilegedRoute ? 'Invalid or tampered JWT presented to a privileged route' : 'Invalid or tampered privileged JWT attempt',
      description: event.summary,
      severity,
      matchedFields: {
        action: event.action,
        sourceIp: event.sourceIp,
        outcome: event.outcome,
        privilegedRoute: isPrivilegedRoute,
      },
      remediation: this.remediation,
      evidenceEventIds: [event.id],
      correlationKey: `gw-token:${event.sourceIp ?? 'unknown'}`,
      falsePositiveNotes: this.falsePositiveNotes,
      severityRationale: this.severityRationale,
      createdAt: new Date().toISOString(),
      provenance: event.provenance,
    };
  },
};
