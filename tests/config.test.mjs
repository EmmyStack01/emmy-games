import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { checkCollisions, discoverGames, loadDeployConfig, loadPublishJson, validateSlug } from '../scripts/lib/config.mjs';
import { BuildConfigError } from '../scripts/lib/errors.mjs';
import { cleanup, makeFixture, write } from './helpers/fixture.mjs';

test('slugs: valid examples pass', () => {
  for (const slug of ['emmy-hustle', 'a', 'game2', 'my-cool-game-3']) assert.deepEqual(validateSlug(slug), [], slug);
});

test('slugs: invalid examples are rejected', () => {
  const bad = ['', 'Emmy', 'emmy_hustle', 'emmy hustle', '-x', 'x-', 'a--b', 'a/b', '../x', 'a.b', 'x'.repeat(51), 'asset', 'assets', 'portal', 'dist', 'con', 'nul', 'com1', 'lpt9', 42, null];
  for (const slug of bad) assert.notDeepEqual(validateSlug(slug), [], String(slug));
});

test('publish.json: the original structure { "published": [] } is valid', async () => {
  const f = await makeFixture({ published: [] });
  try {
    const r = await loadPublishJson(f.root);
    assert.deepEqual(r, { published: [], errors: [] });
  } finally { await cleanup(f); }
});

test('publish.json: a list of slugs is valid', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }, { slug: 'beta' }], published: ['alpha', 'beta'] });
  try {
    const r = await loadPublishJson(f.root);
    assert.deepEqual(r.published, ['alpha', 'beta']);
    assert.deepEqual(r.errors, []);
  } finally { await cleanup(f); }
});

test('publish.json: invalid configurations are all reported', async () => {
  const f = await makeFixture({});
  try {
    const cases = [
      ['{ "live": true }', /unknown key "live"/],
      ['{ "published": [], "live": false }', /unknown key "live"/],
      ['{ "published": "alpha" }', /must be an array/],
      ['{}', /must be an array/],
      ['[]', /must be a JSON object/],
      ['{ "published": [1] }', /not a string/],
      ['{ "published": ["Alpha"] }', /lowercase/],
      ['{ "published": ["alpha", "alpha"] }', /more than once/],
      ['{ "published": ["../x"] }', /slug/],
      ['{ not json', /not valid JSON/],
    ];
    for (const [text, pattern] of cases) {
      await write(path.join(f.root, 'publish.json'), text);
      const r = await loadPublishJson(f.root);
      assert.ok(r.errors.length > 0, `expected errors for ${text}`);
      assert.match(r.errors.join('\n'), pattern, text);
    }
    await fs.rm(path.join(f.root, 'publish.json'));
    const missing = await loadPublishJson(f.root);
    assert.match(missing.errors[0], /missing/);
  } finally { await cleanup(f); }
});

test('deploy.config.json: valid file loads; bad ones throw', async () => {
  const f = await makeFixture({});
  try {
    const ok = await loadDeployConfig(f.root);
    assert.equal(ok.productionBranch, 'main');
    assert.deepEqual(ok.games.alpha.requiredOutputFiles, ['assets/sprite.png']);

    const bad = [
      '{}', '[]', '{ "productionBranch": "" }', '{ "productionBranch": "main", "extra": 1 }',
      '{ "productionBranch": "main", "games": [] }',
      '{ "productionBranch": "main", "games": { "Bad Slug": {} } }',
      '{ "productionBranch": "main", "games": { "alpha": { "requiredOutputFiles": "x" } } }',
      '{ "productionBranch": "main", "games": { "alpha": { "requiredOutputFiles": ["../x"] } } }',
      '{ "productionBranch": "main", "games": { "alpha": { "requiredOutputFiles": ["/abs.png"] } } }',
      '{ "productionBranch": "main", "games": { "alpha": { "requiredOutputFiles": ["a\\\\b.png"] } } }',
      '{ "productionBranch": "main", "games": { "alpha": { "other": 1 } } }',
      'not json',
    ];
    for (const text of bad) {
      await write(path.join(f.root, 'deploy.config.json'), text);
      await assert.rejects(() => loadDeployConfig(f.root), BuildConfigError, text);
    }
  } finally { await cleanup(f); }
});

test('discoverGames: finds games, requires build and test scripts, rejects bad folder names', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }, { slug: 'beta' }] });
  try {
    let r = await discoverGames(f.root);
    assert.deepEqual(r.games.map((g) => g.slug), ['alpha', 'beta']);
    assert.deepEqual(r.errors, []);

    await write(path.join(f.root, 'games', 'Bad_Name', 'package.json'), '{}');
    await write(path.join(f.root, 'games', 'noscripts', 'package.json'), '{"scripts":{"build":"x"}}');
    await write(path.join(f.root, 'games', 'nopkg', 'readme.txt'), 'x');
    await write(path.join(f.root, 'games', 'README.md'), 'a file in games/');
    await write(path.join(f.root, 'games', '.DS_Store'), 'junk');
    r = await discoverGames(f.root);
    const text = r.errors.join('\n');
    assert.match(text, /Bad_Name: invalid game folder name/);
    assert.match(text, /noscripts\/package.json needs a "test" script/);
    assert.match(text, /nopkg\/package.json is missing/);
    assert.ok(r.warnings.some((w) => w.includes('README.md')));
    assert.ok(!text.includes('.DS_Store'));
  } finally { await cleanup(f); }
});

test('collisions: placeholder folder with the same name as a game is allowed', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }] });
  try {
    const { games } = await discoverGames(f.root);
    assert.deepEqual(await checkCollisions({ rootDir: f.root, games }), []);
  } finally { await cleanup(f); }
});

test('collisions: portal entries that clash with a game slug are reported', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }, { slug: 'beta' }, { slug: 'gamma' }, { slug: 'delta' }] });
  try {
    const portal = path.join(f.root, 'portal');
    await fs.rm(path.join(portal, 'alpha'), { recursive: true });            // folder missing => no placeholder
    await write(path.join(portal, 'beta.html'), 'x');                         // /beta would be served by beta.html
    await fs.rm(path.join(portal, 'gamma'), { recursive: true });             // folder replaced by a file
    await write(path.join(portal, 'gamma'), 'a file');
    await fs.rm(path.join(portal, 'delta', 'index.html'));                    // folder without index.html
    await write(path.join(portal, 'delta', 'other.txt'), 'x');
    const { games } = await discoverGames(f.root);
    const text = (await checkCollisions({ rootDir: f.root, games })).join('\n');
    assert.match(text, /"alpha" has no placeholder/);
    assert.match(text, /beta\.html would collide/);
    assert.match(text, /portal\/gamma is a file/);
    assert.match(text, /"delta" collides with portal\/delta\/, which is not a placeholder/);
  } finally { await cleanup(f); }
});

test('collisions: a slug differing from a portal folder only by letter case is reported', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }] });
  try {
    await fs.rm(path.join(f.root, 'portal', 'alpha'), { recursive: true });
    await write(path.join(f.root, 'portal', 'Alpha', 'index.html'), 'x');
    const { games } = await discoverGames(f.root);
    assert.match((await checkCollisions({ rootDir: f.root, games })).join('\n'), /letter case/);
  } finally { await cleanup(f); }
});
