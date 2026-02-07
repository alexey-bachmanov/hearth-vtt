#!/usr/bin/env node

/**
 * Build Docker image for HearthVTT
 * 1. Builds the client
 * 2. Builds the Docker image with --no-cache
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

console.log('Building HearthVTT Docker image...');
console.log('');
console.log('Note: Client and server will be built inside Docker.');
console.log('');

// Build Docker image (builds happen inside Docker)
console.log('Building Docker image (with --no-cache)...');
execSync('docker build --no-cache -t hearth-vtt .', {
  cwd: projectRoot,
  stdio: 'inherit',
});

console.log('');
console.log('Docker image build complete!');
console.log('');
console.log('To run:');
console.log('  npm run docker:up');
