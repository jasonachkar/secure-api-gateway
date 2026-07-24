/**
 * Inline SVG architecture diagram - replaces the old ASCII-art block on About.tsx and is
 * reused on Landing.tsx. Responsive (viewBox + width 100%), no external image assets.
 */

export function ArchitectureDiagram() {
  return (
    <svg
      viewBox="0 0 820 460"
      width="100%"
      role="img"
      aria-labelledby="arch-diagram-title arch-diagram-desc"
      className="architecture-diagram"
    >
      <title id="arch-diagram-title">Secure API Gateway architecture</title>
      <desc id="arch-diagram-desc">
        A client sends requests to the API Gateway, which runs a rate limiter, JWT auth, RBAC, Zod validation, and
        security headers. The gateway reads and writes session, rate-limit, and threat-intel state in Redis, forwards
        allowed requests to upstream services, and streams live metrics and REST admin data to this dashboard.
      </desc>

      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-tertiary)" />
        </marker>
      </defs>

      {/* Client -> Gateway */}
      <line x1="400" y1="80" x2="400" y2="158" stroke="var(--color-text-tertiary)" strokeWidth="2" markerEnd="url(#arrow)" />
      {/* Gateway -> Redis */}
      <line x1="300" y1="240" x2="160" y2="318" stroke="var(--color-text-tertiary)" strokeWidth="2" markerEnd="url(#arrow)" />
      {/* Gateway -> Upstream */}
      <line x1="500" y1="240" x2="640" y2="318" stroke="var(--color-text-tertiary)" strokeWidth="2" markerEnd="url(#arrow)" />
      {/* Gateway -> Admin Dashboard */}
      <line x1="520" y1="185" x2="618" y2="150" stroke="var(--color-primary-500)" strokeWidth="2" markerEnd="url(#arrow)" strokeDasharray="5 4" />

      {/* Client */}
      <g>
        <rect x="300" y="20" width="200" height="60" rx="10" className="architecture-diagram__box" />
        <text x="400" y="55" textAnchor="middle" className="architecture-diagram__label">Client</text>
      </g>

      {/* Gateway */}
      <g>
        <rect x="260" y="160" width="280" height="80" rx="10" className="architecture-diagram__box architecture-diagram__box--accent" />
        <text x="400" y="188" textAnchor="middle" className="architecture-diagram__label architecture-diagram__label--inverse">
          API Gateway (Fastify)
        </text>
        <text x="400" y="208" textAnchor="middle" className="architecture-diagram__sublabel architecture-diagram__sublabel--inverse">
          Rate Limiter · JWT Auth · RBAC
        </text>
        <text x="400" y="224" textAnchor="middle" className="architecture-diagram__sublabel architecture-diagram__sublabel--inverse">
          Zod Validation · Security Headers
        </text>
      </g>

      {/* Redis */}
      <g>
        <path
          d="M 40 340 A 80 16 0 0 1 200 340 L 200 400 A 80 16 0 0 1 40 400 Z"
          className="architecture-diagram__box"
        />
        <ellipse cx="120" cy="340" rx="80" ry="16" className="architecture-diagram__box" />
        <text x="120" y="368" textAnchor="middle" className="architecture-diagram__label">Redis</text>
        <text x="120" y="386" textAnchor="middle" className="architecture-diagram__sublabel">
          Sessions · Rate Limits · Threat Intel
        </text>
      </g>

      {/* Upstream */}
      <g>
        <rect x="600" y="320" width="180" height="70" rx="10" className="architecture-diagram__box" />
        <text x="690" y="350" textAnchor="middle" className="architecture-diagram__label">Upstream Services</text>
        <text x="690" y="368" textAnchor="middle" className="architecture-diagram__sublabel">/ Mock API</text>
      </g>

      {/* Admin Dashboard */}
      <g>
        <rect x="600" y="80" width="180" height="70" rx="10" className="architecture-diagram__box architecture-diagram__box--dashboard" />
        <text x="690" y="110" textAnchor="middle" className="architecture-diagram__label">Admin Dashboard</text>
        <text x="690" y="128" textAnchor="middle" className="architecture-diagram__sublabel">(This UI)</text>
      </g>
      <text x="618" y="140" textAnchor="middle" className="architecture-diagram__edge-label">SSE + REST Admin API</text>
    </svg>
  );
}
