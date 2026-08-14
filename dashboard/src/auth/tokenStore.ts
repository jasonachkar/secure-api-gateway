type TokenListener = (token: string | null) => void;

let accessToken: string | null = null;
let tokenVersion = 0;
const listeners = new Set<TokenListener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function getTokenVersion(): number {
  return tokenVersion;
}

export function setAccessToken(token: string): void {
  accessToken = token;
  tokenVersion += 1;
  listeners.forEach((listener) => listener(token));
}

export function clearAccessToken(): void {
  accessToken = null;
  tokenVersion += 1;
  listeners.forEach((listener) => listener(null));
}

export function subscribeToToken(listener: TokenListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
