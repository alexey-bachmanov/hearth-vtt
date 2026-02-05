import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { Storage } from './storage/storage.js';

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
  });

  // Register WebSocket support
  await server.register(fastifyWebsocket);

  // Health check endpoint
  server.get('/healthz', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Campaign API endpoints
  server.get('/api/campaigns', async () => {
    const campaigns = await options.storage.listCampaigns();
    return { campaigns };
  });

  server.get<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    const campaign = await options.storage.getCampaign(request.params.id);
    if (!campaign) {
      reply.code(404);
      return { error: 'Campaign not found' };
    }
    return { campaign };
  });

  server.post<{ Body: { name: string } }>('/api/campaigns', async (request, reply) => {
    const { name } = request.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      reply.code(400);
      return { error: 'Campaign name is required' };
    }
    const campaign = await options.storage.createCampaign(name.trim());
    reply.code(201);
    return { campaign };
  });

  server.delete<{ Params: { id: string } }>('/api/campaigns/:id', async (request, reply) => {
    const campaign = await options.storage.getCampaign(request.params.id);
    if (!campaign) {
      reply.code(404);
      return { error: 'Campaign not found' };
    }
    await options.storage.deleteCampaign(request.params.id);
    reply.code(204);
    return;
  });

  // WebSocket endpoint for realtime communication
  server.get('/ws', { websocket: true }, (socket, req) => {
    server.log.info('WebSocket client connected');

    // Send welcome message
    socket.send(
      JSON.stringify({ type: 'welcome', payload: { version: '0.1.0' } }),
    );

    socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle ping/pong
        if (data.type === 'ping') {
          socket.send(
            JSON.stringify({
              type: 'pong',
              payload: { timestamp: Date.now() },
            }),
          );
        }
      } catch (err) {
        server.log.warn('Invalid WebSocket message received');
      }
    });

    socket.on('close', () => {
      server.log.info('WebSocket client disconnected');
    });
  });

  // Serve static files from client/dist
  const clientDistPath = findClientDist();
  await server.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/',
  });

  return server;
}
