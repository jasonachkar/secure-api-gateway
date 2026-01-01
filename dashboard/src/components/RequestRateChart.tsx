/**
 * Enhanced Request Rate Chart Component
 * Real-time line chart showing requests per second with consistent styling
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { theme } from '../styles/theme';

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
      <div style={{
        backgroundColor: theme.colors.background.primary,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        height: '380px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: theme.spacing.md,
      }}>
        <div className="skeleton" style={{ width: '200px', height: '20px', borderRadius: theme.borderRadius.sm }} />
        <div className="skeleton" style={{ width: '100%', height: '300px', borderRadius: theme.borderRadius.md }} />
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: theme.colors.background.primary,
      padding: theme.spacing.lg,
      borderRadius: theme.borderRadius.lg,
      boxShadow: theme.shadows.md,
    }}>
      <h3 style={{ 
        fontSize: theme.typography.fontSize.lg, 
        fontWeight: theme.typography.fontWeight.semibold, 
        marginBottom: theme.spacing.lg,
        color: theme.colors.text.primary,
      }}>
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.border.light} />
          <XAxis
            dataKey="time"
            stroke={theme.colors.text.tertiary}
            style={{ fontSize: theme.typography.fontSize.sm }}
            tick={{ fill: theme.colors.text.tertiary }}
          />
          <YAxis
            stroke={theme.colors.text.tertiary}
            style={{ fontSize: theme.typography.fontSize.sm }}
            tick={{ fill: theme.colors.text.tertiary }}
            label={{ 
              value: 'Requests/sec', 
              angle: -90, 
              position: 'insideLeft', 
              style: { 
                fontSize: theme.typography.fontSize.sm,
                fill: theme.colors.text.secondary,
              } 
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.colors.background.primary,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.primary,
              boxShadow: theme.shadows.lg,
            }}
            labelStyle={{
              color: theme.colors.text.secondary,
              fontWeight: theme.typography.fontWeight.medium,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: theme.typography.fontSize.sm }}
            iconType="line"
          />
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
