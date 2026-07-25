import { nanoid } from 'nanoid';
import type { DetectionRule } from '../types.js';

const ACTIONS = new Set([
  'AttachUserPolicy',
  'AttachRolePolicy',
  'PutUserPolicy',
  'PutRolePolicy',
  'CreatePolicyVersion',
  'CreateAccessKey',
]);

export const awsIam002: DetectionRule = {
  id: 'AWS-IAM-002',
  name: 'AWS IAM privilege or credential persistence change',
  description:
    'Detects IAM policy attachments and access-key creation that enable privilege escalation or persistence.',
  version: '1.0.0',
  severity: 'high',
  providers: ['aws'],
  categories: ['privilege-escalation', 'persistence', 'credential-access'],
  severityRationale:
    'Policy attachment and long-lived access keys are common privilege-escalation and persistence techniques.',
  falsePositiveNotes: [
    'IaC pipelines may legitimately attach policies; correlate with expected automation principals.',
  ],
  remediation: [
    'Review the principal that performed the change',
    'Confirm the target identity needed the new privileges',
    'Prefer short-lived credentials over access keys',
    'Do not disable AWS identities from this demo without a sandbox',
  ],
  evaluate(event) {
    if (event.provider !== 'aws') return null;
    if (!ACTIONS.has(event.action) && event.category !== 'privilege-escalation' && event.category !== 'persistence') {
      return null;
    }
    if (!ACTIONS.has(event.action)) return null;

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: 'AWS IAM privilege or credential persistence change',
      description: event.summary,
      severity: this.severity,
      matchedFields: {
        action: event.action,
        principal: event.principal,
        resource: event.resource,
        accountOrProjectId: event.accountOrProjectId,
      },
      remediation: this.remediation,
      evidenceEventIds: [event.id],
      correlationKey: `aws-iam:${event.accountOrProjectId ?? 'unknown'}:${event.principal?.id ?? 'unknown'}`,
      falsePositiveNotes: this.falsePositiveNotes,
      severityRationale: this.severityRationale,
      createdAt: new Date().toISOString(),
      provenance: event.provenance,
    };
  },
};
