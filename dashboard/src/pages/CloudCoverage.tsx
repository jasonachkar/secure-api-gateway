import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud as CloudIcon,
  Database,
  RefreshCw,
  Server,
  Workflow,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { HealthBadge, ProvenanceBadge } from '../components/SecurityBadges';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { CloudProvider, DataProvenance } from '../types';

const PROVIDERS: Array<{ id: CloudProvider; name: string; source: string }> = [
  {
    id: 'gateway',
    name: 'API Gateway',
    source: 'Authentication, authorization, token, and request telemetry',
  },
  {
    id: 'aws',
    name: 'Amazon Web Services',
    source: 'CloudWatch Logs · CloudTrail · WAF · API Gateway',
  },
  { id: 'gcp', name: 'Google Cloud', source: 'Cloud Logging · Audit Logs' },
  { id: 'azure', name: 'Microsoft Azure', source: 'Activity Log fixtures · Monitor normalization' },
];

export function CloudCoverage() {
  const pipeline = useQuery({
    queryKey: ['pipeline-metrics'],
    queryFn: adminApi.getPipelineMetrics,
    refetchInterval: 10_000,
  });
  const capability = useQuery({
    queryKey: ['capability-summary'],
    queryFn: adminApi.getCapabilitySummary,
  });
  const ingestion = useQuery({
    queryKey: ['ingestion-status'],
    queryFn: adminApi.getIngestionStatus,
    refetchInterval: 15_000,
  });
  const error = pipeline.error ?? capability.error ?? ingestion.error;

  const provenanceFor = (provider: CloudProvider): DataProvenance => {
    if (provider === 'gateway') return 'live';
    if (provider === 'azure') return 'replay';
    const source = capability.data?.cloudSources[provider];
    return source?.mode === 'live' ? 'live' : 'replay';
  };

  return (
    <Layout>
      <div className="page-stack cloud-page">
        <SectionHeader
          title="Cloud"
          subtitle="Ingestion readiness, evidence provenance, adapter state, and canonical pipeline health across gateway, AWS, GCP, and Azure sources."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                Promise.all([pipeline.refetch(), ingestion.refetch(), capability.refetch()])
              }
            >
              <RefreshCw size={14} /> Refresh sources
            </Button>
          }
        />
        {error && (
          <div className="alert alert--danger" role="alert">
            {getErrorMessage(error, 'One or more cloud source checks failed.')}
          </div>
        )}

        <div className="cloud-source-grid">
          {PROVIDERS.map((provider) => {
            const health = pipeline.data?.healthByProvider[provider.id];
            const events = pipeline.data?.eventsIngestedByProvider[provider.id] ?? 0;
            const lastPoll = pipeline.data?.lastSuccessfulProviderPoll[provider.id];
            const failures = pipeline.data?.consecutiveProviderFailures[provider.id] ?? 0;
            return (
              <Card key={provider.id} className="cloud-source-card">
                <header>
                  <span className={`provider-mark provider-mark--${provider.id}`}>
                    {provider.id.slice(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h2>{provider.name}</h2>
                    <p>{provider.source}</p>
                  </div>
                  {health && <HealthBadge value={health} />}
                </header>
                <div className="cloud-source-card__metrics">
                  <div>
                    <span>Events ingested</span>
                    <strong>{events.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Consecutive failures</span>
                    <strong className={failures ? 'text-danger' : ''}>{failures}</strong>
                  </div>
                </div>
                <footer>
                  <ProvenanceBadge value={provenanceFor(provider.id)} />
                  <span>
                    {lastPoll
                      ? `Last poll ${new Date(lastPoll).toLocaleString()}`
                      : provider.id === 'gateway'
                        ? 'Event-driven source'
                        : 'No successful poll recorded'}
                  </span>
                </footer>
              </Card>
            );
          })}
        </div>

        <div className="cloud-operational-grid">
          <Card className="cloud-pipeline-card">
            <div className="cloud-section-heading">
              <span>
                <Workflow size={16} />
              </span>
              <div>
                <h2>Canonical pipeline</h2>
                <p>Operational counters from receive through response.</p>
              </div>
            </div>
            <div className="cloud-pipeline-stages">
              {[
                [
                  'Received',
                  Object.values(pipeline.data?.eventsIngestedByProvider ?? {}).reduce(
                    (sum, value) => sum + value,
                    0
                  ),
                ],
                ['Normalized', pipeline.data?.eventsNormalized ?? 0],
                ['Evaluated', pipeline.data?.detectionEvaluations ?? 0],
                ['Matched', pipeline.data?.detectionMatches ?? 0],
                ['Correlated', pipeline.data?.investigationsCreated ?? 0],
                ['Responded', pipeline.data?.responseActionSuccess ?? 0],
              ].map(([label, value], index) => (
                <div key={label}>
                  <span>{index + 1}</span>
                  <strong>{Number(value).toLocaleString()}</strong>
                  <small>{label}</small>
                </div>
              ))}
            </div>
            <div className="pipeline-diagnostics">
              <span
                className={
                  (pipeline.data?.parserFailures ?? 0) ? 'pipeline-diagnostic--warning' : ''
                }
              >
                {(pipeline.data?.parserFailures ?? 0) ? (
                  <AlertTriangle size={13} />
                ) : (
                  <CheckCircle2 size={13} />
                )}{' '}
                {pipeline.data?.parserFailures ?? 0} parser failures
              </span>
              <span>
                <Database size={13} />
                {pipeline.data?.duplicatesDiscarded ?? 0} duplicates discarded
              </span>
              <span>
                <Server size={13} />
                {pipeline.data?.deadLetterCount ?? 0} dead letters
              </span>
            </div>
          </Card>

          <Card className="adapter-card">
            <div className="cloud-section-heading">
              <span>
                <CloudIcon size={16} />
              </span>
              <div>
                <h2>Adapter connections</h2>
                <p>Configured polling integrations and storage readiness.</p>
              </div>
            </div>
            <div className="adapter-list">
              {ingestion.data?.adapters.map((adapter) => (
                <div key={adapter.provider}>
                  <span className={`status-dot ${adapter.healthy ? 'status-dot--healthy' : ''}`} />
                  <div>
                    <strong>{adapter.name}</strong>
                    <small>
                      {adapter.detail ?? (adapter.configured ? 'Configured' : 'Not configured')}
                    </small>
                  </div>
                  <span className="security-badge">
                    {adapter.configured ? 'configured' : 'offline'}
                  </span>
                </div>
              )) ?? <div className="operational-loading">Loading adapters…</div>}
            </div>
            {ingestion.data && (
              <footer>
                <span>
                  <Database size={13} />
                  Redis {ingestion.data.storage.redisConnected ? 'connected' : 'unavailable'}
                </span>
                <span>
                  <Database size={13} />
                  Postgres{' '}
                  {ingestion.data.storage.postgresConnected ? 'connected' : 'not configured'}
                </span>
                <span>{ingestion.data.storage.totalEvents} retained events</span>
              </footer>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
