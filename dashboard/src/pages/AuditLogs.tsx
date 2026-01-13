/**
 * Enhanced Audit Logs page
 * Comprehensive audit log viewing with filtering, pagination, export, and statistics
 */

import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { MetricCard } from '../components/MetricCard';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { Table, TableHeader, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/Table';
import { adminApi } from '../api/admin';
import type { AuditLogEntry } from '../types';

interface AuditLogFilters {
  eventType?: string;
  userId?: string;
  username?: string;
  ip?: string;
  startTime?: number;
  endTime?: number;
  success?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

type SortField = 'timestamp' | 'eventType' | 'username' | 'ip';
type SortDirection = 'asc' | 'desc';

const EVENT_TYPES = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'TOKEN_REFRESH',
  'TOKEN_REVOKED',
  'PERMISSION_DENIED',
  'RATE_LIMIT_EXCEEDED',
  'ACCOUNT_LOCKED',
  'SSRF_BLOCKED',
  'VALIDATION_ERROR',
];

const DATE_PRESETS = [
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 168 },
  { label: 'Last 30 days', hours: 720 },
];

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [allLogs, setAllLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    pageSize: 50,
  });
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);

  const stats = React.useMemo(() => {
    const total = allLogs.length;
    const successCount = allLogs.filter((log) => log.success).length;
    const failedCount = total - successCount;
    const eventTypeCounts: Record<string, number> = {};

    allLogs.forEach((log) => {
      eventTypeCounts[log.eventType] = (eventTypeCounts[log.eventType] || 0) + 1;
    });

    const topEventType = Object.entries(eventTypeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    const uniqueUsers = new Set(allLogs.filter((log) => log.username).map((log) => log.username)).size;
    const uniqueIPs = new Set(allLogs.map((log) => log.ip)).size;

    return {
      total,
      successCount,
      failedCount,
      successRate: total > 0 ? Math.round((successCount / total) * 100) : 0,
      eventTypeCounts,
      topEventType,
      uniqueUsers,
      uniqueIPs,
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

      if (filters.eventType) params.eventType = filters.eventType;
      if (filters.userId) params.userId = filters.userId;
      if (filters.startTime) params.startTime = filters.startTime;
      if (filters.endTime) params.endTime = filters.endTime;

      const data = await adminApi.getAuditLogs(params);

      let filtered = data;

      if (filters.username) {
        filtered = filtered.filter(
          (log) =>
            log.username?.toLowerCase().includes(filters.username!.toLowerCase()) ||
            log.userId?.toLowerCase().includes(filters.username!.toLowerCase())
        );
      }

      if (filters.ip) {
        filtered = filtered.filter((log) => log.ip?.includes(filters.ip!));
      }

      if (filters.success !== undefined) {
        filtered = filtered.filter((log) => log.success === filters.success);
      }

      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filtered = filtered.filter(
          (log) =>
            log.eventType?.toLowerCase().includes(searchTerm) ||
            log.message?.toLowerCase().includes(searchTerm) ||
            log.username?.toLowerCase().includes(searchTerm) ||
            log.userId?.toLowerCase().includes(searchTerm) ||
            log.ip?.toLowerCase().includes(searchTerm) ||
            log.requestId?.toLowerCase().includes(searchTerm)
        );
      }

      setAllLogs(filtered);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs');
      setAllLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, autoRefreshInterval, fetchLogs]);

  useEffect(() => {
    const sortedLogs = [...allLogs].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'timestamp') {
        aValue = new Date(a.timestamp).getTime();
        bValue = new Date(b.timestamp).getTime();
      } else {
        aValue = String(aValue || '').toLowerCase();
        bValue = String(bValue || '').toLowerCase();
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      }
      return aValue < bValue ? 1 : -1;
    });

    const start = (filters.page - 1) * filters.pageSize;
    const end = start + filters.pageSize;
    setLogs(sortedLogs.slice(start, end));
  }, [allLogs, sortField, sortDirection, filters.page, filters.pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleFilterChange = (field: keyof AuditLogFilters, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
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

  const toggleRowExpansion = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const exportToCSV = () => {
    const headers = ['Timestamp', 'Event Type', 'User', 'IP Address', 'Status', 'Message', 'Request ID', 'Resource', 'Action'];
    const rows = allLogs.map((log) => [
      format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      log.eventType,
      log.username || log.userId || '',
      log.ip,
      log.success ? 'Success' : 'Failed',
      log.message || '',
      log.requestId || '',
      log.resource || '',
      log.action || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const json = JSON.stringify(allLogs, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmmss')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(allLogs.length / filters.pageSize);
  const startIndex = (filters.page - 1) * filters.pageSize + 1;
  const endIndex = Math.min(filters.page * filters.pageSize, allLogs.length);

  const getEventClass = (eventType: string) => {
    if (eventType.includes('SUCCESS')) return 'audit-event--success';
    if (eventType.includes('FAILURE') || eventType.includes('DENIED')) return 'audit-event--error';
    if (eventType.includes('LOCKED') || eventType.includes('EXCEEDED')) return 'audit-event--warning';
    return 'audit-event--info';
  };

  const hasActiveFilters = !!(
    filters.eventType ||
    filters.username ||
    filters.ip ||
    filters.startTime ||
    filters.endTime ||
    filters.success !== undefined ||
    filters.search
  );

  return (
    <Layout>
      <div className="page-stack">
        <SectionHeader
          title="Audit Logs"
          subtitle="Security event history and access logs"
          actions={
            <div className="action-row">
              <Button variant="ghost" onClick={() => fetchLogs()} disabled={loading}>
                🔄 Refresh
              </Button>
              <div className="checkbox-row">
                <input
                  type="checkbox"
                  id="auto-refresh"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="checkbox-input"
                />
                <label htmlFor="auto-refresh" className="form-label">
                  Auto-refresh
                </label>
                {autoRefresh && (
                  <select
                    value={autoRefreshInterval}
                    onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                    className="form-control"
                  >
                    <option value={10}>10s</option>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                  </select>
                )}
              </div>
            </div>
          }
        />

        <div className="page-grid page-grid--cards">
          <MetricCard title="Total Logs" value={stats.total.toLocaleString()} color="blue" />
          <MetricCard
            title="Success Rate"
            value={`${stats.successRate}%`}
            subtitle={`${stats.successCount} success, ${stats.failedCount} failed`}
            color={stats.successRate >= 90 ? 'green' : stats.successRate >= 70 ? 'yellow' : 'red'}
          />
          <MetricCard
            title="Top Event Type"
            value={stats.topEventType}
            subtitle={`${stats.eventTypeCounts[stats.topEventType] || 0} occurrences`}
            color="blue"
          />
          <MetricCard title="Unique Users" value={stats.uniqueUsers.toString()} color="blue" />
          <MetricCard title="Unique IPs" value={stats.uniqueIPs.toString()} color="blue" />
        </div>

        <Card className="page-stack">
          <div className="card-header">
            <div className="section-title">Filters</div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear All
              </Button>
            )}
          </div>

          <div className="form-field">
            <label className="form-label">Search</label>
            <input
              type="text"
              placeholder="Search across all fields..."
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
              className="form-control"
            />
          </div>

          <div className="form-grid">
            <div>
              <label className="form-label">Event Type</label>
              <select
                value={filters.eventType || ''}
                onChange={(e) => handleFilterChange('eventType', e.target.value || undefined)}
                className="form-control"
              >
                <option value="">All Events</option>
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">User (username/ID)</label>
              <input
                type="text"
                placeholder="Filter by user..."
                value={filters.username || ''}
                onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
                className="form-control"
              />
            </div>

            <div>
              <label className="form-label">IP Address</label>
              <input
                type="text"
                placeholder="Filter by IP..."
                value={filters.ip || ''}
                onChange={(e) => handleFilterChange('ip', e.target.value || undefined)}
                className="form-control text-mono"
              />
            </div>

            <div>
              <label className="form-label">Status</label>
              <select
                value={filters.success === undefined ? '' : filters.success ? 'success' : 'failed'}
                onChange={(e) => {
                  const value = e.target.value;
                  handleFilterChange('success', value === '' ? undefined : value === 'success');
                }}
                className="form-control"
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Date Range</label>
            <div className="action-row">
              {DATE_PRESETS.map((preset) => (
                <Button key={preset.hours} variant="ghost" size="sm" onClick={() => handleDatePreset(preset.hours)}>
                  {preset.label}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => handleFilterChange('startTime', undefined)}>
                Clear Date
              </Button>
            </div>
            {filters.startTime && (
              <div className="helper-text">
                {format(new Date(filters.startTime), 'MMM dd, yyyy HH:mm')} -{' '}
                {filters.endTime ? format(new Date(filters.endTime), 'MMM dd, yyyy HH:mm') : 'Now'}
              </div>
            )}
          </div>
        </Card>

        <div className="card-header">
          <div className="section-subtitle">
            Showing {startIndex}-{endIndex} of {allLogs.length.toLocaleString()} logs
            {hasActiveFilters && ' (filtered)'}
          </div>
          <div className="action-row">
            <Button variant="secondary" size="sm" onClick={exportToCSV} disabled={allLogs.length === 0}>
              📥 Export CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={exportToJSON} disabled={allLogs.length === 0}>
              📥 Export JSON
            </Button>
          </div>
        </div>

        {error && (
          <div className="alert alert--danger">
            <div className="action-row">
              <strong>Error:</strong> {error}
              <Button variant="ghost" size="sm" onClick={() => fetchLogs()}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {loading && <div className="empty-state">Loading audit logs...</div>}

        {!loading && !error && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>
                  <button className="table-sort-button" onClick={() => handleSort('timestamp')}>
                    Timestamp
                    {sortField === 'timestamp' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>
                  <button className="table-sort-button" onClick={() => handleSort('eventType')}>
                    Event Type
                    {sortField === 'eventType' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>
                  <button className="table-sort-button" onClick={() => handleSort('username')}>
                    User
                    {sortField === 'username' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>
                  <button className="table-sort-button" onClick={() => handleSort('ip')}>
                    IP Address
                    {sortField === 'ip' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Message</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const isExpanded = expandedRows.has(log.id);
                const eventClass = `audit-event-badge ${getEventClass(log.eventType)}`;
                return (
                  <React.Fragment key={log.id}>
                    <TableRow
                      className={isExpanded ? 'data-table__row--expanded' : undefined}
                      onClick={() => toggleRowExpansion(log.id)}
                    >
                      <TableCell>{format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}</TableCell>
                      <TableCell>
                        <span className={eventClass}>{log.eventType}</span>
                      </TableCell>
                      <TableCell>{log.username || log.userId || '-'}</TableCell>
                      <TableCell className="text-mono text-sm">{log.ip}</TableCell>
                      <TableCell>
                        <span className="status-indicator">
                          <span className={`status-dot ${log.success ? 'status-dot--success' : 'status-dot--error'}`} />
                          {log.success ? 'Success' : 'Failed'}
                        </span>
                      </TableCell>
                      <TableCell className="table-cell-truncate">{log.message || '-'}</TableCell>
                      <TableCell>{isExpanded ? '▼' : '▶'}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="data-table__row--expanded">
                        <TableCell colSpan={7}>
                          <div className="detail-grid">
                            <div>
                              <strong>Request ID:</strong>
                              <div className="text-mono text-sm">{log.requestId}</div>
                            </div>
                            {log.resource && (
                              <div>
                                <strong>Resource:</strong>
                                <div>{log.resource}</div>
                              </div>
                            )}
                            {log.action && (
                              <div>
                                <strong>Action:</strong>
                                <div>{log.action}</div>
                              </div>
                            )}
                            {log.userId && (
                              <div>
                                <strong>User ID:</strong>
                                <div className="text-mono text-sm">{log.userId}</div>
                              </div>
                            )}
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="flex-1">
                                <strong>Metadata:</strong>
                                <pre className="audit-metadata">
                                  {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}

        {logs.length === 0 && !loading && !error && (
          <Card className="empty-state">
            <div className="section-title">No audit logs found</div>
            {hasActiveFilters && (
              <div className="section-subtitle">
                Try adjusting your filters or{' '}
                <button className="link-button" onClick={clearFilters}>
                  clear all filters
                </button>
              </div>
            )}
          </Card>
        )}

        {!loading && !error && allLogs.length > 0 && (
          <Card className="audit-pagination">
            <div className="section-subtitle">Page {filters.page} of {totalPages}</div>
            <div className="action-row">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
                disabled={filters.page === 1}
              >
                ← Previous
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (filters.page <= 3) {
                  pageNum = i + 1;
                } else if (filters.page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = filters.page - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={filters.page === pageNum ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => handleFilterChange('page', pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFilterChange('page', Math.min(totalPages, filters.page + 1))}
                disabled={filters.page === totalPages}
              >
                Next →
              </Button>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
