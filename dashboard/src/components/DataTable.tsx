/**
 * Reusable DataTable component
 */

import React from 'react';

type DataTableProps = {
  children: React.ReactNode;
  className?: string;
};

type DataTableSectionProps = {
  children: React.ReactNode;
  className?: string;
};

type DataTableRowProps = {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
};

type DataTableCellProps = {
  children: React.ReactNode;
  className?: string;
};

export function DataTable({ children, className = '' }: DataTableProps) {
  return (
    <div className={['data-table__container', className].filter(Boolean).join(' ')}>
      <table className="data-table">{children}</table>
    </div>
  );
}

export function DataTableHeader({ children, className = '' }: DataTableSectionProps) {
  return <thead className={['data-table__head', className].filter(Boolean).join(' ')}>{children}</thead>;
}

export function DataTableBody({ children, className = '' }: DataTableSectionProps) {
  return <tbody className={className}>{children}</tbody>;
}

export function DataTableRow({ children, className = '', onClick }: DataTableRowProps) {
  const classes = ['data-table__row', onClick ? 'data-table__row--hoverable' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <tr className={classes} onClick={onClick}>
      {children}
    </tr>
  );
}

export function DataTableHeaderCell({ children, className = '' }: DataTableCellProps) {
  return <th className={['data-table__header-cell', className].filter(Boolean).join(' ')}>{children}</th>;
}

export function DataTableCell({ children, className = '' }: DataTableCellProps) {
  return <td className={['data-table__cell', className].filter(Boolean).join(' ')}>{children}</td>;
}
