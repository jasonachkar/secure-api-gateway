/**
 * Public Landing Page
 * Explains the Secure API Gateway project before login
 */

import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

export function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-nav">
          <div className="landing-brand">
            <span>🔒</span>
            <span>Secure API Gateway</span>
          </div>
          <Link to="/login">
            <Button variant="primary" size="md">
              Sign In / Try Demo
            </Button>
          </Link>
        </div>
      </header>

      <section className="landing-hero landing-container">
        <h1 className="landing-hero__title">Production-Grade API Gateway</h1>
        <p className="landing-hero__subtitle">
          A comprehensive demonstration of enterprise-level security patterns, OWASP API Top 10 mitigations, and modern
          authentication/authorization flows. Built with Node.js, TypeScript, and Fastify.
        </p>
        <div className="landing-actions">
          <Link to="/login">
            <Button variant="primary" size="lg">
              Try Live Demo →
            </Button>
          </Link>
          <a href="#features" className="landing-link">
            <Button variant="ghost" size="lg">
              Learn More
            </Button>
          </a>
        </div>
      </section>

      <section id="about" className="landing-section landing-section--alt">
        <div className="landing-container">
          <h2 className="landing-section__title">What is This?</h2>
          <div className="landing-section__text">
            <p className="paragraph">
              This is a <strong>production-grade API Gateway implementation</strong> that showcases enterprise-level
              security best practices and modern microservices architecture patterns. It serves as a comprehensive
              demonstration of how to build secure, scalable, and observable API infrastructure.
            </p>
            <p>
              The project demonstrates real-world implementation of security controls, compliance frameworks, threat
              detection, and operational monitoring—everything you need to understand API Gateway security in a
              production environment.
            </p>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section__title">Key Features</h2>
          <div className="landing-grid">
            {[
              {
                icon: '🔐',
                title: 'Authentication & Authorization',
                description:
                  'JWT-based authentication with token rotation, RBAC with granular permissions, and account lockout mechanisms.',
              },
              {
                icon: '🛡️',
                title: 'Security & OWASP Mitigations',
                description:
                  'Full OWASP API Top 10 coverage, Redis-backed rate limiting, request validation, security headers, and SSRF protection.',
              },
              {
                icon: '📊',
                title: 'Security Monitoring Dashboard',
                description: 'Real-time metrics, threat intelligence, incident response, and comprehensive audit logging.',
              },
              {
                icon: '✅',
                title: 'Compliance Monitoring',
                description: 'Security posture scoring with NIST, OWASP, PCI, and GDPR compliance frameworks.',
              },
              {
                icon: '⚡',
                title: 'Performance & Scalability',
                description: 'Fastify-based architecture, horizontal scaling support, distributed rate limiting via Redis.',
              },
              {
                icon: '🔍',
                title: 'Observability',
                description: 'Structured logging, health checks, OpenAPI documentation, and real-time metrics streaming.',
              },
            ].map((feature, idx) => (
              <Card key={idx} className="landing-feature-card">
                <div className="landing-feature-icon">{feature.icon}</div>
                <div className="section-title">{feature.title}</div>
                <p className="section-subtitle">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--alt">
        <div className="landing-container">
          <h2 className="landing-section__title">Technology Stack</h2>
          <div className="landing-chip-row">
            {['Node.js', 'TypeScript', 'Fastify', 'React', 'Redis', 'JWT', 'Zod', 'Pino', 'OpenAPI'].map((tech) => (
              <span key={tech} className="tech-chip">
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section__title">What This Project Showcases</h2>
          <div className="landing-grid landing-grid--compact">
            {[
              {
                title: 'API Gateway Architecture',
                items: ['Reverse proxy patterns', 'Middleware chains', 'Request/response transformation', 'Circuit breaker patterns'],
              },
              {
                title: 'Security Best Practices',
                items: ['OWASP Top 10 mitigations', 'Secure authentication flows', 'Input validation', 'Security headers'],
              },
              {
                title: 'Real-time Monitoring',
                items: ['Live metrics streaming', 'Threat detection', 'Incident management', 'Audit trails'],
              },
              {
                title: 'Compliance & Audit',
                items: ['Framework compliance', 'Security posture scoring', 'Automated reporting', 'Evidence collection'],
              },
            ].map((showcase, idx) => (
              <Card key={idx} className="landing-feature-card">
                <div className="section-title text-lg">{showcase.title}</div>
                <ul className="check-list">
                  {showcase.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="check-list__item">
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-container">
          <h2 className="landing-section__title">Ready to Explore?</h2>
          <p className="landing-cta__text">
            Sign in to access the live security monitoring dashboard and see real-time metrics, threat detection, and
            compliance monitoring in action.
          </p>
          <Link to="/login">
            <Button variant="primary" size="lg">
              Access Demo Dashboard →
            </Button>
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <p className="landing-footer__title">Secure API Gateway - Production-Grade Security Demonstration</p>
        <p className="landing-footer__subtitle">
          Built with security in mind. Review, audit, and adapt to your threat model.
        </p>
      </footer>
    </div>
  );
}
