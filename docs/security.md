# Security Guide

## Overview

This API Gateway is built with **security-first** design principles. This document covers security features, best practices, and deployment considerations.

## Authentication & Authorization

### JWT Configuration

#### RS256 (Recommended for Production)
```bash
# Generate key pair
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem

# Secure permissions
chmod 600 keys/private.pem
chmod 644 keys/public.pem
```

**Advantages**:
- Public key can be shared for verification
- Private key never leaves auth service
- Better for microservices architecture

#### HS256 (Simpler, Single-Service)
```env
JWT_ALGORITHM=HS256
JWT_SECRET=your-super-secret-key-min-256-bits-long-change-me
```

**Requirements**:
- Minimum 256 bits (32 characters)
- Cryptographically random
- Rotate regularly (every 90 days)

### Token Lifetimes

**Access Tokens**: 15 minutes (short-lived)
- Reduces impact of token theft
- Forces regular refresh
- Limits attack window

**Refresh Tokens**: 7 days (long-lived)
- Stored as httpOnly cookies
- Rotation on each use
- Reuse detection and revocation

### Token Rotation & Reuse Detection

```
Initial Login:
  ├─ Access Token A1 (15min)
  └─ Refresh Token R1 (7d) → stored in Redis

First Refresh (R1):
  ├─ Access Token A2
  ├─ Refresh Token R2
  └─ R1 revoked (blacklist)

Reuse Attempt (R1 again):
  ├─ Detect hash mismatch
  ├─ Revoke entire token family
  └─ Force re-authentication
```

### Account Lockout

**Configuration**:
```env
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000  # 15 minutes in ms
```

**Tracking**:
- Per username + IP combination
- Prevents brute force attacks
- Redis-backed for distributed systems

**Bypass**:
- Admin password reset (implement separately)
- Time-based expiration

## Rate Limiting

### Multi-Layer Approach

#### Global Rate Limit (Per IP)
```env
RATE_LIMIT_GLOBAL_MAX=100      # requests
RATE_LIMIT_GLOBAL_WINDOW=60000 # 1 minute
```

**Purpose**: Prevent single IP from overwhelming system

#### Auth Endpoint Rate Limit
```env
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW=60000
```

**Purpose**: Prevent credential stuffing

#### Per-User Rate Limit
```env
RATE_LIMIT_USER_MAX=200
RATE_LIMIT_USER_WINDOW=60000
```

**Purpose**: Prevent authenticated abuse

### Headers Returned
```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 2025-01-15T10:30:00Z
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1736937000
Retry-After: 60
```

## Input Validation

### Zod Schema Validation

**Security Benefits**:
1. **Type Safety**: Runtime type checking
2. **Unknown Field Stripping**: Prevents prototype pollution
3. **Format Validation**: Regex, email, URL validation
4. **Size Limits**: String length, number ranges

**Example**:
```typescript
const userSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().email(),
  age: z.number().int().min(18).optional(),
});
// Unknown fields automatically stripped
```

### Body Size Limits
```env
BODY_LIMIT=1048576  # 1MB
```

**Prevents**:
- Memory exhaustion
- Slowloris-style attacks
- Accidental large payloads

### Request Timeouts
```env
REQUEST_TIMEOUT=30000  # 30 seconds
```

**Prevents**:
- Slowloris attacks
- Resource exhaustion
- Hanging connections

## Security Headers

### Helmet Configuration

```typescript
{
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // For Swagger UI
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,      // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },  // Prevent clickjacking
  noSniff: true,                    // Prevent MIME sniffing
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}
```

### CORS Configuration

```env
CORS_ORIGIN=https://app.example.com,https://admin.example.com
```

**Security**:
- Allowlist only trusted origins
- Supports credentials (cookies)
- Proper preflight handling

## SSRF Protection

### Hostname Allowlist
```env
ALLOWED_UPSTREAM_HOSTS=mock-service,api.example.com
```

