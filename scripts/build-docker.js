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

// Step 1: Build client
console.log('1. Building client...');
execSync('npm run build:client', { cwd: projectRoot, stdio: 'inherit' });

// Step 2: Build server
console.log('');
console.log('2. Building server...');
execSync('npm run build:server', { cwd: projectRoot, stdio: 'inherit' });

// Step 3: Build Docker image
console.log('');
console.log('3. Building Docker image (with --no-cache)...');
execSync('docker build --no-cache -t hearth-vtt .', {
  cwd: projectRoot,
  stdio: 'inherit',
});

console.log('');
console.log('Docker image build complete!');
console.log('');
console.log('To run:');
console.log('  npm run docker:up');
