// Step 3B: the mission sources of src/state/SaveManager.js
// (getMissionProgress, bindMission, unbindMission) with the real MissionFlow and the real
// GameState, and a fake localStorage that records every string written to the main key.
//
// Several tests check the ACTUAL TEXT the SaveManager wrote (JSON.parse of the stored
// string), not merely that some callback ran.
//
// The session helper below imitates what MissionSystem will do in step 3C: pay through
// gameState.addMoney, and ask for a save whenever the mission's saved progress changed.
// It is a stand-in; the real MissionSystem is wired and tested in 3C.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import SaveManager from '../src/state/SaveManager.js';
import { GameState } from '../src/state/GameState.js';
import MissionFlow from '../src/missions/MissionFlow.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { COINS } from '../src/data/neighbourhood.js';
import { ECONOMY } from '../src/config.js';
import { SAVE_KEYS, SAVE_VERSION, parseSave } from '../src/state/saveSchema.js';
import { MemoryStorage } from './support/memoryStorage.js';
import { MISSION_ID, FAR, AT_CUSTOMER, step, advance, reachOffer, reachPickup, reachDeliver } from './support/missionHelpers.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1';
const SETTINGS_VALUE = JSON.stringify({ joystickSide: 'left' });
const COIN_IDS = COINS.map((coin) => coin.id);
const { startMoney, coinValue } = ECONOMY;
const { reward } = FIRST_DELIVERY;
const settle = () => new Promise((resolve) => setImmediate(resolve)); // lets queued saves run

// A localStorage stand-in that keeps every string written to the main key, in order.
class RecordingStorage extends MemoryStorage {
  constructor(initial = {}, options) {
    super({ [SETTINGS_KEY]: SETTINGS_VALUE, ...initial }, options);
    this.mainWrites = [];
  }

  setItem(key, value) {
    if (key === SAVE_KEYS.main && !this.fails(this.failSet, key)) this.mainWrites.push(String(value));
    super.setItem(key, value);
  }
}

const progress = (state, runId, completed, lastPaidRunId) => ({ state, runId, completed, lastPaidRunId });
const saveText = (mission, extra = {}) =>
  JSON.stringify({
    v: SAVE_VERSION,
    savedAt: 1000,
    money: startMoney,
    coins: { collected: {} },
    missions: { [MISSION_ID]: mission },
    ...extra,
  });

// A SaveManager with a fake game state. schedule: 'manual' (queued saves wait for run()),
// 'default' (the real queueMicrotask) or a function.
function makeManager(storage, { missionIds = [MISSION_ID], schedule = 'manual' } = {}) {
  const warnings = [];
  const queue = [];
  const options = {
    storage,
    context: { coinIds: COIN_IDS, missionIds },
    startMoney,
    log: { warn: (...args) => warnings.push(args) },
  };
  if (schedule === 'manual') options.schedule = (task) => queue.push(task);
  else if (typeof schedule === 'function') options.schedule = schedule;

  const manager = new SaveManager(options);
  const gameState = new GameState();
  manager.load();
  manager.attach(gameState);
  const run = () => queue.splice(0).forEach((task) => task());
  return { manager, gameState, warnings, queue, run };
}

// A whole play session: manager + game state + a real MissionFlow wired like MissionSystem.
function startSession(storage, options) {
  const t = makeManager(storage, options);
  const rewardsPaid = [];
  let lastProgress;
  const noteChange = () => {
    const now = JSON.stringify(flow.toSave());
    if (now !== lastProgress) {
      lastProgress = now;
      t.manager.markDirty();
    }
  };
  const flow = new MissionFlow(FIRST_DELIVERY, {
    onState: noteChange,
    onPackage: () => {},
    onReward: (amount, runId) => {
      rewardsPaid.push(runId);
      t.gameState.addMoney(amount);
    },
  });
  flow.restore(t.manager.getMissionProgress(MISSION_ID));
  lastProgress = JSON.stringify(flow.toSave());
  assert.equal(t.manager.bindMission(MISSION_ID, flow), true);
  return { ...t, flow, rewardsPaid };
}

const lastWrite = (storage) => JSON.parse(storage.mainWrites[storage.mainWrites.length - 1]);

// Money must always equal what coins and finished jobs are worth, in EVERY stored snapshot.
function assertConsistent(raw, label = '') {
  const data = JSON.parse(raw);
  const mission = data.missions[MISSION_ID];
  const coins = Object.keys(data.coins.collected).length;
  assert.equal(data.money, startMoney + coins * coinValue + mission.completed * reward, `${label} money matches coins and jobs`);
  assert.equal(mission.completed, mission.lastPaidRunId, `${label} completed matches lastPaidRunId`);
  assert.ok(mission.lastPaidRunId <= mission.runId, `${label} lastPaidRunId <= runId`);
}