### IP Blocklist
Private IP ranges blocked:
- `10.0.0.0/8` (RFC 1918)
- `172.16.0.0/12` (RFC 1918)
- `192.168.0.0/16` (RFC 1918)
- `127.0.0.0/8` (Loopback)
- `169.254.0.0/16` (Link-local)
- `::1` (IPv6 loopback)
- `fe80::/10` (IPv6 link-local)
- `fc00::/7` (IPv6 unique local)

### DNS Resolution Check
```typescript
// Resolve hostname to IP
const addresses = await dns.resolve4(hostname);

// Check each IP against private ranges
for (const ip of addresses) {
  if (isPrivateIp(ip)) {
    throw new SSRFError();
  }
}
```

## Logging & Audit

### Log Redaction

**Sensitive fields automatically redacted**:
```typescript
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.refreshToken',
  'user.password',
];
```

**Output**:
```json
{
  "req": {
    "headers": {
      "authorization": "[REDACTED]"
    },
    "body": {
      "username": "admin",
      "password": "[REDACTED]"
    }
  }
}
```

### Audit Events

**Security events logged**:
- LOGIN_SUCCESS
- LOGIN_FAILURE
- LOGOUT
- TOKEN_REFRESH
- TOKEN_REVOKED
- PERMISSION_DENIED
- RATE_LIMIT_EXCEEDED
- ACCOUNT_LOCKED
- SSRF_BLOCKED
- VALIDATION_ERROR

**Audit log structure**:
```json
{
  "id": "unique-id",
  "timestamp": 1736937000000,
  "eventType": "LOGIN_FAILURE",
  "userId": "user-123",
  "username": "admin",
  "ip": "192.168.1.100",
  "requestId": "req-xyz",
  "success": false,
  "message": "Invalid credentials"
}
```

## Error Handling

### Safe Error Responses

**Production**:
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Internal server error"
  },
  "requestId": "req-abc123"
}
```

**Development**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "errors": [
        { "field": "email", "message": "Invalid email format" }
      ]
    }
  },
  "requestId": "req-abc123"
}
```

**Never expose**:
- Stack traces (production)
- Database errors
- File paths
- Internal service names

## Cookie Security

### Refresh Token Cookie
```typescript
{
  httpOnly: true,         // No JavaScript access
  secure: true,           // HTTPS only (production)
  sameSite: 'strict',     // CSRF protection
  path: '/auth/refresh',  // Minimal exposure
  maxAge: 604800,         // 7 days
}
```

### Cookie Secret
```env
COOKIE_SECRET=your-cookie-secret-min-32-chars-long-change-in-production
```

**Requirements**:
- Minimum 32 characters
- Cryptographically random
- Different from JWT secret
- Rotate on compromise

## Secrets Management

### Environment Variables

**Development**: `.env` file
```env
JWT_SECRET=dev-secret-only
COOKIE_SECRET=dev-cookie-secret-only
```

**Production**: Use secret management service
- AWS Secrets Manager
- HashiCorp Vault
- Azure Key Vault
- GCP Secret Manager

### Key Rotation Procedure

1. **Generate new keys**:
   ```bash
   openssl genrsa -out keys/private-new.pem 2048
   openssl rsa -in keys/private-new.pem -pubout -out keys/public-new.pem
   ```

2. **Update configuration**:
   ```env
   JWT_PRIVATE_KEY=./keys/private-new.pem
   JWT_PUBLIC_KEY=./keys/public-new.pem
   ```

3. **Deploy new version**

4. **Wait for old tokens to expire** (7 days for refresh tokens)

5. **Remove old keys**

## Production Security Checklist

### Pre-Deployment
- [ ] Generate production JWT keys (RS256)
- [ ] Set strong `COOKIE_SECRET` (32+ chars)
- [ ] Configure Redis authentication
- [ ] Set `NODE_ENV=production`
- [ ] Disable Swagger UI (`ENABLE_SWAGGER=false`)
- [ ] Set appropriate CORS origins
- [ ] Configure TLS termination
- [ ] Review rate limits for expected traffic
- [ ] Set up log aggregation

