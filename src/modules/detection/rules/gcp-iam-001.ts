import { nanoid } from 'nanoid';
import type { DetectionRule } from '../types.js';

export const gcpIam001: DetectionRule = {
  id: 'GCP-IAM-001',
  name: 'GCP service-account key creation',
  description:
    'Detects creation of long-lived GCP service account keys (credential persistence risk).',
  version: '1.0.0',
  severity: 'high',
  providers: ['gcp'],
  categories: ['persistence', 'credential-access'],
  enabled: true,
  supportedProvenance: ['replay', 'live'],
  testPaths: [
    'test/detection-rules.unit.test.ts',
    'test/gcp-logging-adapter-pipeline.integration.test.ts',
    'test/scenarios.integration.test.ts',
  ],
  severityRationale:
    'Service account JSON keys are long-lived credentials that are difficult to rotate and frequently leaked.',
  falsePositiveNotes: [
    'Some legacy systems still require keys; treat as exceptions with expiry tracking.',
  ],
  remediation: [
    'Prefer Workload Identity Federation over service account keys',
    'Disable and delete unexpected keys',
    'Restrict whoCanCreateServiceAccountKeys org policy',
    'Do not disable GCP identities from this demo without a sandbox',
  ],
  evaluate(event) {
    if (event.provider !== 'gcp') return null;
    const action = event.action.toLowerCase();
    const match =
      action.includes('createserviceaccountkey') ||
      action.includes('serviceaccountkeys.create') ||
      event.title.toLowerCase().includes('service-account key');

    if (!match) return null;

    return {
      id: nanoid(),
      ruleId: this.id,
      ruleVersion: this.version,
      title: 'GCP service-account key creation',
      description: event.summary,
      severity: this.severity,
      matchedFields: {
        action: event.action,
        principal: event.principal,
        resource: event.resource,
        project: event.accountOrProjectId,
        sourceIp: event.sourceIp,
      },
      remediation: this.remediation,
      evidenceEventIds: [event.id],
      correlationKey: `gcp-sa-key:${event.accountOrProjectId ?? 'unknown'}:${event.resource?.id ?? 'unknown'}`,
      falsePositiveNotes: this.falsePositiveNotes,
      severityRationale: this.severityRationale,
      createdAt: new Date().toISOString(),
      provenance: event.provenance,
    };
  },
};
