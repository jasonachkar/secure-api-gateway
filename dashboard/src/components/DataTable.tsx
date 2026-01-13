import React from 'react';

interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function DataTable({ className, children, ...props }: DataTableProps) {
  const classes = ['data-table', className].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes}>
      {children}
    </div>
  );
}