### Infrastructure
- [ ] Use HTTPS/TLS 1.3
- [ ] Configure firewall rules
- [ ] Implement DDoS protection (Cloudflare, AWS Shield)
- [ ] Set up intrusion detection (Fail2ban, OSSEC)
- [ ] Enable Redis persistence
- [ ] Configure Redis password authentication
- [ ] Implement database backups (if applicable)
- [ ] Set up monitoring and alerting

### Runtime
- [ ] Run as non-root user
- [ ] Use minimal Docker image (alpine)
- [ ] Limit container resources (CPU, memory)
- [ ] Disable core dumps
- [ ] Set file permission restrictions

### Monitoring
- [ ] Monitor failed login attempts
- [ ] Alert on account lockouts
- [ ] Track rate limit hits
- [ ] Monitor 5xx error rates
- [ ] Watch for SSRF attempts
- [ ] Review audit logs daily
- [ ] Set up security scanning (Snyk, Dependabot)

### Compliance
- [ ] Document data retention policies
- [ ] Implement GDPR/privacy controls (if applicable)
- [ ] Set up audit log retention
- [ ] Configure log shipping to SIEM
- [ ] Perform security audit
- [ ] Conduct penetration testing
- [ ] Document incident response plan

## Common Vulnerabilities Prevented

### SQL Injection
- ✅ Not applicable (no direct DB access in gateway)
- ✅ Validation prevents injection in proxied requests
- ✅ Parameterized queries recommended for future DB integration

### XSS (Cross-Site Scripting)
- ✅ CSP headers configured
- ✅ No user content rendering
- ✅ Input validation and sanitization

### CSRF (Cross-Site Request Forgery)
- ✅ SameSite cookies (`strict`)
- ✅ CORS origin validation
- ✅ Stateless JWT (no CSRF token needed)

### Clickjacking
- ✅ `X-Frame-Options: DENY`
- ✅ CSP `frame-ancestors 'none'`

### Prototype Pollution
- ✅ Zod strips unknown fields
- ✅ No `Object.assign()` on user input
- ✅ Validation middleware sanitizes

### Timing Attacks
- ✅ Constant-time password comparison (bcrypt)
- ✅ Generic "Invalid credentials" message
- ✅ Same response time for invalid username/password

### Brute Force
- ✅ Account lockout (5 attempts)
- ✅ Rate limiting (multiple layers)
- ✅ Redis-backed tracking

## Secure Development Practices

### Code Review Checklist
- [ ] No hardcoded secrets
- [ ] Input validation on all endpoints
- [ ] Authorization checks on protected routes
- [ ] Error messages don't leak info
- [ ] Logging doesn't include secrets
- [ ] Dependencies are up to date
- [ ] No `eval()` or similar dangerous functions

### Dependency Management
```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# Automated scanning (GitHub Dependabot, Snyk)
```

### Testing Requirements
- Unit tests for security logic (RBAC, validation)
- Integration tests for auth flows
- Penetration testing before production
- Regular security audits

## Incident Response

### Suspected Token Compromise
1. Revoke affected user's tokens
2. Rotate JWT signing keys
3. Force re-authentication
4. Review audit logs
5. Investigate source

### Suspected Rate Limit Bypass
1. Review rate limit configuration
2. Check Redis connectivity
3. Analyze IP patterns
4. Implement IP blocking if needed
5. Consider WAF integration

### Data Breach
1. Activate incident response plan
2. Isolate affected systems
3. Review audit logs
4. Notify affected users (GDPR)
5. Document timeline and impact
6. Conduct post-mortem

## Resources

### Standards & Frameworks
- OWASP Top 10: https://owasp.org/Top10/
- OWASP API Security Top 10: https://owasp.org/API-Security/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- CWE Top 25: https://cwe.mitre.org/top25/

### Tools
- OWASP ZAP: Security testing
- Burp Suite: Penetration testing
- Snyk: Dependency scanning
- SonarQube: Code quality & security

### Training
- OWASP WebGoat: https://owasp.org/www-project-webgoat/
- PortSwigger Academy: https://portswigger.net/web-security