describe('getMissionProgress', () => {
  test('a new game: the starting progress for a known mission, nothing for an unknown id', () => {
    const { manager } = makeManager(new RecordingStorage());
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('available', 0, 0, 0));
    ['nope', '', null, undefined, 7, '__proto__', 'toString', 'constructor'].forEach((id) => {
      assert.equal(manager.getMissionProgress(id), null, String(id));
    });
  });

  test('gives a copy: changing it changes nothing', () => {
    const { manager } = makeManager(new RecordingStorage());
    const first = manager.getMissionProgress(MISSION_ID);
    first.state = 'deliver';
    first.runId = 99;
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('available', 0, 0, 0));
  });

  test('returns what the main save holds', () => {
    const storage = new RecordingStorage({ [SAVE_KEYS.main]: saveText(progress('pickup', 2, 1, 1)) });
    assert.deepEqual(makeManager(storage).manager.getMissionProgress(MISSION_ID), progress('pickup', 2, 1, 1));
  });

  test('returns what the backup holds when the main save is damaged', () => {
    const storage = new RecordingStorage({
      [SAVE_KEYS.main]: '{"v":1,"mon',
      [SAVE_KEYS.backup]: saveText(progress('deliver', 3, 2, 2)),
    });
    assert.deepEqual(makeManager(storage).manager.getMissionProgress(MISSION_ID), progress('deliver', 3, 2, 2));
  });

  test('a save written by the Step 2 build (an untouched mission entry) gives the starting progress', () => {
    const step2 = JSON.stringify({
      v: 1,
      savedAt: 1_791_720_000_000,
      money: 600,
      coins: { collected: { 'orisun-01': 1_791_719_000_000, 'orisun-02': 1_791_719_500_000 } },
      missions: { firstDelivery: { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 } },
    });
    const { manager, gameState } = makeManager(new RecordingStorage({ [SAVE_KEYS.main]: step2 }));
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('available', 0, 0, 0));
    assert.equal(gameState.money, 600);
  });

  test('while a source is bound it reports the live progress, even before anything is saved', () => {
    const { manager, flow } = startSession(new RecordingStorage());
    reachPickup(flow);
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('pickup', 1, 0, 0));
  });

  test('if the bound source fails, it falls back to the last known progress', () => {
    const storage = new RecordingStorage({ [SAVE_KEYS.main]: saveText(progress('pickup', 2, 1, 1)) });
    const { manager } = makeManager(storage);
    manager.bindMission(MISSION_ID, {
      toSave() {
        throw new Error('boom');
      },
    });
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('pickup', 2, 1, 1));
  });
});

describe('bindMission and unbindMission: the contract', () => {
  test('a mission that is not known cannot be bound, and nothing throws', () => {
    const { manager, warnings } = makeManager(new RecordingStorage());
    ['nope', '', null, undefined, '__proto__', 'toString'].forEach((id) => {
      assert.equal(manager.bindMission(id, { toSave: () => progress('available', 0, 0, 0) }), false, String(id));
    });
    assert.ok(warnings.length >= 6);
  });

  test('a source without toSave() cannot be bound, and nothing throws', () => {
    const { manager, warnings } = makeManager(new RecordingStorage());
    [null, undefined, {}, 'flow', 5, { toSave: 5 }].forEach((source) => {
      assert.equal(manager.bindMission(MISSION_ID, source), false, String(source));
    });
    assert.ok(warnings.length >= 6);
  });

  test('a valid source binds; unbinding says whether anything was bound', () => {
    const { manager } = makeManager(new RecordingStorage());
    assert.equal(manager.unbindMission(MISSION_ID), false);
    assert.equal(manager.bindMission(MISSION_ID, { toSave: () => progress('available', 0, 0, 0) }), true);
    assert.equal(manager.unbindMission(MISSION_ID), true);
    assert.equal(manager.unbindMission(MISSION_ID), false);
    assert.equal(manager.unbindMission('nope'), false);
  });

  test('binding again replaces the earlier source', () => {
    const storage = new RecordingStorage();
    const { manager, gameState, run } = makeManager(storage);
    manager.bindMission(MISSION_ID, { toSave: () => progress('pickup', 1, 0, 0) });
    manager.bindMission(MISSION_ID, { toSave: () => progress('deliver', 1, 0, 0) });
    gameState.collectCoin('orisun-01', coinValue);
    run();
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('deliver', 1, 0, 0));
  });
});

