/**
 * Scoped API key type definitions
 */

/**
 * Stored API key record (never contains the raw secret - only its hash is
 * indexed separately in the store, and only the hash is ever persisted)
 */
export interface ApiKeyRecord {
  id: string;
  name: string;
  scopes: string[];
  createdAt: number;
  createdBy: string;
  lastUsedAt?: number;
  revoked: boolean;
  revokedAt?: number;
  expiresAt?: number;
}

/**
 * What gets attached to the request once an API key has been validated
 */
export interface ApiKeyContext {
  id: string;
  name: string;
  scopes: string[];
}
