# Architecture Overview

## System Design

The Secure API Gateway follows a **layered architecture** pattern with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                         │
│  (Browser, Mobile App, Service, CLI, Third-party)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTPS
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   Load Balancer / CDN                       │
│            (Nginx, ALB, CloudFlare, etc.)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP (internal)
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    API Gateway                              │
│                 (This Application)                          │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Middleware Chain (ordered)                 │    │
│  ├────────────────────────────────────────────────────┤    │
│  │  1. Request ID Generation                          │    │
│  │  2. Security Headers (Helmet)                      │    │
│  │  3. CORS (Origin Validation)                       │    │
│  │  4. Body Parsing & Size Limit                      │    │
│  │  5. Global Rate Limiting (by IP)                   │    │
│  │  6. Route-Specific Rate Limiting                   │    │
│  │  7. Request Validation (Zod)                       │    │
│  │  8. Authentication (JWT)                           │    │
│  │  9. Authorization (RBAC)                           │    │
│  │  10. Request Logging                               │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │               Route Handlers                       │    │
│  ├────────────────────────────────────────────────────┤    │
│  │  • Auth Routes (/auth/*)                          │    │
│  │  • Admin Routes (/admin/*)                        │    │
│  │  • Resource Routes (/reports/*)                   │    │
│  │  • Proxy Routes (/upstream/*)                     │    │
│  │  • Health Routes (/healthz, /readyz)              │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │            Business Logic Layer                    │    │
│  ├────────────────────────────────────────────────────┤    │
│  │  • Auth Service (login, tokens, lockout)          │    │
│  │  • Audit Service (event logging)                  │    │
│  │  • Reports Service (BOLA checks)                  │    │
│  │  • Proxy Service (SSRF protection)                │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
└──────────────┬────────────────────┬─────────────────────────┘
               │                    │
               │                    │
    ┌──────────▼──────────┐  ┌──────▼────────────────┐
    │      Redis          │  │  Upstream Services    │
    │                     │  │                       │
    │  • Rate Limits      │  │  • Reports Service    │
    │  • Token Store      │  │  • User Service       │
    │  • Lockout State    │  │  • Analytics Service  │
    │  • Audit Logs       │  │  • (any backend)      │
    │  • Session Cache    │  │                       │
    └─────────────────────┘  └───────────────────────┘
```

## Component Breakdown

### 1. Entry Point (`main.ts`)
- Bootstraps the application
- Handles graceful shutdown (SIGTERM, SIGINT)
- Initializes logging

### 2. Application Layer (`app.ts`)
- Creates Fastify instance
- Registers plugins (CORS, cookies, compression, etc.)
- Sets up middleware chain
- Registers routes
- Configures error handling

### 3. Configuration Layer (`config/`)
- **env.ts**: Environment variable validation using Zod
- Fail-fast on misconfiguration
- Type-safe config access

### 4. Middleware Layer (`middleware/`)

#### Request ID Middleware
- Generates or extracts correlation ID
- Attaches to request and response headers
- Enables distributed tracing

#### Security Headers Middleware
- Implements OWASP recommendations
- CSP, HSTS, X-Frame-Options, etc.
- Configurable per environment

#### CORS Middleware
- Origin allowlisting
- Credential support
- Preflight handling

#### Rate Limiting Middleware
- **Global**: Per-IP across all routes
- **Route-specific**: Stricter limits for auth endpoints
- **Per-user**: Authenticated user tracking
- Redis-backed for distributed systems
- Standard rate limit headers

#### Validation Middleware
- Zod schema validation
- Body, query, params, headers
- Unknown field stripping (prototype pollution prevention)
- Clear error messages

#### Authentication Middleware
- JWT validation (RS256 or HS256)
- Token extraction from Authorization header
- Token expiration checking
- User attachment to request

#### RBAC Middleware
- Role checking
- Permission checking
- Granular access control
- Audit logging on denial

### 5. Business Modules (`modules/`)

#### Auth Module
- **Services**: User authentication, token generation, account lockout
- **Controller**: HTTP request handling
- **Routes**: Endpoint definitions
- **Schemas**: Request/response validation
- **Token Store**: Redis-backed refresh token management with rotation

#### Audit Module
- **Service**: Event logging
- **Store**: File or Redis storage
- **Types**: Event type definitions
- **Routes**: Admin query endpoints

#### Reports Module
- **Service**: Business logic with BOLA prevention
- **Controller**: Request handling
- **Routes**: RBAC-protected endpoints
- **Schemas**: Validation

#### Proxy Module
- **Service**: Upstream proxying with SSRF protection
- **Routes**: Gateway endpoints

### 6. Library Layer (`lib/`)
- **logger**: Structured logging with Pino
- **errors**: Custom error classes
- **crypto**: Password hashing, token generation
- **httpClient**: Secure upstream HTTP client
- **requestContext**: Correlation and tracing

## Data Flow

### Authentication Flow
```
1. Client → POST /auth/login { username, password }
2. Gateway → Validate input (Zod)
3. Gateway → Check rate limit (Redis)
4. Gateway → Check account lockout (Redis)
5. Gateway → Verify password (bcrypt)
6. Gateway → Generate JWT access + refresh tokens
7. Gateway → Store refresh token metadata (Redis)
8. Gateway → Set httpOnly cookie (refresh token)
9. Gateway → Respond with access token
10. Client ← { accessToken, expiresIn, tokenType }
```

### Protected Resource Access Flow
```
1. Client → GET /reports/123 (Authorization: Bearer <token>)
2. Gateway → Extract JWT from header
3. Gateway → Verify JWT signature
4. Gateway → Check expiration
5. Gateway → Attach user to request
6. Gateway → Check permissions (RBAC)
7. Gateway → Check rate limit (per-user)
8. Gateway → Forward to upstream OR handle locally
9. Gateway → Check resource ownership (BOLA)
10. Gateway → Sanitize response (property-level auth)
11. Client ← { report data }
```

### Token Refresh Flow
```
1. Client → POST /auth/refresh (Cookie: refreshToken)
2. Gateway → Extract refresh token from cookie
3. Gateway → Verify JWT signature
4. Gateway → Check token type (must be 'refresh')
5. Gateway → Check if revoked (Redis blacklist)
6. Gateway → Verify token hash (reuse detection)
7. Gateway → Revoke old refresh token (rotation)
8. Gateway → Generate new access + refresh tokens
9. Gateway → Store new refresh token metadata
10. Gateway → Set new cookie
11. Client ← { accessToken, expiresIn }
```

## Technology Stack

### Runtime & Framework
- **Node.js 20 LTS**: JavaScript runtime
- **TypeScript 5.7**: Type safety
- **Fastify 5**: High-performance web framework

### Security & Auth
- **jsonwebtoken**: JWT creation and verification
- **bcrypt**: Password hashing
- **@fastify/helmet**: Security headers
- **@fastify/rate-limit**: Rate limiting
- **@fastify/cors**: CORS handling
- **@fastify/cookie**: Cookie parsing

### Validation & Schema
- **Zod**: Runtime type validation
- **@fastify/swagger**: OpenAPI generation

### Data Store
- **ioredis**: Redis client
  - Rate limiting
  - Token storage
  - Account lockout
  - Audit logs (optional)

### Logging & Monitoring
- **Pino**: Structured logging
- **pino-pretty**: Dev-friendly formatting

### Testing
- **Jest**: Test framework
- **ts-jest**: TypeScript support
- **supertest**: HTTP testing

## Scalability Considerations

### Horizontal Scaling
- **Stateless design**: No in-memory session storage
- **Redis for state**: Distributed rate limiting, tokens, lockout
- **Load balancer ready**: Sticky sessions not required
- **Container-friendly**: Docker support

### Performance Optimizations
- **Fastify**: ~2x faster than Express
- **Schema compilation**: Fastify pre-compiles JSON schemas
- **Compression**: Gzip/Brotli for responses
- **Connection pooling**: Redis connection reuse

### High Availability
- **Health checks**: `/healthz` and `/readyz` endpoints
- **Graceful shutdown**: Finish in-flight requests
- **Circuit breaker ready**: Can add resilience patterns
- **Redis clustering**: Supported by ioredis

## Security Architecture

### Defense in Depth Layers
1. **Network**: TLS termination at load balancer
2. **Transport**: HSTS, secure cookies
3. **Input**: Validation, sanitization, size limits
4. **Authentication**: JWT with rotation
5. **Authorization**: RBAC with permissions
6. **Rate Limiting**: Multiple layers (global, route, user)
7. **Output**: Response sanitization, safe error messages
8. **Audit**: Comprehensive logging

### Threat Model Coverage
- **Injection**: Input validation, parameterized queries (future DB)
- **Broken Auth**: Token rotation, lockout, bcrypt
- **BOLA**: Resource ownership checks
- **SSRF**: Hostname allowlist, private IP blocking
- **XSS**: CSP headers, no user content in examples
- **CSRF**: SameSite cookies, CORS
- **Rate Limiting**: DDoS mitigation
- **Info Leakage**: Safe error messages, log redaction

## Future Enhancements

### Planned Features
- **GraphQL Gateway**: Add GraphQL support
- **WebSocket Proxy**: Real-time communication
- **Circuit Breaker**: Resilience patterns
- **Response Caching**: Redis-backed cache layer
- **Distributed Tracing**: OpenTelemetry integration
- **Metrics**: Prometheus export
- **Database Integration**: PostgreSQL for users/resources
- **MFA Support**: TOTP/WebAuthn
