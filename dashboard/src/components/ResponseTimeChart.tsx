/**
 * Enhanced Response Time Chart Component
 * Shows P50, P95, P99 response times over time with consistent styling
 */

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format } from 'date-fns';

interface ResponseTimeDataPoint {
  timestamp: number;
  p50: number;
  p95: number;
  p99: number;
}

interface ResponseTimeChartProps {
  data: ResponseTimeDataPoint[];
  title?: string;
  isLoading?: boolean;
}

export function ResponseTimeChart({ data, title = 'Response Time Percentiles', isLoading = false }: ResponseTimeChartProps) {
  const chartData = data.map(point => ({
    time: format(new Date(point.timestamp), 'HH:mm:ss'),
    'P50 (Median)': point.p50,
    'P95': point.p95,
    'P99': point.p99,
  }));

  if (isLoading || chartData.length === 0) {
    return (
      <div className="chart-card chart-card--loading">
        <div className="skeleton skeleton--chart-title" />
        <div className="skeleton skeleton--chart" />
      </div>
    );
  }

  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
          <XAxis 
            dataKey="time" 
            stroke="var(--color-text-tertiary)" 
            style={{ fontSize: '12px' }}
            tick={{ fill: 'var(--color-text-tertiary)' }}
          />
          <YAxis 
            stroke="var(--color-text-tertiary)" 
            style={{ fontSize: '12px' }}
            tick={{ fill: 'var(--color-text-tertiary)' }}
            label={{ 
              value: 'ms', 
              angle: -90, 
              position: 'insideLeft',
              style: {
                fontSize: '12px',
                fill: 'var(--color-text-secondary)',
              }
            }} 
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
              boxShadow: 'var(--shadow-lg)',
            }}
            labelStyle={{
              color: 'var(--color-text-secondary)',
              fontWeight: 500,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="P50 (Median)"
            stroke="var(--color-primary-500)"
            strokeWidth={2}
            dot={false}
            name="P50 (Median)"
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="P95"
            stroke="var(--color-warning-500)"
            strokeWidth={2}
            dot={false}
            name="P95"
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="P99"
            stroke="var(--color-error-500)"
            strokeWidth={2}
            dot={false}
            name="P99"
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
