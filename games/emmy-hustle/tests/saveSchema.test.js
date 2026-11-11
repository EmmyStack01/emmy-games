// Tests for src/state/saveSchema.js, using Node's built-in test runner.
// Run them with:  npm test

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SAVE_VERSION,
  SAVE_KEYS,
  MAX_MONEY,
  MISSION_STATES,
  MIGRATIONS,
  createDefaultSave,
  validateSave,
  migrateSave,
  parseSave,
  serializeSave,
} from '../src/state/saveSchema.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1'; // owned by src/state/Settings.js
const CONTEXT = { coinIds: ['c01', 'c02', 'c03'], missionIds: ['firstDelivery'] };

const progress = (overrides = {}) => ({ state: 'available', runId: 0, completed: 0, lastPaidRunId: 0, ...overrides });
const makeSave = (overrides = {}) => ({
  v: SAVE_VERSION,
  savedAt: 1_791_720_000_000,
  money: 750,
  coins: { collected: { c01: 1_791_719_000_000 } },
  missions: { firstDelivery: progress({ state: 'deliver', runId: 2, completed: 1, lastPaidRunId: 1 }) },
  ...overrides,
});
const withMission = (changes) => makeSave({ missions: { firstDelivery: progress(changes) } });
const rejects = (result, reason) => {
  assert.equal(result.ok, false, 'expected the save to be rejected');
  if (reason) assert.equal(result.reason, reason);
  assert.ok(Array.isArray(result.problems));
  return result;
};
const accepts = (result) => {
  assert.equal(result.ok, true, `expected the save to be accepted: ${JSON.stringify(result.problems)}`);
  return result;
};

