#!/usr/bin/env node
// Root build for Emmy Games. See README.md and docs/DEPLOYMENT.md.
//
//   npm run build                 publish only what publish.json lists
//   npm run build:all             local/preview only: also publish unpublished games
//   node scripts/build.mjs --skip-tests    local only: skip the test steps
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './lib/orchestrator.mjs';

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`[FAIL] Node.js 22 or newer is required (this is ${process.versions.node}). Set NODE_VERSION=22 in Cloudflare Pages.`);
  process.exit(1);
}

const args = process.argv.slice(2);
let cliPublishAll = false;
let skipTests = false;
let rootArg = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--publish-all') cliPublishAll = true;
  else if (arg === '--skip-tests') skipTests = true;
  else if (arg === '--root') rootArg = args[(i += 1)];
  else if (arg === '--help' || arg === '-h') {
    console.log('Usage: node scripts/build.mjs [--publish-all] [--skip-tests]\n' +
      '  --publish-all  also publish unpublished games (local and preview builds only; ignored in production)\n' +
      '  --skip-tests   skip the test steps (local builds only)');
    process.exit(0);
  } else {
    console.error(`Unknown argument: ${arg}\nRun with --help for usage.`);
    process.exit(2);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = rootArg ? path.resolve(rootArg) : path.resolve(here, '..');

const result = await runBuild({ rootDir, env: process.env, cliPublishAll, skipTests });
process.exit(result.exitCode);