describe('live mission progress is part of every save', () => {
  test('progress that was asked to be saved is written with the mission as it is now', () => {
    const storage = new RecordingStorage();
    const { flow, run } = startSession(storage);
    reachPickup(flow);
    run();
    assert.equal(storage.mainWrites.length, 1);
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('pickup', 1, 0, 0));
  });

  test('nothing is written until a save is requested', () => {
    const storage = new RecordingStorage();
    const { flow, queue, run } = startSession(storage);
    step(flow, FAR);
    run();
    assert.equal(queue.length, 0);
    assert.equal(storage.mainWrites.length, 0);
  });

  test('a coin pick-up carries the live mission along, even though the mission did not ask for the save', () => {
    const storage = new RecordingStorage();
    const { flow, gameState, run } = startSession(storage);
    reachDeliver(flow);
    run();
    gameState.collectCoin('orisun-07', coinValue);
    run();
    const data = lastWrite(storage);
    assert.deepEqual(data.missions[MISSION_ID], progress('deliver', 1, 0, 0));
    assert.deepEqual(Object.keys(data.coins.collected), ['orisun-07']);
    assert.equal(data.money, startMoney + coinValue);
  });

  test('a mission that is not bound is carried through exactly as it was loaded', () => {
    const storage = new RecordingStorage({
      [SAVE_KEYS.main]: JSON.stringify({
        v: SAVE_VERSION,
        savedAt: 1,
        money: 600,
        coins: { collected: {} },
        missions: { firstDelivery: progress('pickup', 2, 1, 1), secondJob: progress('deliver', 5, 4, 4) },
      }),
    });
    const { manager, gameState, run } = makeManager(storage, { missionIds: [MISSION_ID, 'secondJob'] });
    manager.bindMission(MISSION_ID, { toSave: () => progress('deliver', 2, 1, 1) });
    gameState.collectCoin('orisun-01', coinValue);
    run();
    const data = lastWrite(storage);
    assert.deepEqual(data.missions.firstDelivery, progress('deliver', 2, 1, 1), 'the bound one is live');
    assert.deepEqual(data.missions.secondJob, progress('deliver', 5, 4, 4), 'the unbound one is untouched');
  });
});