describe('constants and keys', () => {
  test('the three save keys are distinct and none is the settings key', () => {
    const keys = Object.values(SAVE_KEYS);
    assert.equal(new Set(keys).size, 3);
    assert.ok(!keys.includes(SETTINGS_KEY));
    keys.forEach((key) => assert.ok(key.startsWith('emmys-hustle:save'), key));
    assert.notEqual(SAVE_KEYS.main, SAVE_KEYS.backup);
  });

  test('SAVE_VERSION is a whole number and every older version has a migration', () => {
    assert.ok(Number.isInteger(SAVE_VERSION) && SAVE_VERSION >= 1);
    for (let v = 1; v < SAVE_VERSION; v += 1) {
      assert.equal(typeof MIGRATIONS[v], 'function', `missing migration from version ${v}`);
    }
  });

  test('only available, pickup and deliver can be stored', () => {
    assert.deepEqual([...MISSION_STATES], ['available', 'pickup', 'deliver']);
  });

  test('the schema file is pure: no imports, no browser or storage use', () => {
    const source = readFileSync(new URL('../src/state/saveSchema.js', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/^\s*import\s/m.test(code), 'saveSchema.js must not import anything');
    assert.ok(!/\b(window|document|localStorage|sessionStorage|navigator|phaser)\b/i.test(code));
    assert.ok(!code.includes(SETTINGS_KEY), 'the schema must not touch the settings key');
  });
});

describe('context checks (programming errors throw)', () => {
  test('accepts arrays and Sets', () => {
    accepts(validateSave(makeSave(), CONTEXT));
    accepts(validateSave(makeSave(), { coinIds: new Set(['c01']), missionIds: new Set(['firstDelivery']) }));
  });

  test('throws on a missing, malformed or duplicate context', () => {
    assert.throws(() => validateSave(makeSave()), TypeError);
    assert.throws(() => validateSave(makeSave(), null), TypeError);
    assert.throws(() => validateSave(makeSave(), { coinIds: 'c01', missionIds: [] }), TypeError);
    assert.throws(() => validateSave(makeSave(), { coinIds: ['c01', 'c01'], missionIds: [] }), /duplicate/);
    assert.throws(() => validateSave(makeSave(), { coinIds: [''], missionIds: [] }), TypeError);
    assert.throws(() => validateSave(makeSave(), { coinIds: [1], missionIds: [] }), TypeError);
    assert.throws(() => validateSave(makeSave(), { coinIds: [] }), TypeError);
  });
});

describe('createDefaultSave', () => {
  test('builds a valid new game', () => {
    const save = createDefaultSave(500, ['firstDelivery']);
    assert.deepEqual(save, {
      v: SAVE_VERSION,
      savedAt: 0,
      money: 500,
      coins: { collected: {} },
      missions: { firstDelivery: { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 } },
    });
    accepts(validateSave(save, CONTEXT));
  });

  test('refuses an invalid start amount or mission list', () => {
    [-1, 1.5, NaN, Infinity, '500', null, undefined, MAX_MONEY + 1].forEach((bad) => {
      assert.throws(() => createDefaultSave(bad, ['firstDelivery']), TypeError, String(bad));
    });
    assert.throws(() => createDefaultSave(500, 'firstDelivery'), TypeError);
    assert.throws(() => createDefaultSave(500, ['a', 'a']), TypeError);
  });

  test('every call returns fresh objects', () => {
    const a = createDefaultSave(500, ['firstDelivery']);
    const b = createDefaultSave(500, ['firstDelivery']);
    a.missions.firstDelivery.runId = 9;
    a.coins.collected.c01 = 1;
    assert.equal(b.missions.firstDelivery.runId, 0);
    assert.deepEqual(b.coins.collected, {});
  });
});

describe('validateSave: a good save', () => {
  test('is accepted unchanged, with no warnings', () => {
    const save = makeSave();
    const result = accepts(validateSave(save, CONTEXT));
    assert.deepEqual(result.save, save);
    assert.deepEqual(result.warnings, []);
  });

  test('returns a copy, never the input', () => {
    const save = makeSave();
    const { save: clean } = accepts(validateSave(save, CONTEXT));
    assert.notEqual(clean, save);
    assert.notEqual(clean.coins.collected, save.coins.collected);
    assert.notEqual(clean.missions.firstDelivery, save.missions.firstDelivery);
    save.money = 1;
    save.coins.collected.c02 = 5;
    assert.equal(clean.money, 750);
    assert.ok(!('c02' in clean.coins.collected));
  });

  test('the input is not modified, even when repairs are made', () => {
    const save = makeSave({ missions: { firstDelivery: progress({ state: 'done', runId: 1 }) }, extra: true });
    const before = JSON.stringify(save);
    accepts(validateSave(save, CONTEXT));
    assert.equal(JSON.stringify(save), before);
  });

  test('accepts the edges: money 0 and MAX_MONEY, savedAt 0, no coins', () => {
    accepts(validateSave(makeSave({ money: 0 }), CONTEXT));
    accepts(validateSave(makeSave({ money: MAX_MONEY }), CONTEXT));
    accepts(validateSave(makeSave({ savedAt: 0 }), CONTEXT));
    accepts(validateSave(makeSave({ coins: { collected: {} } }), CONTEXT));
  });
});

describe('validateSave: shape and version', () => {
  test('rejects things that are not objects', () => {
    [null, undefined, [], 42, 'save', true].forEach((bad) => rejects(validateSave(bad, CONTEXT), 'not-object'));
  });

  test('rejects a version other than the current one', () => {
    [0, 2, '1', null, undefined].forEach((v) => rejects(validateSave(makeSave({ v }), CONTEXT), 'invalid'));
  });

  test('rejects a missing or malformed section', () => {
    const missing = (field) => {
      const save = makeSave();
      delete save[field];
      return save;
    };
    ['savedAt', 'money', 'coins', 'missions'].forEach((field) => rejects(validateSave(missing(field), CONTEXT), 'invalid'));
    rejects(validateSave(makeSave({ coins: {} }), CONTEXT), 'invalid');
    rejects(validateSave(makeSave({ coins: { collected: [] } }), CONTEXT), 'invalid');
    rejects(validateSave(makeSave({ coins: null }), CONTEXT), 'invalid');
    rejects(validateSave(makeSave({ missions: [] }), CONTEXT), 'invalid');
    rejects(validateSave(makeSave({ missions: null }), CONTEXT), 'invalid');
  });

  test('reports every problem, not just the first', () => {
    const result = rejects(validateSave(makeSave({ money: -5, savedAt: 'x' }), CONTEXT), 'invalid');
    assert.ok(result.problems.length >= 2);
  });

  test('drops unknown top-level fields with a warning', () => {
    const { save, warnings } = accepts(validateSave(makeSave({ position: { x: 1, y: 2 }, cheats: true }), CONTEXT));
    assert.ok(!('position' in save) && !('cheats' in save));
    assert.equal(warnings.length, 2);
  });
});

describe('validateSave: money', () => {
  test('rejects negative, fractional, non-finite, non-numeric and oversized values', () => {
    [-1, 0.5, 100.25, NaN, Infinity, -Infinity, '750', null, undefined, {}, [], true, MAX_MONEY + 1, 1e30, Number.MAX_VALUE].forEach(
      (money) => rejects(validateSave(makeSave({ money }), CONTEXT), 'invalid')
    );
  });
});

describe('validateSave: savedAt', () => {
  test('rejects negative, non-finite and non-numeric values', () => {
    [-1, NaN, Infinity, '1', null, undefined].forEach((savedAt) => rejects(validateSave(makeSave({ savedAt }), CONTEXT), 'invalid'));
  });
});

describe('validateSave: coins', () => {
  test('keeps known coins and drops unknown ones with a warning', () => {
    const save = makeSave({ coins: { collected: { c01: 10, c02: 20, ghost: 30 } } });
    const { save: clean, warnings } = accepts(validateSave(save, CONTEXT));
    assert.deepEqual(clean.coins.collected, { c01: 10, c02: 20 });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /ghost/);
  });

  test('rejects a collected time that is not a non-negative number', () => {
    [-1, NaN, Infinity, '10', null, true, {}].forEach((when) => {
      rejects(validateSave(makeSave({ coins: { collected: { c01: when } } }), CONTEXT), 'invalid');
    });
  });

  test('an ID that is not in the data is dropped even if it is spelled like an Object key', () => {
    const raw = '{"v":1,"savedAt":0,"money":5,"coins":{"collected":{"__proto__":{"polluted":true},"constructor":1,"c01":7}},"missions":{}}';
    const { save } = accepts(validateSave(JSON.parse(raw), CONTEXT));
    assert.deepEqual(save.coins.collected, { c01: 7 });
    assert.equal({}.polluted, undefined);
    assert.equal(Object.getPrototypeOf(save.coins.collected), Object.prototype);
  });

  test('a coin that is new to the game is simply not collected', () => {
    const { save } = accepts(validateSave(makeSave(), { coinIds: ['c01', 'c04'], missionIds: ['firstDelivery'] }));
    assert.deepEqual(Object.keys(save.coins.collected), ['c01']);
  });
});

