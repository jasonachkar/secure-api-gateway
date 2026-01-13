/**
 * Enhanced Metric Card Component
 * Displays key metrics with icons, trends, and hover effects
 */

import React from 'react';

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
    blue: 'var(--color-primary-500)',
    green: 'var(--color-success-500)',
    red: 'var(--color-error-500)',
    yellow: 'var(--color-warning-500)',
  };

  if (isLoading) {
    return (
      <div className="metric-card" style={{ '--metric-accent': colors[color] } as React.CSSProperties}>
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--value" />
        {subtitle && (
          <div className="skeleton skeleton--subtitle" />
        )}
      </div>
    );
  }

  return (
    <div className="metric-card" style={{ '--metric-accent': colors[color] } as React.CSSProperties}>
      <div className="metric-card__header">
        <div className="metric-card__title">{title}</div>
        {icon && (
          <div className="metric-card__icon">{icon}</div>
        )}
      </div>
      <div className="metric-card__value">
        {value}
      </div>
      {subtitle && (
        <div className="metric-card__subtitle">
          {subtitle}
        </div>
      )}
    </div>
  );
}
