import { nanoid } from 'nanoid';
import type { DetectionRule } from '../types.js';

export const gwAuth001: DetectionRule = {
  id: 'GW-AUTH-001',
  name: 'Gateway credential attack',
  description:
    'Detects concentrated or distributed credential attacks against gateway authentication endpoints.',
  version: '1.0.0',
  severity: 'critical',
  providers: ['gateway'],
  categories: ['authentication', 'credential-access'],
  enabled: true,
  supportedProvenance: ['live'],
  testPaths: [
    'test/detection-rules.unit.test.ts',
    'test/gw-auth-detection.integration.test.ts',
    'test/scenarios.integration.test.ts',
  ],
  severityRationale:
    'Successful credential stuffing or brute force can yield privileged API access.',
  falsePositiveNotes: [
    'Shared NAT egress can inflate distinct IP counts; correlate with user-agent and timing.',
    'Guided scenario traffic against sim-target is intentional and labelled LIVE.',
  ],
  remediation: [
    'Enforce IP block for abusive sources',
    'Verify account lockout engaged for targeted demo account',
    'Rotate credentials if compromise is suspected',
    'Review audit trail for follow-on authorization attempts',
  ],
  evaluate(event, context) {
    if (event.provider !== 'gateway') return null;
    const isAuthFailure =
      event.category === 'authentication' &&
      (event.outcome === 'failure' ||
        event.action.includes('login_failed') ||
        event.action.includes('auth.failed'));

    if (!isAuthFailure && event.action !== 'gateway.credential_attack') {
      return null;
    }

    const failedLoginCount = context.failedLoginCount ?? 0;
    const distinctSourceIps = context.distinctSourceIps ?? (event.sourceIp ? 1 : 0);
    const concentrated = failedLoginCount >= 5;
    const distributed = distinctSourceIps >= 3 && failedLoginCount >= 3;
    const explicit = event.action === 'gateway.credential_attack';

    if (!concentrated && !distributed && !explicit) {
      return null;
    }

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: 'Gateway credential attack detected',
      description: distributed
        ? 'Distributed failed authentication pattern against gateway login'
        : 'Concentrated failed authentication / lockout pattern against gateway login',
      severity: this.severity,
      matchedFields: {
        action: event.action,
        sourceIp: event.sourceIp,
        failedLoginCount,
        distinctSourceIps,
        principal: event.principal?.id ?? event.principal?.displayName,
      },
      remediation: this.remediation,
      evidenceEventIds: [event.id],
      correlationKey: `gw-auth:${event.principal?.id ?? 'sim-target'}:${event.sourceIp ?? 'multi'}`,
      falsePositiveNotes: this.falsePositiveNotes,
      severityRationale: this.severityRationale,
      createdAt: new Date().toISOString(),
      provenance: event.provenance,
    };
  },
};
