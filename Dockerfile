# Multi-stage build for production-optimized image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production image
FROM node:20-alpine

# Install security updates
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create directories for runtime data
RUN mkdir -p /app/logs /app/keys && \
    chown -R nodejs:nodejs /app/logs /app/keys

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/main.js"]
