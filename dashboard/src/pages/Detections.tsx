import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Radar,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { ProvenanceBadge, SeverityBadge } from '../components/SecurityBadges';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { DetectionRuleHealth, SecuritySeverity } from '../types';

function timestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

export function Detections() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<'all' | SecuritySeverity>('all');
  const [provider, setProvider] = useState('all');
  const rules = useQuery({
    queryKey: ['detection-rules'],
    queryFn: adminApi.getDetectionRules,
    refetchInterval: 15_000,
  });

  const filtered = useMemo(
    () =>
      (rules.data ?? []).filter((rule) => {
        const term = search.trim().toLowerCase();
        if (
          term &&
          !`${rule.id} ${rule.name} ${rule.providers.join(' ')}`.toLowerCase().includes(term)
        )
          return false;
        if (severity !== 'all' && rule.severity !== severity) return false;
        if (
          provider !== 'all' &&
          !rule.providers.includes(provider as DetectionRuleHealth['providers'][number])
        )
          return false;
        return true;
      }),
    [rules.data, search, severity, provider]
  );

  const selected = filtered.find((rule) => rule.id === selectedId) ?? filtered[0];
  const totals = useMemo(
    () =>
      (rules.data ?? []).reduce(
        (acc, rule) => ({
          evaluations: acc.evaluations + rule.evaluationCount,
          matches: acc.matches + rule.matchCount,
          errors: acc.errors + rule.errorCount,
        }),
        { evaluations: 0, matches: 0, errors: 0 }
      ),
    [rules.data]
  );

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Detections"
          subtitle="Documented provider-independent rules, their supported evidence provenance, and runtime evaluation health—without opaque scoring."
          actions={
            <span className="control-plane-live">
              <span className="status-dot status-dot--healthy" />
              Rule engine online
            </span>
          }
        />

        <div className="metric-strip">
          <div>
            <span>Enabled rules</span>
            <strong>{rules.data?.filter((rule) => rule.enabled).length ?? '—'}</strong>
            <small>of {rules.data?.length ?? 0} registered</small>
          </div>
          <div>
            <span>Evaluations</span>
            <strong>{totals.evaluations.toLocaleString()}</strong>
            <small>runtime counter</small>
          </div>
          <div>
            <span>Matches</span>
            <strong>{totals.matches.toLocaleString()}</strong>
            <small>across all rules</small>
          </div>
          <div>
            <span>Rule errors</span>
            <strong className={totals.errors ? 'text-danger' : ''}>
              {totals.errors.toLocaleString()}
            </strong>
            <small>{totals.errors ? 'requires review' : 'healthy'}</small>
          </div>
        </div>

        {rules.isError && (
          <div className="alert alert--danger" role="alert">
            {getErrorMessage(rules.error, 'Detection rule health is unavailable.')}
          </div>
        )}

        <div className="detection-toolbar">
          <div className="filter-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search rule name or ID…"
              aria-label="Search detection rules"
            />
          </div>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            aria-label="Filter rules by provider"
          >
            <option value="all">All providers</option>
            {['gateway', 'aws', 'gcp', 'azure'].map((value) => (
              <option key={value}>{value.toUpperCase()}</option>
            ))}
          </select>
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
            aria-label="Filter rules by severity"
          >
            <option value="all">All severities</option>
            {['critical', 'high', 'medium', 'low', 'informational'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>

        {rules.isLoading ? (
          <Card className="operational-loading">Loading detection catalog…</Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon={Radar}
              title="No matching rules"
              description="Adjust the filters to show more of the rule catalog."
            />
          </Card>
        ) : (
          <div className="detection-workbench">
            <div className="detection-list" aria-label="Detection rules">
              {filtered.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  className={`detection-list__item ${selected?.id === rule.id ? 'detection-list__item--active' : ''}`}
                  onClick={() => setSelectedId(rule.id)}
                >
                  <span className="detection-list__title">
                    <code>{rule.id}</code>
                    <strong>{rule.name}</strong>
                  </span>
                  <span className="detection-list__badges">
                    <SeverityBadge value={rule.severity} />
                    {rule.supportedProvenance.map((value) => (
                      <ProvenanceBadge key={value} value={value} />
                    ))}
                  </span>
                  <span className="detection-list__meta">
                    <span>{rule.providers.map((value) => value.toUpperCase()).join(' · ')}</span>
                    <span>v{rule.version}</span>
                    <span>{rule.matchCount} matches</span>
                  </span>
                </button>
              ))}
            </div>

            {selected && (
              <Card className="detection-detail">
                <div className="detection-detail__header">
                  <div>
                    <div className="eyebrow">Detection rule · {selected.id}</div>
                    <h2>{selected.name}</h2>
                    <div className="tag-group">
                      <SeverityBadge value={selected.severity} />
                      {selected.enabled ? (
                        <span className="security-badge security-badge--health-healthy">
                          <CheckCircle2 size={11} />
                          enabled
                        </span>
                      ) : (
                        <span className="security-badge">disabled</span>
                      )}
                      {selected.providers.map((value) => (
                        <span key={value} className="provider-chip">
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="rule-version">version {selected.version}</span>
                </div>
                {selected.description && (
                  <p className="detection-detail__description">{selected.description}</p>
                )}
                <div className="detail-kv-grid">
                  <div>
                    <span>Evaluations</span>
                    <strong>{selected.evaluationCount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Matches</span>
                    <strong>{selected.matchCount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Errors</span>
                    <strong>{selected.errorCount.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Last evaluated</span>
                    <strong>{timestamp(selected.lastEvaluatedAt)}</strong>
                  </div>
                </div>
                <div className="rule-health-row">
                  <div>
                    <Clock3 size={14} />
                    <span>Last match</span>
                    <strong>{timestamp(selected.lastMatchedAt)}</strong>
                  </div>
                  <div>
                    <ShieldCheck size={14} />
                    <span>Supported evidence</span>
                    <span className="tag-group">
                      {selected.supportedProvenance.map((value) => (
                        <ProvenanceBadge key={value} value={value} />
                      ))}
                    </span>
                  </div>
                </div>
                {selected.severityRationale && (
                  <RuleSection icon={AlertTriangle} title="Severity rationale">
                    <p>{selected.severityRationale}</p>
                  </RuleSection>
                )}
                {selected.remediation?.length ? (
                  <RuleSection icon={ShieldCheck} title="Recommended remediation">
                    <ol>
                      {selected.remediation.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </RuleSection>
                ) : null}
                {selected.falsePositiveNotes?.length ? (
                  <RuleSection icon={Radar} title="False-positive notes">
                    <ul>
                      {selected.falsePositiveNotes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </RuleSection>
                ) : null}
                <RuleSection icon={FileCheck2} title="Test evidence">
                  <ul className="code-path-list">
                    {selected.testPaths.map((item) => (
                      <li key={item}>
                        <code>{item}</code>
                      </li>
                    ))}
                  </ul>
                </RuleSection>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function RuleSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rule-section">
      <h3>
        <Icon size={15} />
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}
