/**
 * Public Landing Page
 * Explains the Secure API Gateway project before login
 */

import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { theme } from '../styles/theme';

export function Landing() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.secondary,
      fontFamily: theme.typography.fontFamily.sans,
    }}>
      {/* Header/Navbar */}
      <header style={{
        backgroundColor: theme.colors.background.primary,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        padding: `${theme.spacing.md} ${theme.spacing.xl}`,
        boxShadow: theme.shadows.sm,
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            color: theme.colors.text.primary,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}>
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

      {/* Hero Section */}
      <section style={{
        padding: `${theme.spacing['3xl']} ${theme.spacing.xl}`,
        maxWidth: '1200px',
        margin: '0 auto',
        textAlign: 'center',
      }}>
        <h1 style={{
          ...theme.typography.h1,
          fontSize: theme.typography.fontSize['4xl'],
          marginBottom: theme.spacing.md,
          color: theme.colors.text.primary,
        }}>
          Production-Grade API Gateway
        </h1>
        <p style={{
          ...theme.typography.body,
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.secondary,
          maxWidth: '800px',
          margin: '0 auto',
          marginBottom: theme.spacing['2xl'],
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          A comprehensive demonstration of enterprise-level security patterns, OWASP API Top 10 mitigations, 
          and modern authentication/authorization flows. Built with Node.js, TypeScript, and Fastify.
        </p>
        <div style={{
          display: 'flex',
          gap: theme.spacing.md,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <Link to="/login">
            <Button variant="primary" size="lg">
              Try Live Demo →
            </Button>
          </Link>
          <a href="#features" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="lg">
              Learn More
            </Button>
          </a>
        </div>
      </section>

      {/* What is this? Section */}
      <section id="about" style={{
        padding: `${theme.spacing['2xl']} ${theme.spacing.xl}`,
        backgroundColor: theme.colors.background.primary,
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <h2 style={{
          ...theme.typography.h2,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
        }}>
          What is This?
        </h2>
        <div style={{
          ...theme.typography.body,
          fontSize: theme.typography.fontSize.md,
          color: theme.colors.text.secondary,
          maxWidth: '900px',
          margin: '0 auto',
          lineHeight: theme.typography.lineHeight.relaxed,
        }}>
          <p style={{ marginBottom: theme.spacing.md }}>
            This is a <strong>production-grade API Gateway implementation</strong> that showcases enterprise-level 
            security best practices and modern microservices architecture patterns. It serves as a comprehensive 
            demonstration of how to build secure, scalable, and observable API infrastructure.
          </p>
          <p>
            The project demonstrates real-world implementation of security controls, compliance frameworks, 
            threat detection, and operational monitoring—everything you need to understand API Gateway 
            security in a production environment.
          </p>
        </div>
      </section>

      {/* Key Features Section */}
      <section id="features" style={{
        padding: `${theme.spacing['2xl']} ${theme.spacing.xl}`,
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <h2 style={{
          ...theme.typography.h2,
          marginBottom: theme.spacing.xl,
          textAlign: 'center',
        }}>
          Key Features
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: theme.spacing.lg,
        }}>
          {[
            {
              icon: '🔐',
              title: 'Authentication & Authorization',
              description: 'JWT-based authentication with token rotation, RBAC with granular permissions, and account lockout mechanisms.',
            },
            {
              icon: '🛡️',
              title: 'Security & OWASP Mitigations',
              description: 'Full OWASP API Top 10 coverage, Redis-backed rate limiting, request validation, security headers, and SSRF protection.',
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
            <div
              key={idx}
              style={{
                backgroundColor: theme.colors.background.primary,
                padding: theme.spacing.lg,
                borderRadius: theme.borderRadius.lg,
                boxShadow: theme.shadows.md,
                border: `1px solid ${theme.colors.border.light}`,
              }}
            >
              <div style={{
                fontSize: theme.typography.fontSize['4xl'],
                marginBottom: theme.spacing.md,
              }}>
                {feature.icon}
              </div>
              <h3 style={{
                ...theme.typography.h3,
                marginBottom: theme.spacing.sm,
              }}>
                {feature.title}
              </h3>
              <p style={{
                ...theme.typography.body,
                color: theme.colors.text.secondary,
                lineHeight: theme.typography.lineHeight.relaxed,
              }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Technology Stack Section */}
      <section style={{
        padding: `${theme.spacing['2xl']} ${theme.spacing.xl}`,
        backgroundColor: theme.colors.background.primary,
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <h2 style={{
          ...theme.typography.h2,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
        }}>
          Technology Stack
        </h2>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.md,
          justifyContent: 'center',
        }}>
          {[
            'Node.js',
            'TypeScript',
            'Fastify',
            'React',
            'Redis',
            'JWT',
            'Zod',
            'Pino',
            'OpenAPI',
          ].map((tech) => (
            <span
              key={tech}
              style={{
                backgroundColor: theme.colors.primary[100],
                color: theme.colors.primary[800],
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                borderRadius: theme.borderRadius.full,
                fontSize: theme.typography.fontSize.base,
                fontWeight: theme.typography.fontWeight.medium,
              }}
            >
              {tech}
            </span>
          ))}
        </div>
      </section>

      {/* What It Showcases Section */}
      <section style={{
        padding: `${theme.spacing['2xl']} ${theme.spacing.xl}`,
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <h2 style={{
          ...theme.typography.h2,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
        }}>
          What This Project Showcases
        </h2>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: theme.spacing.lg,
        }}>
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
            <div
              key={idx}
              style={{
                backgroundColor: theme.colors.background.primary,
                padding: theme.spacing.lg,
                borderRadius: theme.borderRadius.lg,
                boxShadow: theme.shadows.md,
                border: `1px solid ${theme.colors.border.light}`,
              }}
            >
              <h3 style={{
                ...theme.typography.h3,
                marginBottom: theme.spacing.md,
                color: theme.colors.primary[700],
              }}>
                {showcase.title}
              </h3>
              <ul style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
              }}>
                {showcase.items.map((item, itemIdx) => (
                  <li
                    key={itemIdx}
                    style={{
                      ...theme.typography.body,
                      color: theme.colors.text.secondary,
                      marginBottom: theme.spacing.xs,
                      paddingLeft: theme.spacing.md,
                      position: 'relative',
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      left: 0,
                      color: theme.colors.primary[500],
                    }}>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section style={{
        padding: `${theme.spacing['3xl']} ${theme.spacing.xl}`,
        backgroundColor: theme.colors.primary[50],
        textAlign: 'center',
      }}>
        <h2 style={{
          ...theme.typography.h2,
          marginBottom: theme.spacing.md,
        }}>
          Ready to Explore?
        </h2>
        <p style={{
          ...theme.typography.body,
          fontSize: theme.typography.fontSize.md,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xl,
          maxWidth: '600px',
          margin: `${theme.spacing.md} auto ${theme.spacing.xl}`,
        }}>
          Sign in to access the live security monitoring dashboard and see real-time metrics, 
          threat detection, and compliance monitoring in action.
        </p>
        <Link to="/login">
          <Button variant="primary" size="lg">
            Access Demo Dashboard →
          </Button>
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        backgroundColor: theme.colors.neutral[900],
        color: theme.colors.text.inverse,
        padding: `${theme.spacing.xl} ${theme.spacing.xl}`,
        textAlign: 'center',
      }}>
        <p style={{
          ...theme.typography.body,
          color: theme.colors.neutral[400],
          marginBottom: theme.spacing.sm,
        }}>
          Secure API Gateway - Production-Grade Security Demonstration
        </p>
        <p style={{
          ...theme.typography.small,
          color: theme.colors.neutral[500],
        }}>
          Built with security in mind. Review, audit, and adapt to your threat model.
        </p>
      </footer>
    </div>
  );
}

