/**
 * Reusable Badge component
 */

import type { CSSProperties, ReactNode } from 'react';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'custom';

type BadgeProps = {
  children: ReactNode;
  className?: string;
  tone?: BadgeTone;
  style?: CSSProperties;
};

export function Badge({ children, className = '', tone = 'neutral', style }: BadgeProps) {
  const classes = ['badge', `badge--${tone}`, className].filter(Boolean).join(' ');

  return (
    <span className={classes} style={style}>
      {children}
    </span>
  );
}
