/**
 * Admin Audit Logs page
 * Displays administrative actions
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { MetricCard } from '../components/MetricCard';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { Table, TableHeader, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/Table';
import { AuditReportExport } from '../components/AuditReportExport';
import { adminApi } from '../api/admin';
import { getErrorMessage } from '../api/errors';
import type { AdminAuditLogEntry } from '../types';
import { format } from 'date-fns';

interface AuditLogFilters {
  actorId?: string;
  action?: string;
  incidentId?: string;
  startTime?: number;
  endTime?: number;
  page: number;
  pageSize: number;
}

const DATE_PRESETS = [
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 168 },
  { label: 'Last 30 days', hours: 720 },
];

export function AuditLogs() {
  const [logs, setLogs] = useState<AdminAuditLogEntry[]>([]);
  const [allLogs, setAllLogs] = useState<AdminAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    pageSize: 50,
  });

  const stats = useMemo(() => {
    const total = allLogs.length;
    const incidentLogs = allLogs.filter((log) => log.incidentId).length;
    const uniqueActors = new Set(allLogs.map((log) => log.actor.userId)).size;
    const actions = allLogs.reduce<Record<string, number>>((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});
    const topAction = Object.entries(actions).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    return {
      total,
      incidentLogs,
      uniqueActors,
      topAction,
    };
  }, [allLogs]);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params: any = {
        limit: 1000,
        offset: 0,
      };

      if (filters.actorId) params.actorId = filters.actorId;
      if (filters.action) params.action = filters.action;
      if (filters.incidentId) params.incidentId = filters.incidentId;
      if (filters.startTime) params.startTime = filters.startTime;
      if (filters.endTime) params.endTime = filters.endTime;

      const data = await adminApi.getAdminActionLogs(params);
      setAllLogs(data);

      const start = (filters.page - 1) * filters.pageSize;
      const end = start + filters.pageSize;
      setLogs(data.slice(start, end));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to fetch audit logs'));
      setAllLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key: keyof AuditLogFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: 1,
    }));
  };

  const handleDatePreset = (hours: number) => {
    const endTime = Date.now();
    const startTime = endTime - hours * 60 * 60 * 1000;
    setFilters((prev) => ({
      ...prev,
      startTime,
      endTime,
      page: 1,
    }));
  };

  const clearFilters = () => {
    setFilters({
      page: 1,
      pageSize: 50,
    });
  };

  const totalPages = Math.ceil(allLogs.length / filters.pageSize);
  const startIndex = (filters.page - 1) * filters.pageSize + 1;
  const endIndex = Math.min(filters.page * filters.pageSize, allLogs.length);

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Audit Logs"
          subtitle="Administrative action history across the platform"
          actions={
            <>
              <AuditReportExport />
              <Button variant="ghost" onClick={() => fetchLogs()} disabled={loading}>
                <RefreshCw size={14} aria-hidden="true" style={{ marginRight: 6 }} />
                Refresh
              </Button>
            </>
          }
        />

        <div className="page-grid page-grid--cards">
          <MetricCard title="Total Actions" value={stats.total.toLocaleString()} color="blue" />
          <MetricCard
            title="Incident Actions"
            value={stats.incidentLogs.toLocaleString()}
            color="yellow"
          />
          <MetricCard title="Unique Actors" value={stats.uniqueActors.toString()} color="green" />
          <MetricCard title="Top Action" value={stats.topAction} color="blue" />
        </div>

        <Card>
          <div className="form-grid audit-logs__filter-grid">
            <input
              type="text"
              aria-label="Filter by actor ID"
              placeholder="Actor ID"
              value={filters.actorId || ''}
              onChange={(e) => handleFilterChange('actorId', e.target.value)}
              className="form-control"
            />
            <input
              type="text"
              aria-label="Filter by action"
              placeholder="Action (e.g. incident.update)"
              value={filters.action || ''}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="form-control"
            />
            <input
              type="text"
              aria-label="Filter by incident ID"
              placeholder="Incident ID"
              value={filters.incidentId || ''}
              onChange={(e) => handleFilterChange('incidentId', e.target.value)}
              className="form-control"
            />
          </div>

          <div className="filter-row" style={{ marginTop: 'var(--space-md)' }}>
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                onClick={() => handleDatePreset(preset.hours)}
              >
                {preset.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </Card>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Timestamp</TableHeaderCell>
              <TableHeaderCell>Actor</TableHeaderCell>
              <TableHeaderCell>Action</TableHeaderCell>
              <TableHeaderCell>Incident</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, rowIdx) => (
                <TableRow key={`skeleton-${rowIdx}`}>
                  {['55%', '70%', '65%', '40%'].map((width, cellIdx) => (
                    <TableCell key={cellIdx}>
                      <div className="skeleton" style={{ height: 14, width }} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                  {error}
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>
                  No audit entries found.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}</TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 600 }}>{log.actor.username}</div>
                    <div className="text-secondary text-sm">{log.actor.userId}</div>
                  </TableCell>
                  <TableCell>
                    <div style={{ fontWeight: 600 }}>{log.action}</div>
                    <div className="text-secondary text-sm">{log.resource}</div>
                  </TableCell>
                  <TableCell>
                    {log.incidentId ? (
                      // Plain text, not a link: /incidents was removed from this app earlier
                      // in the project (see docs/KNOWN_LIMITATIONS.md) and never came back.
                      <code className="text-mono text-sm">{log.incidentId}</code>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="audit-logs__pagination">
          <div className="text-secondary text-sm">
            Showing {startIndex}-{endIndex} of {allLogs.length}
          </div>
          <div className="action-row">
            <Button
              variant="secondary"
              onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
              disabled={filters.page === 1}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleFilterChange('page', Math.min(totalPages, filters.page + 1))}
              disabled={filters.page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
