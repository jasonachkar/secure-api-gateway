# Deployment Guide

## Prerequisites

- Node.js 20 LTS or higher
- Redis 7.x
- Docker & Docker Compose (for containerized deployment)
- SSL/TLS certificates (production)
- Domain name (production)

## Local Development

### 1. Setup

```bash
# Clone repository
git clone <repo-url> secure-api-gateway
cd secure-api-gateway

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Generate JWT keys
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

### 2. Configuration

Edit `.env`:
```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
ENABLE_SWAGGER=true
```

### 3. Start Services

#### Option A: Docker Compose (Recommended)
```bash
docker compose up --build
```

Services running:
- Gateway: `http://localhost:3000`
- Mock Service: `http://localhost:4000`
- Redis: `localhost:6379`
- Swagger UI: `http://localhost:3000/docs`

#### Option B: Local Services
```bash
# Terminal 1: Start Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 2: Start mock service
cd mock-service
npm install
npm run dev

# Terminal 3: Start gateway
npm run dev
```

### 4. Verify Installation

```bash
# Health check
curl http://localhost:3000/healthz

# Expected response:
# {"status":"ok","timestamp":1736937000000}

# Readiness check
curl http://localhost:3000/readyz

# Expected response:
# {"status":"ok","redis":"ok","timestamp":1736937000000}
```

## Production Deployment

### Architecture Options

#### Option 1: Docker Swarm
```
┌─────────────┐
│   Traefik   │ ← TLS termination
│   (LB)      │
└──────┬──────┘
       │
┌──────┴───────┬──────────────┐
│  Gateway     │  Gateway     │  ← Replicas
│  Instance 1  │  Instance 2  │
└──────┬───────┴──────┬───────┘
       │              │
       └──────┬───────┘
              │
       ┌──────┴──────┐
       │    Redis    │  ← Shared state
       │   Cluster   │
       └─────────────┘
```

#### Option 2: Kubernetes
```
                ┌─────────────┐
                │   Ingress   │ ← TLS termination
                │  (Nginx)    │
                └──────┬──────┘
                       │
                ┌──────▼──────┐
                │   Service   │
                └──────┬──────┘
                       │
       ┌───────────────┼───────────────┐
       │               │               │
┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│   Pod 1     │ │   Pod 2     │ │   Pod 3     │ ← HPA
│  (Gateway)  │ │  (Gateway)  │ │  (Gateway)  │
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       │               │               │
       └───────────────┼───────────────┘
                       │
                ┌──────▼──────┐
                │    Redis    │
                │ StatefulSet │
                └─────────────┘
```

#### Option 3: Cloud Platform (AWS)
```
Route 53 (DNS)
      │
      ▼
CloudFront (CDN)
      │
      ▼
ALB (Load Balancer + TLS)
      │
      ├─────────────┬─────────────┐
      │             │             │
   ECS Task     ECS Task     ECS Task  ← Auto Scaling
   (Gateway)    (Gateway)    (Gateway)
      │             │             │
      └─────────────┼─────────────┘
                    │
              ElastiCache
               (Redis)
```

### 1. Build Production Image

```bash
# Build gateway image
docker build -t secure-api-gateway:latest .

# Build mock service (if deploying)
cd mock-service
docker build -t mock-upstream-service:latest .
```

### 2. Production Configuration

Create `production.env`:
```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Logging
LOG_LEVEL=info
LOG_PRETTY=false

# Redis (use managed service)
REDIS_HOST=redis.your-domain.com
REDIS_PORT=6379
REDIS_PASSWORD=<strong-password>
REDIS_DB=0

# JWT (RS256 with strong keys)
JWT_ALGORITHM=RS256
JWT_PRIVATE_KEY=/secrets/jwt-private.pem
JWT_PUBLIC_KEY=/secrets/jwt-public.pem
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# Rate Limiting (adjust based on traffic)
RATE_LIMIT_GLOBAL_MAX=1000
RATE_LIMIT_GLOBAL_WINDOW=60000
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_AUTH_WINDOW=60000
RATE_LIMIT_USER_MAX=500
RATE_LIMIT_USER_WINDOW=60000

# Security
CORS_ORIGIN=https://app.your-domain.com,https://admin.your-domain.com
COOKIE_SECRET=<generate-strong-32+-char-secret>
BCRYPT_ROUNDS=12

# Disable debug features
ENABLE_SWAGGER=false

# Production limits
BODY_LIMIT=1048576
REQUEST_TIMEOUT=30000
```

### 3. Secrets Management

#### AWS Secrets Manager
```bash
# Store JWT private key
aws secretsmanager create-secret \
  --name prod/gateway/jwt-private-key \
  --secret-string file://keys/private.pem

# Store cookie secret
aws secretsmanager create-secret \
  --name prod/gateway/cookie-secret \
  --secret-string "$(openssl rand -base64 32)"

# Store Redis password
aws secretsmanager create-secret \
  --name prod/gateway/redis-password \
  --secret-string "$(openssl rand -base64 32)"
```

#### Docker Secrets (Swarm)
```bash
# Create secrets
docker secret create jwt_private_key keys/private.pem
docker secret create cookie_secret cookie-secret.txt
```

#### Kubernetes Secrets
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: gateway-secrets
type: Opaque
data:
  jwt-private-key: <base64-encoded>
  cookie-secret: <base64-encoded>
  redis-password: <base64-encoded>
