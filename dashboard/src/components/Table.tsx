/**
 * Reusable Table Component
 * Provides consistent table styling with hover states and responsive design
 */

import React from 'react';

interface TableProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Table({ children, style }: TableProps) {
  return (
    <div
      className="data-table__container"
      style={style}
    >
      <table className="data-table">{children}</table>
    </div>
  );
}

interface TableHeaderProps {
  children: React.ReactNode;
}

export function TableHeader({ children }: TableHeaderProps) {
  return (
    <thead
      className="data-table__head"
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
  const classes = ['data-table__row', onClick ? 'data-table__row--hoverable' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <tr
      onClick={onClick}
      className={classes}
      style={style}
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
      className="data-table__header-cell"
      style={style}
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
      className="data-table__cell"
      style={style}
    >
      {children}
    </td>
  );
}