describe('validateSave: missions', () => {
  test('keeps each persisted state', () => {
    MISSION_STATES.forEach((state) => {
      const runId = state === 'available' ? 0 : 1;
      const { save } = accepts(validateSave(withMission({ state, runId }), CONTEXT));
      assert.equal(save.missions.firstDelivery.state, state);
    });
  });

  test('a mission missing from the save gets a fresh entry (a mission added later)', () => {
    const { save, warnings } = accepts(validateSave(makeSave(), { coinIds: ['c01'], missionIds: ['firstDelivery', 'secondJob'] }));
    assert.deepEqual(save.missions.secondJob, progress());
    assert.deepEqual(warnings, []);
  });

  test('an unknown mission is dropped with a warning', () => {
    const save = makeSave({ missions: { firstDelivery: progress(), retired: progress({ runId: 3 }) } });
    const { save: clean, warnings } = accepts(validateSave(save, CONTEXT));
    assert.deepEqual(Object.keys(clean.missions), ['firstDelivery']);
    assert.equal(warnings.length, 1);
  });

  test('the transient states "offer" and "done" are read as "available"', () => {
    ['offer', 'done'].forEach((state) => {
      const { save, warnings } = accepts(validateSave(withMission({ state, runId: 1, lastPaidRunId: 1, completed: 1 }), CONTEXT));
      assert.equal(save.missions.firstDelivery.state, 'available');
      assert.equal(warnings.length, 1);
    });
  });

  test('rejects an unknown or non-string state', () => {
    ['', 'DELIVER', 'paid', 'running', 3, null, undefined, {}].forEach((state) => {
      rejects(validateSave(withMission({ state }), CONTEXT), 'invalid');
    });
  });

  test('rejects counters that are not whole numbers, 0 or more', () => {
    ['runId', 'completed', 'lastPaidRunId'].forEach((field) => {
      [-1, 1.5, NaN, Infinity, '2', null, undefined, Number.MAX_SAFE_INTEGER + 1].forEach((value) => {
        rejects(validateSave(withMission({ [field]: value }), CONTEXT), 'invalid');
      });
    });
  });

  test('rejects a mission entry that is not an object', () => {
    [null, [], 'deliver', 5].forEach((entry) => {
      rejects(validateSave(makeSave({ missions: { firstDelivery: entry } }), CONTEXT), 'invalid');
    });
  });

  test('REWARD SAFETY: "deliver" for a run that is already paid is reset to "available"', () => {
    const { save, warnings } = accepts(validateSave(withMission({ state: 'deliver', runId: 3, completed: 3, lastPaidRunId: 3 }), CONTEXT));
    assert.equal(save.missions.firstDelivery.state, 'available');
    assert.equal(save.missions.firstDelivery.lastPaidRunId, 3);
    assert.equal(warnings.length, 1);
  });

  test('REWARD SAFETY: the same applies to "pickup" and to an older run id', () => {
    ['pickup', 'deliver'].forEach((state) => {
      const { save } = accepts(validateSave(withMission({ state, runId: 2, completed: 4, lastPaidRunId: 4 }), CONTEXT));
      assert.equal(save.missions.firstDelivery.state, 'available');
    });
  });

  test('REWARD SAFETY: a run id of 0 can never be in progress', () => {
    ['pickup', 'deliver'].forEach((state) => {
      const { save } = accepts(validateSave(withMission({ state, runId: 0 }), CONTEXT));
      assert.equal(save.missions.firstDelivery.state, 'available');
    });
  });

  test('a genuine in-progress run (newer than the last paid one) is kept', () => {
    ['pickup', 'deliver'].forEach((state) => {
      const { save, warnings } = accepts(validateSave(withMission({ state, runId: 4, completed: 3, lastPaidRunId: 3 }), CONTEXT));
      assert.equal(save.missions.firstDelivery.state, state);
      assert.deepEqual(warnings, []);
    });
  });

  test('a run counter behind lastPaidRunId is raised so a run id is never reused', () => {
    const { save } = accepts(validateSave(withMission({ state: 'available', runId: 1, lastPaidRunId: 5, completed: 5 }), CONTEXT));
    assert.equal(save.missions.firstDelivery.runId, 5);
    assert.equal(save.missions.firstDelivery.lastPaidRunId, 5);
  });
});

