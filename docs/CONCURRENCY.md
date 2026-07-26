# Concurrency Design: Dedup, Correlation, and Index Retention

Everything in this document lives in `src/modules/ingestion/security-event.store.ts` and
`src/modules/investigations/investigation.service.ts`. It exists because both stores
started with a read-then-write race: check whether a slot is taken, then write - two
concurrent callers can both observe "not taken" and both write, defeating the exact
guarantee (one canonical event, one canonical investigation) the rest of the system
depends on.

## Why not just use `WATCH`/`MULTI`/`EXEC`?

Redis's optimistic-locking primitive (`WATCH` a key, then `MULTI`/`EXEC` a transaction
that aborts if the key changed) is the textbook answer, and an earlier version of this
code used it for investigation merges. It's wrong for this app specifically: every
request handler shares **one** `ioredis` connection (constructed once in `app.ts`).
`WATCH`'s state lives on the *connection*, not on the logical caller that issued it - two
unrelated concurrent operations both calling `.watch()`/`.multi()` on the same shared
connection can abort or corrupt each other's transactions, because Redis has no way to
know which in-flight `MULTI` belongs to which `WATCH`. The fix would be a dedicated
connection per transaction (`redis.duplicate()`), which is real connection overhead per
attempt. Instead:

- **Claiming a slot** (event dedup, investigation correlation-key ownership) uses a
  **Lua script** - a single atomic round-trip, no connection-state pitfalls, no need for
  a second connection.
- **Merging into an already-claimed investigation** uses a **short-TTL per-investigation
  lock** (`SET key token PX ttl NX`, released with a token-check Lua script) instead of
  `WATCH`. Plain `GET`/`SET`/`DEL` are always safe on a shared connection.

## 3.1 - Atomic event deduplication

`SecurityEventStore.saveEvent()` protects two independent uniqueness constraints at
once - `dedupeHash` (derived from provider/action/time/principal/etc.) and
`provider:providerEventId` - with one Lua script (`CLAIM_EVENT_SCRIPT`):

```
GET dedupeKey    -> if set, return it (someone already owns this slot)
GET providerKey  -> if set, return it
SETEX both keys to our candidate id
return our candidate id
```

Both checks and both writes happen inside the same script invocation, which Redis
executes as a single atomic step - there is no window between "check" and "claim" for a
second writer to slip through. The caller compares the returned id to its own candidate
id: a match means it won and should write the event body; anything else means another
writer (concurrently or earlier) already owns this event, so the caller waits briefly for
that writer's body to appear (`waitForEvent`, a bounded poll - covers the narrow gap
between claiming the slot and finishing the body write) and returns
`{ duplicate: true, event: <winner's record> }`.

If the body write fails after a successful claim, the claim keys are deleted in a
`catch` block so the slot isn't permanently stuck pointing at data that was never
written.

**Postgres**, when configured, gets `UNIQUE` indexes on `dedupe_hash` and
`(provider, provider_event_id)` in addition to the primary key - Redis is the atomic
source of truth, but this means Postgres itself can never end up with two rows for one
logical event even if that invariant were ever violated upstream. A conflict on any of
the three constraints is treated as "already recorded" (`ON CONFLICT DO NOTHING`), never
surfaced as an error.

Verified in `test/security-event-concurrency.integration.test.ts`: 20 concurrent writers
racing on the same `dedupeHash` converge on exactly one canonical event id; a second test
does the same for `provider:providerEventId` with differing `dedupeHash` inputs
(simulating a re-poll picking up the same record with a slightly different observed
timestamp); a third confirms two *genuinely distinct* events racing independently both
succeed and never merge into each other.

## 3.2 - Atomic investigation correlation

`InvestigationService.correlate()` follows the same claim-then-act shape:

1. `CLAIM_CORRELATION_SCRIPT` atomically claims the correlation key (same
   check-then-set-in-one-script pattern as event dedup) with a freshly generated
   candidate investigation id.
2. If the caller's candidate id won, it builds and persists a brand-new investigation
   under that id - no read-modify-write race is possible, since nobody else could have
   claimed this key first.
