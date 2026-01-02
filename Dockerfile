# Multi-stage build for production-optimized image
# Optimized for Fly.io deployment
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

# Expose port (Fly.io will map this)
EXPOSE 3000

# Health check for Fly.io monitoring
# Fly.io uses this to determine if the app is healthy
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly (important for Fly.io graceful shutdowns)
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/main.js"]
