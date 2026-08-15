import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Workflow,
  XCircle,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ProvenanceBadge } from '../components/SecurityBadges';
import { JsonViewer } from '../components/JsonViewer';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { ScenarioDefinition, ScenarioId, ScenarioRunResult } from '../types';

export function GuidedScenarios() {
  const scenarios = useQuery({
    queryKey: ['security-lab-scenarios'],
    queryFn: adminApi.getScenarios,
  });
  const [results, setResults] = useState<Record<string, ScenarioRunResult>>({});
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const run = useMutation({
    mutationFn: (id: ScenarioId) => adminApi.runScenario(id),
    onSuccess: (result) => {
      setResults((current) => ({ ...current, [result.scenarioId]: result }));
      setExpandedResult(result.scenarioId);
      showToast('Scenario completed through the real security pipeline', 'success');
      queryClient.invalidateQueries({ queryKey: ['investigations'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-metrics'] });
    },
    onError: (error) => showToast(getErrorMessage(error, 'Scenario run failed'), 'error'),
  });

  const reset = useMutation({
    mutationFn: adminApi.resetGatewayScenario,
    onSuccess: () => showToast('Gateway scenario state reset', 'success'),
    onError: (error) => showToast(getErrorMessage(error, 'Scenario reset failed'), 'error'),
  });

  return (
    <Layout>
      <div className="page-stack security-lab">
        <SectionHeader
          title="Security Lab"
          subtitle="A safe reviewer workspace for generating or replaying known security signals through the same normalization, detection, correlation, and evidence code paths used by the control plane."
          actions={
            <span className="lab-badge">
              <FlaskConical size={14} />
              Isolated test targets
            </span>
          }
        />

        <div className="lab-boundary">
          <ShieldCheck size={18} />
          <div>
            <strong>Safe by construction</strong>
            <p>
              Scenarios only target the fixed demo account and documentation-range IPs, or replay
              sanitized repository fixtures. They never mutate your cloud account.
            </p>
          </div>
          <Link to="/implementation-status">
            Verify boundaries <ArrowRight size={12} />
          </Link>
        </div>

        <div className="lab-pipeline" aria-label="Scenario processing pipeline">
          <span>
            <Sparkles size={15} />
            <strong>Generate / replay</strong>
          </span>
          <ArrowRight size={14} />
          <span>
            <Workflow size={15} />
            <strong>Normalize</strong>
          </span>
          <ArrowRight size={14} />
          <span>
            <ShieldCheck size={15} />
            <strong>Detect</strong>
          </span>
          <ArrowRight size={14} />
          <span>
            <Workflow size={15} />
            <strong>Correlate</strong>
          </span>
          <ArrowRight size={14} />
          <span>
            <CheckCircle2 size={15} />
            <strong>Verify evidence</strong>
          </span>
        </div>

        {scenarios.isError && (
          <div className="alert alert--danger" role="alert">
            {getErrorMessage(scenarios.error, 'Security Lab scenarios are unavailable.')}
          </div>
        )}
        {scenarios.isLoading ? (
          <Card className="operational-loading">Loading safe scenarios…</Card>
        ) : (
          <div className="lab-scenario-grid">
            {scenarios.data?.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                result={results[scenario.id]}
                running={run.isPending && run.variables === scenario.id}
                expanded={expandedResult === scenario.id}
                onRun={() => run.mutate(scenario.id)}
                onToggle={() =>
                  setExpandedResult((value) => (value === scenario.id ? null : scenario.id))
                }
                onReset={scenario.id === 'gw-credential-attack' ? () => reset.mutate() : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function ScenarioCard({
  scenario,
  result,
  running,
  expanded,
  onRun,
  onToggle,
  onReset,
}: {
  scenario: ScenarioDefinition;
  result?: ScenarioRunResult;
  running: boolean;
  expanded: boolean;
  onRun: () => void;
  onToggle: () => void;
  onReset?: () => void;
}) {
  return (
    <Card className={`lab-scenario ${result ? 'lab-scenario--complete' : ''}`}>
      <div className="lab-scenario__header">
        <span className={`provider-mark provider-mark--${scenario.provider}`}>
          {scenario.provider.slice(0, 2).toUpperCase()}
        </span>
        <span className="lab-scenario__badges">
          <ProvenanceBadge value={scenario.provenance} />
          <span className="security-badge">safe for reviewer</span>
        </span>
      </div>
      <h2>{scenario.name}</h2>
      <p>{scenario.description}</p>
      <div className="lab-scenario__outcome">
        <strong>Expected</strong>
        <span>{scenario.expectedOutcome}</span>
      </div>
      <ol className="scenario-stepper">
        {scenario.steps.map((step, index) => {
          const execution = result?.steps.find((item) => item.id === step.id);
          return (
            <li key={step.id} className={execution ? `scenario-step--${execution.status}` : ''}>
              <span>
                {execution?.status === 'completed' ? (
                  <CheckCircle2 size={13} />
                ) : execution?.status === 'failed' ? (
                  <XCircle size={13} />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{execution?.summary ?? step.description}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="lab-scenario__actions">
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw size={13} /> Reset
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={onRun} isLoading={running} disabled={running}>
          <Play size={13} />
          Run scenario
        </Button>
        {result && (
          <button className="lab-scenario__details" type="button" onClick={onToggle}>
            {expanded ? 'Hide artifacts' : 'Inspect artifacts'}
          </button>
        )}
      </div>
      {result && expanded && (
        <div className="lab-result">
          <div className="lab-result__summary">
            <span>
              <strong>{result.eventIds.length}</strong> normalized events
            </span>
            <span>
              <strong>{result.detectionIds.length}</strong> detections
            </span>
            <span>
              <strong>{result.investigationIds.length}</strong> investigations
            </span>
          </div>
          <JsonViewer value={result} label="Scenario execution artifact" />
          {result.investigationIds[0] && (
            <Link
              className="lab-result__investigation"
              to={`/investigations?id=${result.investigationIds[0]}`}
            >
              Open correlated investigation <ArrowRight size={13} />
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}
