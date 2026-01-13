import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outlined' | 'soft';
}

export function Card({ variant = 'default', className, ...props }: CardProps) {
  const classes = [
    'ui-card',
    variant === 'outlined' ? 'ui-card--outlined' : null,
    variant === 'soft' ? 'ui-card--soft' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div {...props} className={classes} />;
}
