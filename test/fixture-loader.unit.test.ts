/**
 * Fixture catalogue and loader: replay fixture ids must resolve only by exact match
 * against a pre-built allowlist catalogue, never by reconstructing a filesystem path
 * from request input.
 */
import { describe, it, expect } from '@jest/globals';
import { listFixtures, loadFixture } from '../src/modules/ingestion/fixture-loader.js';

describe('listFixtures', () => {
  it('returns a non-empty, sorted catalogue of known-good fixtures', () => {
    const fixtures = listFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.map((f) => f.id)).toEqual([...fixtures.map((f) => f.id)].sort());
    for (const fixture of fixtures) {
      expect(['aws', 'gcp', 'azure']).toContain(fixture.provider);
      expect(fixture.id).toBe(`${fixture.provider}/${fixture.fileName.replace(/\.json$/, '')}`);
    }
  });
});

describe('loadFixture', () => {
  it('loads a known-good fixture by exact catalogue id', () => {
    const { provider, payload } = loadFixture('aws/console-login-failure');
    expect(provider).toBe('aws');
    expect(payload).toBeTruthy();
  });

  it('loads every fixture the catalogue reports', () => {
    for (const fixture of listFixtures()) {
      const { provider, payload } = loadFixture(fixture.id);
      expect(provider).toBe(fixture.provider);
      expect(payload).toBeTruthy();
    }
  });

  const maliciousIds = [
    '../../../../etc/passwd',
    'aws/../../../../etc/passwd',
    'aws/..%2f..%2f..%2fetc%2fpasswd',
    'aws/..%2Fconsole-login-failure',
    'aws/%2e%2e%2fconsole-login-failure',
    'aws\\console-login-failure',
    '/etc/passwd',
    'C:\\Windows\\System32\\config\\SAM',
    'aws/console-login-failure.json',
    'aws/console-login-failure.json.js',
    'aws/console-login-failure/../../secrets',
    'aws/console-login-failure\u0000.json',
    'gcp/../aws/console-login-failure',
    'unknownprovider/console-login-failure',
    'aws/unknown-fixture-name',
    'aws/console-login-failure ',
    ' aws/console-login-failure',
    'aws//console-login-failure',
    'aws/console-login-failure/extra',
    '',
    'aws',
    'aws/',
    '/aws/console-login-failure',
  ];

  it.each(maliciousIds)('rejects malicious/unknown fixture id: %j', (id) => {
    expect(() => loadFixture(id)).toThrow(/Unknown fixture id/);
  });

  it('rejects non-string ids without throwing an unrelated error', () => {
    // @ts-expect-error - deliberately exercising a malformed caller
    expect(() => loadFixture(undefined)).toThrow(/Unknown fixture id/);
    // @ts-expect-error - deliberately exercising a malformed caller
    expect(() => loadFixture(null)).toThrow(/Unknown fixture id/);
    // @ts-expect-error - deliberately exercising a malformed caller
    expect(() => loadFixture(123)).toThrow(/Unknown fixture id/);
  });
});
