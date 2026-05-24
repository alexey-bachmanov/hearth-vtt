#!/usr/bin/env node

/**
 * Build a native executable for HearthVTT using Node.js SEA (Single Executable Application).
 *
 * This script:
 * 1. Builds the client
 * 2. Bundles the server with esbuild
 * 3. Generates the SEA blob
 * 4. Creates the native executable
 * 5. Copies all necessary assets
 *
 * Prerequisites:
 *   - Node.js 20+
 *   - postject: npm install -g postject
 *   - On Windows: may need to run as administrator to modify executables
 *
 * Limitations:
 *   - better-sqlite3 is a native module and must be distributed alongside
 */

import { execSync } from 'child_process';
import * as esbuild from 'esbuild';
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
const projectRoot = join(__dirname, '..');
const serverRoot = join(projectRoot, 'server');
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
  mkdirSync(join(serverRoot, 'dist'), { recursive: true });

  // Step 2: Build shared package
  console.log('2. Building shared package...');
  execSync('npm run build:shared', { cwd: projectRoot, stdio: 'inherit' });

  // Step 3: Build client
  console.log('3. Building client...');
  execSync('npm run build:client', { cwd: projectRoot, stdio: 'inherit' });

  // Step 4: Bundle server
  console.log('4. Bundling server...');
  await bundleServer();

  // Step 5: Create launcher for SEA
  console.log('5. Creating SEA launcher...');
  await createLauncher();

  // Step 6: Generate SEA blob
  console.log('6. Generating SEA blob...');
  execSync('node --experimental-sea-config sea-config.json', {
    cwd: serverRoot,
    stdio: 'inherit',
  });

  // Step 7: Copy Node binary
  console.log('7. Copying Node binary...');
  const nodePath = process.execPath;
  const exePath = join(distDir, exeName);
  copyFileSync(nodePath, exePath);

  // Step 8: Inject SEA blob
  console.log('8. Injecting SEA blob...');
  await injectBlob(exePath);

  // Step 9: Copy bundled server
  console.log('9. Copying server bundle...');
  copyFileSync(
    join(serverRoot, 'dist/bundle.cjs'),
    join(distDir, 'server.cjs'),
  );

  // Step 10: Copy client dist
  console.log('10. Copying client assets...');
  copyDirSync(join(projectRoot, 'client/dist'), join(distDir, 'client/dist'));

  // Step 11: Copy native modules
  console.log('11. Copying native modules...');
  copyNativeModules();

  // Step 12: Create documentation
  console.log('12. Creating documentation...');
  createDocs();

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

