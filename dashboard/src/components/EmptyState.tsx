import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="operational-empty-state">
      <span className="operational-empty-state__icon">
        <Icon size={21} aria-hidden="true" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
