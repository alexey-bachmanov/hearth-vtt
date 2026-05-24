import fs from 'fs/promises';
import path from 'path';

/**
 * Ensure the data directory and required subdirectories exist.
 */
export async function ensureDataDir(dataDir: string): Promise<void> {
  const subdirs = [
    'db', // SQLite database file (hearth.db)
  ];

  // Create main data dir
  await fs.mkdir(dataDir, { recursive: true });

  // Create subdirectories
  for (const subdir of subdirs) {
    await fs.mkdir(path.join(dataDir, subdir), { recursive: true });
  }
}
