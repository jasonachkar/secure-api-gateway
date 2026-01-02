# Quick Self-Hosting Guide

Fastest way to self-host your backend.

## Prerequisites

- Linux server (Ubuntu/Debian recommended)
- SSH access
- Root or sudo access

## Option 1: Docker (5 minutes) ⭐ Easiest

```bash
# 1. Install Docker
sudo apt update
sudo apt install docker.io docker-compose -y

# 2. Clone repo
git clone <your-repo-url>
cd secure-api-gateway

# 3. Create .env file
nano .env
# Add: NODE_ENV=production, PORT=3000, REDIS_HOST=redis, JWT_SECRET=..., COOKIE_SECRET=...

# 4. Start everything
docker-compose up -d

# 5. Test
curl http://localhost:3000/healthz
```

**Done!** Your API is running at `http://your-server-ip:3000`

## Option 2: Native Node.js (10 minutes)

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install Redis
sudo apt install redis-server -y
sudo systemctl start redis

# 3. Clone and build
git clone <your-repo-url>
cd secure-api-gateway
npm install
npm run build

# 4. Create .env file
nano .env
# Add all environment variables

# 5. Run
npm start
```

## Access from Internet

**If you have public IP:**
- API: `http://your-server-ip:3000`

**If behind router:**
1. Forward port 3000 in router
2. Use public IP or domain

**With domain + HTTPS:**
1. Point DNS to your server IP
2. Install Caddy (auto HTTPS):
   ```bash
   sudo apt install caddy
   sudo nano /etc/caddy/Caddyfile
   # Add: api.yourdomain.com { reverse_proxy localhost:3000 }
   sudo systemctl restart caddy
   ```

## Firewall

```bash
sudo ufw allow 22,80,443,3000/tcp
sudo ufw enable
```

## That's It! 🎉

Your backend is self-hosted. Update frontend:
```
VITE_API_URL=http://your-server-ip:3000
# or
VITE_API_URL=https://api.yourdomain.com
```

For detailed guide, see `SELF_HOSTING.md`

