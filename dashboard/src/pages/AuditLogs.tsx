/**
 * Enhanced Audit Logs page
 * Comprehensive audit log viewing with filtering, pagination, export, and statistics
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { MetricCard } from '../components/MetricCard';
import { adminApi } from '../api/admin';
import { theme } from '../styles/theme';
import type { AuditLogEntry } from '../types';
import { format } from 'date-fns';

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
  const [allLogs, setAllLogs] = useState<AuditLogEntry[]>([]); // All fetched logs for filtering
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
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30); // seconds

  // Calculate statistics from all logs
  const stats = React.useMemo(() => {
    const total = allLogs.length;
    const successCount = allLogs.filter(log => log.success).length;
    const failedCount = total - successCount;
    const eventTypeCounts: Record<string, number> = {};
    
    allLogs.forEach(log => {
      eventTypeCounts[log.eventType] = (eventTypeCounts[log.eventType] || 0) + 1;
    });

    const topEventType = Object.entries(eventTypeCounts)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    const uniqueUsers = new Set(allLogs.filter(log => log.username).map(log => log.username)).size;
    const uniqueIPs = new Set(allLogs.map(log => log.ip)).size;

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

  // Fetch logs from API
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params: any = {
        limit: 1000, // Fetch more logs for client-side filtering
        offset: 0,
      };

      if (filters.eventType) params.eventType = filters.eventType;
      if (filters.userId) params.userId = filters.userId;
      if (filters.startTime) params.startTime = filters.startTime;
      if (filters.endTime) params.endTime = filters.endTime;

      const data = await adminApi.getAuditLogs(params);
      
      // Apply client-side filters (username, IP, success, search)
      let filtered = data;
      
      if (filters.username) {
        filtered = filtered.filter(log => 
          log.username?.toLowerCase().includes(filters.username!.toLowerCase()) ||
          log.userId?.toLowerCase().includes(filters.username!.toLowerCase())
        );
      }

      if (filters.ip) {
        filtered = filtered.filter(log => 
          log.ip.includes(filters.ip!)
        );
      }

      if (filters.success !== undefined) {
        filtered = filtered.filter(log => log.success === filters.success);
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(log => 
          log.eventType.toLowerCase().includes(searchLower) ||
          log.username?.toLowerCase().includes(searchLower) ||
          log.userId?.toLowerCase().includes(searchLower) ||
          log.ip.includes(searchLower) ||
          log.message?.toLowerCase().includes(searchLower) ||
          log.resource?.toLowerCase().includes(searchLower)
        );
      }

      // Sort
      filtered.sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortField) {
          case 'timestamp':
            aVal = a.timestamp;
            bVal = b.timestamp;
            break;
          case 'eventType':
            aVal = a.eventType;
            bVal = b.eventType;
            break;
          case 'username':
            aVal = a.username || a.userId || '';
            bVal = b.username || b.userId || '';
            break;
          case 'ip':
            aVal = a.ip;
            bVal = b.ip;
            break;
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });

      setAllLogs(filtered);

      // Apply pagination
      const start = (filters.page - 1) * filters.pageSize;
      const end = start + filters.pageSize;
      setLogs(filtered.slice(start, end));
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs');
      setAllLogs([]);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filters, sortField, sortDirection]);

  // Initial fetch and when filters change
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchLogs();
    }, autoRefreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, autoRefreshInterval, fetchLogs]);

  const handleFilterChange = (key: keyof AuditLogFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page on filter change
    }));
  };

  const handleDatePreset = (hours: number) => {
    const endTime = Date.now();
    const startTime = endTime - (hours * 60 * 60 * 1000);
    setFilters(prev => ({
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const toggleRowExpansion = (id: string) => {
    setExpandedRows(prev => {
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
    const headers = ['Timestamp', 'Event Type', 'User', 'IP Address', 'Status', 'Message', 'Resource', 'Action'];
    const rows = allLogs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.eventType,
      log.username || log.userId || '',
      log.ip,
      log.success ? 'Success' : 'Failed',
      log.message || '',
      log.resource || '',
      log.action || '',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
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

  const getEventColor = (eventType: string) => {
    if (eventType.includes('SUCCESS')) return theme.colors.success[500];
    if (eventType.includes('FAILURE') || eventType.includes('DENIED')) return theme.colors.error[500];
    if (eventType.includes('LOCKED') || eventType.includes('EXCEEDED')) return theme.colors.warning[500];
    return theme.colors.primary[500];
  };

  const hasActiveFilters = !!(
    filters.eventType || filters.username || filters.ip || 
    filters.startTime || filters.endTime || 
    filters.success !== undefined || filters.search
  );

  return (
    <Layout>
      <div>
        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: theme.spacing.lg 
        }}>
          <div>
            <h1 style={{ 
              ...theme.typography.h1,
              fontSize: theme.typography.fontSize['3xl'],
              marginBottom: theme.spacing.sm,
            }}>
              Audit Logs
            </h1>
            <p style={{ 
              ...theme.typography.body,
              color: theme.colors.text.secondary,
            }}>
              Security event history and access logs
            </p>
          </div>
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <Button
              variant="ghost"
              onClick={() => fetchLogs()}
              disabled={loading}
            >
              🔄 Refresh
            </Button>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
              <input
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="auto-refresh" style={{ 
                ...theme.typography.body,
                fontSize: theme.typography.fontSize.sm,
                cursor: 'pointer',
              }}>
                Auto-refresh
              </label>
              {autoRefresh && (
                <select
                  value={autoRefreshInterval}
                  onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                  style={{
                    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                    border: `1px solid ${theme.colors.border.medium}`,
                    borderRadius: theme.borderRadius.sm,
                    fontSize: theme.typography.fontSize.sm,
                  }}
                >
                  <option value={10}>10s</option>
                  <option value={30}>30s</option>
                  <option value={60}>60s</option>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: theme.spacing.lg,
          marginBottom: theme.spacing.xl,
        }}>
          <MetricCard
            title="Total Logs"
            value={stats.total.toLocaleString()}
            color="blue"
          />
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
          <MetricCard
            title="Unique Users"
            value={stats.uniqueUsers.toString()}
            color="blue"
          />
          <MetricCard
            title="Unique IPs"
            value={stats.uniqueIPs.toString()}
            color="blue"
          />
        </div>

        {/* Filters Panel */}
        <div style={{
          backgroundColor: theme.colors.background.primary,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.md,
          marginBottom: theme.spacing.lg,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: theme.spacing.md,
          }}>
            <h2 style={{
              ...theme.typography.h3,
              margin: 0,
            }}>
              Filters
            </h2>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
              >
                Clear All
              </Button>
            )}
          </div>

          {/* Search */}
          <div style={{ marginBottom: theme.spacing.md }}>
            <label style={{
              display: 'block',
              ...theme.typography.body,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              marginBottom: theme.spacing.xs,
            }}>
              Search
            </label>
            <input
              type="text"
              placeholder="Search across all fields..."
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
              style={{
                width: '100%',
                padding: theme.spacing.sm,
                border: `1px solid ${theme.colors.border.medium}`,
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSize.base,
                fontFamily: theme.typography.fontFamily.sans,
              }}
            />
          </div>

          {/* Filter Row 1 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: theme.spacing.md,
            marginBottom: theme.spacing.md,
          }}>
            {/* Event Type */}
            <div>
              <label style={{
                display: 'block',
                ...theme.typography.body,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                marginBottom: theme.spacing.xs,
              }}>
                Event Type
              </label>
              <select
                value={filters.eventType || ''}
                onChange={(e) => handleFilterChange('eventType', e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily.sans,
                }}
              >
                <option value="">All Events</option>
                {EVENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* User */}
            <div>
              <label style={{
                display: 'block',
                ...theme.typography.body,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                marginBottom: theme.spacing.xs,
              }}>
                User (username/ID)
              </label>
              <input
                type="text"
                placeholder="Filter by user..."
                value={filters.username || ''}
                onChange={(e) => handleFilterChange('username', e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily.sans,
                }}
              />
            </div>

            {/* IP Address */}
            <div>
              <label style={{
                display: 'block',
                ...theme.typography.body,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                marginBottom: theme.spacing.xs,
              }}>
                IP Address
              </label>
              <input
                type="text"
                placeholder="Filter by IP..."
                value={filters.ip || ''}
                onChange={(e) => handleFilterChange('ip', e.target.value || undefined)}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily.mono,
                }}
              />
            </div>

            {/* Status */}
            <div>
              <label style={{
                display: 'block',
                ...theme.typography.body,
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                marginBottom: theme.spacing.xs,
              }}>
                Status
              </label>
              <select
                value={filters.success === undefined ? '' : filters.success ? 'success' : 'failed'}
                onChange={(e) => {
                  const value = e.target.value;
                  handleFilterChange('success', value === '' ? undefined : value === 'success');
                }}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.base,
                  fontFamily: theme.typography.fontFamily.sans,
                }}
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          {/* Date Range Presets */}
          <div>
            <label style={{
              display: 'block',
              ...theme.typography.body,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.medium,
              marginBottom: theme.spacing.xs,
            }}>
              Date Range
            </label>
            <div style={{ display: 'flex', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              {DATE_PRESETS.map(preset => (
                <Button
                  key={preset.hours}
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDatePreset(preset.hours)}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFilterChange('startTime', undefined)}
              >
                Clear Date
              </Button>
            </div>
            {filters.startTime && (
              <div style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}>
                {format(new Date(filters.startTime), 'MMM dd, yyyy HH:mm')} - {
                  filters.endTime ? format(new Date(filters.endTime), 'MMM dd, yyyy HH:mm') : 'Now'
                }
              </div>
            )}
          </div>
        </div>

        {/* Export and Results Count */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
        }}>
          <div style={{
            ...theme.typography.body,
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}>
            Showing {startIndex}-{endIndex} of {allLogs.length.toLocaleString()} logs
            {hasActiveFilters && ' (filtered)'}
          </div>
          <div style={{ display: 'flex', gap: theme.spacing.sm }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportToCSV}
              disabled={allLogs.length === 0}
            >
              📥 Export CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportToJSON}
              disabled={allLogs.length === 0}
            >
              📥 Export JSON
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div style={{
            backgroundColor: theme.colors.error[50],
            color: theme.colors.error[800],
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.lg,
            marginBottom: theme.spacing.lg,
            borderLeft: `4px solid ${theme.colors.error[500]}`,
          }}>
            <strong>Error:</strong> {error}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchLogs()}
              style={{ marginLeft: theme.spacing.md }}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{
            textAlign: 'center',
            padding: theme.spacing['3xl'],
            color: theme.colors.text.secondary,
          }}>
            <div style={{ fontSize: theme.typography.fontSize.lg }}>Loading audit logs...</div>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <div style={{
            backgroundColor: theme.colors.background.primary,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.md,
            overflow: 'hidden',
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}>
                <thead>
                  <tr style={{
                    backgroundColor: theme.colors.neutral[50],
                    borderBottom: `2px solid ${theme.colors.border.light}`,
                  }}>
                    <th style={tableHeaderStyle}>
                      <button
                        onClick={() => handleSort('timestamp')}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                          width: '100%',
                        }}
                      >
                        Timestamp
                        {sortField === 'timestamp' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th style={tableHeaderStyle}>
                      <button
                        onClick={() => handleSort('eventType')}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                          width: '100%',
                        }}
                      >
                        Event Type
                        {sortField === 'eventType' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th style={tableHeaderStyle}>
                      <button
                        onClick={() => handleSort('username')}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                          width: '100%',
                        }}
                      >
                        User
                        {sortField === 'username' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th style={tableHeaderStyle}>
                      <button
                        onClick={() => handleSort('ip')}
                        style={{
                          all: 'unset',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: theme.spacing.xs,
                          width: '100%',
                        }}
                      >
                        IP Address
                        {sortField === 'ip' && (
                          <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th style={tableHeaderStyle}>Status</th>
                    <th style={tableHeaderStyle}>Message</th>
                    <th style={{ ...tableHeaderStyle, width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    const eventColor = getEventColor(log.eventType);
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          style={{
                            borderBottom: `1px solid ${theme.colors.border.light}`,
                            cursor: 'pointer',
                            backgroundColor: isExpanded ? theme.colors.neutral[50] : 'transparent',
                          }}
                          onClick={() => toggleRowExpansion(log.id)}
                        >
                          <td style={tableCellStyle}>
                            {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                          </td>
                          <td style={tableCellStyle}>
                            <span style={{
                              display: 'inline-block',
                              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                              borderRadius: theme.borderRadius.sm,
                              fontSize: theme.typography.fontSize.sm,
                              fontWeight: theme.typography.fontWeight.medium,
                              backgroundColor: eventColor + '20',
                              color: eventColor,
                            }}>
                              {log.eventType}
                            </span>
                          </td>
                          <td style={tableCellStyle}>
                            {log.username || log.userId || '-'}
                          </td>
                          <td style={{
                            ...tableCellStyle,
                            fontFamily: theme.typography.fontFamily.mono,
                            fontSize: theme.typography.fontSize.sm,
                          }}>
                            {log.ip}
                          </td>
                          <td style={tableCellStyle}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: theme.spacing.xs,
                            }}>
                              <span style={{
                                display: 'inline-block',
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                backgroundColor: log.success ? theme.colors.success[500] : theme.colors.error[500],
                              }} />
                              {log.success ? 'Success' : 'Failed'}
                            </span>
                          </td>
                          <td style={{
                            ...tableCellStyle,
                            maxWidth: '400px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {log.message || '-'}
                          </td>
                          <td style={tableCellStyle}>
                            {isExpanded ? '▼' : '▶'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr style={{
                            backgroundColor: theme.colors.neutral[50],
                            borderBottom: `1px solid ${theme.colors.border.light}`,
                          }}>
                            <td colSpan={7} style={{
                              padding: theme.spacing.lg,
                              ...theme.typography.body,
                              fontSize: theme.typography.fontSize.sm,
                            }}>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                                gap: theme.spacing.md,
                              }}>
                                <div>
                                  <strong>Request ID:</strong>
                                  <div style={{ fontFamily: theme.typography.fontFamily.mono, marginTop: theme.spacing.xs }}>
                                    {log.requestId}
                                  </div>
                                </div>
                                {log.resource && (
                                  <div>
                                    <strong>Resource:</strong>
                                    <div style={{ marginTop: theme.spacing.xs }}>{log.resource}</div>
                                  </div>
                                )}
                                {log.action && (
                                  <div>
                                    <strong>Action:</strong>
                                    <div style={{ marginTop: theme.spacing.xs }}>{log.action}</div>
                                  </div>
                                )}
                                {log.userId && (
                                  <div>
                                    <strong>User ID:</strong>
                                    <div style={{ fontFamily: theme.typography.fontFamily.mono, marginTop: theme.spacing.xs }}>
                                      {log.userId}
                                    </div>
                                  </div>
                                )}
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <div style={{ gridColumn: '1 / -1' }}>
                                    <strong>Metadata:</strong>
                                    <pre style={{
                                      marginTop: theme.spacing.xs,
                                      padding: theme.spacing.md,
                                      backgroundColor: theme.colors.background.secondary,
                                      borderRadius: theme.borderRadius.md,
                                      overflow: 'auto',
                                      fontSize: theme.typography.fontSize.sm,
                                      fontFamily: theme.typography.fontFamily.mono,
                                    }}>
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Empty State */}
            {logs.length === 0 && !loading && (
              <div style={{
                textAlign: 'center',
                padding: theme.spacing['3xl'],
                color: theme.colors.text.tertiary,
              }}>
                <div style={{
                  fontSize: theme.typography.fontSize.xl,
                  marginBottom: theme.spacing.sm,
                }}>
                  No audit logs found
                </div>
                {hasActiveFilters && (
                  <div style={{
                    fontSize: theme.typography.fontSize.sm,
                    marginTop: theme.spacing.md,
                  }}>
                    Try adjusting your filters or{' '}
                    <button
                      onClick={clearFilters}
                      style={{
                        all: 'unset',
                        color: theme.colors.primary[600],
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      clear all filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && allLogs.length > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: theme.spacing.lg,
            padding: theme.spacing.md,
            backgroundColor: theme.colors.background.primary,
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.sm,
          }}>
            <div style={{
              ...theme.typography.body,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
            }}>
              Page {filters.page} of {totalPages}
            </div>
            <div style={{ display: 'flex', gap: theme.spacing.sm }}>
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
          </div>
        )}
      </div>
    </Layout>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: theme.spacing.md,
  textAlign: 'left',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.secondary,
};

const tableCellStyle: React.CSSProperties = {
  padding: theme.spacing.md,
  fontSize: theme.typography.fontSize.base,
  color: theme.colors.text.primary,
};
