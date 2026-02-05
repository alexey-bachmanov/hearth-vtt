# Build stage for client
FROM node:20-alpine AS client-builder

WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci --workspace=client

COPY client/ ./client/
RUN npm run build --workspace=client

# Build stage for server
FROM node:20-alpine AS server-builder

WORKDIR /app
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --workspace=server

COPY server/ ./server/
RUN npm run build --workspace=server

# Production stage
FROM node:20-alpine AS production

# Install build dependencies for better-sqlite3 (native module)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for production install
COPY package*.json ./
COPY server/package*.json ./server/

# Install production dependencies only
RUN npm ci --workspace=server --omit=dev

# Copy built artifacts
COPY --from=client-builder /app/client/dist ./client/dist
COPY --from=server-builder /app/server/dist ./server/dist

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Run as non-root user
RUN addgroup -g 1001 -S hearth && adduser -S hearth -u 1001
RUN chown -R hearth:hearth /app
USER hearth

# Start the server
CMD ["node", "server/dist/index.js"]
