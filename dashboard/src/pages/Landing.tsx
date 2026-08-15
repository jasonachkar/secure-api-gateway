import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileCheck2,
  GitBranch,
  Radar,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { Button } from '../components/Button';
import { ThemeToggle } from '../components/ThemeToggle';

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: 'Protect the gateway',
    body: 'JWT rotation, RBAC, Redis-backed rate limits, SSRF controls, and enforced IP blocks in the request path.',
  },
  {
    icon: Workflow,
    title: 'Normalize every signal',
    body: 'Gateway, AWS, GCP, and Azure events map into one canonical, redacted security schema.',
  },
  {
    icon: Radar,
    title: 'Explain every detection',
    body: 'Versioned rules expose matched fields, severity rationale, false-positive guidance, and test evidence.',
  },
  {
    icon: FileCheck2,
    title: 'Preserve the evidence',
    body: 'Correlated investigations retain raw context, normalized events, response history, and hash-chain verification.',
  },
];

export function Landing() {
  return (
    <div className="product-landing">
      <header className="product-nav landing-container">
        <Link to="/" className="product-brand">
          <span>
            <ShieldCheck size={18} />
          </span>
          <strong>SecureOps</strong>
          <small>Control Plane</small>
        </Link>
        <nav aria-label="Public navigation">
          <a href="#architecture">Architecture</a>
          <a href="#capabilities">Capabilities</a>
          <a href="#evidence">Evidence model</a>
        </nav>
        <div className="product-nav__actions">
          <ThemeToggle compact />
          <a
            className="github-link"
            href="https://github.com/jasonachkar/secure-api-gateway"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GitBranch size={15} />
            GitHub
          </a>
          <Link to="/login">
            <Button variant="primary" size="sm">
              Open live demo <ArrowRight size={13} />
            </Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="product-hero landing-container">
          <div className="product-hero__copy">
            <div className="eyebrow-pill">
              <span className="status-dot status-dot--healthy" />
              Live multi-cloud security engineering portfolio
            </div>
            <h1>
              See the security decision.
              <br />
              <span>Trace the evidence.</span>
            </h1>
            <p>
              A working API gateway and security control plane that turns request telemetry and
              cloud activity into explainable detections, correlated investigations, enforceable
              response, and auditable proof.
            </p>
            <div className="product-hero__actions">
              <Link to="/login">
                <Button variant="primary" size="lg">
                  Explore the control plane <ArrowRight size={15} />
                </Button>
              </Link>
              <a href="#architecture">
                <Button variant="secondary" size="lg">
                  How the pipeline works
                </Button>
              </a>
            </div>
            <div className="product-proof">
              <span>
                <CheckCircle2 size={13} />
                Read-only reviewer access
              </span>
              <span>
                <CheckCircle2 size={13} />
                No credentials required
              </span>
              <span>
                <CheckCircle2 size={13} />
                Live and replay data labeled
              </span>
            </div>
          </div>
          <div className="product-hero__visual" aria-label="Security operations pipeline preview">
            <div className="hero-window">
              <div className="hero-window__bar">
                <span />
                <span />
                <span />
                <small>INVESTIGATION · GW-AUTH-001</small>
              </div>
              <div className="hero-window__status">
                <span className="security-badge security-badge--severity-critical">critical</span>
                <span className="provenance-chip provenance-chip--live">live</span>
                <strong>Gateway credential attack</strong>
              </div>
              <div className="hero-event-flow">
                <div>
                  <span className="hero-flow-icon hero-flow-icon--cloud">
                    <Cloud size={16} />
                  </span>
                  <p>
                    <strong>Receive</strong>
                    <small>gateway auth telemetry</small>
                  </p>
                </div>
                <span />
                <div>
                  <span className="hero-flow-icon hero-flow-icon--normalize">
                    <Workflow size={16} />
                  </span>
                  <p>
                    <strong>Normalize</strong>
                    <small>canonical event v1</small>
                  </p>
                </div>
                <span />
                <div>
                  <span className="hero-flow-icon hero-flow-icon--detect">
                    <Radar size={16} />
                  </span>
                  <p>
                    <strong>Detect</strong>
                    <small>rule + matched fields</small>
                  </p>
                </div>
              </div>
              <div className="hero-evidence">
                <div>
                  <small>Correlation basis</small>
                  <code>principal + source_ip + 15m</code>
                </div>
                <div>
                  <small>Response mode</small>
                  <strong>ENFORCED</strong>
                </div>
              </div>
              <div className="hero-timeline">
                <span />
                <div>
                  <strong>Signal received</strong>
                  <small>Authentication failure from 192.0.2.44</small>
                </div>
                <span />
                <div>
                  <strong>Rule matched</strong>
                  <small>5 failures against one principal</small>
                </div>
                <span />
                <div>
                  <strong>Investigation created</strong>
                  <small>Evidence package ready</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="architecture" className="product-section product-section--dark">
          <div className="landing-container">
            <div className="product-section__intro">
              <div>
                <span className="eyebrow">Security data lifecycle</span>
                <h2>One traceable path from traffic to proof.</h2>
              </div>
              <p>
                The interface follows the actual system: traffic enters gateway policy, becomes
                telemetry, is normalized, evaluated, correlated, investigated, responded to, and
                preserved as evidence.
              </p>
            </div>
            <div className="lifecycle-flow">
              {[
                'Traffic',
                'Gateway policy',
                'Telemetry',
                'Normalize',
                'Detect',
                'Correlate',
                'Investigate',
                'Respond',
                'Evidence',
              ].map((step, index) => (
                <div key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                  {index < 8 && <ArrowRight size={14} />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="capabilities" className="product-section landing-container">
          <div className="product-section__intro">
            <div>
              <span className="eyebrow">Operational capability</span>
              <h2>Built for security review, not dashboard theater.</h2>
            </div>
            <p>
              Every product claim links back to a runtime endpoint, implementation path, test,
              infrastructure definition, or an explicit limitation.
            </p>
          </div>
          <div className="capability-grid">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <article key={title}>
                <span>
                  <Icon size={18} />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="evidence" className="product-section product-section--subtle">
          <div className="landing-container evidence-story">
            <div>
              <span className="eyebrow">Portfolio case study</span>
              <h2>A reviewer can verify the claim and the limit.</h2>
              <p>
                Start with a safe credential-attack scenario, inspect its normalized event and
                matched rule, follow the transparent correlation explanation, and export the
                investigation with its response and audit records.
              </p>
              <Link to="/login">
                <Button variant="primary">
                  Run the reviewer journey <ArrowRight size={14} />
                </Button>
              </Link>
            </div>
            <div className="evidence-manifest">
              <header>
                <FileCheck2 size={16} />
                <strong>Evidence package</strong>
                <span>JSON bundle</span>
              </header>
              {[
                'investigation.json',
                'normalized-events.json',
                'detections.json',
                'response-actions.json',
                'audit-verification.json',
                'README.txt',
              ].map((file) => (
                <div key={file}>
                  <CheckCircle2 size={13} />
                  <code>{file}</code>
                  <span>verified</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="product-footer">
        <div className="landing-container">
          <div className="product-brand">
            <span>
              <ShieldCheck size={17} />
            </span>
            <strong>SecureOps</strong>
            <small>Control Plane</small>
          </div>
          <p>
            Transparent security engineering across gateway, cloud, detection, response, and
            evidence.
          </p>
          <a
            href="https://github.com/jasonachkar/secure-api-gateway"
            target="_blank"
            rel="noopener noreferrer"
          >
            Review the source <ArrowRight size={12} />
          </a>
        </div>
      </footer>
    </div>
  );
}