describe('COMBINED SNAPSHOT: money and mission progress are in the same write', () => {
  // How the guarantee works: the mission counters and the money are all updated by
  // ordinary code, one after another, in a single stretch of code. The save is only
  // QUEUED during that stretch, and the queued task runs after the stretch has finished,
  // so it reads the final money, coins and mission progress together and stores them with
  // one setItem. These tests check that, by reading the text that was actually written.

  test('delivery: nothing is written during the update, then ONE write holds the new balance AND the paid mission', () => {
    const storage = new RecordingStorage();
    const { flow, gameState, queue, run } = startSession(storage);
    reachDeliver(flow);
    run();
    assert.equal(storage.mainWrites.length, 1);
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('deliver', 1, 0, 0));
    assert.equal(lastWrite(storage).money, startMoney);

    step(flow, AT_CUSTOMER); // the whole delivery runs here: counters, hooks, money

    // The updates are complete and visible in memory ...
    assert.equal(gameState.money, startMoney + reward);
    assert.equal(flow.lastPaidRunId, 1);
    // ... but nothing has been written yet: one save is queued behind them.
    assert.equal(storage.mainWrites.length, 1, 'no write happened in the middle of the update');
    assert.equal(queue.length, 1, 'exactly one save is queued, although the mission and the money both changed');

    run();

    assert.equal(storage.mainWrites.length, 2, 'exactly one new write');
    const written = JSON.parse(storage.mainWrites[1]); // the text that was really stored
    assert.equal(written.money, startMoney + reward);
    assert.deepEqual(written.missions[MISSION_ID], progress('available', 1, 1, 1));
    assert.deepEqual(written.coins.collected, {});
    assert.equal(storage.getItem(SAVE_KEYS.main), storage.mainWrites[1]);
  });

  test('the snapshot before it is kept as the backup, and it is whole and consistent too', () => {
    const storage = new RecordingStorage();
    const { flow, run } = startSession(storage);
    reachDeliver(flow);
    run();
    step(flow, AT_CUSTOMER);
    run();

    const backup = JSON.parse(storage.getItem(SAVE_KEYS.backup));
    assert.equal(backup.money, startMoney, 'the old balance ...');
    assert.deepEqual(backup.missions[MISSION_ID], progress('deliver', 1, 0, 0), '... with the unpaid mission');
    assertConsistent(storage.getItem(SAVE_KEYS.backup), 'backup');
    assertConsistent(storage.getItem(SAVE_KEYS.main), 'main');
  });

  test('a coin, a mission step and a payout in the same stretch of code land in one write', () => {
    const storage = new RecordingStorage();
    const { flow, gameState, queue, run } = startSession(storage);
    reachDeliver(flow);
    run();
    const before = storage.mainWrites.length;

    gameState.collectCoin('orisun-03', coinValue);
    step(flow, AT_CUSTOMER);
    assert.equal(queue.length, 1);
    run();

    assert.equal(storage.mainWrites.length, before + 1);
    const written = JSON.parse(storage.mainWrites[before]);
    assert.equal(written.money, startMoney + coinValue + reward);
    assert.deepEqual(Object.keys(written.coins.collected), ['orisun-03']);
    assert.deepEqual(written.missions[MISSION_ID], progress('available', 1, 1, 1));
  });

  test('with the real queueMicrotask the delivery is also exactly one write', async () => {
    const storage = new RecordingStorage();
    const { flow } = startSession(storage, { schedule: 'default' });
    reachDeliver(flow);
    await settle();
    const before = storage.mainWrites.length;
    step(flow, AT_CUSTOMER);
    assert.equal(storage.mainWrites.length, before, 'still nothing written when the update returns');
    await settle();
    assert.equal(storage.mainWrites.length, before + 1);
    const written = lastWrite(storage);
    assert.equal(written.money, startMoney + reward);
    assert.deepEqual(written.missions[MISSION_ID], progress('available', 1, 1, 1));
  });

  test('CONTRAST: if a save ran immediately inside the update, an in-between snapshot would exist', () => {
    // This is NOT how the game is set up. It shows what the queued save protects against:
    // with a save that runs at once (schedule: run it right away), the write made when the
    // mission records the run as paid happens BEFORE the reward money is added.
    const storage = new RecordingStorage();
    const { flow } = startSession(storage, { schedule: (task) => task() });
    reachDeliver(flow);
    const before = storage.mainWrites.length;
    step(flow, AT_CUSTOMER);

    const writes = storage.mainWrites.slice(before).map((text) => JSON.parse(text));
    assert.equal(writes.length, 2, 'two writes: one in the middle of the update, one at its end');
    assert.equal(writes[0].money, startMoney, 'in-between snapshot: money not added yet ...');
    assert.deepEqual(writes[0].missions[MISSION_ID], progress('available', 1, 1, 1), '... but the run is recorded as paid');
    assert.equal(writes[1].money, startMoney + reward);

    // What that in-between snapshot would mean if it were the last thing stored: the player
    // loses that one reward, and can never be paid for the same run twice.
    const reloaded = startSession(new RecordingStorage({ [SAVE_KEYS.main]: storage.mainWrites[before] }));
    assert.equal(reloaded.gameState.money, startMoney);
    assert.equal(reloaded.flow.state, 'available');
    assert.equal(reloaded.flow.complete(), false);
    step(reloaded.flow, AT_CUSTOMER);
    assert.deepEqual(reloaded.rewardsPaid, []);
  });

  test('EVERY snapshot ever written during a long mixed play is consistent (coins, jobs and money together)', async () => {
    const storage = new RecordingStorage();
    const session = startSession(storage, { schedule: 'default' });
    for (let i = 0; i < 18; i += 1) {
      session.gameState.collectCoin(COIN_IDS[i], coinValue);
      if (i % 3 === 0) for (let moves = 0; moves < 5; moves += 1) advance(session.flow);
      await settle();
    }
    assert.ok(storage.mainWrites.length > 10);
    storage.mainWrites.forEach((raw, index) => assertConsistent(raw, `write ${index}`));
    assert.ok(session.rewardsPaid.length >= 3);
  });
});

