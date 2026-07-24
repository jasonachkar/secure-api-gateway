/**
 * "Export Audit Report" - lets the viewer pick a date range and downloads a formatted
 * CSV: a header block (system name, export date, period, total events), the full log
 * table for that period, and a summary breakdown by event type.
 */

import { useState } from 'react';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from './Button';
import { useToast } from '../contexts/ToastContext';
import { adminApi } from '../api/admin';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function AuditReportExport() {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(() => format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [generating, setGenerating] = useState(false);
  const { showToast } = useToast();

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const startTime = new Date(startDate).setHours(0, 0, 0, 0);
      const endTime = new Date(endDate).setHours(23, 59, 59, 999);

      const logs = await adminApi.getAdminActionLogs({ startTime, endTime, limit: 1000 });

      const breakdown = logs.reduce<Record<string, number>>((acc, log) => {
        acc[log.action] = (acc[log.action] || 0) + 1;
        return acc;
      }, {});

      const lines: string[] = [
        'Secure API Gateway - Audit Report',
        `Export Date,${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`,
        `Period Covered,${startDate} to ${endDate}`,
        `Total Events,${logs.length}`,
        '',
        'Timestamp,Actor Username,Actor User ID,Action,Resource,Incident ID',
        ...logs.map((log) =>
          [
            new Date(log.timestamp).toISOString(),
            log.actor.username,
            log.actor.userId,
            log.action,
            log.resource,
            log.incidentId ?? '',
          ]
            .map((v) => csvEscape(String(v)))
            .join(',')
        ),
        '',
        'Summary by Event Type',
        'Action,Count',
        ...Object.entries(breakdown)
          .sort(([, a], [, b]) => b - a)
          .map(([action, count]) => `${csvEscape(action)},${count}`),
      ];

      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      showToast(`Audit report generated: ${logs.length} events`, 'success');
      setOpen(false);
    } catch (err: any) {
      showToast('Failed to generate report: ' + err.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="audit-export">
      <Button variant="secondary" onClick={() => setOpen((prev) => !prev)}>
        <Download size={14} aria-hidden="true" style={{ marginRight: 4 }} />
        Export Audit Report
      </Button>

      {open && (
        <div className="audit-export__panel">
          <div className="form-grid form-grid--two">
            <div className="form-field">
              <label className="form-label" htmlFor="export-start-date">
                From
              </label>
              <input
                id="export-start-date"
                type="date"
                className="form-control"
                value={startDate}
                max={endDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="export-end-date">
                To
              </label>
              <input
                id="export-end-date"
                type="date"
                className="form-control"
                value={endDate}
                min={startDate}
                max={format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <Button variant="primary" onClick={handleGenerate} isLoading={generating} className="button-full">
            Download CSV
          </Button>
        </div>
      )}
    </div>
  );
}
