#!/usr/bin/env node

/**
 * Build Docker image for HearthVTT
 * 1. Checks Docker availability
 * 2. Builds the Docker image with --no-cache
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
const useCache = args.includes('--cache');

console.log('Building HearthVTT Docker image...');
console.log('');

// Check if Docker is available and daemon is running
try {
  execSync('docker info', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ Docker is not available or not running.');
  console.error('');
  console.error('Please ensure Docker Desktop is installed and running:');
  console.error('  - Windows/Mac: Start Docker Desktop application');
  console.error(
    '  - Linux: Ensure Docker daemon is running (sudo systemctl start docker)',
  );
  console.error('');
  console.error(
    'Download Docker Desktop: https://www.docker.com/products/docker-desktop/',
  );
  process.exit(1);
}

console.log('Note: Client and server will be built inside Docker.');
console.log('');

// Build Docker image (builds happen inside Docker)
const cacheFlag = useCache ? '' : '--no-cache ';
console.log(
  `Building Docker image ${useCache ? '(with cache)' : '(with --no-cache)'}...`,
);
execSync(`docker build ${cacheFlag}-t hearth-vtt .`, {
  cwd: projectRoot,
  stdio: 'inherit',
});

console.log('');
console.log('Docker image build complete!');
console.log('');
console.log('To run:');
console.log('  npm run docker:up');
console.log('');
console.log('Tip: For faster rebuilds during development, use:');
console.log('  node scripts/build-docker.js --cache');
