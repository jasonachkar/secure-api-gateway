import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileCheck2,
  FlaskConical,
  Radar,
  ShieldAlert,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import {
  HealthBadge,
  InvestigationStatusBadge,
  ProvenanceBadge,
  SeverityBadge,
} from '../components/SecurityBadges';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { CloudProvider, OperationalHealth, SecurityInvestigation } from '../types';

const PROVIDERS: CloudProvider[] = ['gateway', 'aws', 'gcp', 'azure'];
const HEALTH_RANK: Record<OperationalHealth, number> = {
  unavailable: 0,
  degraded: 1,
  not_configured: 2,
  replay_only: 3,
  healthy: 4,
};

function relativeTime(value: string | number) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function Dashboard() {
  const metrics = useQuery({
    queryKey: ['metrics-summary'],
    queryFn: adminApi.getMetricsSummary,
    refetchInterval: 5_000,
  });
  const pipeline = useQuery({
    queryKey: ['pipeline-metrics'],
    queryFn: adminApi.getPipelineMetrics,
    refetchInterval: 10_000,
  });
  const investigations = useQuery({
    queryKey: ['investigations', 'overview'],
    queryFn: () => adminApi.getInvestigations({ limit: 50 }),
    refetchInterval: 10_000,
  });
  const capabilities = useQuery({
    queryKey: ['capability-summary'],
    queryFn: adminApi.getCapabilitySummary,
  });
  const requests = useQuery({
    queryKey: ['traffic', 'overview'],
    queryFn: () => adminApi.getRecentRequests(5),
    refetchInterval: 4_000,
  });

  const openInvestigations = useMemo(
    () =>
      (investigations.data ?? []).filter((item) => !['resolved', 'closed'].includes(item.status)),
    [investigations.data]
  );
  const prioritized = useMemo(
    () =>
      [...openInvestigations]
        .sort((a, b) => {
          const rank = { critical: 5, high: 4, medium: 3, low: 2, informational: 1 };
          return (
            rank[b.severity] - rank[a.severity] ||
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        })
        .slice(0, 5),
    [openInvestigations]
  );
  const sourceHealth = pipeline.data?.healthByProvider;
  const healthySources = sourceHealth
    ? PROVIDERS.filter((provider) => HEALTH_RANK[sourceHealth[provider]] >= HEALTH_RANK.replay_only)
        .length
    : 0;
  const error = metrics.error ?? pipeline.error ?? investigations.error ?? capabilities.error;

  return (
    <Layout>
      <div className="page-stack security-overview">
        <SectionHeader
          title="Security Overview"
          subtitle="Operational posture across gateway traffic, cloud telemetry, detection, investigation, response, and evidence."
          actions={
            <div className="action-row">
              <span className="control-plane-live">
                <span className="status-dot status-dot--healthy" />
                Live control plane
              </span>
              <Link to="/security-lab">
                <Button variant="secondary" size="sm">
                  <FlaskConical size={14} /> Security Lab
                </Button>
              </Link>
            </div>
          }
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            {getErrorMessage(error, 'One or more overview data sources are unavailable.')}
          </div>
        )}

        <div className="metric-strip metric-strip--overview">
          <OverviewMetric
            label="Open investigations"
            value={openInvestigations.length}
            detail={
              openInvestigations.some((item) => item.severity === 'critical')
                ? 'Critical attention required'
                : 'No critical investigations'
            }
            tone={
              openInvestigations.some((item) => item.severity === 'critical') ? 'danger' : 'neutral'
            }
          />
          <OverviewMetric
            label="Detection matches"
            value={pipeline.data?.detectionMatches ?? '—'}
            detail={`${pipeline.data?.detectionEvaluations ?? 0} evaluations`}
          />
          <OverviewMetric
            label="Requests proxied"
            value={metrics.data?.totalRequests ?? '—'}
            detail={`${metrics.data?.requestsPerSecond?.toFixed(2) ?? '0.00'} req/s`}
          />
          <OverviewMetric
            label="Gateway p95"
            value={metrics.data ? `${metrics.data.responseTimeStats.p95} ms` : '—'}
            detail={`${metrics.data?.errorRate?.toFixed(2) ?? '0.00'}% error rate`}
          />
          <OverviewMetric
            label="Active sources"
            value={`${healthySources}/${PROVIDERS.length}`}
            detail="Live or replay-ready"
          />
        </div>

        <div className="overview-grid overview-grid--primary">
          <Card className="overview-panel overview-panel--risk">
            <PanelHeader
              icon={ShieldAlert}
              title="Active risk"
              meta={`${openInvestigations.length} open`}
              action={{ to: '/investigations', label: 'View investigations' }}
            />
            {prioritized.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No active investigations"
                description="The pipeline has not correlated an open incident. Run a safe scenario to inspect the full workflow."
              />
            ) : (
              <div className="risk-list">
                {prioritized.map((item) => (
                  <RiskRow key={item.id} investigation={item} />
                ))}
              </div>
            )}
          </Card>

          <Card className="overview-panel overview-panel--pipeline">
            <PanelHeader
              icon={Workflow}
              title="Detection pipeline"
              meta={`${pipeline.data?.eventsNormalized ?? 0} normalized`}
              action={{ to: '/cloud', label: 'Pipeline health' }}
            />
            <div className="pipeline-flow" aria-label="Security data pipeline">
              <PipelineStep
                label="Receive"
                value={Object.values(pipeline.data?.eventsIngestedByProvider ?? {}).reduce(
                  (sum, value) => sum + value,
                  0
                )}
                tone="blue"
              />
              <PipelineStep
                label="Normalize"
                value={pipeline.data?.eventsNormalized ?? 0}
                tone="cyan"
              />
              <PipelineStep
                label="Detect"
                value={pipeline.data?.detectionMatches ?? 0}
                tone="amber"
              />
              <PipelineStep
                label="Correlate"
                value={pipeline.data?.investigationsCreated ?? 0}
                tone="violet"
              />
              <PipelineStep
                label="Respond"
                value={
                  (pipeline.data?.responseActionSuccess ?? 0) +
                  (pipeline.data?.responseActionFailure ?? 0)
                }
                tone="green"
              />
            </div>
            <div className="pipeline-footnotes">
              <span>{pipeline.data?.duplicatesDiscarded ?? 0} duplicates discarded</span>
              <span>{pipeline.data?.parserFailures ?? 0} parser failures</span>
              <span>{pipeline.data?.averageIngestionDelayMs ?? 0} ms avg ingest delay</span>
            </div>
          </Card>
        </div>

        <div className="overview-grid overview-grid--secondary">
          <Card className="overview-panel">
            <PanelHeader
              icon={Cloud}
              title="Cloud source status"
              meta={`${healthySources} ready`}
              action={{ to: '/cloud', label: 'Open cloud' }}
            />
            <div className="source-health-list">
              {PROVIDERS.map((provider) => (
                <div key={provider} className="source-health-row">
                  <span className={`provider-mark provider-mark--${provider}`}>
                    {provider.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>
                      {provider === 'gateway'
                        ? 'API Gateway'
                        : `${provider.toUpperCase()} telemetry`}
                    </strong>
                    <small>
                      {pipeline.data?.eventsIngestedByProvider[provider] ?? 0} events received
                    </small>
                  </span>
                  {sourceHealth ? (
                    <HealthBadge value={sourceHealth[provider]} />
                  ) : (
                    <span className="skeleton skeleton--inline" />
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="overview-panel">
            <PanelHeader
              icon={Radar}
              title="Control coverage"
              meta={`${capabilities.data?.total ?? 0} capabilities`}
              action={{ to: '/implementation-status', label: 'View registry' }}
            />
            <div className="coverage-stack">
              {(['implemented', 'partial', 'simulated', 'planned'] as const).map((status) => {
                const count = capabilities.data?.counts[status] ?? 0;
                const percent = capabilities.data?.total
                  ? Math.round((count / capabilities.data.total) * 100)
                  : 0;
                return (
                  <div key={status} className={`coverage-bar coverage-bar--${status}`}>
                    <div>
                      <span>{status}</span>
                      <strong>{count}</strong>
                    </div>
                    <span className="coverage-bar__track">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="overview-panel">
            <PanelHeader
              icon={Activity}
              title="Recent gateway activity"
              meta={`${requests.data?.length ?? 0} captured`}
              action={{ to: '/traffic', label: 'Explore traffic' }}
            />
            {requests.data?.length ? (
              <div className="activity-list">
                {requests.data.map((request) => (
                  <div key={`${request.timestamp}-${request.path}-${request.method}`}>
                    <span className={`http-method http-method--${request.method.toLowerCase()}`}>
                      {request.method}
                    </span>
                    <code>{request.path}</code>
                    <span
                      className={`http-status http-status--${request.statusCode >= 400 ? 'warning' : 'success'}`}
                    >
                      {request.statusCode}
                    </span>
                    <small>{request.latencyMs} ms</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Activity}
                title="Waiting for gateway traffic"
                description="Requests appear here as they pass through the proxy."
              />
            )}
          </Card>
        </div>

        <div className="overview-evidence-note">
          <FileCheck2 size={15} />
          <span>
            Every status above is sourced from a runtime endpoint or the backend capability
            registry.
          </span>
          <Link to="/implementation-status">
            Inspect evidence <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    </Layout>
  );
}

function OverviewMetric({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <div className={`overview-metric overview-metric--${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  action: { to: string; label: string };
}) {
  return (
    <div className="overview-panel__header">
      <div>
        <span className="overview-panel__icon">
          <Icon size={16} />
        </span>
        <h2>{title}</h2>
        <small>{meta}</small>
      </div>
      <Link to={action.to}>
        {action.label}
        <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function RiskRow({ investigation }: { investigation: SecurityInvestigation }) {
  return (
    <Link to={`/investigations?id=${investigation.id}`} className="risk-row">
      <span className={`risk-row__rail risk-row__rail--${investigation.severity}`} />
      <span className="risk-row__content">
        <span>
          <SeverityBadge value={investigation.severity} />
          <InvestigationStatusBadge value={investigation.status} />
          <ProvenanceBadge value={investigation.provenance} />
        </span>
        <strong>{investigation.title}</strong>
        <small>
          {investigation.providerScopes.join(' · ').toUpperCase()} ·{' '}
          {relativeTime(investigation.updatedAt)}
        </small>
      </span>
      <ArrowRight size={14} />
    </Link>
  );
}

function PipelineStep({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`pipeline-step pipeline-step--${tone}`}>
      <span className="pipeline-step__dot" />
      <strong>{value.toLocaleString()}</strong>
      <small>{label}</small>
    </div>
  );
}
