# Operational Runbook

This runbook provides step-by-step procedures for common operational tasks and incident response.

## Table of Contents
- [Daily Operations](#daily-operations)
- [Monitoring](#monitoring)
- [Common Tasks](#common-tasks)
- [Incident Response](#incident-response)
- [Performance Tuning](#performance-tuning)

## Daily Operations

### Health Checks

```bash
# Basic health check
curl https://api.your-domain.com/healthz

# Expected: {"status":"ok","timestamp":1736937000000}

# Readiness check (includes dependencies)
curl https://api.your-domain.com/readyz

# Expected: {"status":"ok","redis":"ok","timestamp":1736937000000}
```

### Log Monitoring

```bash
# View real-time logs (Docker)
docker logs -f gateway --tail=100

# Search for errors
docker logs gateway | grep -i error

# Filter by request ID
docker logs gateway | grep "requestId.*abc123"

# Check audit logs
tail -f logs/audit-logs.json | jq
```

### Metrics to Monitor

**System Metrics**:
- CPU usage: < 70%
- Memory usage: < 80%
- Disk I/O: < 80%

**Application Metrics**:
- Request rate: Expected 100-500 req/s
- Response time P95: < 200ms
- Error rate (5xx): < 0.1%
- Rate limit hits: Monitor for spikes

**Redis Metrics**:
- Memory usage: < 80%
- Connected clients: < 1000
- Command rate: Expected 500-2000 ops/s

## Monitoring

### Dashboard Queries

#### Error Rate (Prometheus)
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

#### P95 Response Time
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

#### Rate Limit Hits
```promql
rate(rate_limit_exceeded_total[5m])
```

#### Failed Login Attempts
```promql
increase(login_failures_total[15m])
```

### Alerts

#### Critical Alerts
- **Service Down**: All instances unreachable
- **High Error Rate**: 5xx > 5% for 5 minutes
- **Redis Down**: Connection failures
- **Disk Full**: > 90% usage

#### Warning Alerts
- **High CPU**: > 70% for 10 minutes
- **High Memory**: > 80% for 10 minutes
- **Slow Responses**: P95 > 500ms for 5 minutes
- **High Rate Limit Hits**: > 100 req/s blocked

## Common Tasks

### Restart Service

```bash
# Docker Compose
docker compose restart gateway

# Docker Swarm
docker service update --force gateway

# Kubernetes
kubectl rollout restart deployment/api-gateway

# Verify restart
curl https://api.your-domain.com/healthz
```

### Scale Service

```bash
# Docker Swarm
docker service scale gateway=5

# Kubernetes
kubectl scale deployment/api-gateway --replicas=5

# Auto-scaling (Kubernetes)
kubectl autoscale deployment/api-gateway --min=3 --max=10 --cpu-percent=70

# Verify scaling
kubectl get pods -l app=api-gateway
```

### Update Configuration

```bash
# 1. Update environment variables
vi production.env

# 2. Recreate service with new config
docker compose up -d --force-recreate gateway

# 3. Verify configuration
curl https://api.your-domain.com/healthz

# 4. Check logs for errors
docker logs gateway --tail=50
```

### Rotate JWT Keys

```bash
# 1. Generate new key pair
openssl genrsa -out keys/private-new.pem 2048
openssl rsa -in keys/private-new.pem -pubout -out keys/public-new.pem

# 2. Update secrets (Kubernetes example)
kubectl create secret generic jwt-keys-new \
  --from-file=private=keys/private-new.pem \
  --from-file=public=keys/public-new.pem

# 3. Update deployment to use new keys
kubectl set env deployment/api-gateway JWT_KEYS_SECRET=jwt-keys-new

# 4. Wait for token expiration (7 days for refresh tokens)
# During this period, both old and new keys should work

# 5. Remove old keys
kubectl delete secret jwt-keys-old
```

### Clear Rate Limits

```bash
# Clear all rate limit data (use with caution!)
redis-cli --scan --pattern "ratelimit:*" | xargs redis-cli del

# Clear rate limit for specific IP
redis-cli del "ratelimit:global:192.168.1.100"

# Clear rate limit for specific user
redis-cli del "ratelimit:user:user-123"
```

### Unlock Account

```bash
# Find lockout key
redis-cli keys "lockout:*username*"

# Remove lockout
redis-cli del "lockout:username:192.168.1.100"

# Verify removal
redis-cli exists "lockout:username:192.168.1.100"
# Expected: 0
```

### Revoke Refresh Token

```bash
# Revoke specific token by JTI
redis-cli setex "token:blacklist:<jti>" 604800 "1"

# Revoke all tokens for user (requires list of JTIs)
# Query tokens for user
redis-cli keys "token:user:user-123"

# Revoke each
redis-cli setex "token:blacklist:<jti1>" 604800 "1"
redis-cli setex "token:blacklist:<jti2>" 604800 "1"
```

## Incident Response

### High Error Rate (5xx)

**Symptoms**: Increased 5xx responses, slow performance

**Investigation**:
```bash
# 1. Check logs for errors
docker logs gateway | grep -i "error\|exception" | tail -50

# 2. Check upstream services
curl http://mock-service:4000/healthz

# 3. Check Redis connection
redis-cli -h redis.your-domain.com -p 6379 ping

# 4. Check resource usage
docker stats gateway
```

**Resolution**:
- If upstream down: Enable circuit breaker or failover
- If Redis down: Restart Redis, check persistence
- If high CPU/memory: Scale horizontally
- If code error: Rollback to previous version

### Brute Force Attack

**Symptoms**: High rate of failed login attempts, lockout alerts

**Investigation**:
```bash
# 1. Check audit logs for login failures
jq 'select(.eventType=="LOGIN_FAILURE")' logs/audit-logs.json | tail -20

# 2. Identify attacking IPs
jq -r 'select(.eventType=="LOGIN_FAILURE") | .ip' logs/audit-logs.json \
  | sort | uniq -c | sort -rn | head -10

# 3. Check rate limit hits
redis-cli keys "ratelimit:*" | wc -l
```

**Resolution**:
```bash
# 1. Block attacking IPs at firewall/WAF level
# AWS example:
aws ec2 create-network-acl-entry \
  --network-acl-id acl-xxxxx \
  --ingress \
  --rule-number 100 \
  --protocol tcp \
  --port-range From=443,To=443 \
  --cidr-block 192.168.1.0/24 \
  --rule-action deny

# 2. Reduce rate limit temporarily
export RATE_LIMIT_AUTH_MAX=3
docker compose up -d --force-recreate gateway

# 3. Enable CAPTCHA (if implemented)

# 4. Review audit logs for compromised accounts
jq 'select(.eventType=="LOGIN_SUCCESS")' logs/audit-logs.json \
  | jq -r '.username' | sort | uniq -c | sort -rn
```

### DDoS Attack

**Symptoms**: Extremely high request rate, service degradation

**Investigation**:
```bash
# 1. Check request rate
docker logs gateway | grep "Incoming request" | wc -l

# 2. Identify top IPs
docker logs gateway \
  | jq -r 'select(.msg=="Incoming request") | .ip' \
  | sort | uniq -c | sort -rn | head -20

# 3. Check rate limit effectiveness
redis-cli get "ratelimit:global:*" | wc -l
```

**Resolution**:
```bash
# 1. Enable DDoS protection at CDN/WAF level
# Cloudflare, AWS Shield, etc.

# 2. Reduce global rate limits
export RATE_LIMIT_GLOBAL_MAX=50
docker compose up -d --force-recreate gateway

# 3. Enable challenge pages (Cloudflare)

# 4. Scale horizontally if legitimate traffic
kubectl scale deployment/api-gateway --replicas=10
```

### Memory Leak

**Symptoms**: Gradually increasing memory usage, eventual OOM

**Investigation**:
```bash
# 1. Monitor memory over time
while true; do
  docker stats gateway --no-stream | grep gateway
  sleep 60
done

# 2. Generate heap snapshot
docker exec gateway kill -SIGUSR2 1

# 3. Analyze heap dump
node --inspect-brk dist/main.js
# Use Chrome DevTools to analyze
```

**Resolution**:
```bash
# 1. Restart affected instances
kubectl rollout restart deployment/api-gateway

# 2. Set memory limits
kubectl set resources deployment/api-gateway \
  --limits=memory=512Mi \
  --requests=memory=256Mi

# 3. Enable automatic restart on high memory
# Add to deployment spec
livenessProbe:
  httpGet:
    path: /healthz
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Redis Connection Loss

**Symptoms**: 503 errors, "Redis connection error" logs

**Investigation**:
```bash
# 1. Check Redis status
redis-cli -h redis.your-domain.com ping

# 2. Check network connectivity
telnet redis.your-domain.com 6379

# 3. Check Redis logs
docker logs redis

# 4. Check authentication
redis-cli -h redis.your-domain.com -a <password> ping
```

**Resolution**:
```bash
# 1. Restart Redis if hung
docker compose restart redis

# 2. Check Redis persistence
redis-cli config get dir
redis-cli config get dbfilename
ls -lh /data/dump.rdb

# 3. Restore from backup if corrupted
redis-cli shutdown save
cp /backup/dump-latest.rdb /data/dump.rdb
docker compose up -d redis

# 4. Verify gateway reconnects
docker logs gateway | grep "Redis connected"
```

## Performance Tuning

### Optimize Rate Limiting

```env
# Adjust based on legitimate traffic patterns
# Conservative (strict):
RATE_LIMIT_GLOBAL_MAX=50
RATE_LIMIT_GLOBAL_WINDOW=60000

# Moderate:
RATE_LIMIT_GLOBAL_MAX=100
RATE_LIMIT_GLOBAL_WINDOW=60000

# Permissive (high traffic):
RATE_LIMIT_GLOBAL_MAX=500
RATE_LIMIT_GLOBAL_WINDOW=60000
```

### Optimize Redis

```bash
# Redis configuration tuning
redis-cli config set maxmemory 1gb
redis-cli config set maxmemory-policy allkeys-lru

# Enable persistence
redis-cli config set save "900 1 300 10 60 10000"

# Set eviction policy
redis-cli config set maxmemory-policy volatile-lru
```

### Optimize Node.js

```bash
# Set appropriate heap size
NODE_OPTIONS="--max-old-space-size=512"  # 512MB heap

# Enable cluster mode (multi-core)
pm2 start dist/main.js -i max  # Use all CPU cores
```

### Load Testing

```bash
# Install tools
npm install -g autocannon

# Basic load test
autocannon -c 100 -d 30 https://api.your-domain.com/healthz

# Auth endpoint test
autocannon -c 10 -d 30 \
  -m POST \
  -H "Content-Type: application/json" \
  -b '{"username":"test","password":"test"}' \
  https://api.your-domain.com/auth/login

# Expected metrics:
# - Requests/sec: > 1000
# - Latency P95: < 200ms
# - Errors: < 0.1%
```

### Benchmark Results

**Hardware**: 2 CPU cores, 4GB RAM, SSD

| Endpoint | Req/s | P50 | P95 | P99 |
|----------|-------|-----|-----|-----|
| /healthz | 5000 | 5ms | 10ms | 20ms |
| /auth/login | 500 | 50ms | 100ms | 150ms |
| /reports/:id | 1000 | 20ms | 50ms | 100ms |

## Maintenance Windows

### Planned Maintenance Procedure

**Before Maintenance**:
```bash
# 1. Notify users (status page)
# 2. Schedule during low traffic (e.g., 2-4 AM)
# 3. Prepare rollback plan
# 4. Backup Redis data
redis-cli --rdb /backup/pre-maintenance-$(date +%Y%m%d).rdb
```

**During Maintenance**:
```bash
# 1. Enable maintenance mode (return 503 with Retry-After)
# 2. Wait for in-flight requests to complete
# 3. Perform updates
# 4. Run smoke tests
curl https://api.your-domain.com/healthz
# 5. Gradually restore traffic
```

**After Maintenance**:
```bash
# 1. Monitor error rates
# 2. Check performance metrics
# 3. Review logs for issues
# 4. Update status page
# 5. Document changes
```

## Backup & Recovery

### Backup Schedule

**Automated Backups**:
```bash
# Cron job (daily at 2 AM)
0 2 * * * /scripts/backup-redis.sh

# backup-redis.sh:
#!/bin/bash
DATE=$(date +%Y%m%d)
redis-cli --rdb /backup/dump-$DATE.rdb
# Keep last 7 days
find /backup -name "dump-*.rdb" -mtime +7 -delete
```

**Manual Backup**:
```bash
# Create backup
redis-cli save
cp /data/dump.rdb /backup/manual-$(date +%Y%m%d-%H%M).rdb

# Verify backup
redis-cli --rdb /backup/manual-*.rdb check
```

### Recovery Procedure

```bash
# 1. Stop gateway (prevent writes)
docker compose stop gateway

# 2. Stop Redis
docker compose stop redis

# 3. Restore backup
cp /backup/dump-20250115.rdb /data/dump.rdb

# 4. Start Redis
docker compose up -d redis

# 5. Verify data
redis-cli keys "*" | wc -l

# 6. Start gateway
docker compose up -d gateway

# 7. Verify operation
curl https://api.your-domain.com/healthz
```

## Contact Information

**On-Call Rotation**:
- Primary: DevOps Team (oncall@example.com)
- Secondary: Platform Engineering (platform@example.com)
- Escalation: Engineering Manager

**External Contacts**:
- Cloud Provider Support: support@provider.com
- Redis Support: support@redis.com

**Emergency Procedures**:
1. Page on-call via PagerDuty
2. Join incident Slack channel #incidents
3. Update status page
4. Follow incident response playbook
