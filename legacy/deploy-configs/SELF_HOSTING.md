# Self-Hosting Guide

Complete guide for hosting the Secure API Gateway backend on your own server, VPS, or computer.

## Requirements

- **Server**: VPS, dedicated server, or your own computer
- **OS**: Linux (Ubuntu/Debian recommended), macOS, or Windows
- **Node.js**: 20+ installed
- **Redis**: Installed and running
- **Docker** (optional): For easier deployment
- **Domain name** (optional): Or use IP address
- **Port forwarding** (if behind router): Forward port 3000

---

## Option 1: Docker (Recommended - Easiest)

Docker is the easiest way to self-host everything together.

### Prerequisites

Install Docker and Docker Compose:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose -y
sudo systemctl start docker
sudo systemctl enable docker

# macOS
brew install docker docker-compose

# Or download Docker Desktop: https://www.docker.com/products/docker-desktop
```

### Step 1: Clone Repository

```bash
git clone <your-repo-url>
cd secure-api-gateway
```

### Step 2: Configure Environment

Create `.env` file:

```bash
cp .env.example .env  # If you have one
# Or create new:
nano .env
```

Add these variables:

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Redis (Docker Compose will create this)
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_ALGORITHM=HS256
JWT_SECRET=<generate-secret>
COOKIE_SECRET=<generate-secret>
BCRYPT_ROUNDS=12

# CORS (your frontend URL or * for all)
CORS_ORIGIN=https://your-dashboard.vercel.app,http://your-server-ip:3000

# Features
ENABLE_SWAGGER=false
LOG_LEVEL=info
LOG_PRETTY=false
```

Generate secrets:
```bash
node scripts/generate-secrets.js
```

### Step 3: Start with Docker Compose

Your `docker-compose.yml` is already configured! Just run:

```bash
docker-compose up -d
```

This starts:
- ✅ Backend API Gateway
- ✅ Redis
- ✅ Mock service (optional)

### Step 4: Verify

```bash
# Check services
docker-compose ps

# Check logs
docker-compose logs -f gateway

# Test health
curl http://localhost:3000/healthz
```

### Step 5: Access from Internet

**If you have a public IP:**
- Your API: `http://your-server-ip:3000`

**If behind router/NAT:**
1. Forward port 3000 in your router
2. Use your public IP or domain name

**With domain name:**
1. Point DNS A record to your server IP
2. Use reverse proxy (Nginx/Caddy) for HTTPS
3. Access: `https://api.yourdomain.com`

---

## Option 2: Native Node.js (No Docker)

Run directly on your server without Docker.

### Step 1: Install Dependencies

**Ubuntu/Debian:**
```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Redis
sudo apt install redis-server -y
sudo systemctl start redis
sudo systemctl enable redis

# Verify
node --version  # Should be 20+
redis-cli ping  # Should return PONG
```

**macOS:**
```bash
brew install node@20 redis
brew services start redis
```

**Windows:**
- Download Node.js from nodejs.org
- Download Redis from redis.io or use WSL

### Step 2: Clone and Build

```bash
git clone <your-repo-url>
cd secure-api-gateway
npm install
npm run build
```

### Step 3: Configure Environment

Create `.env` file:

```bash
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Redis (local)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# JWT
JWT_ALGORITHM=HS256
JWT_SECRET=<generate-secret>
COOKIE_SECRET=<generate-secret>
BCRYPT_ROUNDS=12

# CORS
CORS_ORIGIN=https://your-dashboard.vercel.app,http://your-server-ip:3000

# Features
ENABLE_SWAGGER=false
LOG_LEVEL=info
LOG_PRETTY=false
```

### Step 4: Run

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

**With PM2 (Recommended for Production):**
```bash
# Install PM2
npm install -g pm2

# Start app
pm2 start dist/main.js --name secure-api-gateway

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

---

## Option 3: Systemd Service (Linux)

Run as a system service on Linux.

### Step 1: Create Service File

```bash
sudo nano /etc/systemd/system/secure-api-gateway.service
```

Add:

```ini
[Unit]
Description=Secure API Gateway
After=network.target redis.service

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/secure-api-gateway
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="HOST=0.0.0.0"
Environment="REDIS_HOST=localhost"
Environment="REDIS_PORT=6379"
Environment="JWT_ALGORITHM=HS256"
Environment="JWT_SECRET=your-secret"
Environment="COOKIE_SECRET=your-secret"
# Add all other environment variables
ExecStart=/usr/bin/node /path/to/secure-api-gateway/dist/main.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Step 2: Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable secure-api-gateway
sudo systemctl start secure-api-gateway

# Check status
sudo systemctl status secure-api-gateway

# View logs
sudo journalctl -u secure-api-gateway -f
```

---

## Setting Up HTTPS (Optional but Recommended)

### Option A: Nginx Reverse Proxy

**Install Nginx:**
```bash
sudo apt install nginx -y
```

**Configure:**
```bash
sudo nano /etc/nginx/sites-available/api-gateway
```

Add:
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Enable:**
```bash
sudo ln -s /etc/nginx/sites-available/api-gateway /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**SSL with Let's Encrypt:**
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.yourdomain.com
```

### Option B: Caddy (Easier)

**Install Caddy:**
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

**Create Caddyfile:**
```bash
sudo nano /etc/caddy/Caddyfile
```

Add:
```
api.yourdomain.com {
    reverse_proxy localhost:3000
}
```

**Start:**
```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

