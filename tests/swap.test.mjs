import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { treeHash } from '../scripts/lib/fsutil.mjs';
import { defaultFsOps, recoverInterruptedSwap, removeTempDir, renameWithRetry, replaceDirectory } from '../scripts/lib/swap.mjs';
import { cleanup, leftoverTemps, makeTempDir, write } from './helpers/fixture.mjs';

const exists = async (p) => fs.access(p).then(() => true, () => false);

async function setup({ withDist = true } = {}) {
  const root = await makeTempDir('emmy-swap-');
  const dist = path.join(root, 'dist');
  const staging = path.join(root, '.build-staging-1');
  if (withDist) await write(path.join(dist, 'index.html'), 'OLD');
  await write(path.join(staging, 'index.html'), 'NEW');
  return { root, dist, staging, root_: { root } };
}

test('swap: new output replaces the old, old is removed, no temp folders remain', async () => {
  const s = await setup();
  try {
    await replaceDirectory({ rootDir: s.root, stagingDir: s.staging, finalDir: s.dist, id: '1' });
    assert.equal(await fs.readFile(path.join(s.dist, 'index.html'), 'utf8'), 'NEW');
    assert.deepEqual(await leftoverTemps(s.root), []);
  } finally { await cleanup(s.root_); }
});

test('swap: works when there is no previous dist', async () => {
  const s = await setup({ withDist: false });
  try {
    await replaceDirectory({ rootDir: s.root, stagingDir: s.staging, finalDir: s.dist, id: '1' });
    assert.equal(await fs.readFile(path.join(s.dist, 'index.html'), 'utf8'), 'NEW');
  } finally { await cleanup(s.root_); }
});

test('swap: if installing the new output fails, the old dist is restored byte-for-byte', async () => {
  const s = await setup();
  try {
    const before = await treeHash(s.dist);
    const failing = { ...defaultFsOps, rename: async (from, to) => { if (from === s.staging) throw Object.assign(new Error('disk exploded'), { code: 'EIO' }); return fs.rename(from, to); } };
    await assert.rejects(() => replaceDirectory({ rootDir: s.root, stagingDir: s.staging, finalDir: s.dist, id: '1', fsOps: failing }), /disk exploded/);
    assert.equal(await treeHash(s.dist), before);
    assert.equal(await exists(path.join(s.root, '.build-previous-1')), false, 'previous folder renamed back');
  } finally { await cleanup(s.root_); }
});

test('swap: if even the restore fails, the error says where the old output is', async () => {
  const s = await setup();
  try {
    let calls = 0;
    const failing = { ...defaultFsOps, rename: async (from, to) => { calls += 1; if (calls >= 2) throw Object.assign(new Error('nope'), { code: 'EIO' }); return fs.rename(from, to); } };
    await assert.rejects(() => replaceDirectory({ rootDir: s.root, stagingDir: s.staging, finalDir: s.dist, id: '1', fsOps: failing }), /CRITICAL.*\.build-previous-1/);
    assert.equal(await fs.readFile(path.join(s.root, '.build-previous-1', 'index.html'), 'utf8'), 'OLD', 'old output still intact');
  } finally { await cleanup(s.root_); }
});

test('swap: refuses to replace a dist that is a file', async () => {
  const s = await setup({ withDist: false });
  try {
    await write(s.dist, 'not a directory');
    await assert.rejects(() => replaceDirectory({ rootDir: s.root, stagingDir: s.staging, finalDir: s.dist, id: '1' }), /not a regular directory/);
    assert.equal(await fs.readFile(s.dist, 'utf8'), 'not a directory');
  } finally { await cleanup(s.root_); }
});

test('rename retry: Windows-style EPERM/EBUSY is retried, other errors are not', async () => {
  let attempts = 0;
  const flaky = { rename: async () => { attempts += 1; if (attempts < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' }); } };
  await renameWithRetry(flaky, 'a', 'b', { retries: 5, delayMs: 1 });
  assert.equal(attempts, 3);

  attempts = 0;
  const broken = { rename: async () => { attempts += 1; throw Object.assign(new Error('io'), { code: 'EIO' }); } };
  await assert.rejects(() => renameWithRetry(broken, 'a', 'b', { retries: 5, delayMs: 1 }), /io/);
  assert.equal(attempts, 1);

  attempts = 0;
  const stuck = { rename: async () => { attempts += 1; throw Object.assign(new Error('busy'), { code: 'EBUSY' }); } };
  await assert.rejects(() => renameWithRetry(stuck, 'a', 'b', { retries: 2, delayMs: 1 }), /busy/);
  assert.equal(attempts, 3);
});

test('removeTempDir: only deletes our own temp folders directly inside the root', async () => {
  const root = await makeTempDir('emmy-rm-');
  try {
    await write(path.join(root, 'dist', 'index.html'), 'x');
    await write(path.join(root, '.build-staging-9', 'x'), 'x');
    await assert.rejects(() => removeTempDir(root, path.join(root, 'dist')), /not a build temp directory/);
    await assert.rejects(() => removeTempDir(root, root), /not a build temp directory/);
    await assert.rejects(() => removeTempDir(root, path.join(root, '.build-staging-9', '..')), /not a build temp directory/);
    await removeTempDir(root, path.join(root, '.build-staging-9'));
    assert.equal(await exists(path.join(root, '.build-staging-9')), false);
    assert.equal(await exists(path.join(root, 'dist', 'index.html')), true);
    await removeTempDir(root, path.join(root, '.build-staging-9')); // already gone: fine
  } finally { await cleanup({ root }); }
});

test('recovery: a crash between the two renames is repaired (dist restored)', async () => {
  const root = await makeTempDir('emmy-recover-');
  try {
    await write(path.join(root, '.build-previous-7', 'index.html'), 'OLD');
    const { messages } = await recoverInterruptedSwap(root);
    assert.equal(await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8'), 'OLD');
    assert.match(messages.join('\n'), /Restored dist/);
  } finally { await cleanup({ root }); }
});

test('recovery: old leftovers are removed, recent ones are left, dist is never touched', async () => {
  const root = await makeTempDir('emmy-recover-');
  try {
    await write(path.join(root, 'dist', 'index.html'), 'GOOD');
    await write(path.join(root, '.build-staging-1', 'x'), 'x');
    await write(path.join(root, '.build-previous-2', 'x'), 'x');

    let r = await recoverInterruptedSwap(root); // default: only removes leftovers older than an hour
    assert.match(r.messages.join('\n'), /recent/);
    assert.equal(await exists(path.join(root, '.build-staging-1')), true);

    r = await recoverInterruptedSwap(root, { staleMs: 0 });
    assert.equal(await exists(path.join(root, '.build-staging-1')), false);
    assert.equal(await exists(path.join(root, '.build-previous-2')), false);
    assert.equal(await fs.readFile(path.join(root, 'dist', 'index.html'), 'utf8'), 'GOOD');
  } finally { await cleanup({ root }); }
});
