import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AccessBoundaryProps {
  title?: string;
  description: string;
  resource: string;
  alternative?: { label: string; to: string };
}

export function AccessBoundary({
  title = 'Administrative access required',
  description,
  resource,
  alternative,
}: AccessBoundaryProps) {
  return (
    <section className="access-boundary" aria-labelledby="access-boundary-title">
      <span className="access-boundary__icon" aria-hidden="true">
        <LockKeyhole size={20} />
      </span>
      <div>
        <span className="eyebrow">Protected control-plane surface</span>
        <h2 id="access-boundary-title">{title}</h2>
        <p>{description}</p>
        <div className="access-boundary__meta">
          <span>
            <ShieldCheck size={13} aria-hidden="true" /> RBAC enforced by the API
          </span>
          <code>{resource}</code>
        </div>
        {alternative && (
          <Link to={alternative.to}>
            {alternative.label} <ArrowRight size={13} aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
