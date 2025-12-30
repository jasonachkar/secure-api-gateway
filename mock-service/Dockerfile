# Mock Upstream Service Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci && \
    npm cache clean --force

# Copy source
COPY src ./src

# Build
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built code
COPY --from=builder /app/dist ./dist

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

EXPOSE 4000

CMD ["node", "dist/main.js"]
