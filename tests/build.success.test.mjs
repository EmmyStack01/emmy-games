import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { listTree, sha256File, treeHash } from '../scripts/lib/fsutil.mjs';
import { createCommandRunner } from '../scripts/lib/orchestrator.mjs';
import { build, cleanup, envWith, leftoverTemps, makeFixture, writeKnownGoodDist, write } from './helpers/fixture.mjs';

const exists = async (p) => fs.access(p).then(() => true, () => false);
const read = (p) => fs.readFile(p, 'utf8');
const TWO = [{ slug: 'alpha' }, { slug: 'beta' }];

const PRODUCTION = { CF_PAGES: '1', CF_PAGES_BRANCH: 'main' };
const PREVIEW = { CF_PAGES: '1', CF_PAGES_BRANCH: 'feature/test' };

async function assertPublished(f, slug) {
  assert.match(await read(path.join(f.dist, slug, 'index.html')), new RegExp(`game ${slug}`), `${slug} should be the real game`);
  assert.ok(await exists(path.join(f.dist, slug, 'assets', 'sprite.png')), `${slug} sprite present at /${slug}/assets/sprite.png`);
}
async function assertPlaceholder(f, slug) {
  assert.match(await read(path.join(f.dist, slug, 'index.html')), /placeholder/, `${slug} should still be the placeholder`);
  assert.equal(await exists(path.join(f.dist, slug, 'assets')), false, `${slug} must not contain game files`);
}

test('unpublished: publish.json [] => both games stay placeholders; portal preserved; hidden files excluded', async () => {
  const f = await makeFixture({ games: TWO, published: [] });
  try {
    const r = await build(f);
    assert.equal(r.ok, true, r.log);
    assert.equal(r.exitCode, 0);
    assert.deepEqual(r.selected, []);
    assert.deepEqual(r.placeholders, ['alpha', 'beta']);
    await assertPlaceholder(f, 'alpha');
    await assertPlaceholder(f, 'beta');

    // every portal file present and byte-identical (outside hidden/junk files)
    const portal = path.join(f.root, 'portal');
    for (const e of (await listTree(portal, { skipExcluded: true })).filter((x) => x.kind === 'file')) {
      assert.equal(await sha256File(path.join(f.dist, ...e.rel.split('/'))), await sha256File(e.abs), e.rel);
    }
    // nothing hidden anywhere in the public site
    const names = (await listTree(f.dist)).map((e) => e.rel.split('/').pop());
    assert.deepEqual(names.filter((n) => n.startsWith('.') || /^(thumbs\.db|desktop\.ini)$/i.test(n)), []);
    assert.match(r.log, /excluded hidden\/system file: portal\/\.DS_Store/);
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('published: only the games listed in publish.json replace their placeholder', async () => {
  const f = await makeFixture({ games: TWO, published: ['alpha'] });
  try {
    const r = await build(f);
    assert.equal(r.ok, true, r.log);
    assert.deepEqual(r.selected, ['alpha']);
    await assertPublished(f, 'alpha');
    await assertPlaceholder(f, 'beta');
  } finally { await cleanup(f); }
});

test('all games are built and validated even when unpublished (but not shipped)', async () => {
  const f = await makeFixture({ games: TWO, published: ['alpha'] });
  try {
    const r = await build(f);
    assert.equal(r.ok, true, r.log);
    assert.ok(await exists(path.join(f.root, 'games', 'beta', 'dist', 'index.html')), 'beta was built');
    assert.equal(await exists(path.join(f.dist, 'beta', 'assets')), false, 'beta was not shipped');
    assert.match(r.log, /ok  \/beta\//);
  } finally { await cleanup(f); }
});

test('production: PUBLISH_ALL=1 can never publish an unlisted game', async () => {
  const f = await makeFixture({ games: TWO, published: ['alpha'] });
  try {
    const r = await build(f, { env: envWith({ ...PRODUCTION, PUBLISH_ALL: '1' }) });
    assert.equal(r.ok, true, r.log);
    assert.equal(r.mode, 'production');
    assert.deepEqual(r.selected, ['alpha']);
    await assertPublished(f, 'alpha');
    await assertPlaceholder(f, 'beta');
    assert.match(r.log, /CLOUDFLARE PRODUCTION build/);
    assert.match(r.log, /IGNORED/);
  } finally { await cleanup(f); }
});

test('production: publish.json [] + PUBLISH_ALL=1 publishes nothing', async () => {
  const f = await makeFixture({ games: TWO, published: [] });
  try {
    for (const flag of [false, true]) {
      const r = await build(f, { env: envWith({ ...PRODUCTION, PUBLISH_ALL: '1' }), cliPublishAll: flag });
      assert.equal(r.ok, true, r.log);
      assert.deepEqual(r.selected, []);
      await assertPlaceholder(f, 'alpha');
      await assertPlaceholder(f, 'beta');
    }
  } finally { await cleanup(f); }
});

test('preview: PUBLISH_ALL=1 publishes all games on a genuine preview branch', async () => {
  const f = await makeFixture({ games: TWO, published: [] });
  try {
    const r = await build(f, { env: envWith({ ...PREVIEW, PUBLISH_ALL: '1' }) });
    assert.equal(r.ok, true, r.log);
    assert.equal(r.mode, 'preview');
    assert.deepEqual(r.selected, ['alpha', 'beta']);
    await assertPublished(f, 'alpha');
    await assertPublished(f, 'beta');
    assert.match(r.log, /CLOUDFLARE PREVIEW build/);
  } finally { await cleanup(f); }
});

test('preview without PUBLISH_ALL: still only what publish.json lists', async () => {
  const f = await makeFixture({ games: TWO, published: ['beta'] });
  try {
    const r = await build(f, { env: envWith(PREVIEW) });
    assert.equal(r.ok, true, r.log);
    await assertPlaceholder(f, 'alpha');
    await assertPublished(f, 'beta');
  } finally { await cleanup(f); }
});

test('local: PUBLISH_ALL=1 and --publish-all both allow testing unpublished games; output is labelled local', async () => {
  for (const options of [{ env: envWith({ PUBLISH_ALL: '1' }) }, { cliPublishAll: true }]) {
    const f = await makeFixture({ games: TWO, published: [] });
    try {
      const r = await build(f, options);
      assert.equal(r.ok, true, r.log);
      assert.equal(r.mode, 'local');
      assert.deepEqual(r.selected, ['alpha', 'beta']);
      await assertPublished(f, 'alpha');
      await assertPublished(f, 'beta');
      assert.match(r.log, /LOCAL build/);
      assert.match(r.log, /do not deploy/);
    } finally { await cleanup(f); }
  }
});

test('a successful build replaces an existing dist completely and leaves no temp folders', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: ['alpha'] });
  try {
    const before = await writeKnownGoodDist(f.root);
    const r = await build(f);
    assert.equal(r.ok, true, r.log);
    assert.notEqual(await treeHash(f.dist), before);
    assert.equal(await exists(path.join(f.dist, 'asset', 'keep.svg')), false, 'old files are gone');
    await assertPublished(f, 'alpha');
    assert.deepEqual(await leftoverTemps(f.root), []);
  } finally { await cleanup(f); }
});

test('each game\'s previous dist is removed before it is built; its sources are untouched', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: ['alpha'] });
  try {
    await write(path.join(f.root, 'games', 'alpha', 'dist', 'stale.txt'), 'stale');
    const r = await build(f);
    assert.equal(r.ok, true, r.log);
    assert.equal(await read(path.join(f.root, 'games', 'alpha', 'build-saw-dist.txt')), 'false', 'dist did not exist when the build started');
    assert.equal(await exists(path.join(f.root, 'games', 'alpha', 'dist', 'stale.txt')), false);
    assert.equal(await exists(path.join(f.dist, 'alpha', 'stale.txt')), false);
    for (const keep of ['package.json', 'build.mjs', 'test.mjs', 'src.txt', 'config.json']) {
      assert.ok(await exists(path.join(f.root, 'games', 'alpha', keep)), keep);
    }
    assert.match(r.log, /removed previous games\/alpha\/dist/);
  } finally { await cleanup(f); }
});

