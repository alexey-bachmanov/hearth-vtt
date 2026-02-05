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
import { seatRoutes } from './routes/seats.js';
import { inviteRoutes } from './routes/invites.js';
import { sessionRoutes } from './routes/sessions.js';
import { wsRoutes } from './routes/ws.js';

// Handle both ESM (development) and CJS (bundled) environments
const currentDir =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

/**
 * Find the client dist directory by trying multiple candidate paths
 * This makes the server work across different deployment scenarios:
 * - Development (from server/dist/)
 * - Docker (from /app/)
 * - Native executable (from dist-exe/)
 */
function findClientDist(): string {
  const candidates = [
    // 1. Explicit environment override
    process.env.CLIENT_DIST_PATH,
    // 2. Relative to executable path (for native exe)
    path.join(path.dirname(process.execPath), 'client', 'dist'),
    // 3. Relative to current working directory (for Docker and some runtimes)
    path.join(process.cwd(), 'client', 'dist'),
    // 4. Relative to this file (for development)
    path.resolve(currentDir, '../../client/dist'),
  ];

  console.log('DEBUG: Looking for client dist directory...');
  console.log('DEBUG: process.execPath =', process.execPath);
  console.log('DEBUG: process.cwd() =', process.cwd());
  console.log('DEBUG: currentDir =', currentDir);

  for (const candidate of candidates) {
    console.log(
      'DEBUG: Trying candidate:',
      candidate,
      '| exists:',
      candidate && existsSync(candidate),
    );
    if (candidate && existsSync(candidate)) {
      console.log('DEBUG: Found client dist at:', candidate);
      return candidate;
    }
  }

  throw new Error(
    `Could not find client dist directory. Tried:\n${candidates.filter(Boolean).join('\n')}`,
  );
}

export interface ServerOptions {
  dataDir: string;
  storage: Storage;
  logger?: FastifyServerOptions['logger'];
}

export async function buildServer(
  options: ServerOptions,
): Promise<FastifyInstance> {
  const server = Fastify({
    logger: options.logger ?? true,
  });

  // Register CORS support
  await server.register(fastifyCors, {
    origin: true, // Allow all origins in development
    credentials: true, // Allow cookies
  });

  // Register cookie support for auth
  await server.register(fastifyCookie);

  // Register WebSocket support
  await server.register(fastifyWebsocket);

  // Register route modules
  await healthRoutes(server);
  await campaignRoutes(server, { storage: options.storage });
  await authRoutes(server);
  await seatRoutes(server);
  await inviteRoutes(server);
  await sessionRoutes(server);
  await wsRoutes(server);

  // Serve static files from client/dist
  const clientDistPath = findClientDist();
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

  return server;
}
