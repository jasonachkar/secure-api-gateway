/**
 * Public Landing Page
 * Explains the Secure API Gateway project before login
 */

import { Link } from 'react-router-dom';
import { ShieldCheck, Radar, ClipboardCheck } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ArchitectureDiagram } from '../components/ArchitectureDiagram';
import { LiveTrafficPreview } from '../components/LiveTrafficPreview';

const FEATURE_HIGHLIGHTS = [
  {
    icon: ShieldCheck,
    title: 'OWASP API Top 10 Coverage',
    description: 'Every risk on the list has a real, working mitigation - not a checklist.',
  },
  {
    icon: Radar,
    title: 'Real-time Threat Intelligence',
    description: 'IP reputation scoring, geo-distribution, and attack-pattern detection, live.',
  },
  {
    icon: ClipboardCheck,
    title: 'Multi-framework Compliance',
    description: 'NIST, OWASP, PCI DSS, and GDPR scoring, each control linked to the code that implements it.',
  },
];

export function Landing() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-nav">
          <div className="landing-brand">
            <ShieldCheck size={20} aria-hidden="true" />
            <span>Secure API Gateway</span>
          </div>
          <Link to="/login">
            <Button variant="primary" size="md">
              Sign In / Try Demo
            </Button>
          </Link>
        </div>
      </header>

      <section className="landing-hero landing-container landing-hero--split">
        <div className="landing-hero__copy">
          <h1 className="landing-hero__title landing-hero__title--left">Production-Grade API Security — Live Demo</h1>
          <p className="landing-hero__subtitle landing-hero__subtitle--left">
            A working API gateway with real JWT auth, RBAC, rate limiting, threat intelligence, and incident response
            - not screenshots. Sign in and watch it react to real traffic in real time.
          </p>
          <div className="landing-actions landing-actions--left">
            <Link to="/login">
              <Button variant="primary" size="lg">
                Try Live Demo →
              </Button>
            </Link>
            <a href="https://github.com/jasonachkar/secure-api-gateway" target="_blank" rel="noopener noreferrer" className="landing-link">
              <Button variant="ghost" size="lg">
                View on GitHub
              </Button>
            </a>
          </div>
        </div>
        <div className="landing-hero__widget">
          <LiveTrafficPreview />
        </div>
      </section>

      <section id="about" className="landing-section landing-section--alt">
        <div className="landing-container">
          <h2 className="landing-section__title">What is This?</h2>
          <div className="landing-section__text">
            <p className="paragraph">
              This is a multi-cloud API security control plane: a gateway that normalizes Azure, AWS, and GCP
              security telemetry into one canonical schema, evaluates it against documented detection rules,
              correlates matches into investigations, and executes real (or clearly labeled simulated) response
              actions - with the raw evidence, normalized event, rule logic, and audit trail all inspectable.
            </p>
            <p>
              Some of it runs on real cloud telemetry today; some of it replays sanitized fixtures. Both are
              labeled explicitly throughout - see{' '}
              <Link to="/implementation-status">Implementation Status</Link> after signing in for the honest,
              capability-by-capability breakdown.
            </p>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-container">
          <h2 className="landing-section__title">Key Features</h2>
          <div className="landing-split-grid">
            <Card className="landing-architecture-card">
              <div className="section-title">Security Architecture</div>
              <p className="section-subtitle" style={{ marginBottom: 'var(--space-md)' }}>
                Every request passes through a real middleware chain before it ever reaches an upstream service.
              </p>
              <ArchitectureDiagram />
            </Card>
            <div className="landing-highlight-stack">
              {FEATURE_HIGHLIGHTS.map((feature) => (
                <div key={feature.title} className="landing-highlight">
                  <feature.icon size={22} className="landing-highlight__icon" aria-hidden="true" />
                  <div>
                    <div className="landing-highlight__title">{feature.title}</div>
                    <p className="landing-highlight__description">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-section--alt">
        <div className="landing-container">
          <h2 className="landing-section__title">Technology Stack</h2>
          <div className="landing-chip-row">
            {[
              { name: 'Node.js', slug: 'nodedotjs' },
              { name: 'TypeScript', slug: 'typescript' },
              { name: 'Fastify', slug: 'fastify' },
              { name: 'React', slug: 'react' },
              { name: 'Redis', slug: 'redis' },
              { name: 'JWT', slug: 'jsonwebtokens' },
            ].map((tech) => (
              <span key={tech.name} className="tech-chip tech-chip--logo">
                <img
                  src={`https://cdn.simpleicons.org/${tech.slug}`}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
                {tech.name}
              </span>
            ))}
            {['Zod', 'Pino', 'OpenAPI'].map((tech) => (
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
