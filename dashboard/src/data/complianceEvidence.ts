/**
 * Code-evidence links for the Compliance page - maps each NIST/OWASP/PCI control the
 * backend actually reports (src/modules/admin/compliance.service.ts) to the source file
 * that implements it, plus a one-sentence implementation note. Keys match the real
 * `id`/`risk` strings the API returns, not an assumed/generic list, so a mismatch here
 * is a real bug, not just stale copy.
 */

const REPO_BLOB = 'https://github.com/jasonachkar/secure-api-gateway/blob/main';

export interface EvidenceEntry {
  path?: string;
  note: string;
}

export const NIST_EVIDENCE: Record<string, EvidenceEntry> = {
  'AC-2': {
    path: 'src/modules/auth/auth.service.ts',
    note: 'LockoutManager tracks failed attempts per username+IP in Redis and locks the account after the configured threshold.',
  },
  'AC-7': {
    path: 'src/modules/auth/auth.service.ts',
    note: 'The same lockout mechanism enforces a maximum number of unsuccessful logon attempts before denying further tries.',
  },
  'SI-4': {
    path: 'src/modules/admin/metrics.service.ts',
    note: 'Real-time request/auth/rate-limit metrics collection, paired with the tamper-evident audit log for monitoring.',
  },
  'SC-5': {
    path: 'src/middleware/rateLimit.ts',
    note: 'Redis-backed global and per-route rate limiting is the denial-of-service mitigation for this gateway.',
  },
};

export const OWASP_EVIDENCE: Record<string, EvidenceEntry> = {
  'A01:2021 – Broken Access Control': {
    path: 'src/middleware/rbac.ts',
    note: 'Role- and permission-based access control enforced as Fastify preHandlers on every protected route.',
  },
  'A02:2021 – Cryptographic Failures': {
    path: 'src/lib/crypto.ts',
    note: 'bcrypt password hashing and token-hashing helpers; TLS termination handled at the platform ingress layer.',
  },
  'A03:2021 – Injection': {
    path: 'src/middleware/validation.ts',
    note: 'Zod schema validation on every request body/query/params, stripping unknown keys before they reach business logic.',
  },
  'A04:2021 – Insecure Design': {
    path: 'docs/THREAT_MODEL.md',
    note: 'Trust boundaries, abuse cases, and residual risk are documented explicitly rather than assumed.',
  },
  'A05:2021 – Security Misconfiguration': {
    path: 'src/config/env.ts',
    note: 'Zod-validated config that fails fast in production on placeholder secrets, wildcard CORS, or Swagger left enabled.',
  },
  'A07:2021 – Identification and Authentication Failures': {
    path: 'src/middleware/auth.ts',
    note: 'JWT verification, access-token revocation checks, and refresh-token rotation with reuse detection.',
  },
  'A08:2021 – Software and Data Integrity Failures': {
    path: '.github/workflows',
    note: 'CI dependency review and build pipeline gate what actually gets deployed.',
  },
  'A09:2021 – Security Logging and Monitoring Failures': {
    path: 'src/modules/audit/audit.service.ts',
    note: 'Hash-chained, tamper-evident audit log for every security-relevant event.',
  },
  'A10:2021 – Server-Side Request Forgery': {
    path: 'src/lib/httpClient.ts',
    note: 'Outbound hostname allowlist, private-IP blocking, and DNS-pinning close the classic proxy SSRF and DNS-rebinding gaps.',
  },
};

export const PCI_EVIDENCE: Record<string, EvidenceEntry> = {
  'Req 1': {
    path: 'terraform/modules/networking',
    note: 'Optional VNet integration for the Container Apps environment demonstrates network-segmentation controls.',
  },
  'Req 2': {
    path: 'src/config/env.ts',
    note: 'Boot refuses known placeholder/example secret values in production - no vendor-default credentials survive to a real deployment.',
  },
  'Req 3': {
    note: 'Not applicable: this gateway is a reverse proxy and never stores cardholder data.',
  },
  'Req 4': {
    path: 'src/middleware/securityHeaders.ts',
    note: 'HSTS and related security headers enforce transport encryption for all traffic.',
  },
  'Req 5': {
    note: 'Not applicable: a stateless containerized gateway has no traditional endpoint/anti-virus attack surface.',
  },
  'Req 6': {
    path: '.github/workflows',
    note: 'CI lint/typecheck/test/dependency-review gates changes before they ship.',
  },
  'Req 7': {
    path: 'src/middleware/rbac.ts',
    note: 'Access to admin data is restricted by role, following least-privilege.',
  },
  'Req 8': {
    path: 'src/modules/auth/auth.service.ts',
    note: 'Every account is a distinct user record with its own JWT subject claim - no shared credentials.',
  },
  'Req 9': {
    note: "Delegated to the cloud provider's physical datacenter controls (see terraform/README.md) - not applicable to application code.",
  },
  'Req 10': {
    path: 'src/modules/audit/audit.service.ts',
    note: 'The tamper-evident audit log tracks and timestamps every security-relevant action.',
  },
};

export function githubUrl(path: string): string {
  return `${REPO_BLOB}/${path}`;
}
