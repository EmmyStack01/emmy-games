import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE, resolveBuildMode } from '../scripts/lib/buildMode.mjs';
import { BuildConfigError } from '../scripts/lib/errors.mjs';

const PROD = 'main';
const resolve = (env, extra = {}) => resolveBuildMode({ env, productionBranch: PROD, ...extra });

// ---- Local builds -----------------------------------------------------------
test('local: no Cloudflare variables => local, publish only publish.json', () => {
  const r = resolve({});
  assert.equal(r.mode, MODE.LOCAL);
  assert.equal(r.publishAll, false);
});

test('local: PUBLISH_ALL=1 is honoured (how unpublished games are tested)', () => {
  const r = resolve({ PUBLISH_ALL: '1' });
  assert.equal(r.mode, MODE.LOCAL);
  assert.equal(r.publishAll, true);
});

test('local: --publish-all flag is honoured and equals PUBLISH_ALL=1', () => {
  const r = resolve({}, { cliPublishAll: true });
  assert.equal(r.mode, MODE.LOCAL);
  assert.equal(r.publishAll, true);
});

test('local: PUBLISH_ALL=0 and empty string mean "not requested"', () => {
  assert.equal(resolve({ PUBLISH_ALL: '0' }).publishAll, false);
  assert.equal(resolve({ PUBLISH_ALL: '' }).publishAll, false);
});

test('local: CF_PAGES_BRANCH without CF_PAGES is inconsistent and fails', () => {
  assert.throws(() => resolve({ CF_PAGES_BRANCH: 'main' }), BuildConfigError);
  assert.throws(() => resolve({ CF_PAGES_BRANCH: 'feature/x', PUBLISH_ALL: '1' }), BuildConfigError);
});

// ---- Production -------------------------------------------------------------
test('production: production branch => production, publish only publish.json', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' });
  assert.equal(r.mode, MODE.PRODUCTION);
  assert.equal(r.publishAll, false);
  assert.deepEqual(r.warnings, []);
});

test('production: PUBLISH_ALL=1 NEVER overrides the production restriction', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1' });
  assert.equal(r.mode, MODE.PRODUCTION);
  assert.equal(r.publishAllRequested, true);
  assert.equal(r.publishAll, false);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /IGNORED/);
});

test('production: --publish-all (e.g. a mistaken build command) is also ignored', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, { cliPublishAll: true });
  assert.equal(r.mode, MODE.PRODUCTION);
  assert.equal(r.publishAll, false);
});

test('production: PUBLISH_ALL set to both env and flag is still ignored', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1' }, { cliPublishAll: true });
  assert.equal(r.publishAll, false);
});

test('production branch name comes from the configuration, not a hard-coded "main"', () => {
  const r = resolveBuildMode({ env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'release', PUBLISH_ALL: '1' }, productionBranch: 'release' });
  assert.equal(r.mode, MODE.PRODUCTION);
  assert.equal(r.publishAll, false);
  const other = resolveBuildMode({ env: { CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1' }, productionBranch: 'release' });
  assert.equal(other.mode, MODE.PREVIEW);
});

// ---- Preview ----------------------------------------------------------------
test('preview: non-production branch => preview, publish only publish.json by default', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'feature/new-level' });
  assert.equal(r.mode, MODE.PREVIEW);
  assert.equal(r.publishAll, false);
});

test('preview: PUBLISH_ALL=1 publishes all games on a genuine preview branch', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'feature/new-level', PUBLISH_ALL: '1' });
  assert.equal(r.mode, MODE.PREVIEW);
  assert.equal(r.publishAll, true);
  assert.equal(r.branch, 'feature/new-level');
});

test('preview: --publish-all is honoured on a preview branch', () => {
  const r = resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'dev' }, { cliPublishAll: true });
  assert.equal(r.publishAll, true);
});

// ---- Missing / inconsistent information fails safely -------------------------
test('CF_PAGES=1 with a missing branch fails (never assumed to be preview)', () => {
  assert.throws(() => resolve({ CF_PAGES: '1' }), /CF_PAGES_BRANCH is missing/);
  assert.throws(() => resolve({ CF_PAGES: '1', PUBLISH_ALL: '1' }), BuildConfigError);
});

test('CF_PAGES=1 with an empty or whitespace-only branch fails', () => {
  assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: '' }), BuildConfigError);
  assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: '   ' }), BuildConfigError);
  assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: ' main' }), /whitespace/);
});

test('CF_PAGES with any value other than "1" fails', () => {
  for (const value of ['0', 'true', 'yes', '', 'preview']) {
    assert.throws(() => resolve({ CF_PAGES: value, CF_PAGES_BRANCH: 'dev' }), BuildConfigError, `CF_PAGES=${JSON.stringify(value)}`);
  }
});

test('a branch that differs from production only by letter case is ambiguous and fails', () => {
  assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'Main', PUBLISH_ALL: '1' }), /Ambiguous/);
  assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'MAIN' }), /Ambiguous/);
});

test('PUBLISH_ALL tolerates surrounding whitespace (Windows cmd: `set PUBLISH_ALL=1 && ...` gives "1 ")', () => {
  assert.equal(resolve({ PUBLISH_ALL: '1 ' }).publishAll, true);
  assert.equal(resolve({ PUBLISH_ALL: ' 1' }).publishAll, true);
  assert.equal(resolve({ PUBLISH_ALL: '0 ' }).publishAll, false);
  assert.equal(resolve({ PUBLISH_ALL: '  ' }).publishAll, false);
  assert.equal(resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1 ' }).publishAll, false, 'still ignored in production');
});

test('PUBLISH_ALL accepts only 1, 0 or unset; other values fail in every mode', () => {
  for (const value of ['true', 'yes', '2', 'on', '11']) {
    assert.throws(() => resolve({ PUBLISH_ALL: value }), BuildConfigError, `local ${value}`);
    assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: value }), BuildConfigError, `prod ${value}`);
    assert.throws(() => resolve({ CF_PAGES: '1', CF_PAGES_BRANCH: 'dev', PUBLISH_ALL: value }), BuildConfigError, `preview ${value}`);
  }
});

test('an invalid productionBranch configuration fails', () => {
  for (const bad of [undefined, null, '', ' main', 'ma in', 42]) {
    assert.throws(() => resolveBuildMode({ env: {}, productionBranch: bad }), BuildConfigError, String(bad));
  }
});

// ---- Full matrix (production can never publish all) ---------------------------
test('matrix: every environment combination, publishAll only where allowed', () => {
  const cases = [
    // env, cliFlag, expected mode, expected publishAll
    [{}, false, MODE.LOCAL, false],
    [{ PUBLISH_ALL: '1' }, false, MODE.LOCAL, true],
    [{}, true, MODE.LOCAL, true],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, false, MODE.PRODUCTION, false],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1' }, false, MODE.PRODUCTION, false],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'main' }, true, MODE.PRODUCTION, false],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'main', PUBLISH_ALL: '1' }, true, MODE.PRODUCTION, false],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'dev' }, false, MODE.PREVIEW, false],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'dev', PUBLISH_ALL: '1' }, false, MODE.PREVIEW, true],
    [{ CF_PAGES: '1', CF_PAGES_BRANCH: 'dev' }, true, MODE.PREVIEW, true],
  ];
  for (const [env, flag, mode, publishAll] of cases) {
    const r = resolve(env, { cliPublishAll: flag });
    assert.equal(r.mode, mode, JSON.stringify({ env, flag }));
    assert.equal(r.publishAll, publishAll, JSON.stringify({ env, flag }));
  }
});
