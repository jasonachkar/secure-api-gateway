/**
 * Enhanced Request Rate Chart Component
 * Real-time line chart showing requests per second with consistent styling
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface DataPoint {
  timestamp: number;
  requests: number;
}

interface RequestRateChartProps {
  data: DataPoint[];
  title?: string;
  isLoading?: boolean;
}

export function RequestRateChart({ data, title = 'Request Rate', isLoading = false }: RequestRateChartProps) {
  const chartData = data.map(point => ({
    time: format(new Date(point.timestamp), 'HH:mm:ss'),
    requests: point.requests,
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
              value: 'Requests/sec', 
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
            dataKey="requests"
            stroke="var(--color-primary-500)"
            strokeWidth={2}
            dot={false}
            name="Requests"
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