describe('unbindMission keeps the last valid snapshot', () => {
  test('later saves still contain the mission progress as it was at unbinding', () => {
    const storage = new RecordingStorage();
    const { manager, flow, gameState, run } = startSession(storage);
    reachDeliver(flow);
    run();
    assert.equal(manager.unbindMission(MISSION_ID), true);

    gameState.collectCoin('orisun-02', coinValue);
    run();
    const data = lastWrite(storage);
    assert.deepEqual(data.missions[MISSION_ID], progress('deliver', 1, 0, 0), 'not reverted to the loaded progress');
    assert.deepEqual(Object.keys(data.coins.collected), ['orisun-02']);
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('deliver', 1, 0, 0));
  });

  test('a detached flow no longer affects the save (so unbind is for tearing down, not for mid-play)', () => {
    const storage = new RecordingStorage();
    const { manager, flow, gameState, run } = startSession(storage);
    reachDeliver(flow);
    run();
    manager.unbindMission(MISSION_ID);

    step(flow, AT_CUSTOMER); // the detached flow finishes the delivery and money is added ...
    gameState.collectCoin('orisun-02', coinValue);
    run();
    const data = lastWrite(storage);
    assert.equal(data.money, startMoney + reward + coinValue);
    assert.deepEqual(data.missions[MISSION_ID], progress('deliver', 1, 0, 0), '... but the stored mission is frozen at unbinding');
  });

  test('progress that was never saved is captured, and a save is requested', () => {
    const storage = new RecordingStorage();
    const { manager, queue, run } = makeManager(storage);
    const flow = new MissionFlow(FIRST_DELIVERY); // no hooks: nothing asks for a save
    manager.bindMission(MISSION_ID, flow);
    reachPickup(flow);
    run();
    assert.equal(storage.mainWrites.length, 0);

    assert.equal(manager.unbindMission(MISSION_ID), true);
    assert.equal(queue.length, 1, 'a save is requested because the progress had changed');
    run();
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('pickup', 1, 0, 0));
  });

  test('unchanged progress requests no save', () => {
    const { manager, queue } = makeManager(new RecordingStorage());
    manager.bindMission(MISSION_ID, { toSave: () => progress('available', 0, 0, 0) });
    manager.unbindMission(MISSION_ID);
    assert.equal(queue.length, 0);
  });

  test('if the source fails at that moment, the previous snapshot is kept', () => {
    const storage = new RecordingStorage();
    const { manager, gameState, warnings, run } = makeManager(storage);
    const source = { broken: false, toSave() {
      if (this.broken) throw new Error('boom');
      return progress('pickup', 4, 3, 3);
    } };
    manager.bindMission(MISSION_ID, source);
    gameState.collectCoin('orisun-01', coinValue);
    run();
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('pickup', 4, 3, 3));

    source.broken = true;
    assert.equal(manager.unbindMission(MISSION_ID), true);
    assert.ok(warnings.length > 0);
    gameState.collectCoin('orisun-02', coinValue);
    run();
    const data = lastWrite(storage);
    assert.deepEqual(data.missions[MISSION_ID], progress('pickup', 4, 3, 3));
    assert.equal(data.money, startMoney + 2 * coinValue);
  });

  test('a mission rebuilt from the kept snapshot carries straight on, and still pays once', () => {
    const storage = new RecordingStorage();
    const first = startSession(storage);
    reachDeliver(first.flow);
    first.run();
    first.manager.unbindMission(MISSION_ID); // the scene is torn down

    // the scene is rebuilt in the same running game: a new flow restores from the manager
    const flow = new MissionFlow(FIRST_DELIVERY, { onReward: (amount) => first.gameState.addMoney(amount) });
    flow.restore(first.manager.getMissionProgress(MISSION_ID));
    first.manager.bindMission(MISSION_ID, flow);
    assert.equal(flow.state, 'deliver');
    step(flow, AT_CUSTOMER);
    step(flow, AT_CUSTOMER);
    first.manager.markDirty();
    first.run();
    const data = lastWrite(storage);
    assert.equal(data.money, startMoney + reward);
    assert.deepEqual(data.missions[MISSION_ID], progress('available', 1, 1, 1));
  });

  test('re-binding without unbinding still continues from the old flow\'s live progress', () => {
    const { manager, flow } = startSession(new RecordingStorage());
    reachDeliver(flow);
    const replacement = new MissionFlow(FIRST_DELIVERY);
    replacement.restore(manager.getMissionProgress(MISSION_ID));
    assert.equal(replacement.state, 'deliver');
  });
});