async function bundleServer() {
  const result = await esbuild.build({
    entryPoints: [join(serverRoot, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs', // SEA requires CommonJS
    outfile: join(serverRoot, 'dist/bundle.cjs'),
    sourcemap: false,
    minify: true,
    // Native modules that can't be bundled
    external: ['better-sqlite3'],
    // Production environment
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    // Suppress import.meta warning
    logOverride: {
      'empty-import-meta': 'silent',
    },
    banner: {
      js: `
// HearthVTT Server Bundle
// This is a bundled version for distribution.
// Native modules (better-sqlite3) must be installed separately.
var __bundled_dirname = __dirname;
`.trim(),
    },
  });

  if (result.errors.length > 0) {
    console.error('Bundle failed:', result.errors);
    process.exit(1);
  }
}

async function createLauncher() {
  // Create a minimal launcher script that will be embedded in SEA
  // This launcher loads the external bundle.cjs which can use require() normally
  const launcherCode = `
// HearthVTT SEA Launcher
// This minimal script is embedded in the executable and loads the main bundle
const { join, dirname } = require('path');
const { readFileSync, existsSync } = require('fs');
const vm = require('vm');
const Module = require('module');

// Determine the directory where the executable is located
const exeDir = __dirname;
const bundlePath = join(exeDir, 'server.cjs');

if (!existsSync(bundlePath)) {
  console.error('Error: server.cjs not found. Expected at:', bundlePath);
  console.error('Make sure server.cjs is in the same directory as the executable.');
  process.exit(1);
}

// Create a proper require function that can load external modules
// This is the key: Module.createRequire creates a require function
// that works from the specified file path, bypassing SEA's embedderRequire
const bundleRequire = Module.createRequire(bundlePath);

// Read and execute the bundle using vm module
const bundleCode = readFileSync(bundlePath, 'utf8');

// Wrap the bundle code in a function to provide context
const wrappedCode = \`
(function(__dirname, __filename, require, module, exports) {
\${bundleCode}
})
\`;

const script = new vm.Script(wrappedCode, {
  filename: bundlePath,
});

// Execute the wrapper function with the proper require
const bundleFunction = script.runInThisContext();
const fakeModule = { exports: {}, require: bundleRequire };
bundleFunction(
  exeDir,             // __dirname
  bundlePath,         // __filename
  bundleRequire,      // require (using Module.createRequire)
  fakeModule,         // module
  fakeModule.exports  // exports
);
`.trim();

  writeFileSync(join(serverRoot, 'dist/launcher.cjs'), launcherCode);

  // Create SEA config pointing to the launcher (not the main bundle)
  const seaConfig = {
    main: 'dist/launcher.cjs',
    output: 'dist/sea-prep.blob',
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
  };

  writeFileSync(
    join(serverRoot, 'sea-config.json'),
    JSON.stringify(seaConfig, null, 2),
  );
}

async function injectBlob(exePath) {
  const blobPath = join(serverRoot, 'dist/sea-prep.blob');

  // Remove code signature
  if (targetPlatform === 'darwin') {
    // macOS: Use codesign
    try {
      execSync(`codesign --remove-signature "${exePath}"`, {
        stdio: 'inherit',
      });
    } catch (e) {
      console.warn(
        'Warning: Could not remove code signature (may not be needed)',
      );
    }
  } else if (targetPlatform === 'win32') {
    // Windows: The signature warning is expected and harmless
    // The executable will still run correctly
    // If you have signtool.exe, you could remove it with:
    // execSync(`signtool remove /s "${exePath}"`, { stdio: 'inherit' });
    console.log('   Note: Windows signature warning is expected and harmless');
  }

  // Inject the blob using postject
  let postjectCmd = `npx postject "${exePath}" NODE_SEA_BLOB "${blobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;

  if (targetPlatform === 'darwin') {
    postjectCmd += ' --macho-segment-name NODE_SEA';
  }

  try {
    execSync(postjectCmd, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch (error) {
    console.error(
      'Failed to inject SEA blob. Make sure postject is installed:',
    );
    console.error('  npm install -g postject');
    process.exit(1);
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
  // Copy the entire better-sqlite3 package (not just the .node file)
  // This is necessary because require('better-sqlite3') needs the full package structure
  const modulesToCopy = ['better-sqlite3', 'bindings', 'prebuild-install'];
  const nodeModulesDir = join(distDir, 'node_modules');
  mkdirSync(nodeModulesDir, { recursive: true });

  for (const moduleName of modulesToCopy) {
    // Check both root and server node_modules
    const possiblePaths = [
      join(projectRoot, 'node_modules', moduleName),
      join(serverRoot, 'node_modules', moduleName),
    ];

    let copied = false;
    for (const srcPath of possiblePaths) {
      if (existsSync(srcPath)) {
        const destPath = join(nodeModulesDir, moduleName);
        copyDirSync(srcPath, destPath);
        console.log(`   Copied ${moduleName}`);
        copied = true;
        break;
      }
    }

    if (!copied && moduleName === 'better-sqlite3') {
      console.warn('Warning: Could not find better-sqlite3 module.');
      console.warn(
        'You may need to install it separately on the target system.',
      );
    }
  }
}

function createDocs() {
  // Create a README for the distribution
  const readme = `# HearthVTT

## Running

${platform() === 'win32' ? 'Double-click `hearth-vtt.exe` or run from command line.' : 'Run `./hearth-vtt` from this directory.'}

## Configuration

Set environment variables before running:

- PORT: Server port (default: 3000)
- HOST: Bind address (default: 127.0.0.1 for localhost-only; use 0.0.0.0 for network access)
- DATA_DIR: Data storage directory (default: ./data)
- LOG_LEVEL: Logging level (default: info)

## Native Modules

The \`node_modules/\` directory contains required native modules (better-sqlite3).
These must remain alongside the executable.

## Data

Campaign data is stored in the \`data/\` directory (configurable via DATA_DIR).
`;

  writeFileSync(join(distDir, 'README.md'), readme);

  // Create a .env.example
  const envExample = `# HearthVTT Configuration
PORT=3000
HOST=127.0.0.1
DATA_DIR=./data
LOG_LEVEL=info

# Security Note:
# HOST=127.0.0.1 restricts to localhost (recommended for security)
# Set HOST=0.0.0.0 to allow network access
`;
  writeFileSync(join(distDir, '.env.example'), envExample);
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
