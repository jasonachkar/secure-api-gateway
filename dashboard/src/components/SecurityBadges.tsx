import type {
  DataProvenance,
  InvestigationStatus,
  OperationalHealth,
  SecuritySeverity,
} from '../types';

export function ProvenanceBadge({ value }: { value: DataProvenance }) {
  return <span className={`provenance-chip provenance-chip--${value}`}>{value}</span>;
}

export function SeverityBadge({ value }: { value: SecuritySeverity }) {
  return <span className={`security-badge security-badge--severity-${value}`}>{value}</span>;
}

export function InvestigationStatusBadge({ value }: { value: InvestigationStatus }) {
  return <span className={`security-badge security-badge--status-${value}`}>{value}</span>;
}

export function HealthBadge({ value }: { value: OperationalHealth }) {
  return (
    <span className={`security-badge security-badge--health-${value}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

export function DecisionBadge({ value }: { value: 'allowed' | 'denied' | 'anonymous' }) {
  return <span className={`security-badge security-badge--decision-${value}`}>{value}</span>;
}
