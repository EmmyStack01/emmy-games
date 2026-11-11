// src/missions/missionSequence.js: unlocks, mission status and the next objective.
// Everything is a pure function of (order, saved progress). The inputs are deep-frozen in
// every test, so a function that tried to change them would throw.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS,
  OBJECTIVE,
  isUnlocked,
  missionStatus,
  getActiveMissionIds,
  findActiveMission,
  selectNextObjective,
} from '../src/missions/missionSequence.js';
import { MISSION_IDS } from '../src/missions/missionData.js';

const deepFreeze = (value) => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const ORDER = deepFreeze(['a', 'b', 'c', 'd']);
const rec = (state = 'available', runId = 0, completed = 0, lastPaidRunId = 0) => ({ state, runId, completed, lastPaidRunId });
const done = (n = 1) => rec('available', n, n, n); // delivered n times, nothing in progress
const progress = (entries) => deepFreeze(entries);
const statuses = (p) => ORDER.map((id) => missionStatus(ORDER, p, id));

describe('a brand-new game', () => {
  const fresh = progress({ a: rec(), b: rec(), c: rec(), d: rec() });

  test('only the first mission is unlocked', () => {
    assert.deepEqual(ORDER.map((id) => isUnlocked(ORDER, fresh, id)), [true, false, false, false]);
  });

  test('the first is the new job, the rest are locked', () => {
    assert.deepEqual(statuses(fresh), [STATUS.NEW, STATUS.LOCKED, STATUS.LOCKED, STATUS.LOCKED]);
  });

  test('the next objective is the first mission\'s shop', () => {
    assert.deepEqual(selectNextObjective(ORDER, fresh), { type: OBJECTIVE.NEW_JOB, missionId: 'a' });
  });

  test('missing, empty or null progress behaves like a new game', () => {
    [{}, null, undefined].forEach((p) => {
      assert.deepEqual(statuses(p), [STATUS.NEW, STATUS.LOCKED, STATUS.LOCKED, STATUS.LOCKED]);
      assert.deepEqual(selectNextObjective(ORDER, p), { type: OBJECTIVE.NEW_JOB, missionId: 'a' });
    });
  });
});

describe('unlocking', () => {
  test('delivering a mission once unlocks the next one, and only that one', () => {
    const p = progress({ a: done(1), b: rec(), c: rec(), d: rec() });
    assert.deepEqual(ORDER.map((id) => isUnlocked(ORDER, p, id)), [true, true, false, false]);
    assert.deepEqual(statuses(p), [STATUS.REPEATABLE, STATUS.NEW, STATUS.LOCKED, STATUS.LOCKED]);
  });

  test('delivering it again, or many times, changes nothing about the unlocks', () => {
    [2, 5, 100].forEach((n) => {
      const p = progress({ a: done(n), b: rec(), c: rec(), d: rec() });
      assert.deepEqual(statuses(p), [STATUS.REPEATABLE, STATUS.NEW, STATUS.LOCKED, STATUS.LOCKED]);
    });
  });

  test('unlocking does NOT accept the mission: the next one stays available and unstarted', () => {
    const p = progress({ a: done(1), b: rec(), c: rec(), d: rec() });
    const objective = selectNextObjective(ORDER, p);
    assert.equal(objective.type, OBJECTIVE.NEW_JOB); // a pointer to its shop, not a started job
    assert.equal(objective.stage, undefined);
    assert.equal(p.b.state, 'available');
    assert.equal(p.b.runId, 0);
    assert.equal(findActiveMission(ORDER, p), null);
  });

  test('starting a mission (a run accepted, not yet delivered) does not unlock the next', () => {
    const p = progress({ a: rec('pickup', 1, 0, 0), b: rec(), c: rec(), d: rec() });
    assert.equal(isUnlocked(ORDER, p, 'b'), false);
    const p2 = progress({ a: rec('deliver', 1, 0, 0), b: rec(), c: rec(), d: rec() });
    assert.equal(isUnlocked(ORDER, p2, 'b'), false);
  });

  test('the whole chain unlocks one step at a time', () => {
    const steps = [
      [{ a: done() }, [STATUS.REPEATABLE, STATUS.NEW, STATUS.LOCKED, STATUS.LOCKED]],
      [{ a: done(), b: done() }, [STATUS.REPEATABLE, STATUS.REPEATABLE, STATUS.NEW, STATUS.LOCKED]],
      [{ a: done(), b: done(), c: done() }, [STATUS.REPEATABLE, STATUS.REPEATABLE, STATUS.REPEATABLE, STATUS.NEW]],
      [{ a: done(), b: done(), c: done(), d: done() }, Array(4).fill(STATUS.REPEATABLE)],
    ];
    steps.forEach(([entries, expected]) => assert.deepEqual(statuses(progress(entries)), expected));
  });

  test('a mission is unlocked by the one BEFORE it, not by later ones', () => {
    const p = progress({ a: rec(), b: rec(), c: done(), d: rec() });
    assert.equal(isUnlocked(ORDER, p, 'b'), false);
    assert.equal(isUnlocked(ORDER, p, 'd'), true); // c was delivered (a damaged save): d follows c
    assert.equal(missionStatus(ORDER, p, 'c'), STATUS.LOCKED); // but c itself is still locked
  });

  test('an id that is not in the order is never unlocked and has no status', () => {
    assert.equal(isUnlocked(ORDER, {}, 'zzz'), false);
    assert.equal(missionStatus(ORDER, {}, 'zzz'), null);
  });

  test('the real mission ids start with firstDelivery open and the next locked', () => {
    const fresh = progress(Object.fromEntries(MISSION_IDS.map((id) => [id, rec()])));
    assert.equal(isUnlocked(MISSION_IDS, fresh, 'firstDelivery'), true);
    assert.equal(isUnlocked(MISSION_IDS, fresh, 'freshFromTheOven'), false);
    const after = progress({ ...fresh, firstDelivery: done(1) });
    assert.equal(isUnlocked(MISSION_IDS, after, 'freshFromTheOven'), true);
    assert.equal(isUnlocked(MISSION_IDS, after, 'suyaForTheHall'), false);
  });
});

