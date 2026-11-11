// Builds small throw-away repositories (portal + fake games) in the OS temp
// folder so the real build orchestrator can be exercised without Vite or npm ci.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCommandRunner, runBuild } from '../../scripts/lib/orchestrator.mjs';
import { treeHash } from '../../scripts/lib/fsutil.mjs';

export async function makeTempDir(prefix = 'emmy-games-test-') {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function write(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const FAKE_BUILD = `import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
fs.writeFileSync('build-saw-dist.txt', String(fs.existsSync('dist')));
if (cfg.buildExit) process.exit(cfg.buildExit);
fs.mkdirSync('dist/assets', { recursive: true });
fs.writeFileSync('dist/index.html', '<!doctype html><html><head><script type="module" src="' + cfg.base + 'assets/main.js"></script></head><body>game ' + cfg.slug + '</body></html>');
fs.writeFileSync('dist/assets/main.js', 'console.log(' + JSON.stringify(cfg.rootRef ? '/assets/leak.png' : 'ok') + ');');
if (!cfg.omitSprite) fs.writeFileSync('dist/assets/sprite.png', Buffer.from([137, 80, 78, 71]));
if (cfg.hiddenInDist) fs.writeFileSync('dist/.DS_Store', 'junk');
`;

const FAKE_TEST = `import fs from 'node:fs';
const cfg = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8'));
process.exit(cfg.testExit || 0);
`;

/**
 * @param {object} spec
 * @param {Array<object>} [spec.games] each: { slug, base?, buildExit?, testExit?, omitSprite?, rootRef?, hiddenInDist? }
 * @param {string[]} [spec.published]
 * @param {string} [spec.productionBranch]
 * @param {boolean} [spec.requireSprite]  adds requiredOutputFiles for every game
 */
export async function makeFixture({
  games = [{ slug: 'alpha' }],
  published = [],
  productionBranch = 'main',
  requireSprite = true,
} = {}) {
  const root = await makeTempDir();
  const portal = path.join(root, 'portal');

  const links = games.map((g) => `<a href="/${g.slug}/">${g.slug}</a>`).join('');
  await write(
    path.join(portal, 'index.html'),
    `<!doctype html><html><head><link rel="stylesheet" href="/games.css"><script src="/games.js" defer></script></head><body><img src="/asset/logo.svg" alt="">${links}</body></html>`
  );
  await write(path.join(portal, '404.html'), '<!doctype html><link rel="stylesheet" href="/games.css"><a href="/">Home</a>');
  await write(path.join(portal, 'games.css'), 'body{margin:0}');
  await write(path.join(portal, 'games.js'), 'console.log("portal");');
  await write(path.join(portal, 'asset', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await write(path.join(portal, '.DS_Store'), 'junk');
  await write(path.join(portal, 'asset', '.DS_Store'), 'junk');
  await write(path.join(portal, 'asset', 'Thumbs.db'), 'junk');

  const deploy = { productionBranch, games: {} };
  for (const g of games) {
    await write(
      path.join(portal, g.slug, 'index.html'),
      `<!doctype html><link rel="stylesheet" href="/games.css"><a href="/">Home</a><p>${g.slug} placeholder</p>`
    );
    const dir = path.join(root, 'games', g.slug);
    await write(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: g.slug, version: '1.0.0', private: true, type: 'module', scripts: { build: 'node build.mjs', test: 'node test.mjs' } })
    );
    // A dependency-free lockfile lets `npm ci` run offline, like on Cloudflare.
    await write(
      path.join(dir, 'package-lock.json'),
      JSON.stringify({ name: g.slug, version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: g.slug, version: '1.0.0' } } })
    );
    await write(path.join(dir, 'build.mjs'), FAKE_BUILD);
    await write(path.join(dir, 'test.mjs'), FAKE_TEST);
    await write(path.join(dir, 'src.txt'), `source of ${g.slug}`);
    await write(
      path.join(dir, 'config.json'),
      JSON.stringify({ slug: g.slug, base: g.base ?? `/${g.slug}/`, buildExit: g.buildExit ?? 0, testExit: g.testExit ?? 0, omitSprite: !!g.omitSprite, rootRef: !!g.rootRef, hiddenInDist: !!g.hiddenInDist })
    );
    if (requireSprite) deploy.games[g.slug] = { requiredOutputFiles: ['assets/sprite.png'] };
  }
  await write(path.join(root, 'deploy.config.json'), JSON.stringify(deploy, null, 2));
  await write(path.join(root, 'publish.json'), JSON.stringify({ published }, null, 2));

  return { root, dist: path.join(root, 'dist') };
}

/** A previous successful output, with content we can fingerprint. */
export async function writeKnownGoodDist(root) {
  const dist = path.join(root, 'dist');
  await write(path.join(dist, 'index.html'), '<!doctype html>KNOWN GOOD v1');
  await write(path.join(dist, 'asset', 'keep.svg'), '<svg/>');
  await write(path.join(dist, 'alpha', 'index.html'), 'KNOWN GOOD placeholder');
  return treeHash(dist);
}

/** Environment without any Cloudflare/publish variables, plus overrides. */
export function envWith(overrides = {}) {
  const env = { ...process.env };
  for (const key of ['CF_PAGES', 'CF_PAGES_BRANCH', 'CF_PAGES_COMMIT_SHA', 'CF_PAGES_URL', 'PUBLISH_ALL', 'NODE_TEST_CONTEXT']) delete env[key];
  return { ...env, ...overrides };
}

/** Runs the real orchestrator against a fixture with quiet, dependency-free settings. */
export async function build(fixture, options = {}) {
  const lines = [];
  const result = await runBuild({
    rootDir: fixture.root,
    env: envWith(),
    installDependencies: 'never',
    runCommand: createCommandRunner({ stdio: 'capture' }),
    log: (line) => lines.push(line),
    ...options,
  });
  return { ...result, log: lines.join('\n') };
}

export async function leftoverTemps(root) {
  return (await fs.readdir(root)).filter((n) => n.startsWith('.build-'));
}

export async function cleanup(fixture) {
  await fs.rm(fixture.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
