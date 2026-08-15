import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileCode2,
  FlaskConical,
  Search,
  ShieldCheck,
  TestTube2,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Drawer } from '../components/Drawer';
import { EmptyState } from '../components/EmptyState';
import { ProvenanceBadge } from '../components/SecurityBadges';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { CapabilityCategory, CapabilityDefinition, CapabilityStatus } from '../types';

const STATUS_META = {
  implemented: { label: 'Implemented', icon: CheckCircle2 },
  partial: { label: 'Partial', icon: Clock3 },
  simulated: { label: 'Simulated', icon: FlaskConical },
  planned: { label: 'Planned', icon: CircleDashed },
} satisfies Record<CapabilityStatus, { label: string; icon: typeof CheckCircle2 }>;

const CATEGORY_LABEL: Record<CapabilityCategory, string> = {
  'gateway-protection': 'Gateway protection',
  'cloud-ingestion': 'Cloud ingestion',
  detection: 'Detection & investigation',
  response: 'Response',
  evidence: 'Evidence',
  'platform-security': 'Platform security',
};

export function ImplementationStatus() {
  const summary = useQuery({
    queryKey: ['capability-summary'],
    queryFn: adminApi.getCapabilitySummary,
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | CapabilityStatus>('all');
  const [category, setCategory] = useState<'all' | CapabilityCategory>('all');
  const [selected, setSelected] = useState<CapabilityDefinition | null>(null);

  const capabilities = useMemo(
    () =>
      (summary.data?.capabilities ?? []).filter((item) => {
        const term = search.trim().toLowerCase();
        if (term && !`${item.id} ${item.name} ${item.summary}`.toLowerCase().includes(term))
          return false;
        if (status !== 'all' && item.status !== status) return false;
        if (category !== 'all' && item.category !== category) return false;
        return true;
      }),
    [summary.data, search, status, category]
  );

  return (
    <Layout>
      <div className="page-stack implementation-page">
        <SectionHeader
          title="Implementation"
          subtitle="The backend capability registry is the single source of truth for what is wired, tested, simulated, partial, or planned."
          actions={
            <span className="control-plane-live">
              <ShieldCheck size={14} />
              Registry-backed claims
            </span>
          }
        />
        {summary.isError && (
          <div className="alert alert--danger">
            {getErrorMessage(summary.error, 'Capability registry is unavailable.')}
          </div>
        )}
        <div className="ui-card implementation-registry-source">
          <ShieldCheck size={14} />
          <span>
            <strong>Live backend registry</strong> · status, provenance, limitations,
            implementation, and test paths
          </span>
        </div>
        <div className="metric-strip implementation-metrics">
          {(Object.keys(STATUS_META) as CapabilityStatus[]).map((value) => {
            const Icon = STATUS_META[value].icon;
            return (
              <div key={value}>
                <span>
                  <Icon size={12} />
                  {STATUS_META[value].label}
                </span>
                <strong>{summary.data?.counts[value] ?? '—'}</strong>
                <small>
                  {summary.data?.total
                    ? `${Math.round(((summary.data.counts[value] ?? 0) / summary.data.total) * 100)}% of registry`
                    : 'Loading registry'}
                </small>
              </div>
            );
          })}
        </div>
        <div className="implementation-toolbar">
          <div className="filter-search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search capability, claim, or ID…"
              aria-label="Search capabilities"
            />
          </div>
          <select
            aria-label="Filter by capability category"
            value={category}
            onChange={(event) => setCategory(event.target.value as typeof category)}
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by capability status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([value, meta]) => (
              <option value={value} key={value}>
                {meta.label}
              </option>
            ))}
          </select>
        </div>
        <div className="capability-registry">
          <div className="capability-registry__header">
            <span>Capability</span>
            <span>Category</span>
            <span>Truth status</span>
            <span>Evidence</span>
          </div>
          {summary.isLoading ? (
            <div className="operational-loading">Loading backend registry…</div>
          ) : capabilities.length === 0 ? (
            <EmptyState
              icon={CircleDashed}
              title="No matching capabilities"
              description="Adjust the filters to show more of the registry."
            />
          ) : (
            capabilities.map((item) => (
              <button key={item.id} onClick={() => setSelected(item)}>
                <span>
                  <code>{item.id}</code>
                  <strong>{item.name}</strong>
                  <small>{item.summary}</small>
                </span>
                <span>{CATEGORY_LABEL[item.category]}</span>
                <span>
                  <span className={`capability-status capability-status--${item.status}`}>
                    {item.status}
                  </span>
                  {item.provenance && <ProvenanceBadge value={item.provenance} />}
                </span>
                <span>
                  <span>
                    <FileCode2 size={12} />
                    {item.implementationPaths.length}
                  </span>
                  <span>
                    <TestTube2 size={12} />
                    {item.testPaths.length}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      <Drawer
        isOpen={Boolean(selected)}
        title="Capability evidence"
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="capability-detail">
            <div>
              <div className="eyebrow">{selected.id}</div>
              <h2>{selected.name}</h2>
              <div className="tag-group">
                <span className={`capability-status capability-status--${selected.status}`}>
                  {selected.status}
                </span>
                {selected.provenance && <ProvenanceBadge value={selected.provenance} />}
                <span className="provider-chip">{CATEGORY_LABEL[selected.category]}</span>
              </div>
            </div>
            <p>{selected.summary}</p>
            {selected.limitations?.length ? (
              <section className="capability-limitations">
                <h3>Known limitations</h3>
                <ul>
                  {selected.limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            <PathSection
              title="Implementation"
              icon={FileCode2}
              paths={selected.implementationPaths}
            />
            <PathSection title="Test evidence" icon={TestTube2} paths={selected.testPaths} />
            {selected.infrastructurePaths?.length ? (
              <PathSection
                title="Infrastructure"
                icon={ShieldCheck}
                paths={selected.infrastructurePaths}
              />
            ) : null}
          </div>
        )}
      </Drawer>
    </Layout>
  );
}

function PathSection({
  title,
  icon: Icon,
  paths,
}: {
  title: string;
  icon: typeof FileCode2;
  paths: string[];
}) {
  return (
    <section className="path-section">
      <h3>
        <Icon size={14} />
        {title}
        <span>{paths.length}</span>
      </h3>
      {paths.length ? (
        <ul>
          {paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      ) : (
        <p>No repository path registered.</p>
      )}
    </section>
  );
}
