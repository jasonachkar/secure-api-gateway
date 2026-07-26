/**
 * parseAzureEvent: Azure Activity Log record -> NormalizedSecurityEvent. Replay-only -
 * see docs/CLOUD_INGESTION.md for why there is no live Azure connector. Covers the
 * semantic categories AZ-IAM-001 relies on plus error handling for malformed input.
 */
import { describe, it, expect } from '@jest/globals';
import { parseAzureEvent } from '../src/modules/ingestion/parsers/azure.parser.js';

describe('parseAzureEvent', () => {
  it('classifies a privileged role assignment as critical privilege-escalation', () => {
    const event = parseAzureEvent(
      {
        eventDataId: 'evt-1',
        eventTimestamp: '2026-01-01T00:00:00Z',
        operationName: 'Microsoft.Authorization/roleAssignments/write',
        caller: 'admin@example.onmicrosoft.com',
        subscriptionId: 'sub-1',
        status: 'Succeeded',
      },
      'replay'
    );
    expect(event.severity).toBe('critical');
    expect(event.category).toBe('privilege-escalation');
    expect(event.provenance).toBe('replay');
    expect(event.principal.email).toBe('admin@example.onmicrosoft.com');
  });

  it('classifies a Key Vault access policy change as high configuration-change', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-2',
      eventTimestamp: '2026-01-01T00:00:01Z',
      operationName: 'Microsoft.KeyVault/vaults/accessPolicies/write',
      status: 'Succeeded',
    });
    expect(event.severity).toBe('high');
    expect(event.category).toBe('configuration-change');
  });

  it('classifies an NSG rule change as high network', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-3',
      eventTimestamp: '2026-01-01T00:00:02Z',
      operationName: 'Microsoft.Network/networkSecurityGroups/securityRules/write',
      status: 'Succeeded',
    });
    expect(event.severity).toBe('high');
    expect(event.category).toBe('network');
  });

  it('classifies an authorization failure as medium authorization', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-4',
      eventTimestamp: '2026-01-01T00:00:03Z',
      operationName: 'Microsoft.Compute/virtualMachines/start/action',
      status: 'Failed',
      properties: { statusMessage: 'AuthorizationFailed' },
    });
    expect(event.severity).toBe('medium');
    expect(event.category).toBe('authorization');
  });

  it('classifies a Container App configuration change as medium configuration-change', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-5',
      eventTimestamp: '2026-01-01T00:00:04Z',
      operationName: 'Microsoft.App/containerApps/write',
      status: 'Succeeded',
    });
    expect(event.severity).toBe('medium');
    expect(event.category).toBe('configuration-change');
  });

  it('marks a failing status as outcome failure', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-6',
      eventTimestamp: '2026-01-01T00:00:05Z',
      operationName: 'Microsoft.Storage/storageAccounts/write',
      status: 'Failed',
    });
    expect(event.outcome).toBe('failure');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseAzureEvent('not an object')).toThrow('Azure event payload must be an object');
  });

  it('rejects a record with no derivable event id', () => {
    expect(() => parseAzureEvent({ operationName: 'x' })).toThrow('Azure event missing provider event ID');
  });

  it('redacts sensitive values embedded in the raw event before storing it', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-7',
      eventTimestamp: '2026-01-01T00:00:06Z',
      operationName: 'Microsoft.KeyVault/vaults/secrets/write',
      properties: { authorization: 'Bearer some-real-looking-token-value' },
    });
    const props = event.rawEvent.properties as Record<string, unknown>;
    expect(props.authorization).toBe('[REDACTED]');
  });

  it('carries source-code and test evidence references that resolve to real files', () => {
    const event = parseAzureEvent({
      eventDataId: 'evt-8',
      eventTimestamp: '2026-01-01T00:00:07Z',
      operationName: 'Microsoft.Storage/storageAccounts/write',
    });
    const sourceRef = event.evidence.find((e) => e.type === 'source-code');
    const testRef = event.evidence.find((e) => e.type === 'test');
    expect(sourceRef?.reference).toBe('src/modules/ingestion/parsers/azure.parser.ts');
    expect(testRef?.reference).toBe('test/azure-parser.unit.test.ts');
  });
});
