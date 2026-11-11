import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateGameOutput } from '../scripts/lib/gameOutput.mjs';
import { cleanup, makeTempDir, write } from './helpers/fixture.mjs';

// A realistic Vite-style output for a game published at /<slug>/.
async function makeOutput(slug, { extraHtml = '', js = 'console.log("ok");', css = 'body{margin:0}' } = {}) {
  const dir = await makeTempDir('emmy-output-');
  const base = `/${slug}/`;
  await write(
    path.join(dir, 'index.html'),
    `<!doctype html><html><head><link rel="icon" href="data:,"><script type="module" crossorigin src="${base}assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="${base}assets/index-abc.css">${extraHtml}</head><body></body></html>`
  );
  await write(path.join(dir, 'assets', 'index-abc.js'), js);
  await write(path.join(dir, 'assets', 'index-abc.css'), css);
  await write(path.join(dir, 'assets', 'characters', 'emmy', 'emmy-sheet.png'), Buffer.from([137, 80, 78, 71]));
  return { root: dir };
}
const REQUIRED = ['assets/characters/emmy/emmy-sheet.png'];
const check = (o, slug, requiredFiles = REQUIRED) => validateGameOutput({ distDir: o.root, slug, requiredFiles });

test('output: correct nested base for emmy-hustle passes', async () => {
  const o = await makeOutput('emmy-hustle');
  try { assert.deepEqual((await check(o, 'emmy-hustle')).errors, []); } finally { await cleanup(o); }
});

test('output: paths are derived from the slug, so any future game works the same way', async () => {
  const o = await makeOutput('space-racer');
  try {
    assert.deepEqual((await check(o, 'space-racer')).errors, []);
    // Same files checked as another game must fail: they point at /space-racer/, not /emmy-hustle/.
    const wrong = await check(o, 'emmy-hustle');
    assert.ok(wrong.errors.some((e) => /outside \/emmy-hustle\//.test(e)));
  } finally { await cleanup(o); }
});

test('output: root-level /assets/ references in HTML fail (Vite built with base "/")', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    await write(path.join(o.root, 'index.html'), '<script type="module" src="/assets/index-abc.js"></script>');
    const r = await check(o, 'emmy-hustle');
    assert.match(r.errors.join('\n'), /root-level reference/);
    assert.match(r.errors.join('\n'), /outside \/emmy-hustle\//);
    assert.match(r.errors.join('\n'), /no references under \/emmy-hustle\//);
  } finally { await cleanup(o); }
});

test('output: relative references (Vite base "./") fail', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    await write(path.join(o.root, 'index.html'), '<script type="module" src="./assets/index-abc.js"></script>');
    const r = await check(o, 'emmy-hustle');
    assert.match(r.errors.join('\n'), /relative reference/);
    assert.match(r.errors.join('\n'), /no references under/);
  } finally { await cleanup(o); }
});

test('output: root-level asset paths inside JavaScript fail', async () => {
  for (const js of ['load.image("a", "/assets/characters/emmy/emmy-sheet.png");', "x=('/assets/a.png')", 'x=`/assets/a.png`', 'y=url(/assets/a.png)']) {
    const o = await makeOutput('emmy-hustle', { js });
    try {
      const r = await check(o, 'emmy-hustle');
      assert.match(r.errors.join('\n'), /index-abc\.js: root-level reference/, js);
    } finally { await cleanup(o); }
  }
});

test('output: root-level url() in CSS fails; nested url() passes', async () => {
  let o = await makeOutput('emmy-hustle', { css: 'a{background:url(/assets/bg.png)}' });
  try { assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /index-abc\.css: root-level reference/); } finally { await cleanup(o); }
  o = await makeOutput('emmy-hustle', { css: 'a{background:url(/emmy-hustle/assets/characters/emmy/emmy-sheet.png)}' });
  try { assert.deepEqual((await check(o, 'emmy-hustle')).errors, []); } finally { await cleanup(o); }
});

test('output: correctly nested references in JavaScript pass', async () => {
  const o = await makeOutput('emmy-hustle', { js: 'const base="/emmy-hustle/";load("/emmy-hustle/assets/characters/emmy/emmy-sheet.png");' });
  try { assert.deepEqual((await check(o, 'emmy-hustle')).errors, []); } finally { await cleanup(o); }
});

test('output: a top-level file in the build is also protected from root-level references', async () => {
  const o = await makeOutput('emmy-hustle', { js: 'fetch("/favicon.svg")' });
  try {
    await write(path.join(o.root, 'favicon.svg'), '<svg/>');
    assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /root-level reference/);
  } finally { await cleanup(o); }
});

test('output: HTML referring to a file that is not in the build fails', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    await fs.rm(path.join(o.root, 'assets', 'index-abc.css'));
    assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /does not exist in the build output/);
  } finally { await cleanup(o); }
});

test('output: letter-case mismatch in a reference fails (Cloudflare is case-sensitive)', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    await write(path.join(o.root, 'index.html'), '<script type="module" src="/emmy-hustle/Assets/index-abc.js"></script>');
    assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /does not exist/);
  } finally { await cleanup(o); }
});

test('output: the expected character sprite must exist at the correct nested location', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    assert.deepEqual((await check(o, 'emmy-hustle')).errors, []);
    await fs.rm(path.join(o.root, 'assets', 'characters', 'emmy', 'emmy-sheet.png'));
    assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /required file assets\/characters\/emmy\/emmy-sheet\.png is missing .*\/emmy-hustle\/assets\/characters\/emmy\/emmy-sheet\.png/);

    // sprite in the wrong place (e.g. directly under assets/) is still a failure
    await write(path.join(o.root, 'assets', 'emmy-sheet.png'), Buffer.from([1, 2, 3]));
    assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /is missing/);

    // an empty sprite is a failure too
    await write(path.join(o.root, 'assets', 'characters', 'emmy', 'emmy-sheet.png'), '');
    assert.match((await check(o, 'emmy-hustle')).errors.join('\n'), /is empty/);
  } finally { await cleanup(o); }
});

test('output: missing folder or missing index.html fails', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    assert.match((await validateGameOutput({ distDir: path.join(o.root, 'nope'), slug: 'emmy-hustle' })).errors[0], /output folder not found/);
    await fs.rm(path.join(o.root, 'index.html'));
    assert.match((await check(o, 'emmy-hustle')).errors[0], /index\.html is missing/);
  } finally { await cleanup(o); }
});

test('output: external URLs, data: URIs and commented-out tags are not treated as problems', async () => {
  const o = await makeOutput('emmy-hustle', { extraHtml: '<link rel="preconnect" href="https://fonts.googleapis.com"><!-- <script src="/assets/old.js"></script> --><img src="data:image/png;base64,AAAA">' });
  try { assert.deepEqual((await check(o, 'emmy-hustle')).errors, []); } finally { await cleanup(o); }
});

test('output: hidden files in the build are warnings (they are excluded when staging)', async () => {
  const o = await makeOutput('emmy-hustle');
  try {
    await write(path.join(o.root, '.DS_Store'), 'junk');
    const r = await check(o, 'emmy-hustle');
    assert.deepEqual(r.errors, []);
    assert.ok(r.warnings.some((w) => w.includes('.DS_Store')));
  } finally { await cleanup(o); }
});
