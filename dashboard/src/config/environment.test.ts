import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './environment';

describe('dashboard environment', () => {
  it('uses localhost only outside production', () => {
    expect(parseEnvironment({ MODE: 'development', DEV: true })).toMatchObject({
      apiBaseUrl: 'http://localhost:3000',
      showFixtureCredentials: true,
    });
  });

  it('normalizes one trailing slash', () => {
    expect(parseEnvironment({ MODE: 'production', VITE_API_URL: 'https://api.example.com/' }).apiBaseUrl)
      .toBe('https://api.example.com');
  });

  it.each([
    undefined,
    'http://api.example.com',
    'https://api.example.com/path',
    'https://api.example.com?debug=true',
    'https://user:pass@api.example.com',
  ])('rejects invalid production API configuration: %s', (value) => {
    expect(() => parseEnvironment({ MODE: 'production', VITE_API_URL: value })).toThrow();
  });
});
