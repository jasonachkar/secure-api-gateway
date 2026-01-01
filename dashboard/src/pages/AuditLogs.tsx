/**
 * Audit logs page
 */

import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { adminApi } from '../api/admin';
import type { AuditLogEntry } from '../types';
import { format } from 'date-fns';

export function AuditLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const data = await adminApi.getAuditLogs({ limit: 50 });
      setLogs(data);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const getEventColor = (eventType: string) => {
    if (eventType.includes('SUCCESS')) return '#22c55e';
    if (eventType.includes('FAILURE') || eventType.includes('DENIED')) return '#ef4444';
    if (eventType.includes('LOCKED') || eventType.includes('EXCEEDED')) return '#f59e0b';
    return '#3b82f6';
  };

  return (
    <Layout>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: 'bold', marginBottom: '10px' }}>
          Audit Logs
        </h1>
        <p style={{ color: '#64748b', marginBottom: '30px' }}>
          Security event history and access logs
        </p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
            Loading audit logs...
          </div>
        )}

        {error && (
          <div style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            overflow: 'hidden'
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={tableHeaderStyle}>Timestamp</th>
                  <th style={tableHeaderStyle}>Event Type</th>
                  <th style={tableHeaderStyle}>User</th>
                  <th style={tableHeaderStyle}>IP Address</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tableCellStyle}>
                      {format(new Date(log.timestamp), 'MMM dd, HH:mm:ss')}
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: getEventColor(log.eventType) + '20',
                        color: getEventColor(log.eventType)
                      }}>
                        {log.eventType}
                      </span>
                    </td>
                    <td style={tableCellStyle}>
                      {log.username || log.userId || '-'}
                    </td>
                    <td style={{ ...tableCellStyle, fontFamily: 'monospace', fontSize: '13px' }}>
                      {log.ip}
                    </td>
                    <td style={tableCellStyle}>
                      <span style={{
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: log.success ? '#22c55e' : '#ef4444',
                        marginRight: '6px'
                      }} />
                      {log.success ? 'Success' : 'Failed'}
                    </td>
                    <td style={{ ...tableCellStyle, maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.message || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {logs.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                No audit logs found
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: '13px',
  fontWeight: '600',
  color: '#475569'
};

const tableCellStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '14px',
  color: '#1e293b'
};
