/**
 * Enhanced Response Time Chart Component
 * Shows P50, P95, P99 response times over time with consistent styling
 */

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format } from 'date-fns';
import { theme } from '../styles/theme';

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
      boxShadow: theme.shadows.md 
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
              value: 'ms', 
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
            dataKey="P50 (Median)"
            stroke={theme.colors.primary[500]}
            strokeWidth={2}
            dot={false}
            name="P50 (Median)"
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="P95"
            stroke={theme.colors.warning[500]}
            strokeWidth={2}
            dot={false}
            name="P95"
            animationDuration={300}
          />
          <Line
            type="monotone"
            dataKey="P99"
            stroke={theme.colors.error[500]}
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
