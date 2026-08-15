import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { Activity, ArrowDownUp, RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react';
import { format } from 'date-fns';
import { Layout } from '../components/Layout';
import { SectionHeader } from '../components/SectionHeader';
import { Button } from '../components/Button';
import { Drawer } from '../components/Drawer';
import { DecisionBadge } from '../components/SecurityBadges';
import { EmptyState } from '../components/EmptyState';
import { JsonViewer } from '../components/JsonViewer';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { RequestLogEntry } from '../types';

const columnHelper = createColumnHelper<RequestLogEntry>();

function statusTone(status: number) {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  return 'success';
}

export function TrafficExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [method, setMethod] = useState(() => searchParams.get('method') ?? 'all');
  const [decision, setDecision] = useState(() => searchParams.get('decision') ?? 'all');
  const [statusFamily, setStatusFamily] = useState(() => searchParams.get('status') ?? 'all');
  const [selected, setSelected] = useState<RequestLogEntry | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'timestamp', desc: true }]);

  const requests = useQuery({
    queryKey: ['traffic', 'recent'],
    queryFn: () => adminApi.getRecentRequests(100),
    refetchInterval: 2_000,
  });

  const data = useMemo(
    () =>
      (requests.data ?? []).filter((entry) => {
        const term = search.trim().toLowerCase();
        if (
          term &&
          !`${entry.method} ${entry.path} ${entry.user} ${entry.sourceIp} ${entry.requestId} ${entry.statusCode}`
            .toLowerCase()
            .includes(term)
        )
          return false;
        if (method !== 'all' && entry.method !== method) return false;
        if (decision !== 'all' && entry.rbacDecision !== decision) return false;
        if (
          statusFamily !== 'all' &&
          Math.floor(entry.statusCode / 100).toString() !== statusFamily
        )
          return false;
        return true;
      }),
    [requests.data, search, method, decision, statusFamily]
  );

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set('q', search.trim());
    if (method !== 'all') next.set('method', method);
    if (decision !== 'all') next.set('decision', decision);
    if (statusFamily !== 'all') next.set('status', statusFamily);
    setSearchParams(next, { replace: true });
  }, [search, method, decision, statusFamily, setSearchParams]);

  const columns = useMemo(
    () => [
      columnHelper.accessor('timestamp', {
        header: 'Time',
        cell: (info) => (
          <span className="table-mono">{format(new Date(info.getValue()), 'HH:mm:ss.SSS')}</span>
        ),
      }),
      columnHelper.accessor('method', {
        header: 'Method',
        cell: (info) => (
          <span className={`http-method http-method--${info.getValue().toLowerCase()}`}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('path', {
        header: 'Route',
        cell: (info) => <span className="table-route">{info.getValue()}</span>,
      }),
      columnHelper.accessor('user', { header: 'Principal' }),
      columnHelper.accessor('rbacDecision', {
        header: 'RBAC',
        cell: (info) => <DecisionBadge value={info.getValue()} />,
      }),
      columnHelper.accessor('rateLimitRemaining', {
        header: 'Budget',
        cell: (info) => <span className="table-mono">{info.getValue() ?? '—'}</span>,
      }),
      columnHelper.accessor('statusCode', {
        header: 'Status',
        cell: (info) => (
          <span className={`http-status http-status--${statusTone(info.getValue())}`}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor('latencyMs', {
        header: 'Latency',
        cell: (info) => <span className="table-mono">{info.getValue()} ms</span>,
      }),
      columnHelper.accessor('requestId', {
        header: 'Request ID',
        cell: (info) => (
          <span className="table-mono table-request-id" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const resetFilters = () => {
    setSearch('');
    setMethod('all');
    setDecision('all');
    setStatusFamily('all');
  };

  const activeFilters = [
    search.trim()
      ? { key: 'q', label: `Search: ${search.trim()}`, clear: () => setSearch('') }
      : null,
    method !== 'all'
      ? { key: 'method', label: `Method: ${method}`, clear: () => setMethod('all') }
      : null,
    decision !== 'all'
      ? { key: 'decision', label: `RBAC: ${decision}`, clear: () => setDecision('all') }
      : null,
    statusFamily !== 'all'
      ? { key: 'status', label: `Status: ${statusFamily}xx`, clear: () => setStatusFamily('all') }
      : null,
  ].filter((filter): filter is { key: string; label: string; clear: () => void } =>
    Boolean(filter)
  );

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Traffic Explorer"
          subtitle="Live gateway request telemetry with authentication, authorization, rate-limit, status, and latency decisions in one operational view."
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => requests.refetch()}
              disabled={requests.isFetching}
            >
              <RefreshCw size={14} /> Refresh
            </Button>
          }
        />

        <div className="traffic-toolbar">
          <div className="filter-search">
            <Search size={15} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search route, principal, method…"
              aria-label="Search traffic"
            />
          </div>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            aria-label="Filter by HTTP method"
          >
            <option value="all">All methods</option>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            aria-label="Filter by RBAC decision"
          >
            <option value="all">All decisions</option>
            <option value="allowed">Allowed</option>
            <option value="denied">Denied</option>
            <option value="anonymous">Anonymous</option>
          </select>
          <select
            value={statusFamily}
            onChange={(event) => setStatusFamily(event.target.value)}
            aria-label="Filter by status family"
          >
            <option value="all">All statuses</option>
            <option value="2">2xx</option>
            <option value="4">4xx</option>
            <option value="5">5xx</option>
          </select>
          <button className="filter-reset" type="button" onClick={resetFilters}>
            <SlidersHorizontal size={14} /> Reset
          </button>
          <div className="traffic-toolbar__live">
            <span className={`status-dot ${requests.isError ? '' : 'status-dot--healthy'}`} />
            {requests.isError ? 'Disconnected' : 'Polling every 2s'}
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="filter-chips" aria-label="Active traffic filters">
            {activeFilters.map((filter) => (
              <button key={filter.key} type="button" onClick={filter.clear}>
                {filter.label}
                <X size={11} aria-hidden="true" />
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
          </div>
        )}

        {requests.isError && (
          <div className="alert alert--danger" role="alert">
            {getErrorMessage(requests.error, 'Traffic telemetry is unavailable.')}
          </div>
        )}

        <div className="operational-table-card">
          {requests.isLoading ? (
            <div className="operational-loading">Loading request telemetry…</div>
          ) : data.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No matching traffic"
              description={
                requests.data?.length
                  ? 'Adjust the filters to broaden the result set.'
                  : 'Requests will appear here as they pass through the gateway.'
              }
              action={
                requests.data?.length
                  ? { label: 'Clear filters', onClick: resetFilters }
                  : undefined
              }
            />
          ) : (
            <div className="operational-table-scroll">
              <table className="operational-table">
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => (
                        <th key={header.id}>
                          <button type="button" onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {header.column.getCanSort() && <ArrowDownUp size={11} />}
                          </button>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() => setSelected(row.original)}
                      onKeyDown={(event) => event.key === 'Enter' && setSelected(row.original)}
                      aria-label={`Inspect ${row.original.method} ${row.original.path}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="operational-table-footer">
            <span>
              {data.length} of {requests.data?.length ?? 0} requests
            </span>
            <span>Newest telemetry retained in memory by the gateway</span>
          </div>
        </div>
      </div>

      <Drawer isOpen={Boolean(selected)} title="Request evidence" onClose={() => setSelected(null)}>
        {selected && (
          <div className="detail-stack">
            <div className="detail-kv-grid">
              <div>
                <span>Decision</span>
                <DecisionBadge value={selected.rbacDecision} />
              </div>
              <div>
                <span>Status</span>
                <strong>{selected.statusCode}</strong>
              </div>
              <div>
                <span>Latency</span>
                <strong>{selected.latencyMs} ms</strong>
              </div>
              <div>
                <span>Rate-limit budget</span>
                <strong>{selected.rateLimitRemaining ?? 'Not recorded'}</strong>
              </div>
            </div>
            <section>
              <h3>Request</h3>
              <div className="request-line">
                <span className={`http-method http-method--${selected.method.toLowerCase()}`}>
                  {selected.method}
                </span>
                <code>{selected.path}</code>
              </div>
              <div className="request-evidence-meta">
                <span>
                  Request ID <code>{selected.requestId}</code>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSearch(selected.sourceIp);
                    setSelected(null);
                  }}
                >
                  Filter source IP <code>{selected.sourceIp}</code>
                </button>
              </div>
            </section>
            <section>
              <h3>Principal</h3>
              <p>{selected.user || 'Anonymous request'}</p>
            </section>
            <JsonViewer value={selected} label="Captured request telemetry" />
          </div>
        )}
      </Drawer>
    </Layout>
  );
}
