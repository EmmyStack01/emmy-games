import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validatePortal } from '../scripts/lib/portal.mjs';
import { cleanup, makeFixture, write } from './helpers/fixture.mjs';

const validate = (f, slugs = ['alpha']) => validatePortal({ rootDir: f.root, gameSlugs: slugs });

test('portal: a good portal passes; hidden files only produce warnings', async () => {
  const f = await makeFixture({});
  try {
    const r = await validate(f);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('.DS_Store')));
    assert.ok(r.warnings.some((w) => w.includes('Thumbs.db')));
  } finally { await cleanup(f); }
});

test('portal: missing required files and folders are reported', async () => {
  const f = await makeFixture({});
  try {
    for (const name of ['games.css', 'games.js', '404.html', 'index.html']) await fs.rm(path.join(f.root, 'portal', name));
    await fs.rm(path.join(f.root, 'portal', 'asset'), { recursive: true });
    const text = (await validate(f)).errors.join('\n');
    for (const name of ['games.css', 'games.js', '404.html', 'index.html']) assert.match(text, new RegExp(`portal/${name} is missing`));
    assert.match(text, /portal\/asset\/ is missing/);
  } finally { await cleanup(f); }
});

test('portal: missing portal directory is reported', async () => {
  const f = await makeFixture({});
  try {
    await fs.rm(path.join(f.root, 'portal'), { recursive: true });
    assert.match((await validate(f)).errors[0], /portal\/ directory is missing/);
  } finally { await cleanup(f); }
});

test('portal: broken references are reported (file, case, hidden file, folder without index)', async () => {
  const f = await makeFixture({});
  try {
    await write(path.join(f.root, 'portal', 'asset', '.secret'), 'x');
    await fs.mkdir(path.join(f.root, 'portal', 'empty'));
    await write(
      path.join(f.root, 'portal', 'index.html'),
      '<link href="/games.css"><img src="/asset/missing.png"><img src="/Asset/logo.svg"><img src="/asset/.secret"><a href="/empty/">e</a><a href="/portal/games.css">p</a>'
    );
    const text = (await validate(f)).errors.join('\n');
    assert.match(text, /broken reference "\/asset\/missing\.png"/);
    assert.match(text, /broken reference "\/Asset\/logo\.svg"/);
    assert.match(text, /hidden file/);
    assert.match(text, /folder without index\.html/);
    assert.match(text, /broken reference "\/portal\/games\.css"/);
    assert.match(text, /contains "\/portal\/"/);
  } finally { await cleanup(f); }
});

test('portal: external links, anchors, data: URIs and commented-out tags are ignored', async () => {
  const f = await makeFixture({});
  try {
    await write(
      path.join(f.root, 'portal', 'index.html'),
      '<link href="/games.css"><a href="https://example.com/x">x</a><a href="#top">t</a><img src="data:image/png;base64,AAAA"><a href="mailto:a@b.c">m</a><a href="//cdn.example.com/x.js">c</a><!-- <img src="/nope.png"> -->'
    );
    assert.deepEqual((await validate(f)).errors, []);
  } finally { await cleanup(f); }
});

test('portal: game links must use the trailing-slash form /slug/', async () => {
  const f = await makeFixture({});
  try {
    await write(path.join(f.root, 'portal', 'index.html'), '<link href="/games.css"><a href="/alpha">no slash</a>');
    assert.match((await validate(f)).errors.join('\n'), /trailing slash: \/alpha\//);
    await write(path.join(f.root, 'portal', 'index.html'), '<link href="/games.css"><a href="/alpha/">slash</a>');
    assert.deepEqual((await validate(f)).errors, []);
  } finally { await cleanup(f); }
});

test('portal: CSS url() references are checked', async () => {
  const f = await makeFixture({});
  try {
    await write(path.join(f.root, 'portal', 'games.css'), 'a{background:url(/asset/logo.svg)} b{background:url("/asset/gone.png")}');
    const text = (await validate(f)).errors.join('\n');
    assert.match(text, /broken reference "\/asset\/gone\.png"/);
    assert.ok(!text.includes('logo.svg'));
  } finally { await cleanup(f); }
});

test('portal: relative references are warnings, not errors', async () => {
  const f = await makeFixture({});
  try {
    await write(path.join(f.root, 'portal', 'index.html'), '<link href="/games.css"><a href="other.html">rel</a>');
    const r = await validate(f);
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('relative reference')));
  } finally { await cleanup(f); }
});

test('portal: symlinks are rejected (skipped where the OS does not allow creating them)', async (t) => {
  const f = await makeFixture({});
  try {
    try {
      await fs.symlink(path.join(f.root, 'portal', 'games.css'), path.join(f.root, 'portal', 'link.css'));
    } catch {
      t.skip('symlinks cannot be created here');
      return;
    }
    assert.match((await validate(f)).errors.join('\n'), /symbolic link/);
  } finally { await cleanup(f); }
});