describe('migrateSave', () => {
  test('rejects things that are not saves or have no usable version', () => {
    [null, [], 'x', 3].forEach((bad) => rejects(migrateSave(bad), 'not-object'));
    [{}, { v: 0 }, { v: -1 }, { v: 1.5 }, { v: '1' }, { v: NaN }, { v: null }].forEach((bad) => rejects(migrateSave(bad), 'bad-version'));
  });

  test('refuses a save from a newer game', () => {
    rejects(migrateSave({ v: SAVE_VERSION + 1 }), 'newer-version');
  });

  test('a current save passes through as an untouched copy', () => {
    const save = makeSave();
    const result = accepts(migrateSave(save));
    assert.deepEqual(result.data, save);
    assert.notEqual(result.data, save);
    assert.equal(result.migratedFrom, null);
  });

  test('runs each step in order, from the save version up to the target', () => {
    const calls = [];
    const migrations = {
      1: (old) => (calls.push(1), { ...old, v: 2, upgrades: {} }),
      2: (old) => (calls.push(2), { ...old, v: 3, houses: [] }),
    };
    const original = { v: 1, money: 10 };
    const result = accepts(migrateSave(original, migrations, 3));
    assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(result.data, { v: 3, money: 10, upgrades: {}, houses: [] });
    assert.equal(result.migratedFrom, 1);
    assert.deepEqual(original, { v: 1, money: 10 }, 'the input must not change');
  });

  test('starts from the save version, skipping steps it has already passed', () => {
    const calls = [];
    const migrations = {
      1: (old) => (calls.push(1), { ...old, v: 2 }),
      2: (old) => (calls.push(2), { ...old, v: 3 }),
    };
    const result = accepts(migrateSave({ v: 2 }, migrations, 3));
    assert.deepEqual(calls, [2]);
    assert.equal(result.migratedFrom, 2);
  });

  test('a step that mutates its input cannot change the caller data', () => {
    const original = { v: 1, nested: { n: 1 } };
    accepts(migrateSave(original, { 1: (old) => { old.nested.n = 99; old.v = 2; return old; } }, 2));
    assert.equal(original.nested.n, 1);
  });

  test('fails cleanly when a step is missing, throws, or returns the wrong thing', () => {
    rejects(migrateSave({ v: 1 }, {}, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: () => { throw new Error('boom'); } }, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: () => ({ v: 1 }) }, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: () => ({ v: 3 }) }, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: () => null }, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: () => [] }, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: () => 'v2' }, 2), 'migration-failed');
    rejects(migrateSave({ v: 1 }, { 1: (old) => ({ ...old, v: 2 }) }, 3), 'migration-failed'); // step 2 missing
  });
});

