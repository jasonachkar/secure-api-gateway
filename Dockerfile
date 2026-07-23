# Multi-stage build for production-optimized image
# Deployment target: Azure Container Apps (see terraform/modules/container-app).
# Listens on $PORT (default 3000); the Terraform module's ingress target_port must match.
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (for better layer caching)
# Explicitly copy both package.json and package-lock.json for npm ci
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
# Use npm ci for reproducible builds
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

# Install security updates and dumb-init for proper signal handling
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
# Explicitly copy both package.json and package-lock.json for npm ci
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf /tmp/*

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create directories for runtime data
RUN mkdir -p /app/logs /app/keys && \
    chown -R nodejs:nodejs /app/logs /app/keys

# Switch to non-root user
USER nodejs

# Expose port (matches the Container Apps ingress target_port)
EXPOSE 3000

# Container-level health check. Azure Container Apps uses its own HTTP probes
# (configured in terraform/modules/container-app) against the same /healthz and
# /readyz endpoints; this HEALTHCHECK covers plain `docker run`/docker-compose use.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly (important for graceful shutdowns/rollouts)
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/main.js"]