test('hidden files produced inside a game build are excluded from the site', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha', hiddenInDist: true }], published: ['alpha'] });
  try {
    const r = await build(f);
    assert.equal(r.ok, true, r.log);
    assert.equal(await exists(path.join(f.dist, 'alpha', '.DS_Store')), false);
    assert.match(r.log, /excluded hidden\/system file: games\/alpha\/dist\/\.DS_Store/);
  } finally { await cleanup(f); }
});

test('step order: install -> tests -> build, and child processes never see CF_PAGES/PUBLISH_ALL', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    const real = createCommandRunner({ stdio: 'capture' });
    const seen = [];
    const r = await build(f, {
      installDependencies: 'auto',
      env: envWith({ ...PREVIEW, PUBLISH_ALL: '1' }),
      runCommand: async (command, opts) => {
        seen.push({ command, env: opts.env });
        return command === 'npm ci' ? { code: 0, output: '' } : real(command, opts);
      },
    });
    assert.equal(r.ok, true, r.log);
    assert.deepEqual(seen.map((s) => s.command), ['npm ci', 'npm test', 'npm run build']);
    for (const s of seen) {
      assert.equal(s.env.CF_PAGES, undefined);
      assert.equal(s.env.CF_PAGES_BRANCH, undefined);
      assert.equal(s.env.PUBLISH_ALL, undefined);
    }
  } finally { await cleanup(f); }
});

test('dependencies: local build reuses node_modules; Cloudflare builds always run npm ci', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }], published: [] });
  try {
    await write(path.join(f.root, 'games', 'alpha', 'node_modules', '.keep'), '');
    const real = createCommandRunner({ stdio: 'capture' });
    const run = (seen) => async (command, opts) => { seen.push(command); return command === 'npm ci' ? { code: 0, output: '' } : real(command, opts); };

    let seen = [];
    let r = await build(f, { installDependencies: 'auto', runCommand: run(seen) });
    assert.equal(r.ok, true, r.log);
    assert.ok(!seen.includes('npm ci'), 'local + node_modules present: no reinstall');

    seen = [];
    r = await build(f, { installDependencies: 'auto', env: envWith(PRODUCTION), runCommand: run(seen) });
    assert.equal(r.ok, true, r.log);
    assert.ok(seen.includes('npm ci'), 'production: clean install');
  } finally { await cleanup(f); }
});

test('local: --skip-tests builds even when a game test would fail (local only)', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha', testExit: 1 }], published: [] });
  try {
    const r = await build(f, { skipTests: true });
    assert.equal(r.ok, true, r.log);
    assert.match(r.log, /tests SKIPPED/);
  } finally { await cleanup(f); }
});
