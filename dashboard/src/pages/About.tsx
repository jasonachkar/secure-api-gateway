import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  Cloud,
  Database,
  FileCheck2,
  FileCode2,
  Fingerprint,
  GitBranch,
  Network,
  ServerCog,
  ShieldCheck,
  TestTube2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { EmptyState } from '../components/EmptyState';
import { ProvenanceBadge } from '../components/SecurityBadges';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { CapabilityCategory, CapabilityDefinition } from '../types';

const CATEGORY_LABEL: Record<CapabilityCategory, string> = {
  'gateway-protection': 'Gateway protection',
  'cloud-ingestion': 'Cloud ingestion',
  detection: 'Detection & investigation',
  response: 'Response',
  evidence: 'Evidence',
  'platform-security': 'Platform security',
};

const REQUEST_STAGES = [
  { label: 'Receive', detail: 'Fastify request context', icon: Network },
  { label: 'Authenticate', detail: 'JWT + token family', icon: Fingerprint },
  { label: 'Authorize', detail: 'Role + permission', icon: ShieldCheck },
  { label: 'Control', detail: 'Rate limit + IP block', icon: ServerCog },
  { label: 'Proxy', detail: 'SSRF-safe upstream', icon: ArrowRight },
];

const INGESTION_STAGES = [
  { label: 'Provider event', detail: 'AWS · GCP · Azure', icon: Cloud },
  { label: 'Parse', detail: 'Provider adapter', icon: Braces },
  { label: 'Normalize', detail: 'Canonical schema', icon: Workflow },
  { label: 'Protect', detail: 'Redact + dedupe', icon: ShieldCheck },
  { label: 'Store', detail: 'Redis evidence', icon: Database },
];

const SIGNAL_STAGES = [
  { label: 'Detect', detail: 'Versioned rule', icon: ShieldCheck },
  { label: 'Correlate', detail: 'Explainable key', icon: GitBranch },
  { label: 'Investigate', detail: 'Timeline + entities', icon: Workflow },
  { label: 'Respond', detail: 'Enforced or explicit', icon: ServerCog },
  { label: 'Evidence', detail: 'Export + hash chain', icon: FileCheck2 },
];

export function About() {
  const registry = useQuery({
    queryKey: ['capability-summary'],
    queryFn: adminApi.getCapabilitySummary,
  });
  const [selectedId, setSelectedId] = useState<string>('gateway-jwt-auth');
  const capabilities = registry.data?.capabilities ?? [];
  const selected = useMemo(
    () => capabilities.find((item) => item.id === selectedId) ?? capabilities[0],
    [capabilities, selectedId]
  );
  const infrastructureCount = capabilities.filter(
    (item) => item.infrastructurePaths?.length
  ).length;

  return (
    <Layout>
      <div className="page-stack architecture-page">
        <SectionHeader
          title="Architecture & Evidence"
          subtitle="Trust boundaries, request protection, cloud normalization, correlation, response, and the code and tests behind each product claim."
          actions={
            <Link to="/implementation-status">
              <Button variant="secondary" size="sm">
                Open full registry <ArrowRight size={14} />
              </Button>
            </Link>
          }
        />

        {registry.isError && (
          <div className="alert alert--danger">
            {getErrorMessage(registry.error, 'Capability registry is unavailable.')}
          </div>
        )}

        <section className="architecture-trust-strip" aria-label="Architecture trust boundaries">
          <div>
            <span>Untrusted</span>
            <strong>Clients & cloud events</strong>
          </div>
          <ArrowRight size={14} aria-hidden="true" />
          <div>
            <span>Decision plane</span>
            <strong>Gateway & security pipeline</strong>
          </div>
          <ArrowRight size={14} aria-hidden="true" />
          <div>
            <span>Protected</span>
            <strong>Upstream, evidence & audit</strong>
          </div>
        </section>

        <div className="architecture-flow-grid">
          <ArchitectureFlow
            eyebrow="Request protection pipeline"
            title="Every request is evaluated before it reaches an upstream."
            stages={REQUEST_STAGES}
          />
          <ArchitectureFlow
            eyebrow="Cloud ingestion pipeline"
            title="Every provider uses one canonical security-event path."
            stages={INGESTION_STAGES}
          />
          <ArchitectureFlow
            eyebrow="Signal-to-evidence pipeline"
            title="A rule match stays traceable through response and export."
            stages={SIGNAL_STAGES}
          />
        </div>

        <section className="architecture-proof">
          <header>
            <div>
              <span className="eyebrow">Interactive implementation map</span>
              <h2>Architecture claims resolve to evidence.</h2>
              <p>
                Select a capability to inspect its backend-owned status, provenance, limitations,
                source paths, tests, and infrastructure.
              </p>
            </div>
            <div className="architecture-proof__counts">
              <span>
                <strong>{registry.data?.total ?? '—'}</strong> registry entries
              </span>
              <span>
                <strong>{infrastructureCount || '—'}</strong> with IaC evidence
              </span>
            </div>
          </header>

          {registry.isLoading ? (
            <div className="operational-loading">Loading architecture evidence…</div>
          ) : capabilities.length === 0 ? (
            <EmptyState
              icon={Workflow}
              title="No architecture evidence available"
              description="The capability registry returned no entries."
            />
          ) : (
            <div className="architecture-explorer">
              <div className="architecture-capability-list" aria-label="Architecture capabilities">
                {capabilities.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === selected?.id ? 'architecture-capability--active' : ''}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span>
                      <code>{item.id}</code>
                      <strong>{item.name}</strong>
                    </span>
                    <span className={`capability-status capability-status--${item.status}`}>
                      {item.status}
                    </span>
                  </button>
                ))}
              </div>
              {selected && <CapabilityEvidence capability={selected} />}
            </div>
          )}
        </section>

        <section className="architecture-principles">
          <article>
            <ShieldCheck size={17} />
            <div>
              <strong>Security boundaries stay server-side</strong>
              <p>
                Authentication, authorization, rate limiting, redaction, and reviewer restrictions
                are enforced by backend middleware—not UI state.
              </p>
            </div>
          </article>
          <article>
            <GitBranch size={17} />
            <div>
              <strong>One provider-independent signal path</strong>
              <p>
                Replay and live ingestion converge before detection, so a provider cannot bypass
                normalization, deduplication, or correlation.
              </p>
            </div>
          </article>
          <article>
            <FileCheck2 size={17} />
            <div>
              <strong>Evidence has explicit limits</strong>
              <p>
                The audit chain detects local history modification. It is intentionally described as
                tamper-evident, not externally anchored or tamper-proof.
              </p>
            </div>
          </article>
        </section>
      </div>
    </Layout>
  );
}

