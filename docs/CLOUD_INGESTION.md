# Cloud Security Telemetry Ingestion

## One pipeline, three entry points

Every way a security event enters this system - a live AWS/GCP poll, a manual fixture
replay, or a guided scenario - runs through the exact same function:
`ingestProviderEvent()` in
[`src/modules/ingestion/security-ingestion.pipeline.ts`](../src/modules/ingestion/security-ingestion.pipeline.ts).

```
raw provider payload
  -> parse            (provider-specific parser: aws/gcp/azure/gateway)
  -> normalize         (canonical NormalizedSecurityEvent schema)
  -> redact             (before persistence - same treatment for parser failures)
  -> persist (dedupe)    (SecurityEventStore - atomic on providerEventId + dedupeHash)
  -> detect                (DetectionEngine evaluates every rule against the event)
  -> correlate                (InvestigationService groups detections into cases)
```

There is no separate "live" code path that skips steps or uses different logic. The only
things that differ between entry points are:

1. **Where the raw payload comes from** - a CloudWatch/Cloud Logging poll vs. a fixture
   file vs. a scenario-generated payload.
2. **The provenance tag** attached to the resulting event - `live`, `replay`, `synthetic`,
   or `planned` - which is preserved end to end and shown in the UI on every event,
   detection, and investigation.

## Entry points

| Entry point | Provenance | Driver |
| --- | --- | --- |
| `POST /admin/security/replay` | `replay` | [`src/modules/ingestion/replay.ts`](../src/modules/ingestion/replay.ts) - loads a fixture via the allowlisted catalogue (see `docs/KNOWN_LIMITATIONS.md`), calls `ingestProviderEvent()`. |
| Guided scenarios | `replay` (AWS/GCP) or `live` (gateway) | [`src/modules/scenarios/scenario.service.ts`](../src/modules/scenarios/scenario.service.ts) - same `replayFixtureThroughPipeline()` for cloud scenarios; the gateway scenario drives real HTTP requests through the actual auth route. |
| AWS CloudWatch polling | `live` | [`src/modules/ingestion/adapters/cloudwatch.adapter.ts`](../src/modules/ingestion/adapters/cloudwatch.adapter.ts) |
| GCP Cloud Logging polling | `live` | [`src/modules/ingestion/adapters/gcp-logging.adapter.ts`](../src/modules/ingestion/adapters/gcp-logging.adapter.ts) |
| Azure | `replay` only | No live connector exists - see below. |

## AWS: CloudWatch Logs -> canonical pipeline

`CloudWatchAdapter` polls a single CloudWatch Logs log group with `FilterLogEventsCommand`
on an interval (`INGESTION_POLL_INTERVAL_MS`), tracking a cursor (last-polled timestamp)
in Redis so restarts don't re-process old events. For each log event:

1. `unwrapMessage()` JSON-parses the event's `message` field. If it's a CloudTrail
   `{"Records": [...]}` envelope, each record is processed individually; otherwise the
   parsed object is treated as one record. A message that isn't valid JSON is still
   passed through (wrapped so the parser sees an object) rather than silently dropped -
   it becomes a tracked, redacted parser failure instead of vanishing.
2. Each record is handed to `ingestProviderEvent()` with `provider: 'aws'`,
   `provenance: 'live'`. `parseAwsEvent()` (shared with replay) derives severity,
   category, principal, resource, and outcome from the actual CloudTrail/WAF/API Gateway
   fields - it does **not** assign a flat severity to every event.
3. A single malformed record never aborts the rest of the poll: each record gets its own
   try/catch, incrementing `parserFailures` and logging a warning rather than losing the
   remaining records in that batch.

Confirmed matching detection rules from real CloudTrail-shaped records (see
`test/cloudwatch-adapter-pipeline.integration.test.ts`): root-account activity, console
login failure, IAM policy attachment, access-key creation, WAF blocked request, and API
Gateway authorization failure - via `AWS-IAM-001`/`AWS-IAM-002` and the parser's own
field-based classification.

## GCP: Cloud Logging -> canonical pipeline

`GcpLoggingAdapter` polls Cloud Logging entries (Cloud Audit Logs) the same way, using a
Redis cursor and the project's default log sink (no log source needs provisioning -
only a read-only `roles/logging.viewer` service account). For each entry,
`toProviderRecord()` reshapes the client library's `Entry` object into the flat record
shape `parseGcpEvent()` expects: `insertId`/`logName`/`timestamp`/`severity`/`resource`
at the top level, with the entry's structured payload nested under `protoPayload`,
matching the GCP API's native JSON representation (and what the replay fixtures already
look like).

One thing this reshaping step exists specifically to handle: the client library returns
`timestamp` as a JS `Date`, but `parseGcpEvent` - shared with replay fixtures, which are
plain JSON and so always carry `timestamp` as a string - only accepts a string. This was
caught by the adapter-to-parser-to-detection integration test
(`test/gcp-logging-adapter-pipeline.integration.test.ts`), not by a unit test with a
mocked pipeline: every live GCP event would have silently failed to parse without this
fix, since replay fixtures never exercise a `Date` value in that field.

Confirmed matching detection rules from real Cloud Audit Log-shaped records: service
account key creation, IAM policy modification, privileged role grants, permission
denied, and audit configuration changes - via `GCP-IAM-001` and the parser's field-based
classification.

## Minimal IAM policy

`terraform/modules/aws-logging` and `terraform/modules/gcp-logging` are the source of
truth (opt-in, both default `false`) - this section is a portable copy for anyone
pointing the live adapters at an existing AWS/GCP account without running this repo's
Terraform.

