/**
 * Admin Audit Logs page
 * Displays administrative actions with incident links
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { MetricCard } from '../components/MetricCard';
import { adminApi } from '../api/admin';
import { theme } from '../styles/theme';
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
      setError(err.message || 'Failed to fetch audit logs');
      setAllLogs([]);
      setLogs([]);
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
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.lg,
          }}
        >
          <div>
            <h1
              style={{
                ...theme.typography.h1,
                fontSize: theme.typography.fontSize['3xl'],
                marginBottom: theme.spacing.sm,
              }}
            >
              Audit Logs
            </h1>
            <p
              style={{
                ...theme.typography.body,
                color: theme.colors.text.secondary,
              }}
            >
              Administrative action history across the platform
            </p>
          </div>
          <Button variant="ghost" onClick={() => fetchLogs()} disabled={loading}>
            🔄 Refresh
          </Button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: theme.spacing.lg,
            marginBottom: theme.spacing.xl,
          }}
        >
          <MetricCard title="Total Actions" value={stats.total.toLocaleString()} color="blue" />
          <MetricCard
            title="Incident Actions"
            value={stats.incidentLogs.toLocaleString()}
            color="purple"
          />
          <MetricCard title="Unique Actors" value={stats.uniqueActors.toString()} color="green" />
          <MetricCard title="Top Action" value={stats.topAction} color="blue" />
        </div>

        <div
          style={{
            background: theme.colors.background.card,
            borderRadius: theme.borderRadius.lg,
            padding: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
            border: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: theme.spacing.md,
              marginBottom: theme.spacing.md,
            }}
          >
            <input
              type="text"
              placeholder="Actor ID"
              value={filters.actorId || ''}
              onChange={(e) => handleFilterChange('actorId', e.target.value)}
              style={{
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
              }}
            />
            <input
              type="text"
              placeholder="Action (e.g. incident.update)"
              value={filters.action || ''}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              style={{
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
              }}
            />
            <input
              type="text"
              placeholder="Incident ID"
              value={filters.incidentId || ''}
              onChange={(e) => handleFilterChange('incidentId', e.target.value)}
              style={{
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.sm,
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              alignItems: 'center',
            }}
          >
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
        </div>

        <div
          style={{
            background: theme.colors.background.card,
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border.light}`,
            overflow: 'hidden',
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: theme.colors.background.secondary }}>
                  {['Timestamp', 'Actor', 'Action', 'Incident'].map((header) => (
                    <th
                      key={header}
                      style={{
                        textAlign: 'left',
                        padding: theme.spacing.md,
                        fontSize: theme.typography.fontSize.sm,
                        color: theme.colors.text.secondary,
                        borderBottom: `1px solid ${theme.colors.border.light}`,
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: theme.spacing.xl, textAlign: 'center' }}
                    >
                      Loading audit logs...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: theme.spacing.xl, textAlign: 'center' }}
                    >
                      {error}
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      style={{ padding: theme.spacing.xl, textAlign: 'center' }}
                    >
                      No audit entries found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}>
                      <td style={{ padding: theme.spacing.md }}>
                        {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                      </td>
                      <td style={{ padding: theme.spacing.md }}>
                        <div style={{ fontWeight: 600 }}>{log.actor.username}</div>
                        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                          {log.actor.userId}
                        </div>
                      </td>
                      <td style={{ padding: theme.spacing.md }}>
                        <div style={{ fontWeight: 600 }}>{log.action}</div>
                        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
                          {log.resource}
                        </div>
                      </td>
                      <td style={{ padding: theme.spacing.md }}>
                        {log.incidentId ? (
                          <Link
                            to={`/incidents?incidentId=${encodeURIComponent(log.incidentId)}`}
                            style={{ color: theme.colors.primary[500], textDecoration: 'none' }}
                          >
                            {log.incidentId}
                          </Link>
                        ) : (
                          <span style={{ color: theme.colors.text.secondary }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: theme.spacing.md,
              borderTop: `1px solid ${theme.colors.border.light}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
              Showing {startIndex}-{endIndex} of {allLogs.length}
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
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
      </div>
    </Layout>
  );
}