3. If a different id already owned the key, the caller **merges** into that
   investigation instead, under a per-investigation lock (`mergeIntoExisting`):
   - Acquire `sec:investigation:merge-lock:<id>` via `SET token PX 3000 NX`.
   - Read the current investigation, merge in the new event/detection (dedup-safe
     `eventIds`/`detectionIds`/principals/resources/source IPs, append a timeline
     entry), write it back.
   - Release the lock only if the token still matches (a Lua script), so a slow holder
     whose lock already expired can't release a lock a *different*, later holder now
     legitimately owns.
   - If the lock is held by someone else, retry with jittered backoff
     (`5ms * attempt + random(0, 20ms)`, not a fixed delay - a fixed delay means every
     loser in a many-way race retries at the exact same instant and collides again) up
     to `MAX_MERGE_ATTEMPTS` (30, sized for a burst of a few dozen correlated
     detections hitting one hot investigation at once, e.g. a guided scenario or a noisy
     source against one account).

**Idempotency**: if the detection being merged is already in the target investigation's
`detectionIds` (a retried call, a re-run replay), `mergeIntoExisting` returns the
existing record unchanged - no duplicate timeline entry, no spurious reopen.

**Reopen behavior is deterministic**: a new detection landing on a `resolved`/`closed`
investigation always reopens it to `investigating` with an explicit timeline entry
explaining why, whether it arrives via the "new investigation" path (impossible, since
reopening only applies to existing records) or the merge path - the same `reopened` check
runs every time, not just on the first correlation.

**Fallback for a vanished claim**: if the correlation key's claimed id doesn't correspond
to an actual investigation record (the original claimant's write failed after claiming),
the merge path opens a fresh investigation rather than losing the detection - logged as a
warning since it's a rare, abnormal path, not routine behavior. It does not touch the
original correlation-key claim, so it's self-contained.

Verified in `test/investigation-concurrency.integration.test.ts`: 15 concurrent
detections sharing a correlation key converge on exactly one investigation, with all 15
detections and events present in the final record (none lost to the claim/merge race);
a dedicated idempotency test; and a test confirming genuinely different correlation keys
never merge into each other.

## 3.3 - Index retention and lazy pruning

Sorted-set indexes (`sec:events:index`, `sec:events:index:by-provider:<provider>`) are
capped by count (`trimIndex`, oldest-first eviction past 50,000 events) but can still
carry entries whose underlying `sec:event:<id>` key has separately expired via its own
TTL before the count cap ever kicks in. `SecurityEventStore.listEvents()` prunes these
lazily: after fetching a page of ids and their bodies, any id with no body left is
`ZREM`'d from the relevant index(es) in the same call. This is a self-healing process
across calls (each read that encounters staleness cleans a little of it up), not a single
strongly-consistent snapshot - a page that happens to contain several stale entries can
return fewer than `limit` live results for that one call, but the index converges toward
accurate over repeated reads rather than growing unboundedly. A scheduled maintenance
sweep (walking the full index rather than only what a read happens to touch) is not
implemented; see `docs/KNOWN_LIMITATIONS.md`.

## 3.4 - Provider-specific filtering

`listEvents({ provider })` queries `sec:events:index:by-provider:<provider>` directly
instead of paging the global index and discarding non-matching entries client-side. A
request for 50 AWS events returns up to 50 AWS events regardless of how many
GCP/Azure/gateway events dominate the global index - verified in
`test/security-event-provider-filtering.unit.test.ts` (200 non-AWS events seeded ahead of
50 AWS events; a `limit: 50, provider: 'aws'` query still returns all 50).

## What's not covered here

`InvestigationService.attachResponseAction()` and `setStatus()` are still plain
read-modify-write with no lock - two concurrent response actions attaching to the same
investigation, or a status change racing a correlation, could lose an update. These are
lower-frequency, operator-driven paths (a human clicking "block IP" or "resolve"), not
the high-frequency ingestion/detection hot path this document covers, but they are not
concurrency-safe today. Tracked in `docs/KNOWN_LIMITATIONS.md`.
