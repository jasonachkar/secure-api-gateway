import { nanoid } from 'nanoid';
import type { DetectionRule } from '../types.js';

export const azIam001: DetectionRule = {
  id: 'AZ-IAM-001',
  name: 'Azure privileged role assignment',
  description: 'Detects Azure RBAC role assignment operations that grant privileged access.',
  version: '1.0.0',
  severity: 'critical',
  providers: ['azure'],
  categories: ['privilege-escalation', 'authorization'],
  enabled: true,
  // Azure has no live connector (see docs/CLOUD_INGESTION.md / azure-sentinel.adapter.ts) - replay only. Do not add 'live' here until a real Azure Monitor/Log Analytics adapter exists and is tested.
  supportedProvenance: ['replay'],
  testPaths: ['test/detection-rules.unit.test.ts'],
  severityRationale:
    'Privileged role assignments (e.g. Owner / User Access Administrator) expand control over subscriptions and resources.',
  falsePositiveNotes: [
    'PIM-eligible activations may appear similar; prefer verifying via Entra PIM audit where available.',
  ],
  remediation: [
    'Verify the assignment was expected and time-bounded',
    'Prefer Privileged Identity Management for just-in-time access',
    'Review Key Vault and subscription scope impact',
    'Azure identity disable remains DISABLED in this control plane',
  ],
  evaluate(event) {
    if (event.provider !== 'azure') return null;
    const match =
      /roleAssignments\/write/i.test(event.action) ||
      event.title.toLowerCase().includes('privileged role assignment');

    if (!match) return null;

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: 'Azure privileged role assignment',
      description: event.summary,
      severity: this.severity,
      matchedFields: {
        action: event.action,
        principal: event.principal,
        resource: event.resource,
        subscriptionId: event.accountOrProjectId,
      },
      remediation: this.remediation,
      evidenceEventIds: [event.id],
      correlationKey: `az-role:${event.accountOrProjectId ?? 'unknown'}:${event.principal?.id ?? 'unknown'}`,
      falsePositiveNotes: this.falsePositiveNotes,
      severityRationale: this.severityRationale,
      createdAt: new Date().toISOString(),
      provenance: event.provenance,
    };
  },
};