describe('active missions', () => {
  test('a job in pickup or deliver is active, and its stage is the objective', () => {
    ['pickup', 'deliver'].forEach((stage) => {
      const p = progress({ a: rec(stage, 1, 0, 0), b: rec(), c: rec(), d: rec() });
      assert.equal(missionStatus(ORDER, p, 'a'), STATUS.ACTIVE);
      assert.deepEqual(selectNextObjective(ORDER, p), { type: OBJECTIVE.ACTIVE, missionId: 'a', stage });
    });
  });

  test('a replay in progress is active, and outranks the next new job', () => {
    const p = progress({ a: rec('deliver', 4, 3, 3), b: rec(), c: rec(), d: rec() });
    assert.deepEqual(statuses(p), [STATUS.ACTIVE, STATUS.NEW, STATUS.LOCKED, STATUS.LOCKED]);
    assert.deepEqual(selectNextObjective(ORDER, p), { type: OBJECTIVE.ACTIVE, missionId: 'a', stage: 'deliver' });
  });

  test('when the replay is delivered, the pointer goes back to the next new job', () => {
    const p = progress({ a: rec('available', 4, 4, 4), b: rec(), c: rec(), d: rec() });
    assert.deepEqual(selectNextObjective(ORDER, p), { type: OBJECTIVE.NEW_JOB, missionId: 'b' });
  });

  test('a run that is already paid is never treated as in progress (the same rule MissionFlow uses)', () => {
    const p = progress({ a: rec('deliver', 1, 1, 1), b: rec(), c: rec(), d: rec() });
    assert.equal(missionStatus(ORDER, p, 'a'), STATUS.REPEATABLE);
    assert.equal(findActiveMission(ORDER, p), null);
    const newer = progress({ a: rec('pickup', 3, 2, 2), b: rec(), c: rec(), d: rec() }); // run 3 is newer than the last paid run 2: in progress
    assert.equal(missionStatus(ORDER, newer, 'a'), STATUS.ACTIVE);
    const behind = progress({ a: rec('pickup', 2, 2, 5), b: rec(), c: rec(), d: rec() }); // paid run is newer
    assert.equal(missionStatus(ORDER, behind, 'a'), STATUS.REPEATABLE);
  });

  test('"offer" and "done" are not in-progress states', () => {
    ['offer', 'done'].forEach((state) => {
      const p = progress({ a: rec(state, 1, 0, 0), b: rec(), c: rec(), d: rec() });
      assert.equal(findActiveMission(ORDER, p), null, state);
    });
  });

  test('a locked mission can never be active, even if a damaged save says it is in progress', () => {
    const p = progress({ a: rec(), b: rec(), c: rec('pickup', 1, 0, 0), d: rec() });
    assert.equal(missionStatus(ORDER, p, 'c'), STATUS.LOCKED);
    assert.deepEqual(getActiveMissionIds(ORDER, p), []);
    assert.deepEqual(selectNextObjective(ORDER, p), { type: OBJECTIVE.NEW_JOB, missionId: 'a' });
  });

  test('two jobs in progress are both reported, in order, so a later stage can keep one', () => {
    const p = progress({ a: done(1), b: rec('pickup', 1, 0, 0), c: rec(), d: rec() });
    const damaged = progress({ a: rec('deliver', 2, 1, 1), b: rec('pickup', 1, 1, 0), c: rec(), d: rec() });
    assert.deepEqual(getActiveMissionIds(ORDER, p), ['b']);
    assert.deepEqual(getActiveMissionIds(ORDER, damaged), ['a', 'b']);
    assert.equal(findActiveMission(ORDER, damaged), 'a');
    assert.equal(selectNextObjective(ORDER, damaged).missionId, 'a');
  });
});

