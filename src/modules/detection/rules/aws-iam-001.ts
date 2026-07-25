import { nanoid } from 'nanoid';
import type { DetectionRule } from '../types.js';

export const awsIam001: DetectionRule = {
  id: 'AWS-IAM-001',
  name: 'AWS root-account activity',
  description: 'Detects CloudTrail events indicating AWS root account usage.',
  version: '1.0.0',
  severity: 'critical',
  providers: ['aws'],
  categories: ['privilege-escalation', 'authentication'],
  severityRationale:
    'Root account credentials bypass IAM least privilege and MFA-scoped roles; any use is high risk.',
  falsePositiveNotes: [
    'Break-glass root use may be legitimate if documented; still require investigation.',
  ],
  remediation: [
    'Verify whether root use was authorized break-glass activity',
    'Ensure root has hardware MFA and no access keys',
    'Prefer SSO / IAM roles for administration',
    'Do not perform destructive AWS remediation from this demo control plane',
  ],
  evaluate(event) {
    if (event.provider !== 'aws') return null;
    const principalType = event.principal?.type?.toLowerCase();
    const principalId = event.principal?.id ?? '';
    const isRoot =
      principalType === 'root' ||
      /:root$/.test(principalId) ||
      event.principal?.displayName === 'root' ||
      event.title.toLowerCase().includes('root-account');

    if (!isRoot) return null;

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: 'AWS root-account activity',
      description: event.summary,
      severity: this.severity,
      matchedFields: {
        principal: event.principal,
        action: event.action,
        accountOrProjectId: event.accountOrProjectId,
        sourceIp: event.sourceIp,
      },
      remediation: this.remediation,
      evidenceEventIds: [event.id],
      correlationKey: `aws-root:${event.accountOrProjectId ?? 'unknown'}`,
      falsePositiveNotes: this.falsePositiveNotes,
      severityRationale: this.severityRationale,
      createdAt: new Date().toISOString(),
      provenance: event.provenance,
    };
  },
};
