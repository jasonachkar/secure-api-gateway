# Security control-plane UX redesign

This redesign reframes the dashboard around one traceable lifecycle:

`Traffic → gateway policy → telemetry → normalize → detect → correlate → investigate → respond → evidence`

## Audit findings

The original interface exposed strong backend capabilities as separate project/demo pages. The main issues were:

- navigation followed implementation-page names instead of an analyst workflow;
- operational request metrics dominated security outcomes;
- traffic, rules, correlation, response, and evidence were difficult to connect;
- replay, live, synthetic, partial, and planned capabilities were not consistently visible;
- investigations lacked a dense timeline/evidence workspace;
- guided scenarios did not visually explain the real returned pipeline trace;
- the Architecture page read like a long README;
- reviewer visits to sensitive governance routes rendered dead-end access boundaries;
- the binary theme choice did not follow the operating system by default;
- mobile tables and secondary navigation needed explicit interaction design.

Representative before screenshots are in [`screenshots/redesign/before`](screenshots/redesign/before). The final 90-image desktop/tablet/mobile and light/dark matrix is in [`screenshots/redesign/after`](screenshots/redesign/after).

## Product architecture

The authenticated shell now uses grouped workflow navigation:

- Observe: Overview, Traffic Explorer
- Detect: Detections, Investigations, Threat intelligence
- Respond: Security Lab, Sessions
- Govern: Cloud, Control evidence, Audit trail, Identities
- System: Architecture, Implementation, API documentation

The shell is collapsible on desktop, a drawer on mobile, and includes environment/demo identity, health, account controls, theme selection, breadcrumbs, and command search.

## Data truth rules

Runtime metrics come from existing API endpoints. Capability claims come from `src/modules/security/capability-registry.ts`. The UI renders provenance and capability status explicitly and does not substitute synthetic values for unavailable data.

The public reviewer can open every dashboard workflow. Sensitive governance pages use API-owned read projections: raw source IPs and session identifiers become stable aliases, user/session/audit queries are scoped to the reviewer identity, and operator mutations remain administrator-only. The Security Lab animates only a completed trace returned by the backend; it does not pretend the API streams stages.

## Key implementation

- `TrafficExplorer.tsx`: polled request telemetry, URL-backed removable filters, TanStack Table sorting, bounded mobile table, and an evidence drawer with request ID/source-IP-alias correlation in reviewer mode.
- `Detections.tsx`: backend rule catalog, runtime health, provenance, rationale, remediation, false-positive notes, and test paths.
- `Investigations.tsx`: resizable queue/workspace, URL-selected investigation, timeline, normalized/raw evidence, response history, export, and correlation explanation.
- `GuidedScenarios.tsx`: Security Lab safety boundary and returned six-stage trace.
- `CloudCoverage.tsx`: provider capabilities, connector status, provenance, pipeline metrics, and limitations.
- `About.tsx`: interactive architecture flows and capability-registry evidence explorer.
- `ImplementationStatus.tsx`: searchable registry matrix with status, provenance, limitations, code, tests, and IaC paths.

TanStack Query centralizes new server-state reads, TanStack Table powers the operational Traffic table, and `react-resizable-panels` provides the investigation workbench. Routes are lazy-loaded to keep the main bundle bounded.

## Validation

The repository includes:

- Playwright reviewer journeys for authentication, every canonical route, mobile navigation, command search, scenario replay, investigation selection, evidence export visibility, and compliance disclosure;
- integration coverage proving reviewers can read every governance workflow through sanitized responses while write endpoints still return `403`;
- axe checks across every canonical reviewer route in light and dark themes;
- System/Light/Dark persistence and OS-preference tests;
- stable `toHaveScreenshot` baselines for critical public surfaces plus seven authenticated workflows across desktop/mobile and light/dark themes;
- a repeatable full-route visual capture script at `dashboard/scripts/capture-redesign.mjs`.

The screenshot capture script intentionally uses SPA navigation after authentication so a visual audit does not create artificial refresh-token rate-limit pressure.

The final CI-parity Playwright run completed with 70 passing cases and two expected data-conditional chart/map skips. The screenshot audit contains 24 representative before images and 90 final images across desktop, tablet, mobile, light, and dark variants.

Refresh-token bootstrap now uses the normal authenticated-user request budget instead of the five-attempt password-login budget. Trusted-origin enforcement, rotation, reuse detection, family revocation, and the global limiter remain in force; password and one-click demo entry retain the stricter authentication limit.

## Deliberately deferred backend work

Real Azure Monitor/Event Hub ingestion, MITRE ATT&CK mapping, OpenTelemetry spans, OCSF export, and supply-chain attestations require new runtime contracts, credentials, schemas, or CI trust configuration. They were not represented as implemented. The backend enhancement in this change extends rule-health responses with description, categories, severity rationale, false-positive guidance, and remediation—the data required for the new Detections experience—and keeps the capability registry synchronized with the new reviewer and Security Lab UX.
