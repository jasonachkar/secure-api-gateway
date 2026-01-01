/**
 * Reusable Table Component
 * Provides consistent table styling with hover states and responsive design
 */

import React from 'react';
import { theme } from '../styles/theme';

interface TableProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Table({ children, style }: TableProps) {
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.primary,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.md,
        overflow: 'hidden',
        ...style,
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        {children}
      </table>
    </div>
  );
}

interface TableHeaderProps {
  children: React.ReactNode;
}

export function TableHeader({ children }: TableHeaderProps) {
  return (
    <thead
      style={{
        backgroundColor: theme.colors.neutral[50],
        borderBottom: `1px solid ${theme.colors.border.light}`,
      }}
    >
      {children}
    </thead>
  );
}

interface TableBodyProps {
  children: React.ReactNode;
}

export function TableBody({ children }: TableBodyProps) {
  return <tbody>{children}</tbody>;
}

interface TableRowProps {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function TableRow({ children, onClick, style }: TableRowProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <tr
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: isHovered ? theme.colors.neutral[50] : 'transparent',
        cursor: onClick ? 'pointer' : 'default',
        transition: theme.transitions.fast,
        ...style,
      }}
    >
      {children}
    </tr>
  );
}

interface TableHeaderCellProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function TableHeaderCell({ children, style }: TableHeaderCellProps) {
  return (
    <th
      style={{
        padding: theme.spacing.md,
        textAlign: 'left',
        fontSize: theme.typography.fontSize.sm,
        fontWeight: theme.typography.fontWeight.semibold,
        color: theme.colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

interface TableCellProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function TableCell({ children, style }: TableCellProps) {
  return (
    <td
      style={{
        padding: theme.spacing.md,
        fontSize: theme.typography.fontSize.base,
        color: theme.colors.text.primary,
        ...style,
      }}
    >
      {children}
    </td>
  );
}


