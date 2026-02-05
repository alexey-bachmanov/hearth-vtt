import 'dotenv/config';
import { buildServer } from './server.js';
import { ensureDataDir } from './storage/ensure-dirs.js';
import { SqliteStorage } from './storage/sqlite-storage.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || './data';

async function main() {
  // Ensure data directory exists
  await ensureDataDir(DATA_DIR);

  // Initialize storage
  const storage = new SqliteStorage({ dataDir: DATA_DIR });
  await storage.init();

  // Build and start server
  const server = await buildServer({
    dataDir: DATA_DIR,
    storage,
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`HearthVTT server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
