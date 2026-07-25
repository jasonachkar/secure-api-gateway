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
    const signals = [
      'jwt.invalid',
      'jwt.tampered',
      'token.invalid',
      'privileged_jwt_failure',
    ];
    const matched = signals.some(
      (s) => event.action.includes(s) || event.title.toLowerCase().includes('tampered')
    );
    if (!matched && event.category !== 'malicious-request') return null;
    if (!matched) return null;

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: 'Invalid or tampered privileged JWT attempt',
      description: event.summary,
      severity: this.severity,
      matchedFields: {
        action: event.action,
        sourceIp: event.sourceIp,
        outcome: event.outcome,
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
