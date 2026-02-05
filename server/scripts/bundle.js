/**
 * Bundle the server into a single JS file for SEA (Single Executable Application).
 *
 * Note: better-sqlite3 is a native module and cannot be bundled into the executable.
 * It must be distributed alongside the executable or the user must have it installed.
 *
 * For now, this creates a bundle that can be run with `node dist/bundle.cjs`
 * or used as the basis for SEA packaging on platforms that support it.
 */

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(__dirname, '..');

async function bundle() {
  console.log('Bundling server...');

  const result = await esbuild.build({
    entryPoints: [join(serverRoot, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs', // SEA requires CommonJS
    outfile: join(serverRoot, 'dist/bundle.cjs'),
    sourcemap: false,
    minify: true,
    // Native modules that can't be bundled
    external: ['better-sqlite3'],
    // Inline the dotenv config
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    // Suppress import.meta warning - we handle this with a typeof check at runtime
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

  console.log('Bundle created: dist/bundle.cjs');

  // Create SEA config
  const seaConfig = {
    main: 'dist/bundle.cjs',
    output: 'dist/sea-prep.blob',
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
    assets: {
      // Client dist will be embedded - for now just a placeholder
      // In production, we'd need to handle this differently
    },
  };

  writeFileSync(
    join(serverRoot, 'sea-config.json'),
    JSON.stringify(seaConfig, null, 2),
  );

  console.log('SEA config created: sea-config.json');
  console.log('');
  console.log('To create a native executable:');
  console.log('  1. npm run build:bundle');
  console.log('  2. node --experimental-sea-config sea-config.json');
  console.log(
    '  3. cp $(which node) hearth-vtt.exe  # or hearth-vtt on Linux/Mac',
  );
  console.log(
    '  4. npx postject hearth-vtt.exe NODE_SEA_BLOB dist/sea-prep.blob \\',
  );
  console.log(
    '       --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  );
  console.log('');
  console.log(
    'Note: better-sqlite3.node must be distributed alongside the executable.',
  );
}

bundle().catch(console.error);
