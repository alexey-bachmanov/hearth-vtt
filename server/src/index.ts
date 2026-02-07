import 'dotenv/config';
import { buildServer } from './server.js';
import { ensureDataDir } from './storage/ensure-dirs.js';
import { Storage } from './storage/index.js';
import { ensureServerAdminSetup } from './auth/setup-pin.js';
import { startRateLimitCleanup } from './routes/admin-auth.js';
import type { FastifyInstance } from 'fastify';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = process.env.DATA_DIR || './data';

async function main() {
  // Ensure data directory exists
  await ensureDataDir(DATA_DIR);

  // Initialize storage
  const storage = new Storage(DATA_DIR);
  await storage.init();

  // Ensure server admin setup is complete
  // If no admin exists, generates setup PIN and displays instructions
  await ensureServerAdminSetup(storage, DATA_DIR, HOST, PORT);

  // Build and start server
  const server = await buildServer({
    dataDir: DATA_DIR,
    storage,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  // Start rate limit cleanup (runs hourly)
  const rateLimitCleanupInterval = startRateLimitCleanup();

  // Clean up expired admin sessions every hour
  let sessionCleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Graceful shutdown handler.
   * Cleans up resources and closes connections before exit.
   */
  async function shutdown(signal: string) {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    try {
      // Clear cleanup intervals
      if (rateLimitCleanupInterval) {
        clearInterval(rateLimitCleanupInterval);
      }
      if (sessionCleanupInterval) {
        clearInterval(sessionCleanupInterval);
      }

      // Close Fastify server (stops accepting new connections)
      await server.close();
      console.log('Server closed successfully');

      // Close storage connections (will be implemented in next step)
      // await storage.close();

      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  }

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`HearthVTT server listening on http://${HOST}:${PORT}`);

    sessionCleanupInterval = setInterval(
      async () => {
        try {
          await storage.cleanupExpiredAdminSessions();
          server.log.info('Cleaned up expired admin sessions');
        } catch (err) {
          server.log.error(err, 'Failed to clean up expired admin sessions');
        }
      },
      60 * 60 * 1000,
    ); // Run every hour
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
