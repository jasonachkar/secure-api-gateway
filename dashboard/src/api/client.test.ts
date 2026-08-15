import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import { apiClient, refreshAccessToken, refreshHttpClient } from './client';
import { clearAccessToken, getAccessToken, setAccessToken } from '../auth/tokenStore';

const apiMock = new MockAdapter(apiClient);
const refreshMock = new MockAdapter(refreshHttpClient);

afterEach(() => {
  apiMock.reset();
  refreshMock.reset();
  clearAccessToken();
});

describe('authenticated API lifecycle', () => {
  it('sends valid empty JSON for authentication requests without a payload', async () => {
    apiMock.onPost('/auth/demo-login').reply(200, { accessToken: 'demo-token' });
    refreshMock.onPost('/auth/refresh').reply(200, { accessToken: 'renewed' });

    await apiClient.post('/auth/demo-login', {});
    await refreshAccessToken();

    expect(apiMock.history.post[0]).toMatchObject({
      data: '{}',
    });
    expect(apiMock.history.post[0].headers?.['Content-Type']).toBe('application/json');
    expect(refreshMock.history.post[0]).toMatchObject({
      data: '{}',
    });
    expect(refreshMock.history.post[0].headers?.['Content-Type']).toBe('application/json');
  });

  it('keeps access tokens in memory and attaches bearer authentication', async () => {
    setAccessToken('memory-token');
    apiMock.onGet('/protected').reply((config) => [200, { authorization: config.headers?.Authorization }]);
    const response = await apiClient.get('/protected');
    expect(response.data.authorization).toBe('Bearer memory-token');
    expect(getAccessToken()).toBe('memory-token');
  });

  it('shares one refresh across concurrent protected 401 responses', async () => {
    setAccessToken('expired');
    let protectedCalls = 0;
    apiMock.onGet('/protected').reply(() => {
      protectedCalls += 1;
      return protectedCalls <= 2 ? [401, { error: { code: 'TOKEN_EXPIRED' } }] : [200, { ok: true }];
    });
    refreshMock.onPost('/auth/refresh').reply(200, { accessToken: 'renewed' });

    const responses = await Promise.all([apiClient.get('/protected'), apiClient.get('/protected')]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(refreshMock.history.post).toHaveLength(1);
    expect(getAccessToken()).toBe('renewed');
  });

  it('does not recursively refresh an authentication endpoint', async () => {
    apiMock.onPost('/auth/login').reply(401, { error: { code: 'INVALID_CREDENTIALS' } });
    await expect(apiClient.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshMock.history.post).toHaveLength(0);
  });

  it('clears memory state when refresh fails', async () => {
    setAccessToken('expired');
    refreshMock.onPost('/auth/refresh').reply(401);
    await expect(refreshAccessToken()).rejects.toBeDefined();
    expect(getAccessToken()).toBeNull();
  });
});
