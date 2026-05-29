import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { Storage } from './storage/storage.js';
import { healthRoutes } from './routes/health.js';
import { campaignRoutes } from './routes/campaigns.js';
import { authRoutes } from './routes/auth.js';
import { adminAuthRoutes } from './routes/admin-auth.js';
import { seatRoutes } from './routes/seats.js';
import { inviteRoutes } from './routes/invites.js';
import { sessionRoutes } from './routes/sessions.js';
import { wsRoutes } from './routes/ws.js';
import { CampaignManager } from './domain/engine/index.js';

// Handle both ESM (development) and CJS (bundled) environments
const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the client dist directory by trying multiple candidate paths
 * This makes the server work across different deployment scenarios:
 * - Development (from server/dist/) - returns null if not found in dev mode
 * - Docker (from /app/)
 * - Native executable (from dist-exe/)
 */
function findClientDist(): string | null {
  // In development mode with Vite, skip static file serving
  if (process.env.NODE_ENV === 'development') {
    return null;
  }

  const candidates = [
    // 1. Explicit environment override
    process.env.CLIENT_DIST_PATH,
    // 2. Relative to executable path (for native exe)
    path.join(path.dirname(process.execPath), 'client', 'dist'),
    // 3. Relative to current working directory (for Docker and some runtimes)
    path.join(process.cwd(), 'client', 'dist'),
    // 4. Relative to this file (for production builds)
    path.resolve(currentDir, '../../client/dist'),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Could not find client dist directory. Tried:\n${candidates.filter(Boolean).join('\n')}`,
  );
}

/**
 * Parses TRUST_PROXY environment variable into Fastify trustProxy configuration.
 *
 * Supports:
 * - "true" -> trust all proxies
 * - "false" or undefined -> trust no proxies
 * - Number string (e.g., "1") -> trust N hops
 * - Comma-separated IPs (e.g., "10.0.0.1,10.0.0.2") -> trust specific IPs
 *
 * @param value - TRUST_PROXY environment variable value
 * @returns Fastify trustProxy configuration
 */
export function parseTrustProxy(
  value: string | undefined,
): boolean | number | string | string[] {
  if (!value || value === 'false') {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  // Try parsing as number (e.g., "1" means trust 1 hop)
  const asNumber = parseInt(value, 10);
  if (!isNaN(asNumber) && asNumber.toString() === value) {
    return asNumber;
  }

  // Check if comma-separated list of IPs
  if (value.includes(',')) {
    return value.split(',').map((ip) => ip.trim());
  }

  // Single IP address or other string value
  return value;
}

export interface ServerOptions {
  dataDir: string;
  storage: Storage;
  logger?: FastifyServerOptions['logger'];
}

export async function buildServer(
  options: ServerOptions,
): Promise<FastifyInstance> {
  // Configure proxy trust for rate limiting and IP detection behind load balancers
  const trustProxyConfig = parseTrustProxy(process.env.TRUST_PROXY);

  const server = Fastify({
    logger: options.logger ?? true,
    trustProxy: trustProxyConfig,
  });

  // Register CORS support
  // Security: Restrict to same-origin and PUBLIC_BASE_URL to prevent CSRF
  await server.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, Postman, curl, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Allow PUBLIC_BASE_URL if configured (for hosted deployments)
      const publicBaseUrl = process.env.PUBLIC_BASE_URL;
      if (publicBaseUrl) {
        try {
          const allowedOrigin = new URL(publicBaseUrl).origin;
          if (origin === allowedOrigin) {
            callback(null, true);
            return;
          }
        } catch (_err) {
          // Invalid PUBLIC_BASE_URL, ignore and continue
        }
      }

      // Allow localhost origins in development
      if (process.env.NODE_ENV !== 'production') {
        try {
          const originUrl = new URL(origin);
          if (
            originUrl.hostname === 'localhost' ||
            originUrl.hostname === '127.0.0.1' ||
            originUrl.hostname === '[::1]'
          ) {
            callback(null, true);
            return;
          }
        } catch (_err) {
          // Invalid origin URL, reject below
        }
      }

      // Reject all other origins
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true, // Allow cookies
  });

  // Register cookie support for auth
  // COOKIE_SECRET is ensured to exist by env-local.ts during startup
  await server.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET!,
  });

  // Register WebSocket support
  await server.register(fastifyWebsocket);

  // Apply localhost restriction to admin routes by default
  // Security measure: Admin routes only accessible from localhost unless ADMIN_ALLOW_REMOTE=true
  server.addHook('preHandler', async (request, reply) => {
    const allowRemote = process.env.ADMIN_ALLOW_REMOTE === 'true';

    // Only apply restriction to admin routes
    if (!request.url.startsWith('/api/admin/')) {
      return;
    }

    // If remote access is explicitly allowed, skip check
    if (allowRemote) {
      return;
    }

    // Check if request is from localhost
    const clientIp = request.ip;
    const isLocalhost =
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1' ||
      clientIp === 'localhost';

    if (!isLocalhost) {
      reply.code(403);
      return reply.send({
        error: {
          code: 'REMOTE_ACCESS_DENIED',
          message:
            'Admin routes are restricted to localhost. To allow remote access, set ADMIN_ALLOW_REMOTE=true environment variable (not recommended without reverse proxy with TLS).',
        },
      });
    }
  });

  // Register route modules
  await healthRoutes(server);
  await adminAuthRoutes(server, {
    storage: options.storage,
    dataDir: options.dataDir,
  });
  await campaignRoutes(server, { storage: options.storage });
  await authRoutes(server, { storage: options.storage });
  await seatRoutes(server, { storage: options.storage });
  await inviteRoutes(server, { storage: options.storage });
  await sessionRoutes(server);
  const campaignManager = new CampaignManager(options.storage, server.log);
  server.addHook('onClose', async () => {
    await campaignManager.closeAll();
  });

  await wsRoutes(server, { storage: options.storage, campaignManager });

  // Serve static files from client/dist (only in production)
  // In development, Vite serves the client on a separate port
  const clientDistPath = findClientDist();
  if (clientDistPath) {
    await server.register(fastifyStatic, {
      root: clientDistPath,
      prefix: '/',
    });

    // SPA fallback: serve index.html for any non-API, non-ws routes
    // This must be registered AFTER static files
    server.setNotFoundHandler(async (request, reply) => {
      const { url } = request;

      // Don't handle API routes, WebSocket, or health checks
      if (
        url.startsWith('/api/') ||
        url.startsWith('/ws') ||
        url === '/healthz' ||
        url === '/health'
      ) {
        reply.code(404);
        return {
          error: {
            code: 'NOT_FOUND',
            message: 'Route not found',
          },
        };
      }

      // Serve index.html for client-side routing
      reply.type('text/html');
      return reply.sendFile('index.html');
    });
  } else {
    // In dev mode, return 404 for non-API routes
    // Client is served by Vite on a different port
    server.setNotFoundHandler(async (request, reply) => {
      reply.code(404);
      return {
        error: {
          code: 'NOT_FOUND',
          message:
            'Route not found - in development mode, access client at http://localhost:5173',
        },
      };
    });
  }

  return server;
}
