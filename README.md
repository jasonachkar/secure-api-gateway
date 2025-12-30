# Secure API Gateway

A **production-grade API Gateway** implementation in Node.js + TypeScript, demonstrating enterprise-level security patterns, OWASP API Top 10 mitigations, and modern authentication/authorization flows.

## Features

### Authentication & Authorization
- **JWT-based authentication** with RS256 asymmetric signing
- **Access tokens** (short-lived, 15min) + **Refresh tokens** (long-lived, 7d)
- **Refresh token rotation** with reuse detection
- **Token revocation** support via Redis-backed token store
- **Role-Based Access Control (RBAC)** with granular permissions
- **Account lockout** after failed login attempts

### Security & OWASP Mitigations
- **OWASP API Security Top 10** mitigations (see [owasp-api-top10.md](docs/owasp-api-top10.md))
- **Redis-backed rate limiting** with sliding window algorithm
- **Request validation** using Zod schemas
- **Security headers** (HSTS, CSP, X-Frame-Options, etc.)
- **CORS** with origin allowlisting
- **SSRF protection** for proxy endpoints
- **Input sanitization** and unknown field stripping
- **Safe error responses** (no stack trace leakage in production)

### Observability & Compliance
- **Structured logging** with Pino (request IDs, log redaction)
- **Audit logging** for security events (login, token rotation, permission denials)
- **OpenAPI 3.0 specification** with Swagger UI
- **Health checks** (`/healthz`, `/readyz`)

### Gateway Pattern
- **Reverse proxy** to upstream services with:
  - Request/response transformation
  - Outbound timeout and retry logic
  - Header sanitization
  - Circuit breaker patterns (ready for implementation)

## Architecture

**Why Fastify?**
We chose Fastify over Express for:
- **Performance**: ~2x faster request throughput
- **Schema-first design**: Built-in JSON schema validation (we use Zod for additional type safety)
- **TypeScript support**: First-class TypeScript experience
- **Plugin ecosystem**: Rich ecosystem with official security plugins

**Layered Architecture**:
```
┌─────────────────────────────────────────────┐
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
└────────┘              └────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20+ LTS
- Docker & Docker Compose
- Redis (via Docker or local)

### Local Development (Docker Compose)

1. **Clone and setup**:
```bash
git clone <repo-url> secure-api-gateway
cd secure-api-gateway
cp .env.example .env
```

2. **Generate JWT keys** (RS256):
```bash
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

3. **Start services**:
```bash
docker compose up --build
```

4. **Gateway available at**: `http://localhost:3000`
   - Swagger UI: `http://localhost:3000/docs`
   - Health check: `http://localhost:3000/healthz`

### Local Development (Without Docker)

1. **Install dependencies**:
```bash
npm install
```

2. **Start Redis** (requires local Redis or Docker):
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

3. **Generate JWT keys** (see above)

4. **Run in dev mode**:
```bash
npm run dev
```

## API Usage Examples

### 1. Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!"
  }'
```

Response:
```json
{
  "accessToken": "eyJhbGc...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```
*Note: Refresh token is set as httpOnly cookie*

### 2. Access Protected Resource
```bash
curl http://localhost:3000/reports/123 \
  -H "Authorization: Bearer <access-token>" \
  --cookie "refreshToken=<from-login>"
```

### 3. Refresh Access Token
```bash
curl -X POST http://localhost:3000/auth/refresh \
  --cookie "refreshToken=<from-login>"
```

### 4. View Audit Logs (Admin Only)
```bash
curl http://localhost:3000/admin/audit-logs \
  -H "Authorization: Bearer <admin-access-token>"
```

### 5. Logout (Revoke Refresh Token)
```bash
curl -X POST http://localhost:3000/auth/logout \
  --cookie "refreshToken=<from-login>"
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test Coverage**:
- Unit tests: RBAC, rate limiting, token rotation, validation
- Integration tests: Auth flows, rate limit enforcement

## Configuration

See [.env.example](.env.example) for all configuration options.

**Key Settings**:
- `JWT_ALGORITHM`: RS256 (recommended) or HS256
- `RATE_LIMIT_*`: Configure per-IP, per-user, and per-route limits
- `CORS_ORIGIN`: Comma-separated allowlist
- `ENABLE_SWAGGER`: Disable in production
- `ALLOWED_UPSTREAM_HOSTS`: SSRF protection allowlist

## Default Users (Development Only)

| Username | Password | Roles | Permissions |
|----------|----------|-------|-------------|
| `admin` | `Admin123!` | `admin`, `user` | All permissions |
| `user` | `User123!` | `user` | `read:reports` |
| `service` | `Service123!` | `service` | `read:reports`, `write:reports` |

**Warning**: These are seeded for local dev only. Never use in production!

## Roles & Permissions

**Roles**:
- `admin`: Full system access
- `user`: Standard user access
- `service`: Service-to-service access

**Permissions** (example set):
- `read:reports`: Read report data
- `write:reports`: Create/update reports
- `read:admin`: Read admin data
- `manage:users`: User management

See [src/modules/auth/auth.service.ts](src/modules/auth/auth.service.ts) for RBAC configuration.

## Security Considerations

### Production Checklist
- [ ] Generate strong, unique `COOKIE_SECRET` and `JWT_PRIVATE_KEY`
- [ ] Set `NODE_ENV=production`
- [ ] Disable Swagger UI (`ENABLE_SWAGGER=false`)
- [ ] Configure TLS termination at reverse proxy (Nginx, ALB, etc.)
- [ ] Set appropriate `CORS_ORIGIN` allowlist
- [ ] Enable HSTS with appropriate `max-age`
- [ ] Configure Redis persistence and authentication
- [ ] Set up log aggregation (ELK, Datadog, CloudWatch)
- [ ] Implement secret rotation procedures
- [ ] Review and adjust rate limits for your traffic patterns
- [ ] Set up monitoring and alerting for audit log events

See [docs/security.md](docs/security.md) for detailed security guidance.

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Security Guide](docs/security.md)
- [OWASP API Top 10 Mitigations](docs/owasp-api-top10.md)
- [Deployment Guide](docs/deployment.md)
- [Runbook (Operations)](docs/runbook.md)
- [OpenAPI Specification](openapi/openapi.yaml)

## Project Structure

```
secure-api-gateway/
├── docs/                    # Documentation
├── openapi/                 # OpenAPI specification
├── scripts/                 # Utility scripts
├── src/
│   ├── config/             # Configuration and env validation
│   ├── lib/                # Shared utilities (logger, errors, crypto)
│   ├── middleware/         # Request middleware (auth, rate limit, etc.)
│   ├── modules/            # Business modules (auth, audit, reports, proxy)
│   ├── types/              # TypeScript type definitions
│   ├── app.ts              # Fastify app setup
│   └── main.ts             # Entry point
├── test/                   # Unit and integration tests
├── mock-service/           # Mock upstream service
└── docker-compose.yml      # Local development stack
```

## Performance & Scalability

- **Horizontal scaling**: Stateless design (session stored in Redis)
- **Rate limiting**: Distributed via Redis (scales across instances)
- **Caching**: Ready for response caching layer
- **Load testing**: See [docs/runbook.md](docs/runbook.md) for benchmarks

## Roadmap

- [ ] GraphQL gateway support
- [ ] WebSocket proxy support
- [ ] Circuit breaker implementation
- [ ] Response caching layer
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Metrics export (Prometheus)
- [ ] Multi-factor authentication (MFA)

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/secure-api-gateway/issues)
- **Security**: Report vulnerabilities to security@example.com (DO NOT open public issues)

---

**Built with security in mind. Review, audit, and adapt to your threat model.**
