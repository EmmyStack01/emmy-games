// Stage 1: the ordered mission list against the REAL save system, and old saves.
// Real: saveSystem, SaveManager, saveSchema, GameState, MissionFlow, missionSequence.
// Faked: only localStorage (MemoryStorage). "Refresh" = start the save system again on the
// same storage.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startSaveSystem, getSaveManager } from '../src/state/saveSystem.js';
import { GameState } from '../src/state/GameState.js';
import MissionFlow from '../src/missions/MissionFlow.js';
import { FIRST_DELIVERY, MISSION_IDS } from '../src/missions/missionData.js';
import { OBJECTIVE, STATUS, isUnlocked, missionStatus, findActiveMission, selectNextObjective } from '../src/missions/missionSequence.js';
import { SAVE_KEYS, createDefaultSave, serializeSave } from '../src/state/saveSchema.js';
import { COINS } from '../src/data/neighbourhood.js';
import { ECONOMY } from '../src/config.js';
import { MemoryStorage } from './support/memoryStorage.js';
import { FAR, reachDone, step } from './support/missionHelpers.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1';
const SETTINGS_VALUE = '{"joystickSide":"left"}';
const { startMoney } = ECONOMY;
const settle = () => new Promise((resolve) => setImmediate(resolve));
const DEFAULT = { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 };
const NEW_IDS = MISSION_IDS.slice(1);

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

// A save file exactly as the game wrote it BEFORE Stage 1: only firstDelivery is known.
function oldSaveText({ money = 500, firstDelivery = DEFAULT, collected = {} } = {}) {
  const save = createDefaultSave(money, [FIRST_DELIVERY.id]);
  save.missions[FIRST_DELIVERY.id] = firstDelivery;
  save.coins.collected = collected;
  return serializeSave(save, { coinIds: COINS.map((c) => c.id), missionIds: [FIRST_DELIVERY.id] });
}

const newStorage = (initial = {}) => new MemoryStorage({ [SETTINGS_KEY]: SETTINGS_VALUE, ...initial });
const savedMain = (storage) => JSON.parse(storage.data.get(SAVE_KEYS.main));

// One page load: returns the game state and the manager.
function load(storage) {
  const state = new GameState();
  const manager = startSaveSystem({ storage, target: state });
  return { state, manager };
}

// The progress of every mission, read the way the game reads it.
const progressOf = (manager) => Object.fromEntries(MISSION_IDS.map((id) => [id, manager.getMissionProgress(id)]));

