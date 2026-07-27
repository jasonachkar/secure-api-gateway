/**
 * Detection rule unit tests - runs the 6 required rules against the sanitized
 * replay fixtures (and synthetic gateway events, since there's no separate
 * gateway fixture directory) to confirm true positives fire and unrelated
 * events don't produce false positives.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allRules, gwAuth001, gwToken001, awsIam001, awsIam002, gcpIam001, azIam001 } from '../src/modules/detection/rules/index.js';
import { parseAwsEvent } from '../src/modules/ingestion/parsers/aws.parser.js';
import { parseGcpEvent } from '../src/modules/ingestion/parsers/gcp.parser.js';
import { parseAzureEvent } from '../src/modules/ingestion/parsers/azure.parser.js';
import { parseGatewayEvent } from '../src/modules/ingestion/parsers/gateway.parser.js';

function loadFixture(provider: string, name: string): unknown {
  const raw = readFileSync(join(__dirname, 'fixtures', provider, `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

describe('Detection rule registry', () => {
  it('exposes exactly the 6 required stable rule IDs', () => {
    const ids = allRules.map((r) => r.id).sort();
    expect(ids).toEqual(
      ['AWS-IAM-001', 'AWS-IAM-002', 'AZ-IAM-001', 'GCP-IAM-001', 'GW-AUTH-001', 'GW-TOKEN-001'].sort()
    );
  });

  it('every rule declares severity rationale, false-positive notes, and remediation', () => {
    for (const rule of allRules) {
      expect(rule.severityRationale.length).toBeGreaterThan(0);
      expect(rule.falsePositiveNotes.length).toBeGreaterThan(0);
      expect(rule.remediation.length).toBeGreaterThan(0);
      expect(rule.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});

describe('AWS-IAM-001 (root-account activity)', () => {
  it('fires on CloudTrail root console login', () => {
    const event = parseAwsEvent(loadFixture('aws', 'cloudtrail-root-activity'), 'replay');
    const result = awsIam001.evaluate(event, {});
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('AWS-IAM-001');
    expect(result!.severity).toBe('critical');
    expect(result!.evidenceEventIds).toContain(event.id);
  });

  it('does not fire on a non-root IAM policy change', () => {
    const event = parseAwsEvent(loadFixture('aws', 'iam-policy-attached'), 'replay');
    expect(awsIam001.evaluate(event, {})).toBeNull();
  });
});

describe('AWS-IAM-002 (IAM privilege/credential persistence change)', () => {
  it('fires on IAM policy attachment', () => {
    const event = parseAwsEvent(loadFixture('aws', 'iam-policy-attached'), 'replay');
    const result = awsIam002.evaluate(event, {});
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('AWS-IAM-002');
  });

  it('fires on access key creation', () => {
    const event = parseAwsEvent(loadFixture('aws', 'access-key-created'), 'replay');
    const result = awsIam002.evaluate(event, {});
    expect(result).not.toBeNull();
  });

  it('does not fire on an unrelated WAF block', () => {
    const event = parseAwsEvent(loadFixture('aws', 'waf-blocked-request'), 'replay');
    expect(awsIam002.evaluate(event, {})).toBeNull();
  });
});

describe('GCP-IAM-001 (service-account key creation)', () => {
  it('fires on service-account key creation', () => {
    const event = parseGcpEvent(loadFixture('gcp', 'service-account-key-created'), 'replay');
    const result = gcpIam001.evaluate(event, {});
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('high');
  });

  it('does not fire on an unrelated permission-denied event', () => {
    const event = parseGcpEvent(loadFixture('gcp', 'permission-denied'), 'replay');
    expect(gcpIam001.evaluate(event, {})).toBeNull();
  });
});

describe('AZ-IAM-001 (privileged role assignment)', () => {
  it('fires on a role assignment write', () => {
    const event = parseAzureEvent(loadFixture('azure', 'privileged-role-assignment'), 'replay');
    const result = azIam001.evaluate(event, {});
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
  });

  it('does not fire on an unrelated NSG change', () => {
    const event = parseAzureEvent(loadFixture('azure', 'nsg-change'), 'replay');
    expect(azIam001.evaluate(event, {})).toBeNull();
  });
});

describe('GW-AUTH-001 (gateway credential attack)', () => {
  it('fires when failed-login count crosses the concentrated threshold', () => {
    const event = parseGatewayEvent(
      { action: 'gateway.account_lockout', outcome: 'failure', category: 'authentication', sourceIp: '203.0.113.10' },
      'live'
    );
    const result = gwAuth001.evaluate(event, { failedLoginCount: 5, distinctSourceIps: 1 });
    expect(result).not.toBeNull();
    expect(result!.severity).toBe('critical');
  });

  it('fires on a distributed pattern below the concentrated threshold', () => {
    const event = parseGatewayEvent(
      { action: 'auth.login_failed', outcome: 'failure', category: 'authentication', sourceIp: '198.51.100.5' },
      'live'
    );
    const result = gwAuth001.evaluate(event, { failedLoginCount: 3, distinctSourceIps: 3 });
    expect(result).not.toBeNull();
  });

  it('does not fire on an isolated failed login', () => {
    const event = parseGatewayEvent(
      { action: 'auth.login_failed', outcome: 'failure', category: 'authentication', sourceIp: '198.51.100.5' },
      'live'
    );
    expect(gwAuth001.evaluate(event, { failedLoginCount: 1, distinctSourceIps: 1 })).toBeNull();
  });

  it('does not fire on a successful login', () => {
    const event = parseGatewayEvent(
      { action: 'auth.login_success', outcome: 'success', category: 'authentication' },
      'live'
    );
    expect(gwAuth001.evaluate(event, { failedLoginCount: 10, distinctSourceIps: 5 })).toBeNull();
  });
});

describe('GW-TOKEN-001 (tampered/invalid privileged JWT)', () => {
  it('fires on a tampered JWT signal', () => {
    const event = parseGatewayEvent(
      { action: 'auth.jwt.tampered', outcome: 'failure', category: 'malicious-request', sourceIp: '192.0.2.20' },
      'live'
    );
    const result = gwToken001.evaluate(event, {});
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('GW-TOKEN-001');
  });

  it('does not fire on an unrelated authentication failure', () => {
    const event = parseGatewayEvent(
      { action: 'auth.login_failed', outcome: 'failure', category: 'authentication', sourceIp: '192.0.2.20' },
      'live'
    );
    expect(gwToken001.evaluate(event, {})).toBeNull();
  });
});
