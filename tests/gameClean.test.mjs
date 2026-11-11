import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanGameDist } from '../scripts/lib/gameClean.mjs';
import { cleanup, makeFixture, write } from './helpers/fixture.mjs';

const exists = async (p) => fs.access(p).then(() => true, () => false);

test('clean: removes only games/<slug>/dist and leaves every source file alone', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }, { slug: 'beta' }] });
  try {
    const game = path.join(f.root, 'games', 'alpha');
    await write(path.join(game, 'dist', 'old.js'), 'old');
    await write(path.join(game, 'dist', 'assets', 'old.png'), 'old');
    await write(path.join(f.root, 'games', 'beta', 'dist', 'keep.js'), 'other game');
    await write(path.join(f.root, 'dist', 'index.html'), 'root dist');

    const r = await cleanGameDist({ rootDir: f.root, gameDir: game, protectedDirs: [path.join(f.root, '.build-staging-1'), path.join(f.root, 'dist')] });
    assert.equal(r.removed, true);
    assert.equal(await exists(path.join(game, 'dist')), false);
    for (const keep of ['package.json', 'build.mjs', 'test.mjs', 'src.txt', 'config.json']) assert.equal(await exists(path.join(game, keep)), true, keep);
    assert.equal(await exists(path.join(f.root, 'games', 'beta', 'dist', 'keep.js')), true, 'other game untouched');
    assert.equal(await exists(path.join(f.root, 'dist', 'index.html')), true, 'root dist untouched');
    assert.equal(await exists(path.join(f.root, 'portal', 'index.html')), true, 'portal untouched');
  } finally { await cleanup(f); }
});

test('clean: nothing to clean is fine', async () => {
  const f = await makeFixture({});
  try {
    const r = await cleanGameDist({ rootDir: f.root, gameDir: path.join(f.root, 'games', 'alpha') });
    assert.equal(r.removed, false);
  } finally { await cleanup(f); }
});

test('clean: refuses a game folder that is not directly inside games/', async () => {
  const f = await makeFixture({});
  try {
    await write(path.join(f.root, 'dist', 'index.html'), 'root');
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: f.root }), /not a direct child/);
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: path.join(f.root, 'portal') }), /not a direct child/);
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: path.join(f.root, 'games') }), /not a direct child/);
    assert.equal(await exists(path.join(f.root, 'dist', 'index.html')), true);
  } finally { await cleanup(f); }
});

test('clean: refuses when dist overlaps a protected directory (staging / root dist)', async () => {
  const f = await makeFixture({});
  try {
    const game = path.join(f.root, 'games', 'alpha');
    await write(path.join(game, 'dist', 'x.js'), 'x');
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: game, protectedDirs: [path.join(game, 'dist')] }), /protected/);
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: game, protectedDirs: [game] }), /protected/);
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: game, protectedDirs: [path.join(game, 'dist', 'inner')] }), /protected/);
    assert.equal(await exists(path.join(game, 'dist', 'x.js')), true);
  } finally { await cleanup(f); }
});

test('clean: refuses a "dist" that looks like source (package.json, src, node_modules...)', async () => {
  for (const marker of ['package.json', 'src', 'node_modules', 'vite.config.mjs', 'tests']) {
    const f = await makeFixture({});
    try {
      const game = path.join(f.root, 'games', 'alpha');
      await write(path.join(game, 'dist', marker, 'x'), 'x');
      await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: game }), /looks like source/, marker);
      assert.equal(await exists(path.join(game, 'dist', marker, 'x')), true);
    } finally { await cleanup(f); }
  }
});

test('clean: refuses when dist is a file or a symbolic link, and never follows the link', async (t) => {
  const f = await makeFixture({});
  try {
    const game = path.join(f.root, 'games', 'alpha');
    await write(path.join(game, 'dist'), 'a file, not a directory');
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: game }), /not a directory/);
    await fs.rm(path.join(game, 'dist'));

    const precious = path.join(f.root, 'precious');
    await write(path.join(precious, 'important.txt'), 'do not delete');
    try {
      await fs.symlink(precious, path.join(game, 'dist'), 'junction');
    } catch {
      t.skip('symlinks cannot be created here');
      return;
    }
    await assert.rejects(() => cleanGameDist({ rootDir: f.root, gameDir: game }), /symbolic link/);
    assert.equal(await exists(path.join(precious, 'important.txt')), true);
  } finally { await cleanup(f); }
});
