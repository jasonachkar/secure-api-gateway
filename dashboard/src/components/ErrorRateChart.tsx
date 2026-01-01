/**
 * Enhanced Error Rate Chart Component
 * Real-time area chart showing error rates by status code with consistent styling
 */

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';
import { theme } from '../styles/theme';

interface DataPoint {
  timestamp: number;
  errors4xx: number;
  errors5xx: number;
}

interface ErrorRateChartProps {
  data: DataPoint[];
  title?: string;
  isLoading?: boolean;
}

export function ErrorRateChart({ data, title = 'Error Rate', isLoading = false }: ErrorRateChartProps) {
  const chartData = data.map(point => ({
    time: format(new Date(point.timestamp), 'HH:mm:ss'),
    '4xx Errors': point.errors4xx,
    '5xx Errors': point.errors5xx,
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
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="color4xx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.warning[500]} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={theme.colors.warning[500]} stopOpacity={0.1}/>
            </linearGradient>
            <linearGradient id="color5xx" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.colors.error[500]} stopOpacity={0.8}/>
              <stop offset="95%" stopColor={theme.colors.error[500]} stopOpacity={0.1}/>
            </linearGradient>
          </defs>
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
              value: 'Errors/sec', 
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
            iconType="square"
          />
          <Area
            type="monotone"
            dataKey="4xx Errors"
            stroke={theme.colors.warning[500]}
            strokeWidth={2}
            fill="url(#color4xx)"
            animationDuration={300}
          />
          <Area
            type="monotone"
            dataKey="5xx Errors"
            stroke={theme.colors.error[500]}
            strokeWidth={2}
            fill="url(#color5xx)"
            animationDuration={300}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
