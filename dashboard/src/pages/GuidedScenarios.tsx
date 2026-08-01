/**
 * Guided Scenarios page - runs the 3 deterministic scenarios (see
 * src/modules/scenarios/scenario.service.ts) and renders the resulting
 * 6-step trace (Generate/Replay -> Normalize -> Detect -> Correlate ->
 * Respond -> Verify evidence) exactly as returned by the API - nothing here
 * is a client-side simulation of the steps.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, MinusCircle, Play, RotateCcw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { SectionHeader } from '../components/SectionHeader';
import { PageLoadingSkeleton } from '../components/PageLoadingSkeleton';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { ScenarioDefinition, ScenarioRunResult, ScenarioId } from '../types';

const PROVENANCE_VARIANT: Record<string, 'success' | 'info' | 'neutral'> = {
  live: 'success',
  replay: 'info',
  synthetic: 'neutral',
  planned: 'neutral',
};

function StepIcon({ status }: { status: 'completed' | 'skipped' | 'failed' }) {
  if (status === 'completed') return <CheckCircle2 size={16} color="var(--color-success-600)" aria-hidden="true" />;
  if (status === 'failed') return <XCircle size={16} color="var(--color-error-600)" aria-hidden="true" />;
  return <MinusCircle size={16} className="text-muted" aria-hidden="true" />;
}

export function GuidedScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState<ScenarioId | null>(null);
  const [results, setResults] = useState<Record<string, ScenarioRunResult>>({});
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await adminApi.getScenarios();
        if (!cancelled) setScenarios(data);
      } catch (err: any) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load scenarios'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runScenario = async (id: ScenarioId) => {
    setRunning(id);
    try {
      const result = await adminApi.runScenario(id);
      setResults((prev) => ({ ...prev, [id]: result }));
      showToast(`Scenario "${id}" completed`, 'success');
    } catch (err: any) {
      showToast(getErrorMessage(err, 'Scenario run failed'), 'error');
    } finally {
      setRunning(null);
    }
  };

  const resetGateway = async () => {
    try {
      await adminApi.resetGatewayScenario();
      showToast('Gateway scenario reset (demo IP unblocked, lockout cleared)', 'success');
    } catch (err: any) {
      showToast(getErrorMessage(err, 'Reset failed'), 'error');
    }
  };

  if (loading) {
    return (
      <Layout>
        <PageLoadingSkeleton cardCount={3} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Guided scenarios"
          subtitle="Each scenario drives the real detection pipeline end to end - a live gateway credential attack, or a replay of a sanitized AWS/GCP fixture. None of these touch your own account or perform a destructive cloud action."
        />

        {error && (
          <div className="alert alert--danger" role="alert">
            {error}
          </div>
        )}

        {scenarios.map((scenario) => {
          const result = results[scenario.id];
          return (
            <Card key={scenario.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <strong>{scenario.name}</strong>
                    <Badge variant={PROVENANCE_VARIANT[scenario.provenance] ?? 'neutral'}>{scenario.provenance}</Badge>
                    <Badge variant="neutral">{scenario.provider}</Badge>
                  </div>
                  <p className="text-sm text-muted" style={{ marginTop: 6, maxWidth: 680 }}>
                    {scenario.description}
                  </p>
                  <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                    <strong>Expected outcome:</strong> {scenario.expectedOutcome}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  {scenario.id === 'gw-credential-attack' && (
                    <Button variant="ghost" size="sm" onClick={resetGateway}>
                      <RotateCcw size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                      Reset
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => runScenario(scenario.id)}
                    disabled={running !== null}
                    isLoading={running === scenario.id}
                  >
                    <Play size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                    Run scenario
                  </Button>
                </div>
              </div>

              <ol
                aria-label={`${scenario.name} steps`}
                style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', listStyle: 'none', padding: 0 }}
              >
                {scenario.steps.map((step) => {
                  const stepResult = result?.steps.find((s) => s.id === step.id);
                  return (
                    <li key={step.id} style={{ minWidth: 150, flex: '1 1 150px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {stepResult ? <StepIcon status={stepResult.status} /> : <MinusCircle size={16} className="text-muted" aria-hidden="true" />}
                        <span className="text-sm" style={{ fontWeight: 600 }}>
                          {step.label}
                        </span>
                      </div>
                      <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                        {stepResult?.summary ?? step.description}
                      </p>
                    </li>
                  );
                })}
              </ol>

              {result && (
                <div className="text-sm text-muted" style={{ marginTop: 12, borderTop: '1px solid var(--color-border-light)', paddingTop: 12 }}>
                  Correlation ID: <code className="text-mono">{result.correlationId}</code>
                  {result.investigationIds.length > 0 && (
                    <>
                      {' '}
                      &middot;{' '}
                      <Link to={`/investigations?id=${result.investigationIds[0]}`}>
                        View investigation{result.investigationIds.length > 1 ? 's' : ''}
                      </Link>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
