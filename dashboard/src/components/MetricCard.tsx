/**
 * Enhanced Metric Card Component
 * Displays key metrics with icons, trends, and hover effects
 */

import React from 'react';
import { theme } from '../styles/theme';

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  color?: 'blue' | 'green' | 'red' | 'yellow';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function MetricCard({ 
  title, 
  value, 
  subtitle, 
  color = 'blue',
  icon,
  isLoading = false
}: MetricCardProps) {
  const colors = {
    blue: theme.colors.primary[500],
    green: theme.colors.success[500],
    red: theme.colors.error[500],
    yellow: theme.colors.warning[500],
  };

  const [isHovered, setIsHovered] = React.useState(false);

  if (isLoading) {
    return (
      <div style={{
        backgroundColor: theme.colors.background.primary,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        borderLeft: `4px solid ${colors[color]}`,
      }}>
        <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: theme.spacing.sm, borderRadius: theme.borderRadius.sm }} />
        <div className="skeleton" style={{ height: '32px', width: '40%', marginBottom: theme.spacing.xs, borderRadius: theme.borderRadius.sm }} />
        {subtitle && (
          <div className="skeleton" style={{ height: '12px', width: '50%', borderRadius: theme.borderRadius.sm }} />
        )}
      </div>
    );
  }

  return (
    <div 
      style={{
        backgroundColor: theme.colors.background.primary,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: isHovered ? theme.shadows.lg : theme.shadows.md,
        borderLeft: `4px solid ${colors[color]}`,
        transition: theme.transitions.normal,
        cursor: 'default',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm 
      }}>
        <div style={{ 
          fontSize: theme.typography.fontSize.sm, 
          color: theme.colors.text.tertiary,
          fontWeight: theme.typography.fontWeight.medium,
        }}>
          {title}
        </div>
        {icon && (
          <div style={{ 
            color: colors[color],
            fontSize: '20px',
          }}>
            {icon}
          </div>
        )}
      </div>
      <div style={{ 
        fontSize: theme.typography.fontSize['4xl'], 
        fontWeight: theme.typography.fontWeight.bold, 
        color: theme.colors.text.primary, 
        marginBottom: subtitle ? theme.spacing.xs : 0,
        lineHeight: theme.typography.lineHeight.tight,
      }}>
        {value}
      </div>
      {subtitle && (
        <div style={{ 
          fontSize: theme.typography.fontSize.sm, 
          color: theme.colors.text.tertiary,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}
