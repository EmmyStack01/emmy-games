import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { treeHash } from '../scripts/lib/fsutil.mjs';
import { defaultFsOps } from '../scripts/lib/swap.mjs';
import { build, cleanup, envWith, leftoverTemps, makeFixture, write, writeKnownGoodDist } from './helpers/fixture.mjs';

const exists = async (p) => fs.access(p).then(() => true, () => false);
const PRODUCTION = { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' };

/**
 * Every scenario: a known-good dist/ exists, something goes wrong, and afterwards
 *  - the build reports failure with a non-zero exit code
 *  - dist/ is byte-for-byte what it was
 *  - no staging / previous temp folders are left behind
 */
const scenarios = [
  // ---- step 1: portal -----------------------------------------------------
  { name: 'portal: required file missing', expect: /portal validation failed[\s\S]*games\.css is missing/,
    setup: async (f) => fs.rm(path.join(f.root, 'portal', 'games.css')) },
  { name: 'portal: broken link', expect: /broken reference "\/asset\/nope\.png"/,
    setup: async (f) => write(path.join(f.root, 'portal', 'index.html'), '<link href="/games.css"><img src="/asset/nope.png">') },
  { name: 'portal: wrong /portal/ prefix', expect: /\/portal\//,
    setup: async (f) => write(path.join(f.root, 'portal', '404.html'), '<link href="/portal/games.css">') },

  // ---- step 2: publish.json -------------------------------------------------
  { name: 'publish.json: different structure (live: true)', expect: /publish\.json is invalid[\s\S]*unknown key "live"/,
    setup: async (f) => write(path.join(f.root, 'publish.json'), '{ "live": true }') },
  { name: 'publish.json: not valid JSON', expect: /not valid JSON/,
    setup: async (f) => write(path.join(f.root, 'publish.json'), '{ oops') },
  { name: 'publish.json: missing', expect: /publish\.json is missing/,
    setup: async (f) => fs.rm(path.join(f.root, 'publish.json')) },
  { name: 'publish.json: duplicate slug', expect: /more than once/,
    setup: async (f) => write(path.join(f.root, 'publish.json'), '{ "published": ["alpha", "alpha"] }') },

  // ---- step 3: slugs and collisions ------------------------------------------
  { name: 'slugs: publish.json lists a game that does not exist', expect: /no games\/ghost\/ folder/,
    setup: async (f) => write(path.join(f.root, 'publish.json'), '{ "published": ["ghost"] }') },
  { name: 'slugs: game folder name is invalid (capital letters)', expect: /invalid game folder name/,
    setup: async (f) => write(path.join(f.root, 'games', 'BadName', 'package.json'), '{"scripts":{"build":"x","test":"x"}}') },
  { name: 'slugs: game folder uses a reserved name', expect: /reserved/,
    setup: async (f) => write(path.join(f.root, 'games', 'asset', 'package.json'), '{"scripts":{"build":"x","test":"x"}}') },
  { name: 'collision: portal/<slug>.html shadows the game URL', expect: /would collide with the URL \/alpha\//,
    setup: async (f) => write(path.join(f.root, 'portal', 'alpha.html'), 'x') },
  { name: 'portal: a link to a game whose placeholder is missing is caught by portal validation', expect: /broken reference "\/alpha\/"/,
    setup: async (f) => fs.rm(path.join(f.root, 'portal', 'alpha'), { recursive: true }) },
  { name: 'collision: game without a placeholder page', expect: /"alpha" has no placeholder/,
    setup: async (f) => { await fs.rm(path.join(f.root, 'portal', 'alpha'), { recursive: true }); await write(path.join(f.root, 'portal', 'index.html'), '<link href="/games.css">'); } },
  { name: 'collision: portal folder with the game name is not a placeholder', expect: /is not a placeholder/,
    setup: async (f) => { await fs.rm(path.join(f.root, 'portal', 'alpha', 'index.html')); await write(path.join(f.root, 'portal', 'alpha', 'x.txt'), 'x'); await write(path.join(f.root, 'portal', 'index.html'), '<link href="/games.css">'); } },
  { name: 'config: deploy.config.json invalid', expect: /deploy\.config\.json/,
    setup: async (f) => write(path.join(f.root, 'deploy.config.json'), '{ "productionBranch": "" }') },

  // ---- step 4: tests ----------------------------------------------------------
  { name: 'tests: a game test fails', games: [{ slug: 'alpha', testExit: 1 }], expect: /npm test \(games\/alpha\)[\s\S]*exited with code 1/ },

  // ---- step 5: build ----------------------------------------------------------
  { name: 'build: a game build fails', games: [{ slug: 'alpha', buildExit: 3 }], expect: /npm run build \(games\/alpha\)[\s\S]*exited with code 3/ },

  // ---- step 6: game output ----------------------------------------------------
  { name: 'output: game built with root base "/"', games: [{ slug: 'alpha', base: '/' }], expect: /alpha: .*outside \/alpha\// },
  { name: 'output: game built with relative base "./"', games: [{ slug: 'alpha', base: './' }], expect: /alpha: .*relative reference/ },
  { name: 'output: game built for a different slug', games: [{ slug: 'alpha', base: '/other-game/' }], expect: /alpha: .*outside \/alpha\// },
  { name: 'output: root-level /assets/ path inside the JavaScript', games: [{ slug: 'alpha', rootRef: true }], expect: /root-level reference/ },
  { name: 'output: expected sprite missing', games: [{ slug: 'alpha', omitSprite: true }], expect: /required file assets\/sprite\.png is missing/ },
  { name: 'output: an UNPUBLISHED game is broken (every game is validated)', games: [{ slug: 'alpha' }, { slug: 'beta', base: '/' }], published: ['alpha'], expect: /beta: .*outside \/beta\// },

  // ---- step 8: staged output ----------------------------------------------------
  { name: 'staged: index.html lost during assembly', expect: /staged output is invalid[\s\S]*missing index\.html/,
    options: { testHooks: { afterStaging: async (dir) => fs.rm(path.join(dir, 'index.html')) } } },
  { name: 'staged: hidden file leaks into the output', expect: /hidden\/system file leaked/,
    options: { testHooks: { afterStaging: async (dir) => write(path.join(dir, 'asset', '.DS_Store'), 'junk') } } },
  { name: 'staged: unexpected top-level entry', expect: /unexpected top-level entry/,
    options: { testHooks: { afterStaging: async (dir) => write(path.join(dir, 'surprise.txt'), 'x') } } },
  { name: 'staged: a portal file is altered', expect: /portal file differs/,
    options: { testHooks: { afterStaging: async (dir) => write(path.join(dir, 'games.css'), 'body{display:none}') } } },
  { name: 'staged: a placeholder is replaced', expect: /placeholder for unpublished game "alpha" was altered/,
    options: { testHooks: { afterStaging: async (dir) => write(path.join(dir, 'alpha', 'index.html'), 'tampered') } } },
  { name: 'staged: a published game loses its sprite', published: ['alpha'], expect: /staged \/alpha\/: required file assets\/sprite\.png is missing/,
    options: { testHooks: { afterStaging: async (dir) => fs.rm(path.join(dir, 'alpha', 'assets', 'sprite.png')) } } },

  // ---- environment / options (rejected before anything is built) ------------------
  { name: 'env: Cloudflare build without a branch', expect: /CF_PAGES_BRANCH is missing/, options: { env: envWith({ CF_PAGES: '1' }) } },
  { name: 'env: Cloudflare build with an empty branch', expect: /CF_PAGES_BRANCH is missing/, options: { env: envWith({ CF_PAGES: '1', CF_PAGES_BRANCH: '' }) } },
  { name: 'env: branch without CF_PAGES', expect: /Inconsistent environment/, options: { env: envWith({ CF_PAGES_BRANCH: 'main' }) } },
  { name: 'env: PUBLISH_ALL=true (not 1)', expect: /PUBLISH_ALL must be/, options: { env: envWith({ PUBLISH_ALL: 'true' }) } },
  { name: 'env: branch differs from production only by case', expect: /Ambiguous/, options: { env: envWith({ CF_PAGES: '1', CF_PAGES_BRANCH: 'Main', PUBLISH_ALL: '1' }) } },
  { name: 'options: tests cannot be skipped in production', expect: /never in a Cloudflare production or preview build/, options: { env: envWith(PRODUCTION), skipTests: true } },
  { name: 'options: tests cannot be skipped in preview', expect: /never in a Cloudflare production or preview build/, options: { env: envWith({ CF_PAGES: '1', CF_PAGES_BRANCH: 'dev' }), skipTests: true } },
];

for (const scenario of scenarios) {
  test(`failure keeps previous dist unchanged: ${scenario.name}`, async () => {
    const f = await makeFixture({ games: scenario.games ?? [{ slug: 'alpha' }], published: scenario.published ?? [] });
    try {
      if (scenario.setup) await scenario.setup(f);
      const before = await writeKnownGoodDist(f.root);

      const r = await build(f, scenario.options ?? {});

      assert.equal(r.ok, false, `build unexpectedly succeeded:\n${r.log}`);
      assert.equal(r.exitCode, 1);
      assert.match(r.log, scenario.expect);
      assert.match(r.log, /\[FAIL\] Build failed/);
      assert.match(r.log, /previous successful output is unchanged/);
      assert.equal(await treeHash(f.dist), before, 'dist/ must be byte-for-byte unchanged');
      assert.equal(await fs.readFile(path.join(f.dist, 'index.html'), 'utf8'), '<!doctype html>KNOWN GOOD v1');
      assert.deepEqual(await leftoverTemps(f.root), [], 'no staging/previous folders may remain');
    } finally { await cleanup(f); }
  });
}

test('failure keeps the previous dist: the final swap fails and the old output is restored', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: ['alpha'] });
  try {
    const before = await writeKnownGoodDist(f.root);
    const failing = {
      ...defaultFsOps,
      rename: async (from, to) => {
        if (path.basename(from).startsWith('.build-staging-')) throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' });
        return fs.rename(from, to);
      },
    };
    const r = await build(f, { fsOps: failing });
    assert.equal(r.ok, false);
    assert.equal(r.exitCode, 1);
    assert.match(r.log, /simulated rename failure/);
    assert.match(r.log, /previous dist\/ was restored and is unchanged/);
    assert.equal(await treeHash(f.dist), before);
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('failure after a SUCCESSFUL build: the first output survives a later broken build', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: ['alpha'] });
  try {
    const first = await build(f);
    assert.equal(first.ok, true, first.log);
    const good = await treeHash(f.dist);

    // Break the game, rebuild
    await write(path.join(f.root, 'games', 'alpha', 'config.json'), JSON.stringify({ slug: 'alpha', base: '/', buildExit: 0, testExit: 0 }));
    const second = await build(f);
    assert.equal(second.ok, false);
    assert.equal(await treeHash(f.dist), good, 'previous successful build is still served');
    assert.match(await fs.readFile(path.join(f.dist, 'alpha', 'index.html'), 'utf8'), /game alpha/);
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('failure when there is no previous dist: none is created, nothing is left behind', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha', buildExit: 2 }] });
  try {
    const r = await build(f);
    assert.equal(r.ok, false);
    assert.equal(await exists(f.dist), false);
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('a dist that is a file (not a directory) stops the build before anything else happens', async () => {
  const f = await makeFixture({});
  try {
    await write(f.dist, 'I am a file');
    const r = await build(f);
    assert.equal(r.ok, false);
    assert.match(r.log, /dist exists but is not a regular directory/);
    assert.equal(await fs.readFile(f.dist, 'utf8'), 'I am a file');
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('a crash between the two renames is repaired at the start of the next build', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: ['alpha'] });
  try {
    await write(path.join(f.root, '.build-previous-123-abc', 'index.html'), 'SURVIVOR');
    await build(f, { testHooks: { afterStaging: async () => { throw new Error('stop here'); } } });
    assert.equal(await fs.readFile(path.join(f.dist, 'index.html'), 'utf8'), 'SURVIVOR', 'dist restored from the interrupted swap');
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});