describe('a failing mission source never blocks money and coins', () => {
  const LOADED = progress('pickup', 2, 1, 1);
  const badSources = [
    ['throws', () => { throw new Error('boom'); }],
    ['returns null', () => null],
    ['returns undefined', () => undefined],
    ['returns text', () => 'deliver'],
    ['returns an array', () => []],
    ['an unknown state', () => progress('junk', 3, 2, 2)],
    ['a NaN run id', () => progress('deliver', NaN, 0, 0)],
    ['a negative counter', () => progress('available', -1, 0, 0)],
    ['a fractional counter', () => progress('available', 1.5, 0, 0)],
    ['missing fields', () => ({ state: 'available' })],
  ];

  badSources.forEach(([name, makeBad]) => {
    test(`${name}: money and coins are saved, the mission keeps its last good progress`, () => {
      const storage = new RecordingStorage({ [SAVE_KEYS.main]: saveText(LOADED, { money: 700 }) });
      const { manager, gameState, warnings, run } = makeManager(storage);
      assert.equal(manager.bindMission(MISSION_ID, { toSave: makeBad }), true);

      gameState.collectCoin('orisun-01', coinValue);
      gameState.addMoney(250);
      assert.doesNotThrow(run);

      assert.equal(storage.mainWrites.length, 1);
      const data = lastWrite(storage);
      assert.equal(data.money, 700 + coinValue + 250);
      assert.deepEqual(Object.keys(data.coins.collected), ['orisun-01']);
      assert.deepEqual(data.missions[MISSION_ID], LOADED);
      assert.ok(warnings.length > 0, 'the failure is logged');
    });
  });

  test('once the source works again, its live progress is saved again', () => {
    const storage = new RecordingStorage({ [SAVE_KEYS.main]: saveText(LOADED, { money: 700 }) });
    const { manager, gameState, run } = makeManager(storage);
    const source = { mode: 'broken', toSave() {
      if (this.mode === 'broken') throw new Error('boom');
      return progress('deliver', 2, 1, 1);
    } };
    manager.bindMission(MISSION_ID, source);

    gameState.collectCoin('orisun-01', coinValue);
    run();
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], LOADED);

    source.mode = 'ok';
    gameState.collectCoin('orisun-02', coinValue);
    run();
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('deliver', 2, 1, 1));
  });

  test('progress the schema only needs to repair is saved in its repaired, safe form (an already-paid run is not resumable)', () => {
    const storage = new RecordingStorage();
    const { manager, gameState, warnings, run } = makeManager(storage);
    manager.bindMission(MISSION_ID, { toSave: () => progress('deliver', 3, 3, 3) });
    gameState.collectCoin('orisun-01', coinValue);
    run();
    assert.deepEqual(lastWrite(storage).missions[MISSION_ID], progress('available', 3, 3, 3));
    assert.ok(warnings.length > 0);
  });

  test('with two missions, a failing one does not stop the healthy one from being saved live', () => {
    const storage = new RecordingStorage({
      [SAVE_KEYS.main]: JSON.stringify({
        v: SAVE_VERSION,
        savedAt: 1,
        money: 500,
        coins: { collected: {} },
        missions: { firstDelivery: progress('pickup', 2, 1, 1), secondJob: progress('available', 0, 0, 0) },
      }),
    });
    const { manager, gameState, run } = makeManager(storage, { missionIds: [MISSION_ID, 'secondJob'] });
    manager.bindMission(MISSION_ID, { toSave: () => { throw new Error('boom'); } });
    manager.bindMission('secondJob', { toSave: () => progress('deliver', 1, 0, 0) });
    gameState.collectCoin('orisun-01', coinValue);
    run();
    const data = lastWrite(storage);
    assert.deepEqual(data.missions.firstDelivery, progress('pickup', 2, 1, 1));
    assert.deepEqual(data.missions.secondJob, progress('deliver', 1, 0, 0));
    assert.equal(data.money, 500 + coinValue);
  });
});

describe('read-only, missing and failing storage', () => {
  test('a save from a newer game is never overwritten, and bound missions cause no error', () => {
    const newer = JSON.stringify({ v: SAVE_VERSION + 1, money: 99999 });
    const storage = new RecordingStorage({ [SAVE_KEYS.main]: newer });
    const { manager, gameState, flow, run } = (() => {
      const s = startSession(storage);
      return s;
    })();
    assert.equal(manager.getStatus().readOnlyReason, 'newer-version');
    reachDeliver(flow);
    gameState.collectCoin('orisun-01', coinValue);
    assert.doesNotThrow(run);
    assert.equal(storage.getItem(SAVE_KEYS.main), newer);
    assert.equal(storage.mainWrites.length, 0);
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('deliver', 1, 0, 0), 'the game itself carries on in memory');
  });

  test('no storage at all: binding, reading and unbinding work in memory', () => {
    const { manager, flow, gameState, run } = startSession(null);
    assert.equal(manager.getStatus().readOnlyReason, 'no-storage');
    reachDeliver(flow);
    gameState.collectCoin('orisun-01', coinValue);
    assert.doesNotThrow(() => {
      run();
      manager.unbindMission(MISSION_ID);
    });
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), progress('deliver', 1, 0, 0));
  });

  test('a write that fails is survived; the next one saves everything, mission included', () => {
    const storage = new RecordingStorage({}, { failSet: [SAVE_KEYS.main] });
    const { flow, gameState, warnings, run } = startSession(storage);
    reachDeliver(flow);
    assert.doesNotThrow(run);
    assert.ok(warnings.length > 0);

    storage.failSet = [];
    gameState.collectCoin('orisun-01', coinValue);
    run();
    const data = lastWrite(storage);
    assert.deepEqual(data.missions[MISSION_ID], progress('deliver', 1, 0, 0));
    assert.equal(data.money, startMoney + coinValue);
  });
});

