# Secure API Gateway

A **production-grade API Gateway** in Fastify + TypeScript, in front of a genuine
**multi-cloud security detection and investigation control plane**: AWS CloudTrail and
GCP Cloud Logging feed live (Azure replay-only), gateway auth activity is monitored
directly, everything normalizes into one canonical event schema, gets evaluated against
documented detection rules, correlates into investigations with real evidence, and can
trigger real response actions.

This site is the reference documentation. For the live reviewer dashboard, guided
scenarios, and a hands-on tour, see the [Reviewer Guide](DEMO_WALKTHROUGH.md) and the
project [README](https://github.com/jasonachkar/secure-api-gateway#readme).

## Where to start

<div class="grid cards" markdown>

- :material-sitemap:{ .lg .middle } **Architecture**

    ---

    How the gateway, detection pipeline, and dashboard fit together - component
    breakdown, data flows, and deployment topology.

    [:octicons-arrow-right-24: Read the overview](ARCHITECTURE.md)

- :material-shield-alert:{ .lg .middle } **Threat Model**

    ---

    Trust boundaries, assets, and the numbered abuse cases this system is designed
    to detect and mitigate.

    [:octicons-arrow-right-24: Read the threat model](THREAT_MODEL.md)

- :material-radar:{ .lg .middle } **Detection Rules**

    ---

    The detection rule contract, per-rule health tracking, and every documented
    rule from gateway credential attacks to cloud IAM privilege escalation.

    [:octicons-arrow-right-24: Read the detection rules](DETECTION_RULES.md)

- :material-api:{ .lg .middle } **API Reference**

    ---

    The full OpenAPI specification for every endpoint this gateway exposes.

    [:octicons-arrow-right-24: Browse the API reference](api-reference.md)

</div>

## Data provenance: live, replay, and synthetic

Every security event and every score in this system is tagged with where it actually
came from, and the UI/API never blur that distinction:

- **`live`** - a real event from a real source: AWS CloudTrail via CloudWatch Logs, GCP
  Cloud Logging, or the gateway's own auth activity.
- **`replay`** - a sanitized, real-shaped fixture pushed through the exact same
  parse → normalize → detect → correlate pipeline as live traffic.
- **`synthetic`** - fabricated data, off by default, used only to animate dashboard
  charts for local visual demos, never allowed to feed detection or scoring.

See [Cloud Ingestion](CLOUD_INGESTION.md) for the pipeline this provenance tagging runs
through, and [Known Limitations](KNOWN_LIMITATIONS.md) for every place a score or
feature is real-but-partial rather than fully live.

## Honest by design

Every claim in this documentation traces to a specific file in the repository - not
aspirational bullet points. Where something genuinely isn't implemented yet, or is
real-but-mocked, it's called out explicitly in [Known Limitations](KNOWN_LIMITATIONS.md)
rather than glossed over. The in-app **Implementation Status** page (reviewer dashboard)
is the single source of truth this documentation is written to match.
