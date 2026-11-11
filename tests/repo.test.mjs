// Static checks of the REAL repository (nothing is built here): the committed
// configuration must be valid and internally consistent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCollisions, discoverGames, loadDeployConfig, loadPublishJson } from '../scripts/lib/config.mjs';
import { validatePortal } from '../scripts/lib/portal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readText = (...p) => fs.readFile(path.join(ROOT, ...p), 'utf8');

test('repo: publish.json and deploy.config.json are valid', async () => {
  const publish = await loadPublishJson(ROOT);
  assert.deepEqual(publish.errors, []);
  const deploy = await loadDeployConfig(ROOT);
  assert.equal(typeof deploy.productionBranch, 'string');
});

test('repo: games are discovered, every published slug exists, no collisions', async () => {
  const { games, errors } = await discoverGames(ROOT);
  assert.deepEqual(errors, []);
  assert.ok(games.some((g) => g.slug === 'emmy-hustle'));
  const slugs = games.map((g) => g.slug);
  const publish = await loadPublishJson(ROOT);
  for (const slug of publish.published) assert.ok(slugs.includes(slug), `publish.json lists unknown game ${slug}`);
  assert.deepEqual(await checkCollisions({ rootDir: ROOT, games }), []);
});

test('repo: the real portal validates (links, assets, placeholders, /emmy-hustle/ form)', async () => {
  const { games } = await discoverGames(ROOT);
  const r = await validatePortal({ rootDir: ROOT, gameSlugs: games.map((g) => g.slug) });
  assert.deepEqual(r.errors, []);
});

test('repo: every game\'s Vite base equals /<slug>/ (folder name, base path and URL stay consistent)', async () => {
  const { games } = await discoverGames(ROOT);
  for (const g of games) {
    const cfg = await readText('games', g.slug, 'vite.config.mjs');
    const match = cfg.match(/base\s*:\s*(['"])([^'"]*)\1/);
    assert.ok(match, `games/${g.slug}/vite.config.mjs must set base`);
    assert.equal(match[2], `/${g.slug}/`);
  }
});

test('repo: Emmy\'s Hustle sprite check matches the path the game actually loads', async () => {
  const deploy = await loadDeployConfig(ROOT);
  const source = await readText('games', 'emmy-hustle', 'src', 'config.js');
  const sheetPath = source.match(/sheetPath\s*:\s*'([^']+)'/)?.[1];
  assert.ok(sheetPath, 'could not find CHARACTER.sheetPath in the game');
  assert.ok(deploy.games['emmy-hustle'].requiredOutputFiles.includes(sheetPath));
  const sprite = await fs.stat(path.join(ROOT, 'games', 'emmy-hustle', 'public', sheetPath));
  assert.ok(sprite.size > 0, 'sprite source file exists in public/');
});

test('repo: root package.json has the expected scripts and Node 22', async () => {
  const pkg = JSON.parse(await readText('package.json'));
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
  assert.equal(pkg.scripts['build:all'], 'node scripts/build.mjs --publish-all');
  assert.ok(pkg.scripts.test);
  assert.match(pkg.engines.node, /22/);
  assert.equal((await readText('.node-version')).trim(), '22');
  assert.equal((await readText('.nvmrc')).trim(), '22');
  assert.deepEqual(pkg.dependencies ?? {}, {}, 'the root build must not need any dependencies');
  assert.deepEqual(pkg.devDependencies ?? {}, {});
});

test('repo: .gitignore keeps dependencies, build output and temp folders out of git', async () => {
  const lines = (await readText('.gitignore')).split(/\r?\n/);
  for (const needed of ['node_modules/', 'dist/', '.build-staging-*/', '.build-previous-*/', '.DS_Store']) {
    assert.ok(lines.includes(needed), `.gitignore must contain ${needed}`);
  }
  const game = (await readText('games', 'emmy-hustle', '.gitignore')).split(/\r?\n/);
  assert.ok(game.includes('node_modules/') && game.includes('dist/'));
});