describe('reloading with the mission bound', () => {
  test('repeated reloads while carrying keep the job unpaid; delivering pays once; later reloads pay nothing', async () => {
    const storage = new RecordingStorage();
    let session = startSession(storage, { schedule: 'default' });
    reachDeliver(session.flow);
    await settle();

    for (let reload = 0; reload < 5; reload += 1) {
      session.manager.detach();
      session = startSession(storage, { schedule: 'default' });
      assert.equal(session.flow.state, 'deliver', `reload ${reload}`);
      assert.equal(session.gameState.money, startMoney, `reload ${reload}`);
      assert.deepEqual(session.rewardsPaid, []);
      for (let frame = 0; frame < 10; frame += 1) step(session.flow, FAR);
      await settle();
    }

    step(session.flow, AT_CUSTOMER);
    await settle();
    assert.deepEqual(session.rewardsPaid, [1]);
    assert.equal(session.gameState.money, startMoney + reward);

    for (let reload = 0; reload < 5; reload += 1) {
      session.manager.detach();
      session = startSession(storage, { schedule: 'default' });
      step(session.flow, AT_CUSTOMER);
      step(session.flow, AT_CUSTOMER);
      await settle();
      assert.deepEqual(session.rewardsPaid, [], `after delivery, reload ${reload}`);
      assert.equal(session.gameState.money, startMoney + reward);
      assert.deepEqual(session.manager.getMissionProgress(MISSION_ID), progress('available', 1, 1, 1));
    }
    storage.mainWrites.forEach((raw, index) => assertConsistent(raw, `write ${index}`));
  });

  test('a job completed and replayed after a reload is paid once each time, as runs 2 and 3', async () => {
    const storage = new RecordingStorage();
    let session = startSession(storage, { schedule: 'default' });
    for (let moves = 0; moves < 20 && session.rewardsPaid.length < 1; moves += 1) advance(session.flow);
    await settle();
    assert.deepEqual(session.rewardsPaid, [1]);

    for (const job of [2, 3]) {
      session.manager.detach();
      session = startSession(storage, { schedule: 'default' });
      for (let moves = 0; moves < 20 && session.rewardsPaid.length < 1; moves += 1) advance(session.flow);
      await settle();
      assert.deepEqual(session.rewardsPaid, [job]);
      assert.equal(session.gameState.money, startMoney + job * reward);
    }
    assertConsistent(storage.getItem(SAVE_KEYS.main));
    assert.equal(JSON.parse(storage.getItem(SAVE_KEYS.main)).missions[MISSION_ID].completed, 3);
  });

  test('backup recovery: a damaged main save falls back to the one-step-older snapshot, whole and consistent, and still pays once', async () => {
    const storage = new RecordingStorage();
    let session = startSession(storage, { schedule: 'default' });
    reachDeliver(session.flow);
    await settle();
    step(session.flow, AT_CUSTOMER);
    await settle();
    assert.equal(JSON.parse(storage.getItem(SAVE_KEYS.main)).money, startMoney + reward);

    const damaged = '{"v":1,"savedAt":17,"mon';
    storage.setItem(SAVE_KEYS.main, damaged); // the main save is damaged
    session.manager.detach();
    session = startSession(storage, { schedule: 'default' });

    assert.equal(session.manager.getStatus().source, 'backup');
    assert.equal(session.gameState.money, startMoney, 'the backup holds the balance from before the payout ...');
    assert.equal(session.flow.state, 'deliver', '... together with the unpaid job');
    step(session.flow, AT_CUSTOMER);
    await settle();
    assert.deepEqual(session.rewardsPaid, [1]);
    assert.equal(session.gameState.money, startMoney + reward, 'paid once, not twice');
    assertConsistent(storage.getItem(SAVE_KEYS.main));
    assert.ok(JSON.parse(storage.getItem(SAVE_KEYS.corrupt)).entries.some((entry) => entry.raw === damaged), 'the damaged text was kept');
  });

  test('both saves damaged: a fresh game, the mission at its start, nothing thrown', () => {
    const storage = new RecordingStorage({ [SAVE_KEYS.main]: 'garbage', [SAVE_KEYS.backup]: '[]' });
    const session = startSession(storage);
    assert.equal(session.manager.getStatus().source, 'new');
    assert.equal(session.flow.state, 'available');
    assert.equal(session.gameState.money, startMoney);
  });

  // A seeded random mix of coins, mission steps and reloads. Every stored snapshot, and
  // the live state after every reload, must have money = start + coins + finished jobs.
  [20261027, 7, 424242].forEach((seed) => {
    test(`random play with reloads, seed ${seed}: money, coins and mission always agree`, async () => {
      const storage = new RecordingStorage();
      let session = startSession(storage, { schedule: 'default' });
      let state = seed;
      const random = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
      for (let i = 0; i < 90; i += 1) {
        const roll = random();
        if (roll < 0.2) {
          session.manager.detach();
          session = startSession(storage, { schedule: 'default' });
        } else if (roll < 0.45) {
          const free = COIN_IDS.filter((id) => !session.gameState.hasCollectedCoin(id));
          if (free.length > 0) session.gameState.collectCoin(free[Math.floor(random() * free.length)], coinValue);
        } else {
          advance(session.flow);
        }
        await settle();
        const coins = session.gameState.collectedCoins.size;
        assert.equal(session.gameState.money, startMoney + coins * coinValue + session.flow.completed * reward, `step ${i}`);
        assert.equal(session.flow.completed, session.flow.lastPaidRunId, `step ${i}`);
      }
      storage.mainWrites.forEach((raw, index) => assertConsistent(raw, `seed ${seed} write ${index}`));
    });
  });

  // Here the queued save is allowed to be delayed, and a "reload" throws the not-yet-run
  // saves away. That SIMULATES a save that never happened (for example the page being
  // closed before the queued task ran). It shows that what is stored is still an earlier,
  // internally consistent snapshot. It does not show that a real browser or device stop is
  // handled at every instant: that depends on the browser's own storage behaviour.
  [11, 99].forEach((seed) => {
    test(`random play where queued saves are lost at reload, seed ${seed}: stored snapshots stay consistent`, async () => {
      const storage = new RecordingStorage();
      let session = startSession(storage);
      let state = seed;
      const random = () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
      };
      for (let i = 0; i < 120; i += 1) {
        const roll = random();
        if (roll < 0.15) {
          session.queue.length = 0; // the queued save never runs
          session.manager.detach();
          session = startSession(storage);
        } else if (roll < 0.4) {
          const free = COIN_IDS.filter((id) => !session.gameState.hasCollectedCoin(id));
          if (free.length > 0) session.gameState.collectCoin(free[0], coinValue);
        } else {
          advance(session.flow);
        }
        if (random() < 0.5) session.run();
        const coins = session.gameState.collectedCoins.size;
        assert.equal(session.gameState.money, startMoney + coins * coinValue + session.flow.completed * reward, `step ${i}`);
      }
      session.run();
      storage.mainWrites.forEach((raw, index) => assertConsistent(raw, `seed ${seed} write ${index}`));
    });
  });
});

