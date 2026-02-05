#!/usr/bin/env node

/**
 * Build a native executable for HearthVTT using Node.js SEA (Single Executable Application).
 *
 * Usage: node scripts/build-exe.js [--platform linux|win|darwin]
 *
 * Prerequisites:
 *   - Node.js 20+
 *   - postject: npm install -g postject
 *   - On Windows: may need to run as administrator to modify executables
 *
 * Limitations:
 *   - better-sqlite3 is a native module and must be distributed alongside
 *   - Client assets are NOT embedded (served from ./client/dist relative to exe)
 */

import { execSync, spawnSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readdirSync,
} from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(__dirname, '..');
const projectRoot = join(serverRoot, '..');
const distDir = join(projectRoot, 'dist-exe');

// Parse arguments
const args = process.argv.slice(2);
const targetPlatform = args.includes('--platform')
  ? args[args.indexOf('--platform') + 1]
  : platform();

const exeName = targetPlatform === 'win32' ? 'hearth-vtt.exe' : 'hearth-vtt';

async function main() {
  console.log(`Building HearthVTT executable for ${targetPlatform}...`);
  console.log('');

  // Step 1: Clean and create dist directory
  console.log('1. Preparing directories...');
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true });
  }
  mkdirSync(distDir, { recursive: true });
  mkdirSync(join(distDir, 'client'), { recursive: true });

  // Step 2: Build client
  console.log('2. Building client...');
  execSync('npm run build:client', { cwd: projectRoot, stdio: 'inherit' });

  // Step 3: Bundle server
  console.log('3. Bundling server...');
  execSync('npm run build:bundle', { cwd: serverRoot, stdio: 'inherit' });

  // Step 4: Generate SEA blob
  console.log('4. Generating SEA blob...');
  execSync('node --experimental-sea-config sea-config.json', {
    cwd: serverRoot,
    stdio: 'inherit',
  });

  // Step 5: Copy Node binary
  console.log('5. Copying Node binary...');
  const nodePath = process.execPath;
  const exePath = join(distDir, exeName);
  copyFileSync(nodePath, exePath);

  // Step 6: Inject SEA blob
  console.log('6. Injecting SEA blob...');
  const blobPath = join(serverRoot, 'dist/sea-prep.blob');

  // Remove code signature on macOS
  if (targetPlatform === 'darwin') {
    try {
      execSync(`codesign --remove-signature "${exePath}"`, {
        stdio: 'inherit',
      });
    } catch (e) {
      console.warn(
        'Warning: Could not remove code signature (may not be needed)',
      );
    }
  }

  // Inject the blob using postject
  const postjectArgs = [
    'npx',
    'postject',
    exePath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ];

  if (targetPlatform === 'darwin') {
    postjectArgs.push('--macho-segment-name', 'NODE_SEA');
  }

  const result = spawnSync(postjectArgs[0], postjectArgs.slice(1), {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    console.error(
      'Failed to inject SEA blob. Make sure postject is installed:',
    );
    console.error('  npm install -g postject');
    process.exit(1);
  }

  // Step 7: Copy client dist
  console.log('7. Copying client assets...');
  copyDirSync(join(projectRoot, 'client/dist'), join(distDir, 'client/dist'));

  // Step 8: Copy native modules
  console.log('8. Copying native modules...');
  copyNativeModules();

  // Step 9: Create launcher script
  console.log('9. Creating launcher...');
  createLauncher();

  console.log('');
  console.log('Build complete!');
  console.log(`Output directory: ${distDir}`);
  console.log('');
  console.log('Contents:');
  readdirSync(distDir).forEach((f) => console.log(`  ${f}`));
  console.log('');
  console.log('To run:');
  if (targetPlatform === 'win32') {
    console.log(`  cd dist-exe && ${exeName}`);
  } else {
    console.log(`  cd dist-exe && ./${exeName}`);
  }
}

function copyDirSync(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function copyNativeModules() {
  // Find and copy better-sqlite3 native binding
  const possiblePaths = [
    join(
      projectRoot,
      'node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    ),
    join(projectRoot, 'node_modules/better-sqlite3/prebuilds'),
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      const destDir = join(distDir, 'native');
      mkdirSync(destDir, { recursive: true });

      if (p.endsWith('.node')) {
        copyFileSync(p, join(destDir, 'better_sqlite3.node'));
        console.log(`   Copied ${basename(p)}`);
      } else {
        // It's the prebuilds directory
        copyDirSync(p, join(destDir, 'prebuilds'));
        console.log('   Copied prebuilds directory');
      }
      return;
    }
  }

  console.warn('Warning: Could not find better-sqlite3 native module.');
  console.warn('You may need to install it separately on the target system.');
}

function createLauncher() {
  // Create a README for the distribution
  const readme = `# HearthVTT

## Running

${platform() === 'win32' ? 'Double-click `hearth-vtt.exe` or run from command line.' : 'Run `./hearth-vtt` from this directory.'}

## Configuration

Set environment variables before running:

- PORT: Server port (default: 3000)
- HOST: Bind address (default: 0.0.0.0)
- DATA_DIR: Data storage directory (default: ./data)
- LOG_LEVEL: Logging level (default: info)

## Native Modules

The \`native/\` directory contains platform-specific compiled modules.
These must remain alongside the executable.

## Data

Campaign data is stored in the \`data/\` directory (configurable via DATA_DIR).
`;

  writeFileSync(join(distDir, 'README.md'), readme);

  // Create a .env.example
  const envExample = `# HearthVTT Configuration
PORT=3000
HOST=0.0.0.0
DATA_DIR=./data
LOG_LEVEL=info
`;
  writeFileSync(join(distDir, '.env.example'), envExample);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
