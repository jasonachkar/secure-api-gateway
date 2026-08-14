import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { classifyApiError } from './errors';

function responseError(status: number, code: string, headers: Record<string, string> = {}) {
  return new AxiosError('failed', undefined, undefined, undefined, {
    status,
    statusText: 'failed',
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
    data: { error: { code }, requestId: 'request-123' },
  });
}

describe('safe API error classification', () => {
  it('renders invalid credentials without server detail', () => {
    expect(classifyApiError(responseError(401, 'INVALID_CREDENTIALS'), 'fallback').message)
      .toBe('Invalid username or password.');
  });

  it('includes Retry-After for lockouts and rate limits', () => {
    expect(classifyApiError(responseError(401, 'ACCOUNT_LOCKED', { 'retry-after': '42' }), 'fallback'))
      .toMatchObject({ kind: 'locked', retryAfter: 42 });
    expect(classifyApiError(responseError(429, 'RATE_LIMIT_EXCEEDED', { 'retry-after': '9' }), 'fallback'))
      .toMatchObject({ kind: 'rate-limited', retryAfter: 9 });
  });

  it('shows the request ID for server failures', () => {
    expect(classifyApiError(responseError(503, 'SERVICE_UNAVAILABLE'), 'fallback').message)
      .toContain('request-123');
  });
});