describe('after every mission has been delivered', () => {
  const all = progress({ a: done(2), b: done(1), c: done(3), d: done(1) });

  test('all are repeatable and there is no next job', () => {
    assert.deepEqual(statuses(all), Array(4).fill(STATUS.REPEATABLE));
    assert.deepEqual(selectNextObjective(ORDER, all), { type: OBJECTIVE.NONE, missionId: null });
  });

  test('a replay in progress is still the objective', () => {
    const replay = progress({ ...all, c: rec('pickup', 4, 3, 3) });
    assert.deepEqual(selectNextObjective(ORDER, replay), { type: OBJECTIVE.ACTIVE, missionId: 'c', stage: 'pickup' });
  });
});

describe('messy input never breaks it', () => {
  test('bad counters count as zero', () => {
    ['1', -1, 1.5, NaN, Infinity, null, undefined, {}, [], true].forEach((bad) => {
      const p = progress({ a: { state: 'available', runId: 0, completed: bad, lastPaidRunId: 0 }, b: rec() });
      assert.equal(isUnlocked(ORDER, p, 'b'), false, `completed: ${String(bad)}`);
    });
  });

  test('entries that are not objects are ignored', () => {
    [null, 'x', 7, [], undefined].forEach((bad) => {
      const p = progress({ a: bad });
      assert.equal(missionStatus(ORDER, p, 'a'), STATUS.NEW);
      assert.equal(isUnlocked(ORDER, p, 'b'), false);
    });
  });

  test('names that exist on every object (like "constructor") are not read as progress', () => {
    const order = deepFreeze(['constructor', 'toString']);
    assert.equal(missionStatus(order, {}, 'constructor'), STATUS.NEW);
    assert.equal(isUnlocked(order, {}, 'toString'), false);
  });

  test('an invalid order is a programming error and throws', () => {
    assert.throws(() => isUnlocked('a,b', {}, 'a'), TypeError);
    assert.throws(() => isUnlocked(['a', ''], {}, 'a'), TypeError);
    assert.throws(() => isUnlocked(['a', 'a'], {}, 'a'), TypeError);
    assert.throws(() => selectNextObjective(null, {}), TypeError);
  });

  test('an empty order has no objective', () => {
    assert.deepEqual(selectNextObjective([], {}), { type: OBJECTIVE.NONE, missionId: null });
  });
});

describe('purity', () => {
  test('the same input always gives the same answer, and the input is never changed', () => {
    const p = progress({ a: done(2), b: rec('deliver', 1, 0, 0), c: rec(), d: rec() });
    const before = JSON.stringify(p);
    const first = selectNextObjective(ORDER, p);
    const second = selectNextObjective(ORDER, p);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(p), before);
  });
});