```

### 4. Reverse Proxy Configuration

#### Nginx (TLS Termination)
```nginx
upstream gateway {
    least_conn;
    server gateway1:3000;
    server gateway2:3000;
    server gateway3:3000;
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    # TLS Configuration
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers (additional layer)
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;

    location / {
        proxy_pass http://gateway;
        proxy_http_version 1.1;

        # Preserve client IP
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;

        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health checks
    location /healthz {
        access_log off;
        proxy_pass http://gateway/healthz;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

### 5. Docker Compose (Production)

```yaml
version: '3.8'

services:
  gateway:
    image: secure-api-gateway:latest
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    environment:
      NODE_ENV: production
    env_file:
      - production.env
    secrets:
      - jwt_private_key
      - jwt_public_key
      - cookie_secret
    ports:
      - "3000:3000"
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis-data:/data
    deploy:
      restart_policy:
        condition: on-failure

volumes:
  redis-data:

secrets:
  jwt_private_key:
    external: true
  jwt_public_key:
    external: true
  cookie_secret:
    external: true
```

### 6. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  labels:
    app: api-gateway
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: gateway
        image: secure-api-gateway:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_HOST
          value: "redis-service"
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: gateway-secrets
              key: redis-password
        - name: COOKIE_SECRET
          valueFrom:
            secretKeyRef:
              name: gateway-secrets
              key: cookie-secret
        volumeMounts:
        - name: jwt-keys
          mountPath: /secrets
          readOnly: true
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /healthz
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /readyz
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: jwt-keys
        secret:
          secretName: gateway-secrets
          items:
          - key: jwt-private-key
            path: jwt-private.pem
          - key: jwt-public-key
            path: jwt-public.pem
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway-service
spec:
  selector:
    app: api-gateway
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## Monitoring & Observability

### Logging

#### Centralized Logging (ELK Stack)
```yaml
# Filebeat for log shipping
filebeat.inputs:
- type: container
  paths:
    - '/var/lib/docker/containers/*/*.log'
  processors:
    - add_docker_metadata: ~

output.elasticsearch:
  hosts: ["elasticsearch:9200"]
```

#### CloudWatch (AWS)
```json
{
  "logConfiguration": {
    "logDriver": "awslogs",
    "options": {
      "awslogs-group": "/ecs/api-gateway",
      "awslogs-region": "us-east-1",
      "awslogs-stream-prefix": "gateway"
    }
  }
}
```

### Metrics

#### Prometheus
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['gateway:3000']
    metrics_path: '/metrics'  # Add metrics endpoint
```

### Alerting

#### Example Alerts
```yaml
groups:
- name: gateway_alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 5m
    annotations:
      summary: "High 5xx error rate"

  - alert: HighRateLimitHits
    expr: rate(rate_limit_exceeded_total[5m]) > 10
    for: 5m
    annotations:
      summary: "High rate limit hits"

  - alert: FailedLogins
    expr: increase(login_failures_total[5m]) > 50
    annotations:
      summary: "Potential brute force attack"
```

## Scaling Guidelines

### Horizontal Scaling
- **Stateless design**: Can scale to N instances
- **Redis required**: For rate limiting, tokens
- **Load balancer**: Distribute traffic evenly

### Vertical Scaling
- **CPU**: 0.5-1 core per instance
- **Memory**: 256-512 MB per instance
- **Connections**: ~1000 concurrent connections per instance

### Auto-Scaling Rules
```
Scale UP when:
- CPU > 70% for 5 minutes
- Memory > 80% for 5 minutes
- Request queue > 1000

Scale DOWN when:
- CPU < 30% for 10 minutes
- Memory < 40% for 10 minutes
- Request queue < 100
```

## Disaster Recovery

### Backup Strategy
```bash
# Redis backup
redis-cli --rdb /backup/dump-$(date +%Y%m%d).rdb

# Automated backups (cron)
0 2 * * * /scripts/backup-redis.sh
```

### Recovery Procedure
1. Restore Redis from backup
2. Deploy latest gateway image
3. Verify health checks
4. Gradually restore traffic
5. Monitor error rates

## Rollback Procedure

### Blue-Green Deployment
```bash
# Deploy new version (green)
docker service update --image gateway:v2 gateway_green

# Health check green
curl https://green.api.your-domain.com/healthz

# Switch traffic
# Update load balancer to point to green

# Rollback if issues
# Switch load balancer back to blue
```

### Rolling Update
```bash
# Kubernetes rolling update
kubectl set image deployment/api-gateway gateway=gateway:v2

# Rollback
kubectl rollout undo deployment/api-gateway
```

## Security Hardening

### Container Security
```dockerfile
# Use specific version (not :latest)
FROM node:20.10.0-alpine

# Run as non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Read-only filesystem
docker run --read-only --tmpfs /tmp gateway:latest
```

### Network Policies (Kubernetes)
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: gateway-network-policy
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: nginx-ingress
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: redis
    ports:
    - protocol: TCP
      port: 6379
```

## Troubleshooting

### Common Issues

#### Redis Connection Failed
```bash
# Check Redis connectivity
redis-cli -h redis.your-domain.com -p 6379 ping

# Check credentials
redis-cli -h redis.your-domain.com -p 6379 -a <password> ping
```

#### High Memory Usage
```bash
# Check container stats
docker stats gateway

# Analyze Node.js heap
kill -SIGUSR2 <pid>  # Generate heap snapshot
```

#### Rate Limit Not Working
```bash
# Check Redis keys
redis-cli keys "ratelimit:*"

# Verify Redis TTL
redis-cli ttl "ratelimit:global:192.168.1.1"
```
