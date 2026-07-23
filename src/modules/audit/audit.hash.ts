/**
 * Tamper-evident hash chaining for the audit log
 *
 * Each entry commits to the hash of the entry before it, forming a chain: editing or
 * deleting any past entry (in the file store's JSON, or directly in Redis) changes that
 * entry's hash, which no longer matches the prevHash recorded by the entry after it -
 * `verifyChain` walks the log and reports exactly where that first breaks.
 *
 * This is tamper-EVIDENT, not tamper-PROOF: an attacker with write access to the store
 * could recompute the whole chain from the point they edited onward. Real immutability
 * needs the hashes anchored somewhere outside the store's own reach (e.g. periodically
 * publishing the latest hash to external, append-only storage) - see docs/SECURITY_CONTROLS.md.
 */

import { createHash } from 'crypto';
import type { AuditLogEntry } from './audit.types.js';

/** prevHash of the very first entry in a log */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Compute the hash for an entry given its content and the hash of the entry before it.
 * Field order is fixed explicitly (not left to JSON.stringify's key-insertion-order
 * behavior) so the same logical entry always hashes the same way.
 */
export function computeEntryHash(entry: Omit<AuditLogEntry, 'hash'>): string {
  const canonical = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    eventType: entry.eventType,
    userId: entry.userId ?? null,
    username: entry.username ?? null,
    ip: entry.ip,
    requestId: entry.requestId,
    resource: entry.resource ?? null,
    action: entry.action ?? null,
    success: entry.success,
    message: entry.message ?? null,
    metadata: entry.metadata ?? null,
    prevHash: entry.prevHash,
  });

  return createHash('sha256').update(canonical).digest('hex');
}

export interface ChainVerificationResult {
  valid: boolean;
  checked: number;
  brokenEntryId?: string;
  reason?: string;
}

/**
 * Walk a chronologically-ordered (oldest first) run of entries and verify every
 * hash/prevHash link. Stops and reports at the first break, if any.
 */
export function verifyEntryChain(chronologicalEntries: AuditLogEntry[]): ChainVerificationResult {
  let expectedPrevHash = GENESIS_HASH;

  for (let i = 0; i < chronologicalEntries.length; i++) {
    const entry = chronologicalEntries[i];

    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        checked: i,
        brokenEntryId: entry.id,
        reason: 'prevHash does not match the preceding entry - the chain link is broken (entries reordered, deleted, or inserted)',
      };
    }

    const { hash: storedHash, ...withoutHash } = entry;
    const recomputed = computeEntryHash(withoutHash);

    if (recomputed !== storedHash) {
      return {
        valid: false,
        checked: i,
        brokenEntryId: entry.id,
        reason: 'stored hash does not match the recomputed hash - this entry was modified after being written',
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { valid: true, checked: chronologicalEntries.length };
}