**AWS** - an IAM identity with exactly this policy, scoped to one log group's ARN, is
sufficient for `CloudWatchAdapter`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:FilterLogEvents", "logs:DescribeLogGroups"],
      "Resource": "arn:aws:logs:<region>:<account-id>:log-group:<your-log-group>:*"
    }
  ]
}
```

Set `CLOUDWATCH_LOG_GROUP`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
(see `.env.example`). **These are static, long-lived credentials** - the AWS SDK's
default credential provider chain is used as-is (`src/modules/ingestion/adapters/cloudwatch.adapter.ts`),
with no STS `AssumeRole`/OIDC federation implemented. This is a deliberate, documented
tradeoff (see `terraform/README.md` and `docs/KNOWN_LIMITATIONS.md`), not a best-practice
default - contrast with this project's own Azure deploy pipeline, which does use OIDC
federation (`.github/workflows/deploy.yml`) precisely because that credential is
long-lived-secret-free. Rotate this key like any other long-lived secret; it grants
read-only access to one log group and nothing else.

**GCP** - a service account with only `roles/logging.viewer` on the project (GCP has no
finer-grained, log-source-scoped role) is sufficient for `GcpLoggingAdapter`:

```bash
gcloud iam service-accounts create secure-api-gateway-reader \
  --display-name="secure-api-gateway log reader"
gcloud projects add-iam-policy-binding <project-id> \
  --member="serviceAccount:secure-api-gateway-reader@<project-id>.iam.gserviceaccount.com" \
  --role="roles/logging.viewer"
gcloud iam service-accounts keys create key.json \
  --iam-account="secure-api-gateway-reader@<project-id>.iam.gserviceaccount.com"
```

Set `GCP_LOGGING_PROJECT` and `GCP_SERVICE_ACCOUNT_KEY` (the JSON key file's contents,
as a single-line string - see `.env.example`). Same tradeoff as AWS above: this is a
static service-account key passed directly as `credentials`
(`src/modules/ingestion/adapters/gcp-logging.adapter.ts`), not Application Default
Credentials or Workload Identity Federation.

## Azure: replay only

There is no live Azure connector. `AzureSentinelAdapter`
([`src/modules/ingestion/adapters/azure-sentinel.adapter.ts`](../src/modules/ingestion/adapters/azure-sentinel.adapter.ts))
is intentionally a two-line class that only reports whether `AZURE_SENTINEL_WORKSPACE` is
set - it has no `poll()`, makes no SDK calls, and its "configured" status must never be
read as "Sentinel is connected." Azure Activity Log fixtures are normalized through the
real parser (`parseAzureEvent`) and canonical pipeline via replay, exactly like AWS/GCP
fixtures.

**Documented implementation path for a live Azure connector** (not built): Azure Monitor
/ Log Analytics workspace query API (or Event Hubs streaming export) would replace the
placeholder adapter with one that polls Log Analytics on a schedule (same cursor pattern
as CloudWatch/GCP), feeds records to `parseAzureEvent()`, and calls
`ingestProviderEvent()` with `provider: 'azure'`, `provenance: 'live'` - architecturally
a straightforward third adapter once Azure Monitor read access (`Monitoring Reader` role)
is provisioned via `terraform/modules/monitoring`.

## Operational metrics

Both live adapters track, per-adapter (`IngestionAdapterStatus`, exposed via
`GET /admin/ingestion/status`):

- `eventsReceived` - raw provider records seen, before parsing.
- `eventsIngested` - successfully parsed and persisted (excludes duplicates/failures).
- `parserFailures` - records that failed to parse (also recorded, redacted, in
  `SecurityEventStore`'s parser-failure store).
- `duplicatesDiscarded` - records that matched an existing event via dedup.
- `lastEventAt` / `lastSyncAt` / `cursor` - operator visibility into poll progress.

Pipeline-wide metrics (ingestion delay, detection evaluation/match counts, investigation
creation/dedup counts) are tracked in
[`src/modules/security/pipeline-metrics.ts`](../src/modules/security/pipeline-metrics.ts)
and reflect the canonical pipeline regardless of which entry point produced the event.

## What was unified

Before this pass, live AWS/GCP polling fed a **separate, legacy pipeline**
(`NormalizedEvent` schema, `NormalizedEventStore`, automatic
`IncidentResponseService.createIncidentFromNormalizedEvent()` calls) that never touched
the canonical `NormalizedSecurityEvent` schema, detection engine, or investigation
service replay/scenarios already used. That meant a live CloudTrail event and a replayed
CloudTrail fixture went through genuinely different code, produced different downstream
objects (an "incident" vs. a "detection" + "investigation"), and live events never
matched a documented detection rule at all - every AWS event was flatly assigned `low`
severity regardless of content.

`IngestionService` now only owns adapter lifecycle (start/stop/status) and a thin bound
`ingest()` closure per provider; `NormalizedEventStore` is kept solely for its Redis-only
cursor methods (`getCursor`/`setCursor`), not event storage. The legacy `NormalizedEvent`
schema, store, and `createIncidentFromNormalizedEvent()` method still exist in
`src/modules/ingestion/normalized-event.*` and
`src/modules/admin/incident-response.service.ts` respectively - nothing in the live or
replay ingestion path calls them anymore, but they have not been deleted (removing the
manual/administrative incident-creation capability and any dashboard surface built on it
is a larger, separate change than unifying ingestion - see `docs/KNOWN_LIMITATIONS.md`).
