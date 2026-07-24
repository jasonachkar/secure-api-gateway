/**
 * Enhanced Metric Card Component
 * Displays key metrics with icons, trends, and hover effects
 */

import React from 'react';
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';

export interface MetricTrend {
  direction: 'up' | 'down' | 'flat';
  percentage: number;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  /** Percentage change vs. the previous period, with direction and coloring. */
  trend?: MetricTrend;
  /**
   * By default, "up" is treated as good (green) and "down" as bad (red) - the right
   * default for something like requests/sec. Set this for metrics where more is worse
   * (e.g. Failed Logins), so "up" renders red and "down" renders green instead.
   */
  invertTrend?: boolean;
  subtitle?: string;
  color?: 'blue' | 'green' | 'red' | 'yellow';
  icon?: React.ReactNode;
  isLoading?: boolean;
}

export function MetricCard({
  title,
  value,
  trend,
  invertTrend = false,
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

  const isGood = trend && (invertTrend ? trend.direction === 'down' : trend.direction === 'up');
  const isBad = trend && (invertTrend ? trend.direction === 'up' : trend.direction === 'down');
  const trendClass = trend ? (trend.direction === 'flat' ? 'metric-card__trend--flat' : isGood ? 'metric-card__trend--good' : isBad ? 'metric-card__trend--bad' : '') : '';

  return (
    <div className={cardClasses}>
      <div className="metric-card__header">
        <div className="metric-card__label">{title}</div>
        {icon && (
          <div className="metric-card__icon">{icon}</div>
        )}
      </div>
      <div className="metric-card__value-row">
        <div className="metric-card__value">{value}</div>
        {trend && (
          <span className={`metric-card__trend-icon ${trendClass}`} aria-hidden="true">
            {trend.direction === 'up' ? <ArrowUp size={14} /> : trend.direction === 'down' ? <ArrowDown size={14} /> : <ArrowRight size={14} />}
          </span>
        )}
      </div>
      {trend && (
        <div className={`metric-card__trend-label ${trendClass}`}>
          {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''}
          {Math.abs(trend.percentage).toFixed(1)}% vs last period
        </div>
      )}
      {subtitle && (
        <div className="metric-card__subtitle">{subtitle}</div>
      )}
    </div>
  );
}
