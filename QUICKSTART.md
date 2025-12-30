# Quick Start Guide

Get the Secure API Gateway running in under 5 minutes!

## Prerequisites

- Node.js 20+ LTS
- Docker & Docker Compose

## Option 1: Docker Compose (Recommended)

```bash
# 1. Clone and navigate
cd secure-api-gateway

# 2. Setup environment
./scripts/dev-seed.sh

# 3. Start everything
docker compose up --build

# 4. Test
curl http://localhost:3000/healthz
```

**Services Running**:
- Gateway: [http://localhost:3000](http://localhost:3000)
- Swagger UI: [http://localhost:3000/docs](http://localhost:3000/docs)
- Mock Service: [http://localhost:4000](http://localhost:4000)
- Redis: `localhost:6379`

## Option 2: Local Development

```bash
# 1. Setup
./scripts/dev-seed.sh
npm install

# 2. Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# 3. Start mock service (separate terminal)
cd mock-service
npm install && npm run dev

# 4. Start gateway (separate terminal)
npm run dev
```

## Try It Out

### 1. Login as Admin
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' \
  -c cookies.txt

# Save the access token
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}' \
  | jq -r '.accessToken')
```

### 2. Access Protected Resource
```bash
curl http://localhost:3000/reports/123 \
  -H "Authorization: Bearer $TOKEN" \
  -b cookies.txt
```

### 3. View Audit Logs (Admin Only)
```bash
curl http://localhost:3000/admin/audit-logs?limit=10 \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Test Rate Limiting
```bash
# Rapid-fire 10 requests (limit is 5/min on auth)
for i in {1..10}; do
  curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}'
  echo ""
done
# You should get 429 Too Many Requests after 5 attempts
```

### 5. Explore API (Swagger UI)
Open [http://localhost:3000/docs](http://localhost:3000/docs) in your browser.

## Demo Users

| Username | Password | Roles | Permissions |
|----------|----------|-------|-------------|
| `admin` | `Admin123!` | admin, user | All permissions |
| `user` | `User123!` | user | read:reports |
| `service` | `Service123!` | service | read:reports, write:reports |

## Common Commands

```bash
# View logs
docker compose logs -f gateway

# Restart gateway
docker compose restart gateway

# Stop all services
docker compose down

# Run tests
npm test

# Run specific test
npm test -- auth.integration.test.ts

# Check health
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Redis Connection Error
```bash
# Check Redis is running
docker ps | grep redis

# Restart Redis
docker compose restart redis
```

### Tests Failing
```bash
# Ensure Redis is running on localhost:6379
docker run -d -p 6379:6379 redis:7-alpine

# Re-run tests
npm test
```

## Next Steps

- Read [docs/architecture.md](docs/architecture.md) for system design
- Review [docs/security.md](docs/security.md) for security features
- Check [docs/owasp-api-top10.md](docs/owasp-api-top10.md) for OWASP mitigations
- See [docs/deployment.md](docs/deployment.md) for production deployment
- Consult [docs/runbook.md](docs/runbook.md) for operations

## Support

- **Issues**: [GitHub Issues](https://github.com/your-org/secure-api-gateway/issues)
- **Documentation**: [/docs](docs/)
- **API Docs**: [OpenAPI Spec](openapi/openapi.yaml)

Happy coding! 🚀
