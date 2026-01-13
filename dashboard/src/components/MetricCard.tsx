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
  const cardClasses = ['metric-card', `metric-card--${color}`].join(' ');

  if (isLoading) {
    return (
      <div className={cardClasses}>
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--value" />
        {subtitle && (
          <div className="skeleton skeleton--subtitle" />
        )}
      </div>
    );
  }

  return (
    <div className={cardClasses}>
      <div className="metric-card__header">
        <div className="metric-card__label">{title}</div>
        {icon && (
          <div className="metric-card__icon">{icon}</div>
        )}
      </div>
      <div className="metric-card__value">{value}</div>
      {subtitle && (
        <div className="metric-card__subtitle">{subtitle}</div>
      )}
    </div>
  );
}
