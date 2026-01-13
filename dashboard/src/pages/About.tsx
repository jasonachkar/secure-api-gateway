/**
 * About Page
 * Detailed information about the Secure API Gateway project
 * Accessible only to authenticated users
 */

import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';

export function About() {
  return (
    <Layout>
      <div className="content-width page-stack">
        <SectionHeader
          title="About Secure API Gateway"
          subtitle="A comprehensive production-grade API Gateway implementation demonstrating enterprise-level security patterns, OWASP API Top 10 mitigations, and modern authentication/authorization flows."
        />

        <Card className="page-stack">
          <div className="section-title">Project Overview</div>
          <div className="section-subtitle">
            <p className="paragraph">
              The Secure API Gateway is a production-ready implementation that acts as a single entry point for API
              requests, providing centralized authentication, authorization, rate limiting, security controls, and
              observability. It demonstrates real-world patterns used in enterprise microservices architectures.
            </p>
            <p>
              This gateway sits between clients and your backend services, handling cross-cutting concerns like security,
              monitoring, and routing. It's designed to be stateless and horizontally scalable, making it suitable for
              high-traffic production environments.
            </p>
          </div>
        </Card>

        <Card className="page-stack">
          <div className="section-title">Architecture Overview</div>
          <div className="code-block">
            <pre className="text-prewrap">
{`┌─────────────────────────────────────────────┐
│  Client (Browser, Mobile App, Service)     │
└─────────────────┬───────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │   API Gateway      │
        │  (This Service)    │
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────────────────────────┐
        │  Middleware Chain                      │
        │  • Request ID                          │
        │  • Security Headers                    │
        │  • Rate Limiting (Global/User/Route)   │
        │  • Authentication (JWT validation)     │
        │  • Authorization (RBAC)                │
        │  • Validation (Zod schemas)            │
        └─────────┬──────────────────────────────┘
                  │
        ┌─────────▼──────────┐
        │  Route Handlers    │
        │  • Auth endpoints  │
        │  • Proxy routes    │
        │  • Admin routes    │
        └─────────┬──────────┘
                  │
        ┌─────────▼──────────┐
        │  Business Logic    │
        │  • Services        │
        │  • Stores          │
        └─────────┬──────────┘
                  │
    ┌─────────────┴────────────────┐
    │                              │
┌───▼────┐              ┌──────────▼─────────┐
│ Redis  │              │  Upstream Services │
└────────┘              └────────────────────┘`}
            </pre>
          </div>
          <div className="section-subtitle">
            <p>
              <strong>Why Fastify?</strong> We chose Fastify over Express for better performance (~2x faster),
              schema-first design with built-in JSON schema validation, first-class TypeScript support, and a rich plugin
              ecosystem with official security plugins.
            </p>
          </div>
        </Card>

        <Card className="page-stack">
          <div className="section-title">Feature Categories</div>
          <div className="page-stack">
            {[
              {
                title: 'Authentication & Authorization',
                icon: '🔐',
                features: [
                  'JWT-based authentication with RS256 asymmetric signing',
                  'Access tokens (short-lived, 15min) + Refresh tokens (long-lived, 7d)',
                  'Refresh token rotation with reuse detection',
                  'Token revocation support via Redis-backed token store',
                  'Role-Based Access Control (RBAC) with granular permissions',
                  'Account lockout after failed login attempts',
                ],
              },
              {
                title: 'Security & OWASP Mitigations',
                icon: '🛡️',
                features: [
                  'Full OWASP API Security Top 10 coverage',
                  'Redis-backed rate limiting with sliding window algorithm',
                  'Request validation using Zod schemas',
                  'Security headers (HSTS, CSP, X-Frame-Options, etc.)',
                  'CORS with origin allowlisting',
                  'SSRF protection for proxy endpoints',
                  'Input sanitization and unknown field stripping',
                  'Safe error responses (no stack trace leakage)',
                ],
              },
              {
                title: 'Observability & Compliance',
                icon: '📊',
                features: [
                  'Structured logging with Pino (request IDs, log redaction)',
                  'Audit logging for security events',
                  'OpenAPI 3.0 specification with Swagger UI',
                  'Health checks (/healthz, /readyz)',
                  'Real-time metrics streaming via Server-Sent Events',
                  'Security posture scoring',
                  'Compliance frameworks: NIST, OWASP, PCI, GDPR',
                ],
              },
              {
                title: 'Gateway Pattern',
                icon: '⚡',
                features: [
                  'Reverse proxy to upstream services',
                  'Request/response transformation',
                  'Outbound timeout and retry logic',
                  'Header sanitization',
                  'Circuit breaker patterns (ready for implementation)',
                ],
              },
            ].map((category, idx) => (
              <div key={idx} className="feature-card">
                <div className="feature-card__title">
                  <span>{category.icon}</span>
                  <span>{category.title}</span>
                </div>
                <ul className="feature-list">
                  {category.features.map((feature, featureIdx) => (
                    <li key={featureIdx} className="feature-list__item">
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card className="page-stack">
          <div className="section-title">What This Dashboard Shows</div>
          <div className="alert alert--warning">
            <strong>Note:</strong> All metrics and data shown in this dashboard are auto-generated for demonstration
            purposes. This helps showcase the monitoring capabilities without requiring actual production traffic.
          </div>
          <div className="page-stack">
            {[
              {
                title: 'Dashboard',
                path: '/',
                description:
                  'Real-time security metrics including request rates, error rates, response times, failed logins, active sessions, and rate limit violations. Live event feed shows security events as they occur.',
              },
              {
                title: 'Threats',
                path: '/threats',
                description:
                  'Threat intelligence system that tracks suspicious IP addresses, calculates threat scores based on failed logins and rate limit violations, and automatically blocks high-risk IPs.',
              },
              {
                title: 'Incidents',
                path: '/incidents',
                description:
                  'Auto-generated security incidents created when threats reach high or critical levels. Tracks incident status, response times, and resolution times.',
              },
              {
                title: 'Compliance',
                path: '/compliance',
                description:
                  'Security posture scoring with compliance metrics for NIST, OWASP Top 10, PCI DSS, and GDPR. Shows compliance scores, control status, and recommendations.',
              },
              {
                title: 'Audit Logs',
                path: '/audit-logs',
                description:
                  'Comprehensive audit trail of all security events including logins, token rotations, permission denials, and administrative actions.',
              },
              {
                title: 'Sessions',
                path: '/sessions',
                description:
                  'Active user sessions and JWT token management. View active sessions, token expiration times, and manage session revocation.',
              },
              {
                title: 'Users',
                path: '/users',
                description: 'User management interface showing user accounts, roles, permissions, and RBAC configuration.',
              },
            ].map((section, idx) => (
              <div key={idx} className="dashboard-link-card">
                <div className="dashboard-link-card__header">
                  <div className="section-title">{section.title}</div>
                  <Link to={section.path}>
                    <Button variant="ghost" size="sm">
                      View →
                    </Button>
                  </Link>
                </div>
                <p className="section-subtitle">{section.description}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="page-stack">
          <div className="section-title">Technical Details</div>
          <div className="section-subtitle">
            <p className="paragraph">
              <strong>Backend:</strong> Node.js 20+ with TypeScript, Fastify framework, Redis for session storage and rate
              limiting, Pino for structured logging.
            </p>
            <p className="paragraph">
              <strong>Frontend:</strong> React with TypeScript, Server-Sent Events for real-time updates, responsive design
              with modern UI patterns.
            </p>
            <p className="paragraph">
              <strong>Security:</strong> JWT tokens (RS256/HS256), bcrypt for password hashing, httpOnly cookies for refresh
              tokens, comprehensive input validation with Zod schemas.
            </p>
            <p>
              <strong>Deployment:</strong> Designed for Docker containerization, horizontal scaling support, stateless
              architecture for load balancing, health checks for orchestration platforms.
            </p>
          </div>
        </Card>

        <div className="centered-section">
          <Link to="/">
            <Button variant="primary" size="lg">
              Return to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
