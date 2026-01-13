/**
 * Enhanced Request Rate Chart Component
 * Real-time line chart showing requests per second with consistent styling
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { theme } from '../styles/theme';
import { ChartTooltip } from './ChartTooltip';

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
        <div className="skeleton chart-card__skeleton-title" />
        <div className="skeleton chart-card__skeleton-body" />
      </div>
    );
  }

  return (
    <div className="chart-card">
      <h3 className="chart-card__title">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
          <XAxis
            dataKey="time"
            stroke={theme.colors.text.tertiary}
            tick={{ className: 'chart-axis-tick' }}
          />
          <YAxis
            stroke={theme.colors.text.tertiary}
            tick={{ className: 'chart-axis-tick' }}
            label={{ 
              value: 'Requests/sec', 
              angle: -90, 
              position: 'insideLeft', 
              className: 'chart-axis-label',
            }}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="line" />
          <Line
            type="monotone"
            dataKey="requests"
            stroke={theme.colors.primary[500]}
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
