/**
 * parseGcpEvent: Cloud Audit Log record -> NormalizedSecurityEvent. Covers the semantic
 * categories GCP-IAM-001 relies on (docs/CLOUD_INGESTION.md, docs/DETECTION_RULES.md)
 * plus error handling for malformed input and the live-adapter Date/string timestamp
 * fix (see docs/CLOUD_INGESTION.md).
 */
import { describe, it, expect } from '@jest/globals';
import { parseGcpEvent } from '../src/modules/ingestion/parsers/gcp.parser.js';

describe('parseGcpEvent', () => {
  it('classifies service-account key creation as high persistence', () => {
    const event = parseGcpEvent(
      {
        insertId: 'insert-1',
        logName: 'projects/my-project/logs/cloudaudit.googleapis.com%2Factivity',
        timestamp: '2026-01-01T00:00:00Z',
        severity: 'NOTICE',
        resource: { type: 'service_account', labels: { project_id: 'my-project' } },
        protoPayload: {
          serviceName: 'iam.googleapis.com',
          methodName: 'google.iam.admin.v1.CreateServiceAccountKey',
          resourceName: 'projects/my-project/serviceAccounts/runner@my-project.iam.gserviceaccount.com',
          authenticationInfo: { principalEmail: 'admin@example.com' },
          requestMetadata: { callerIp: '198.51.100.10' },
        },
      },
      'replay'
    );
    expect(event.severity).toBe('high');
    expect(event.category).toBe('persistence');
    // The acting principal is the admin user who created the key, not the service
    // account the key was created *for* (that's the resource) - real
    // CreateServiceAccountKey semantics.
    expect(event.principal.type).toBe('user');
    expect(event.providerEventId).toBe('insert-1');
  });

  it('classifies an IAM policy modification as high privilege-escalation', () => {
    const event = parseGcpEvent({
      insertId: 'insert-2',
      timestamp: '2026-01-01T00:00:01Z',
      protoPayload: { methodName: 'SetIamPolicy', authenticationInfo: { principalEmail: 'user@example.com' } },
    });
    expect(event.severity).toBe('high');
    expect(event.category).toBe('privilege-escalation');
  });

  it('classifies a privileged role grant as critical privilege-escalation', () => {
    const event = parseGcpEvent({
      insertId: 'insert-3',
      timestamp: '2026-01-01T00:00:02Z',
      protoPayload: {
        methodName: 'google.iam.admin.v1.SetPolicy',
        request: { policy: { bindings: [{ role: 'roles/owner' }] } },
      },
    });
    expect(event.severity).toBe('critical');
    expect(event.category).toBe('privilege-escalation');
  });

  it('classifies permission denied as medium authorization', () => {
    const event = parseGcpEvent({
      insertId: 'insert-4',
      timestamp: '2026-01-01T00:00:03Z',
      protoPayload: { methodName: 'storage.objects.get', status: { code: 7 } },
    });
    expect(event.severity).toBe('medium');
    expect(event.category).toBe('authorization');
  });

  it('classifies an audit configuration change as high audit-integrity', () => {
    const event = parseGcpEvent({
      insertId: 'insert-5',
      timestamp: '2026-01-01T00:00:04Z',
      protoPayload: { methodName: 'google.logging.v2.ConfigServiceV2.UpdateSink' },
    });
    expect(event.severity).toBe('high');
    expect(event.category).toBe('audit-integrity');
  });

  it('accepts a JS Date for timestamp (the shape @google-cloud/logging hands the live adapter), not just a string', () => {
    const event = parseGcpEvent({
      insertId: 'insert-6',
      timestamp: new Date('2026-01-01T00:00:05Z').toISOString(), // adapter re-serializes Date -> string before this point
      protoPayload: { methodName: 'x' },
    });
    expect(event.occurredAt).toBe('2026-01-01T00:00:05.000Z');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseGcpEvent('not an object')).toThrow('GCP event payload must be an object');
  });

  it('rejects a record with no derivable insertId', () => {
    expect(() => parseGcpEvent({ protoPayload: { methodName: 'x' } })).toThrow(
      'GCP event missing insertId / provider event ID'
    );
  });

  it('redacts sensitive values embedded in the raw event before storing it', () => {
    const event = parseGcpEvent({
      insertId: 'insert-7',
      timestamp: '2026-01-01T00:00:06Z',
      protoPayload: {
        methodName: 'google.iam.admin.v1.CreateServiceAccountKey',
        serviceAccountKey: { private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----' },
      },
    });
    const proto = event.rawEvent.protoPayload as Record<string, unknown>;
    const key = proto.serviceAccountKey as Record<string, unknown>;
    expect(key.private_key).toBe('[REDACTED]');
  });

  it('carries source-code and test evidence references that resolve to real files', () => {
    const event = parseGcpEvent({
      insertId: 'insert-8',
      timestamp: '2026-01-01T00:00:07Z',
      protoPayload: { methodName: 'some.method' },
    });
    const sourceRef = event.evidence.find((e) => e.type === 'source-code');
    const testRef = event.evidence.find((e) => e.type === 'test');
    expect(sourceRef?.reference).toBe('src/modules/ingestion/parsers/gcp.parser.ts');
    expect(testRef?.reference).toBe('test/gcp-parser.unit.test.ts');
  });
});
