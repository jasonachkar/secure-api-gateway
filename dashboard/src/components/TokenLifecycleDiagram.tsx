/**
 * Static JWT token lifecycle diagram for the Sessions page - explains the whole auth flow
 * (endpoints included) to a viewer who has never read the code.
 */

import { ArrowRight } from 'lucide-react';

const STEPS = [
  { label: 'Login', endpoint: 'POST /auth/login' },
  { label: 'Access token issued', endpoint: 'TTL 15min' },
  { label: 'Authenticated request', endpoint: 'Authorization: Bearer <token>' },
  { label: 'Access token expires', endpoint: '—' },
  { label: 'Refresh', endpoint: 'POST /auth/refresh (httpOnly cookie)' },
  { label: 'New pair issued (rotation)', endpoint: 'old refresh token revoked' },
  { label: 'Manual revoke', endpoint: 'POST /auth/logout' },
];

export function TokenLifecycleDiagram() {
  return (
    <div
      className="token-lifecycle"
      role="img"
      tabIndex={0}
      aria-label="JWT token lifecycle: login, access token issued, authenticated requests, expiry, refresh with rotation, and manual revoke via logout"
    >
      {STEPS.map((step, index) => (
        <div className="token-lifecycle__step-wrapper" key={step.label}>
          <div className="token-lifecycle__step">
            <div className="token-lifecycle__step-label">{step.label}</div>
            <div className="token-lifecycle__step-endpoint text-mono">{step.endpoint}</div>
          </div>
          {index < STEPS.length - 1 && (
            <ArrowRight size={16} className="token-lifecycle__arrow" aria-hidden="true" />
          )}
        </div>
      ))}
    </div>
  );
}