describe('the save system knows every mission in the list', () => {
  test('the schema context holds the ids in unlock order', () => {
    const { manager } = load(newStorage());
    assert.deepEqual(manager.context.missionIds, [...MISSION_IDS]);
    assert.deepEqual(manager.context.missionIds, ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall', 'acrossOrisunClose']);
  });

  test('a new game has a fresh record for each mission, and only the first is unlocked', () => {
    const { manager } = load(newStorage());
    MISSION_IDS.forEach((id) => assert.deepEqual(manager.getMissionProgress(id), DEFAULT, id));
    const progress = progressOf(manager);
    assert.deepEqual(MISSION_IDS.map((id) => isUnlocked(MISSION_IDS, progress, id)), [true, false, false, false]);
    assert.deepEqual(selectNextObjective(MISSION_IDS, progress), { type: OBJECTIVE.NEW_JOB, missionId: 'firstDelivery' });
  });

  test('a save writes exactly four-field records and no unlock flags', async () => {
    const storage = newStorage();
    const { state } = load(storage);
    state.addMoney(1);
    await settle();
    const save = savedMain(storage);
    assert.deepEqual(Object.keys(save.missions).sort(), [...MISSION_IDS].sort());
    Object.values(save.missions).forEach((record) => {
      assert.deepEqual(Object.keys(record).sort(), ['completed', 'lastPaidRunId', 'runId', 'state']);
    });
    assert.ok(!/unlock/i.test(storage.data.get(SAVE_KEYS.main)), 'nothing about unlocking is stored');
  });
});

describe('saves made before Stage 1 (only firstDelivery in them)', () => {
  test('a finished-once save loads intact, the new missions start fresh, and mission 2 is unlocked', () => {
    const old = { state: 'available', runId: 3, completed: 3, lastPaidRunId: 3 };
    const storage = newStorage({
      [SAVE_KEYS.main]: oldSaveText({ money: 1234, firstDelivery: old, collected: { 'orisun-04': 111 } }),
    });
    const { state, manager } = load(storage);
    assert.equal(manager.source, 'main');
    assert.deepEqual(manager.warnings, []);
    assert.equal(state.money, 1234);
    assert.equal(state.hasCollectedCoin('orisun-04'), true);
    assert.deepEqual(manager.getMissionProgress('firstDelivery'), old);
    NEW_IDS.forEach((id) => assert.deepEqual(manager.getMissionProgress(id), DEFAULT, id));

    const progress = progressOf(manager);
    assert.equal(missionStatus(MISSION_IDS, progress, 'firstDelivery'), STATUS.REPEATABLE);
    assert.equal(missionStatus(MISSION_IDS, progress, 'freshFromTheOven'), STATUS.NEW);
    assert.equal(missionStatus(MISSION_IDS, progress, 'suyaForTheHall'), STATUS.LOCKED);
    assert.deepEqual(selectNextObjective(MISSION_IDS, progress), { type: OBJECTIVE.NEW_JOB, missionId: 'freshFromTheOven' });
  });

  test('loading it pays nothing and changes no money', () => {
    const storage = newStorage({ [SAVE_KEYS.main]: oldSaveText({ money: 900, firstDelivery: { state: 'available', runId: 1, completed: 1, lastPaidRunId: 1 } }) });
    const { state } = load(storage);
    assert.equal(state.money, 900);
  });

  test('a save taken mid-delivery resumes it, and mission 2 stays locked until it is delivered', () => {
    const storage = newStorage({
      [SAVE_KEYS.main]: oldSaveText({ firstDelivery: { state: 'deliver', runId: 1, completed: 0, lastPaidRunId: 0 } }),
    });
    const { manager } = load(storage);
    const progress = progressOf(manager);
    assert.equal(findActiveMission(MISSION_IDS, progress), 'firstDelivery');
    assert.equal(isUnlocked(MISSION_IDS, progress, 'freshFromTheOven'), false);
    assert.deepEqual(selectNextObjective(MISSION_IDS, progress), { type: OBJECTIVE.ACTIVE, missionId: 'firstDelivery', stage: 'deliver' });
  });

  test('a replay in progress is the objective while mission 2 is already unlocked', () => {
    const storage = newStorage({
      [SAVE_KEYS.main]: oldSaveText({ firstDelivery: { state: 'pickup', runId: 4, completed: 3, lastPaidRunId: 3 } }),
    });
    const { manager } = load(storage);
    const progress = progressOf(manager);
    assert.equal(missionStatus(MISSION_IDS, progress, 'firstDelivery'), STATUS.ACTIVE);
    assert.equal(missionStatus(MISSION_IDS, progress, 'freshFromTheOven'), STATUS.NEW);
    assert.deepEqual(selectNextObjective(MISSION_IDS, progress), { type: OBJECTIVE.ACTIVE, missionId: 'firstDelivery', stage: 'pickup' });
  });

  test('the next save adds the new missions and keeps everything else, settings untouched', async () => {
    const old = { state: 'available', runId: 2, completed: 2, lastPaidRunId: 2 };
    const storage = newStorage({ [SAVE_KEYS.main]: oldSaveText({ money: 700, firstDelivery: old, collected: { 'orisun-02': 5 } }) });
    const { state } = load(storage);
    state.collectCoin('orisun-03', ECONOMY.coinValue);
    await settle();
    const save = savedMain(storage);
    assert.equal(save.money, 700 + ECONOMY.coinValue);
    assert.deepEqual(Object.keys(save.coins.collected).sort(), ['orisun-02', 'orisun-03']);
    assert.deepEqual(save.missions.firstDelivery, old);
    NEW_IDS.forEach((id) => assert.deepEqual(save.missions[id], DEFAULT, id));
    assert.equal(storage.data.get(SETTINGS_KEY), SETTINGS_VALUE);
    assert.equal(storage.touched(SETTINGS_KEY), false);
  });

  test('a damaged save that marks a locked mission in progress cannot activate it', () => {
    const save = createDefaultSave(500, MISSION_IDS);
    save.missions.suyaForTheHall = { state: 'pickup', runId: 1, completed: 0, lastPaidRunId: 0 };
    const storage = newStorage({
      [SAVE_KEYS.main]: serializeSave(save, { coinIds: COINS.map((c) => c.id), missionIds: [...MISSION_IDS] }),
    });
    const { manager } = load(storage);
    const progress = progressOf(manager);
    assert.equal(missionStatus(MISSION_IDS, progress, 'suyaForTheHall'), STATUS.LOCKED);
    assert.equal(findActiveMission(MISSION_IDS, progress), null);
    assert.deepEqual(selectNextObjective(MISSION_IDS, progress), { type: OBJECTIVE.NEW_JOB, missionId: 'firstDelivery' });
  });
});

describe('completing a mission unlocks the next one, derived from the saved count', () => {
  // The real MissionFlow, bound to the real SaveManager, paying through the real GameState.
  function startFlow(state, manager) {
    const flow = new MissionFlow(FIRST_DELIVERY, { onReward: (amount) => state.addMoney(amount) });
    assert.equal(manager.bindMission(FIRST_DELIVERY.id, flow), true);
    return flow;
  }

  test('delivering the first mission saves its progress, unlocks mission 2 and does not start it', async () => {
    const storage = newStorage();
    const { state, manager } = load(storage);
    const flow = startFlow(state, manager);
    reachDone(flow);
    await settle();

    const save = savedMain(storage);
    assert.equal(save.money, startMoney + 250);
    assert.deepEqual(save.missions.firstDelivery, { state: 'available', runId: 1, completed: 1, lastPaidRunId: 1 });
    NEW_IDS.forEach((id) => assert.deepEqual(save.missions[id], DEFAULT, `${id} is untouched`));

    const progress = progressOf(manager);
    assert.equal(isUnlocked(MISSION_IDS, progress, 'freshFromTheOven'), true);
    assert.equal(findActiveMission(MISSION_IDS, progress), null); // unlocked, but not accepted
    assert.deepEqual(selectNextObjective(MISSION_IDS, progress), { type: OBJECTIVE.NEW_JOB, missionId: 'freshFromTheOven' });
  });

  test('after a refresh the unlock is still there, from the saved count alone', async () => {
    const storage = newStorage();
    const first = load(storage);
    reachDone(startFlow(first.state, first.manager));
    await settle();

    const { state, manager } = load(storage);
    assert.equal(state.money, startMoney + 250);
    assert.equal(isUnlocked(MISSION_IDS, progressOf(manager), 'freshFromTheOven'), true);
  });

  test('replaying the first mission pays 250 each time and never moves the next job', async () => {
    const storage = newStorage();
    const { state, manager } = load(storage);
    const flow = startFlow(state, manager);
    for (let run = 1; run <= 3; run += 1) {
      step(flow, FAR); // leave the shop so the offer can open again
      step(flow, FAR, FIRST_DELIVERY.doneDelayMs); // let "done" return to "available"
      reachDone(flow);
      assert.equal(state.money, startMoney + 250 * run, `run ${run}`);
    }
    await settle();
    const save = savedMain(storage);
    assert.deepEqual(save.missions.firstDelivery, { state: 'available', runId: 3, completed: 3, lastPaidRunId: 3 });
    NEW_IDS.forEach((id) => assert.deepEqual(save.missions[id], DEFAULT, id));
    assert.deepEqual(selectNextObjective(MISSION_IDS, progressOf(manager)), { type: OBJECTIVE.NEW_JOB, missionId: 'freshFromTheOven' });
  });

  test('refreshing right after the delivery does not pay the first mission again', async () => {
    const storage = newStorage();
    const first = load(storage);
    reachDone(startFlow(first.state, first.manager));
    await settle();

    const { state, manager } = load(storage);
    const restored = new MissionFlow(FIRST_DELIVERY, { onReward: (amount) => state.addMoney(amount) });
    restored.restore(manager.getMissionProgress(FIRST_DELIVERY.id));
    step(restored, { x: FIRST_DELIVERY.customer.x, y: FIRST_DELIVERY.customer.y });
    step(restored, { x: FIRST_DELIVERY.pickup.x, y: FIRST_DELIVERY.pickup.y });
    assert.equal(state.money, startMoney + 250);
    assert.equal(restored.completed, 1);
  });
});

describe('the unchanged save code is untouched by the new list', () => {
  test('getSaveManager returns the manager for the whole list', () => {
    const { manager } = load(newStorage());
    assert.equal(getSaveManager(), manager);
    assert.equal(manager.getMissionProgress('notAMission'), null);
  });
});