describe('parseSave', () => {
  const text = (value) => JSON.stringify(value);

  test('nothing stored is "missing", not corruption', () => {
    rejects(parseSave(null, CONTEXT), 'missing');
    rejects(parseSave(undefined, CONTEXT), 'missing');
  });

  test('text that is not JSON is "not-json"', () => {
    ['', ' ', 'garbage', '{', '{"v":1,', '{"v":1,"money":', 'undefined', 'NaN', "{'v':1}"].forEach((raw) => {
      rejects(parseSave(raw, CONTEXT), 'not-json');
    });
    rejects(parseSave(42, CONTEXT), 'not-json');
    rejects(parseSave({}, CONTEXT), 'not-json');
  });

  test('JSON that is not an object is "not-object"', () => {
    ['null', '[]', '123', '"save"', 'true', '[{"v":1}]'].forEach((raw) => rejects(parseSave(raw, CONTEXT), 'not-object'));
  });

  test('a missing or bad version is "bad-version"', () => {
    const noVersion = makeSave();
    delete noVersion.v;
    rejects(parseSave(text(noVersion), CONTEXT), 'bad-version');
    rejects(parseSave(text(makeSave({ v: 'one' })), CONTEXT), 'bad-version');
    rejects(parseSave(text(makeSave({ v: 0 })), CONTEXT), 'bad-version');
  });

  test('a save from a newer game is "newer-version"', () => {
    rejects(parseSave(text(makeSave({ v: 999 })), CONTEXT), 'newer-version');
  });

  test('a damaged value is "invalid" and says what is wrong', () => {
    const result = rejects(parseSave(text(makeSave({ money: 'a lot' })), CONTEXT), 'invalid');
    assert.match(result.problems.join(' '), /money/);
  });

  test('a valid save is accepted, with its warnings and no migration', () => {
    const raw = text(makeSave({ coins: { collected: { c01: 1, ghost: 2 } } }));
    const result = accepts(parseSave(raw, CONTEXT));
    assert.deepEqual(result.save.coins.collected, { c01: 1 });
    assert.equal(result.warnings.length, 1);
    assert.equal(result.migratedFrom, null);
  });

  test('a save read back from text is exactly what was written', () => {
    const save = makeSave();
    assert.deepEqual(accepts(parseSave(serializeSave(save, CONTEXT), CONTEXT)).save, save);
  });

  test('survives a truncated copy of a real save', () => {
    const raw = serializeSave(makeSave(), CONTEXT);
    for (let cut = 0; cut < raw.length; cut += 7) {
      const result = parseSave(raw.slice(0, cut), CONTEXT);
      assert.equal(result.ok, false, `a save cut at ${cut} characters must not load`);
    }
  });
});

describe('serializeSave', () => {
  test('writes text that parses back to the same save', () => {
    const save = makeSave();
    const raw = serializeSave(save, CONTEXT);
    assert.equal(typeof raw, 'string');
    assert.deepEqual(JSON.parse(raw), save);
  });

  test('refuses to write an invalid save, so NaN never becomes null on disk', () => {
    assert.throws(() => serializeSave(makeSave({ money: NaN }), CONTEXT), /invalid save/);
    assert.throws(() => serializeSave(makeSave({ money: -1 }), CONTEXT), /money/);
    assert.throws(() => serializeSave(null, CONTEXT), /invalid save/);
  });

  test('writes only the clean, normalised version', () => {
    const raw = serializeSave(makeSave({ coins: { collected: { c01: 1, ghost: 2 } }, extra: 1 }), CONTEXT);
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.coins.collected, { c01: 1 });
    assert.ok(!('extra' in parsed));
  });

  test('never writes a paid-out run as resumable', () => {
    const raw = serializeSave(withMission({ state: 'deliver', runId: 2, completed: 2, lastPaidRunId: 2 }), CONTEXT);
    assert.equal(JSON.parse(raw).missions.firstDelivery.state, 'available');
  });
});