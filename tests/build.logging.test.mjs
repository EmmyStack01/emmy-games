import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandRunner } from '../scripts/lib/orchestrator.mjs';
import { build, cleanup, makeFixture } from './helpers/fixture.mjs';

test('logging: a passing test step prints only a short summary, not the whole TAP stream', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }] });
  try {
    const real = createCommandRunner({ stdio: 'capture' });
    const r = await build(f, {
      runCommand: async (command, opts) =>
        command === 'npm test'
          ? { code: 0, output: 'TAP version 13\nok 1 - something\n# tests 5\n# suites 1\n# pass 5\n# fail 0\n# skipped 0\n' }
          : real(command, opts),
    });
    assert.equal(r.ok, true, r.log);
    assert.match(r.log, /tests 5/);
    assert.match(r.log, /pass 5/);
    assert.doesNotMatch(r.log, /TAP version/);
    assert.doesNotMatch(r.log, /ok 1 - something/);
  } finally { await cleanup(f); }
});

test('logging: a failing test step prints its full output so the cause is visible', async () => {
  const f = await makeFixture({ games: [{ slug: 'alpha' }] });
  try {
    const real = createCommandRunner({ stdio: 'capture' });
    const r = await build(f, {
      runCommand: async (command, opts) =>
        command === 'npm test' ? { code: 1, output: 'not ok 7 - the thing that broke\n  AssertionError: details here\n' } : real(command, opts),
    });
    assert.equal(r.ok, false);
    assert.match(r.log, /not ok 7 - the thing that broke/);
    assert.match(r.log, /AssertionError: details here/);
  } finally { await cleanup(f); }
});
