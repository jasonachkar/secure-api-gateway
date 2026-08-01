/**
 * Cloud Coverage page - real per-provider ingestion health and pipeline
 * metrics (GET /admin/security/pipeline-metrics), not a static "Configured"
 * label. See src/modules/security/pipeline-metrics.ts.
 */
import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { SectionHeader } from '../components/SectionHeader';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { PipelineMetricsSnapshot, OperationalHealth, CloudProvider } from '../types';

const HEALTH_VARIANT: Record<OperationalHealth, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  healthy: 'success',
  degraded: 'warning',
  unavailable: 'error',
  replay_only: 'info',
  not_configured: 'neutral',
};

const HEALTH_LABEL: Record<OperationalHealth, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  unavailable: 'Unavailable',
  replay_only: 'Replay only',
  not_configured: 'Not configured',
};

const PROVIDER_LABEL: Record<CloudProvider, string> = {
  aws: 'AWS CloudWatch / CloudTrail',
  gcp: 'GCP Cloud Logging',
  azure: 'Azure (replay only)',
  gateway: 'Gateway (live)',
};

export function CloudCoverage() {
  const [snapshot, setSnapshot] = useState<PipelineMetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.getPipelineMetrics();
        if (!cancelled) setSnapshot(data);
      } catch (err: any) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load pipeline metrics'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Layout>
        <PageLoadingSkeleton cardCount={3} />
      </Layout>
    );
  }

  const providers: CloudProvider[] = ['aws', 'gcp', 'azure', 'gateway'];

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Cloud coverage"
          subtitle="Per-provider ingestion health, computed from real poll success/failure counters - not a static badge."
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {snapshot && (
          <>
            <div className="page-grid page-grid--cards">
              {providers.map((provider) => {
                const health = snapshot.healthByProvider[provider];
                const ingested = snapshot.eventsIngestedByProvider[provider] ?? 0;
                const lastPoll = snapshot.lastSuccessfulProviderPoll[provider];
                const failures = snapshot.consecutiveProviderFailures[provider] ?? 0;
                return (
                  <Card key={provider}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong>{PROVIDER_LABEL[provider]}</strong>
                      <Badge variant={HEALTH_VARIANT[health]}>{HEALTH_LABEL[health]}</Badge>
                    </div>
                    <div className="text-sm text-muted">Events ingested: {ingested}</div>
                    <div className="text-sm text-muted">
                      Last successful poll: {lastPoll ? new Date(lastPoll).toLocaleString() : 'never'}
                    </div>
                    {failures > 0 && <div className="text-sm text-muted">Consecutive poll failures: {failures}</div>}
                  </Card>
                );
              })}
            </div>

            <Card>
              <h3 className="section-title">Pipeline totals</h3>
              <div className="page-grid page-grid--cards">
                <div>
                  <div className="text-sm text-muted">Events normalized</div>
                  <div className="metric-card__value">{snapshot.eventsNormalized}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Duplicates discarded</div>
                  <div className="metric-card__value">{snapshot.duplicatesDiscarded}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Parser failures</div>
                  <div className="metric-card__value">{snapshot.parserFailures}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Detection evaluations</div>
                  <div className="metric-card__value">{snapshot.detectionEvaluations}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Detection matches</div>
                  <div className="metric-card__value">{snapshot.detectionMatches}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Investigations created</div>
                  <div className="metric-card__value">{snapshot.investigationsCreated}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Investigation dedups</div>
                  <div className="metric-card__value">{snapshot.investigationDeduplications}</div>
                </div>
                <div>
                  <div className="text-sm text-muted">Avg ingestion delay</div>
                  <div className="metric-card__value">{snapshot.averageIngestionDelayMs} ms</div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
