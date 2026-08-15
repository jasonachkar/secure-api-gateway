import { Eye, ShieldCheck } from 'lucide-react';

interface ReviewerModeNoticeProps {
  children: string;
}

export function ReviewerModeNotice({ children }: ReviewerModeNoticeProps) {
  return (
    <div className="alert alert--info" role="status">
      <Eye size={16} aria-hidden="true" />
      <div>
        <strong>Read-only reviewer view.</strong> {children}{' '}
        <span>
          <ShieldCheck size={13} aria-hidden="true" /> Mutations remain administrator-only.
        </span>
      </div>
    </div>
  );
}