describe('the joystick settings are never touched', () => {
  test('mission binding, saving, unbinding, recovery and reloads never read or write the settings key', async () => {
    const storage = new RecordingStorage({ [SAVE_KEYS.main]: 'garbage', [SAVE_KEYS.backup]: saveText(progress('deliver', 1, 0, 0)) });
    storage.calls.length = 0;
    let session = startSession(storage, { schedule: 'default' });
    step(session.flow, AT_CUSTOMER);
    session.gameState.collectCoin('orisun-01', coinValue);
    await settle();
    session.manager.unbindMission(MISSION_ID);
    session.manager.detach();
    session = startSession(storage, { schedule: 'default' });
    reachOffer(session.flow);
    await settle();
    assert.equal(storage.touched(SETTINGS_KEY), false);
    assert.equal(storage.getItem(SETTINGS_KEY), SETTINGS_VALUE);
  });
});

test('everything stored is valid for the real schema', async () => {
  const storage = new RecordingStorage();
  const session = startSession(storage, { schedule: 'default' });
  for (let moves = 0; moves < 20; moves += 1) {
    advance(session.flow);
    await settle(); // each move is its own save, so a backup of the previous save exists
  }
  session.gameState.collectCoin('orisun-05', coinValue);
  await settle();
  assert.ok(storage.mainWrites.length >= 3);
  const context = { coinIds: COIN_IDS, missionIds: [MISSION_ID] };
  [SAVE_KEYS.main, SAVE_KEYS.backup].forEach((key) => {
    const parsed = parseSave(storage.getItem(key), context);
    assert.equal(parsed.ok, true, key);
    assert.deepEqual(parsed.warnings, [], key);
  });
});
