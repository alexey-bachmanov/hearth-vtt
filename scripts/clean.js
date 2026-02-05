#!/usr/bin/env node

/**
 * Clean all build artifacts
 */

import { existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const dirsToClean = [
  join(projectRoot, 'client/dist'),
  join(projectRoot, 'server/dist'),
  join(projectRoot, 'dist-exe'),
];

console.log('Cleaning build artifacts...');

for (const dir of dirsToClean) {
  if (existsSync(dir)) {
    console.log(`  Removing ${dir}`);
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('Clean complete!');