function ArchitectureFlow({
  eyebrow,
  title,
  stages,
}: {
  eyebrow: string;
  title: string;
  stages: Array<{ label: string; detail: string; icon: LucideIcon }>;
}) {
  return (
    <section className="architecture-flow-card">
      <header>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </header>
      <div className="architecture-flow-card__stages">
        {stages.map((stage, index) => {
          const Icon = stage.icon;
          return (
            <div key={stage.label}>
              <span>
                <Icon size={14} aria-hidden="true" />
              </span>
              <p>
                <strong>{stage.label}</strong>
                <small>{stage.detail}</small>
              </p>
              {index < stages.length - 1 && <ArrowRight size={12} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CapabilityEvidence({ capability }: { capability: CapabilityDefinition }) {
  return (
    <article className="architecture-evidence-detail">
      <div>
        <span className="eyebrow">{CATEGORY_LABEL[capability.category]}</span>
        <h3>{capability.name}</h3>
        <div className="tag-group">
          <span className={`capability-status capability-status--${capability.status}`}>
            {capability.status}
          </span>
          {capability.provenance && <ProvenanceBadge value={capability.provenance} />}
        </div>
      </div>
      <p>{capability.summary}</p>
      {capability.limitations?.length ? (
        <section className="capability-limitations">
          <h4>Known limitations</h4>
          <ul>
            {capability.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : (
        <div className="architecture-evidence-ok">
          <CheckCircle2 size={14} /> No registry limitation recorded
        </div>
      )}
      <EvidencePaths
        title="Implementation"
        icon={FileCode2}
        paths={capability.implementationPaths}
      />
      <EvidencePaths title="Test evidence" icon={TestTube2} paths={capability.testPaths} />
      {capability.infrastructurePaths?.length ? (
        <EvidencePaths title="Infrastructure" icon={Cloud} paths={capability.infrastructurePaths} />
      ) : null}
    </article>
  );
}

function EvidencePaths({
  title,
  icon: Icon,
  paths,
}: {
  title: string;
  icon: LucideIcon;
  paths: string[];
}) {
  return (
    <section className="architecture-evidence-paths">
      <h4>
        <Icon size={13} />
        {title}
        <span>{paths.length}</span>
      </h4>
      {paths.length ? (
        <ul>
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>No path registered.</p>
      )}
    </section>
  );
}
