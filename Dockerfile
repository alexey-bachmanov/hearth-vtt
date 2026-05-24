# Build stage for shared package
FROM node:22-alpine AS shared-builder

WORKDIR /app
# Copy all package.json files for workspace resolution
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci --workspace=shared

COPY shared/ ./shared/
RUN npm run build --workspace=shared

# Build stage for client
FROM node:22-alpine AS client-builder

WORKDIR /app
# Copy all package.json files for workspace resolution
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci --workspace=client
COPY --from=shared-builder /app/shared ./shared

COPY client/ ./client/
RUN npm run build --workspace=client

# Build stage for server
FROM node:22-alpine AS server-builder

WORKDIR /app
# Copy all package.json files for workspace resolution
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/
RUN npm ci --workspace=server
COPY --from=shared-builder /app/shared ./shared

COPY server/ ./server/
RUN npm run build --workspace=server

# Native module builder stage (for better-sqlite3)
FROM node:22-alpine AS native-builder

# Install build tools for native compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app
# Copy all package.json files for workspace resolution
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install production dependencies (this compiles better-sqlite3)
RUN npm ci --workspace=server --omit=dev
# Copy shared dist so the workspace symlink resolves at runtime
COPY --from=shared-builder /app/shared/dist ./shared/dist

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy all package.json files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Copy production node_modules with compiled native modules from builder
# Note: npm workspaces hoist dependencies to root node_modules
COPY --from=native-builder /app/node_modules ./node_modules

# Copy built artifacts
COPY --from=client-builder /app/client/dist ./client/dist
COPY --from=server-builder /app/server/dist ./server/dist
# Copy shared dist so the workspace symlink in node_modules resolves at runtime
COPY --from=shared-builder /app/shared/dist ./shared/dist

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
