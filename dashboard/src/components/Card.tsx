/**
 * Reusable Card component
 */

import React from 'react';

type CardVariant = 'default' | 'outlined' | 'subtle';

type CardProps = {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
  padding?: 'sm' | 'md' | 'lg' | 'xl';
  onClick?: () => void;
  style?: React.CSSProperties;
};

const paddingClassMap: Record<NonNullable<CardProps['padding']>, string> = {
  sm: 'card--padding-sm',
  md: 'card--padding-md',
  lg: 'card--padding-lg',
  xl: 'card--padding-xl',
};

export function Card({ children, className = '', variant = 'default', padding = 'lg', onClick, style }: CardProps) {
  const classes = [
    'card',
    `card--${variant}`,
    paddingClassMap[padding],
    onClick ? 'card--clickable' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} onClick={onClick} style={style}>
      {children}
    </div>
  );
}