Caddy automatically handles HTTPS with Let's Encrypt!

---

## Firewall Configuration

**Ubuntu/Debian (UFW):**
```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Direct API access (optional)
sudo ufw enable
```

**CentOS/RHEL (firewalld):**
```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

---

## Security Best Practices

### 1. Use Non-Root User
```bash
# Create user
sudo adduser api-gateway
sudo usermod -aG docker api-gateway  # If using Docker

# Run as this user
sudo -u api-gateway node dist/main.js
```

### 2. Keep System Updated
```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Use Strong Secrets
```bash
node scripts/generate-secrets.js
```

### 4. Restrict Redis Access
```bash
# Edit /etc/redis/redis.conf
sudo nano /etc/redis/redis.conf

# Add password
requirepass your-strong-redis-password

# Bind to localhost only
bind 127.0.0.1

# Restart Redis
sudo systemctl restart redis
```

### 5. Enable Fail2Ban
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 6. Regular Backups
```bash
# Backup Redis
redis-cli --rdb /backup/redis-$(date +%Y%m%d).rdb

# Backup application
tar -czf /backup/api-gateway-$(date +%Y%m%d).tar.gz /path/to/secure-api-gateway
```

---

## Monitoring

### Option 1: PM2 Monitoring
```bash
pm2 monit
pm2 logs
```

### Option 2: Systemd Logs
```bash
sudo journalctl -u secure-api-gateway -f
```

### Option 3: Docker Logs
```bash
docker-compose logs -f gateway
```

### Option 4: Health Endpoint
```bash
# Monitor with cron
*/5 * * * * curl -f http://localhost:3000/healthz || echo "API down" | mail -s "Alert" your@email.com
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
sudo lsof -i :3000
# or
sudo netstat -tulpn | grep 3000

# Kill process
sudo kill -9 <PID>
```

### Redis Connection Failed
```bash
# Check Redis is running
sudo systemctl status redis
redis-cli ping

# Check Redis logs
sudo journalctl -u redis -f
```

### Service Won't Start
```bash
# Check logs
sudo journalctl -u secure-api-gateway -n 50

# Check environment variables
sudo systemctl show secure-api-gateway

# Test manually
cd /path/to/secure-api-gateway
node dist/main.js
```

### Out of Memory
```bash
# Check memory
free -h

# Increase swap (if needed)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

---

## VPS Providers (If You Need One)

**Free/Cheap Options:**
- **Oracle Cloud**: Free tier (2 VMs, 200GB storage)
- **Google Cloud**: Free tier ($300 credit)
- **AWS**: Free tier (1 year)
- **DigitalOcean**: $4/month (cheapest paid)
- **Linode**: $5/month
- **Vultr**: $2.50/month (cheapest)

**Recommended for Beginners:**
- **DigitalOcean**: Easy setup, good docs
- **Linode**: Simple interface
- **Vultr**: Very cheap, good performance

---

## Quick Start Checklist

- [ ] Server/VPS ready
- [ ] Node.js 20+ installed
- [ ] Redis installed and running
- [ ] Code cloned and built
- [ ] Environment variables configured
- [ ] Secrets generated
- [ ] Service started (Docker/PM2/systemd)
- [ ] Firewall configured
- [ ] Port forwarded (if behind router)
- [ ] HTTPS configured (optional)
- [ ] Monitoring set up
- [ ] Backups configured

---

## Example: Complete Setup on Ubuntu VPS

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Install Redis
sudo apt install redis-server -y
sudo systemctl enable redis
sudo systemctl start redis

# 4. Install Docker (optional)
sudo apt install docker.io docker-compose -y
sudo systemctl enable docker
sudo systemctl start docker

# 5. Clone repo
git clone <your-repo>
cd secure-api-gateway

# 6. Configure
cp .env.example .env
nano .env  # Edit with your values

# 7. Start with Docker
docker-compose up -d

# Or start natively
npm install
npm run build
npm start

# 8. Configure firewall
sudo ufw allow 22,80,443,3000/tcp
sudo ufw enable

# 9. Test
curl http://localhost:3000/healthz
```

---

## Cost Comparison

| Option | Cost | Setup Time | Maintenance |
|--------|------|------------|-------------|
| **Self-Hosted (VPS)** | $2-10/mo | 30 min | Medium |
| **Self-Hosted (Home)** | $0 (electricity) | 1 hour | High |
| **Cloud (Fly.io)** | $0 (free tier) | 10 min | Low |
| **Cloud (Render)** | $0 (free tier) | 5 min | Low |

---

## Summary

**Yes, you can absolutely self-host!** Options:

1. **Docker Compose** (easiest) - Everything in containers
2. **Native Node.js** - Direct installation
3. **Systemd Service** - Production Linux service

**Requirements:**
- Server/VPS or your computer
- Node.js 20+
- Redis
- Port 3000 accessible

**Recommended for:**
- Learning
- Full control
- Cost savings
- Privacy/security

**Not recommended if:**
- You want zero maintenance
- You need automatic scaling
- You want managed infrastructure

---

## Next Steps

1. Choose your hosting method (Docker recommended)
2. Set up server/VPS
3. Follow the guide above
4. Configure HTTPS (optional)
5. Set up monitoring
6. Enjoy your self-hosted API! 🚀

