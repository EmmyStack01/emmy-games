// End-to-end: runs the real command-line entry point (scripts/build.mjs) against
// throw-away repositories, checking exit codes and the printed summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { treeHash } from '../scripts/lib/fsutil.mjs';
import { cleanup, envWith, leftoverTemps, makeFixture, writeKnownGoodDist } from './helpers/fixture.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'build.mjs');
const exists = async (p) => fs.access(p).then(() => true, () => false);

function runCli(f, args = [], env = {}) {
  const r = spawnSync(process.execPath, [CLI, '--root', f.root, ...args], { env: envWith(env), encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

test('cli: local build succeeds (exit 0) and says it is a local build', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    const r = runCli(f);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /LOCAL build/);
    assert.match(r.out, /\[ OK \] Build succeeded/);
    assert.ok(await exists(path.join(f.dist, 'index.html')));
    assert.match(await fs.readFile(path.join(f.dist, 'alpha', 'index.html'), 'utf8'), /placeholder/);
  } finally { await cleanup(f); }
});

test('cli: production ignores PUBLISH_ALL=1 and --publish-all (exit 0, nothing extra published)', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    for (const args of [[], ['--publish-all']]) {
      const r = runCli(f, args, { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1' });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /CLOUDFLARE PRODUCTION build/);
      assert.match(r.out, /IGNORED/);
      assert.match(await fs.readFile(path.join(f.dist, 'alpha', 'index.html'), 'utf8'), /placeholder/);
      assert.equal(await exists(path.join(f.dist, 'alpha', 'assets')), false);
    }
  } finally { await cleanup(f); }
});

test('cli: preview with PUBLISH_ALL=1 publishes the unpublished game', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    const r = runCli(f, [], { CF_PAGES: '1', CF_PAGES_BRANCH: 'feature/x', PUBLISH_ALL: '1' });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /CLOUDFLARE PREVIEW build/);
    assert.match(await fs.readFile(path.join(f.dist, 'alpha', 'index.html'), 'utf8'), /game alpha/);
  } finally { await cleanup(f); }
});

test('cli: Cloudflare build with missing branch exits 1 and leaves dist untouched', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    const before = await writeKnownGoodDist(f.root);
    const r = runCli(f, [], { CF_PAGES: '1', PUBLISH_ALL: '1' });
    assert.equal(r.code, 1);
    assert.match(r.out, /CF_PAGES_BRANCH is missing/);
    assert.equal(await treeHash(f.dist), before);
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('cli: a failing game exits 1 and keeps the previous dist', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha', base: '/' }], published: [] });
  try {
    const before = await writeKnownGoodDist(f.root);
    const r = runCli(f);
    assert.equal(r.code, 1);
    assert.match(r.out, /\[FAIL\] Build failed/);
    assert.equal(await treeHash(f.dist), before);
  } finally { await cleanup(f); }
});

test('cli: --skip-tests is refused outside local builds (exit 1)', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    const r = runCli(f, ['--skip-tests'], { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' });
    assert.equal(r.code, 1);
    assert.match(r.out, /never in a Cloudflare production or preview build/);
  } finally { await cleanup(f); }
});

test('cli: unknown arguments exit 2 and --help exits 0', async () => {
  const f = await makeFixture({});
  try {
    assert.equal(runCli(f, ['--nope']).code, 2);
    const help = runCli(f, ['--help']);
    assert.equal(help.code, 0);
    assert.match(help.out, /--publish-all/);
  } finally { await cleanup(f); }
});
