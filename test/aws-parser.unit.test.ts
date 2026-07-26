/**
 * parseAwsEvent: CloudTrail/WAF/API Gateway record -> NormalizedSecurityEvent.
 * Covers the semantic categories AWS-IAM-001/002 rely on (docs/CLOUD_INGESTION.md,
 * docs/DETECTION_RULES.md) plus error handling for malformed input.
 */
import { describe, it, expect } from '@jest/globals';
import { parseAwsEvent } from '../src/modules/ingestion/parsers/aws.parser.js';

describe('parseAwsEvent', () => {
  it('classifies root-account console login as critical privilege-escalation', () => {
    const event = parseAwsEvent(
      {
        eventID: 'evt-root-1',
        eventName: 'ConsoleLogin',
        eventTime: '2026-01-01T00:00:00Z',
        eventSource: 'signin.amazonaws.com',
        awsRegion: 'us-east-1',
        recipientAccountId: '123456789012',
        sourceIPAddress: '198.51.100.5',
        userIdentity: { type: 'Root', principalId: '123456789012', arn: 'arn:aws:iam::123456789012:root' },
      },
      'replay'
    );
    expect(event.severity).toBe('critical');
    expect(event.category).toBe('privilege-escalation');
    expect(event.principal.type).toBe('Root');
    expect(event.provenance).toBe('replay');
    expect(event.providerEventId).toBe('evt-root-1');
  });

  it('classifies a console login failure as medium authentication', () => {
    const event = parseAwsEvent({
      eventID: 'evt-2',
      eventName: 'ConsoleLogin',
      eventTime: '2026-01-01T00:00:01Z',
      errorMessage: 'Failed authentication',
      userIdentity: { type: 'IAMUser', userName: 'alice' },
    });
    expect(event.severity).toBe('medium');
    expect(event.category).toBe('authentication');
    expect(event.outcome).toBe('failure');
  });

  it('classifies IAM policy attachment as high privilege-escalation', () => {
    const event = parseAwsEvent({
      eventID: 'evt-3',
      eventName: 'AttachUserPolicy',
      eventTime: '2026-01-01T00:00:02Z',
      userIdentity: { type: 'IAMUser', userName: 'bob' },
      requestParameters: { userName: 'bob', policyArn: 'arn:aws:iam::aws:policy/AdministratorAccess' },
    });
    expect(event.severity).toBe('high');
    expect(event.category).toBe('privilege-escalation');
  });

  it('classifies access-key creation as high persistence', () => {
    const event = parseAwsEvent({
      eventID: 'evt-4',
      eventName: 'CreateAccessKey',
      eventTime: '2026-01-01T00:00:03Z',
      userIdentity: { type: 'IAMUser', userName: 'carol' },
    });
    expect(event.severity).toBe('high');
    expect(event.category).toBe('persistence');
  });

  it('classifies a WAF blocked request as medium malicious-request', () => {
    const event = parseAwsEvent({
      eventID: 'evt-5',
      eventName: 'wafBlock',
      eventSource: 'waf.amazonaws.com',
      eventTime: '2026-01-01T00:00:04Z',
      httpRequest: { clientIp: '198.51.100.9', action: 'BLOCK' },
    });
    expect(event.severity).toBe('medium');
    expect(event.category).toBe('malicious-request');
  });

  it('classifies an API Gateway authorization failure as medium authorization', () => {
    const event = parseAwsEvent({
      eventID: 'evt-6',
      eventName: 'Unauthorized',
      eventTime: '2026-01-01T00:00:05Z',
      errorCode: 'AccessDeniedException',
    });
    expect(event.severity).toBe('medium');
    expect(event.category).toBe('authorization');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseAwsEvent('not an object')).toThrow('AWS event payload must be an object');
  });

  it('rejects a record with no derivable event id', () => {
    expect(() => parseAwsEvent({ eventName: 'SomeEvent' })).toThrow('AWS event missing provider event ID');
  });

  it('redacts a key name that itself looks sensitive ("accessKey") down to the whole value', () => {
    const event = parseAwsEvent({
      eventID: 'evt-7',
      eventName: 'CreateAccessKey',
      eventTime: '2026-01-01T00:00:06Z',
      userIdentity: { type: 'IAMUser', userName: 'dave' },
      responseElements: { accessKey: { secretAccessKey: 'super-secret-value' } },
    });
    const responseElements = event.rawEvent.responseElements as Record<string, unknown>;
    // "accessKey" itself matches the sensitive-key pattern, so the whole nested object
    // is redacted at that level - not just secretAccessKey inside it.
    expect(responseElements.accessKey).toBe('[REDACTED]');
  });

  it('redacts a sensitive value nested under a non-sensitive key name', () => {
    const event = parseAwsEvent({
      eventID: 'evt-7b',
      eventName: 'CreateAccessKey',
      eventTime: '2026-01-01T00:00:06Z',
      userIdentity: { type: 'IAMUser', userName: 'dave' },
      responseElements: { keyMaterial: { secretAccessKey: 'super-secret-value' } },
    });
    const responseElements = event.rawEvent.responseElements as Record<string, unknown>;
    const keyMaterial = responseElements.keyMaterial as Record<string, unknown>;
    expect(keyMaterial.secretAccessKey).toBe('[REDACTED]');
  });

  it('carries source-code and test evidence references that resolve to real files', () => {
    const event = parseAwsEvent({ eventID: 'evt-8', eventName: 'X' });
    const sourceRef = event.evidence.find((e) => e.type === 'source-code');
    const testRef = event.evidence.find((e) => e.type === 'test');
    expect(sourceRef?.reference).toBe('src/modules/ingestion/parsers/aws.parser.ts');
    expect(testRef?.reference).toBe('test/aws-parser.unit.test.ts');
  });
});
