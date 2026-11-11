// Step 3B: the getSaveManager() accessor in src/state/saveSystem.js.
// (Each test file runs in its own process, so the accessor starts out empty here.)

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { startSaveSystem, getSaveManager } from '../src/state/saveSystem.js';
import { GameState } from '../src/state/GameState.js';
import MissionFlow from '../src/missions/MissionFlow.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { ECONOMY } from '../src/config.js';
import { SAVE_KEYS } from '../src/state/saveSchema.js';
import { MemoryStorage } from './support/memoryStorage.js';
import { MISSION_ID, reachDeliver } from './support/missionHelpers.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1';
const settle = () => new Promise((resolve) => setImmediate(resolve));
const newStorage = () => new MemoryStorage({ [SETTINGS_KEY]: '{"joystickSide":"right"}' });

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

describe('getSaveManager', () => {
  // This must be the first test: nothing has been started yet in this process.
  test('is null before the save system has started', () => {
    assert.equal(getSaveManager(), null);
  });

  test('returns the manager that startSaveSystem started', () => {
    const manager = startSaveSystem({ storage: newStorage(), target: new GameState() });
    assert.ok(manager);
    assert.equal(getSaveManager(), manager);
  });

  test('exposes the mission methods, with the real mission id', () => {
    startSaveSystem({ storage: newStorage(), target: new GameState() });
    const manager = getSaveManager();
    assert.deepEqual(manager.getMissionProgress(MISSION_ID), { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 });
    assert.equal(manager.getMissionProgress('somethingElse'), null);
    assert.equal(manager.bindMission(MISSION_ID, new MissionFlow(FIRST_DELIVERY)), true);
    assert.equal(manager.unbindMission(MISSION_ID), true);
  });

  test('a mission bound through the accessor is saved together with money, in one write', async () => {
    const storage = newStorage();
    const target = new GameState();
    startSaveSystem({ storage, target });
    const flow = new MissionFlow(FIRST_DELIVERY, { onReward: (amount) => target.addMoney(amount) });
    getSaveManager().bindMission(MISSION_ID, flow);

    reachDeliver(flow);
    getSaveManager().markDirty();
    await settle();
    const stored = JSON.parse(storage.getItem(SAVE_KEYS.main));
    assert.equal(stored.money, ECONOMY.startMoney);
    assert.equal(stored.missions[MISSION_ID].state, 'deliver');
    assert.equal(storage.writesTo(SAVE_KEYS.main), 1);
  });

  test('saving unavailable (no storage): the manager still exists, and mission calls are harmless', async () => {
    const target = new GameState();
    const manager = startSaveSystem({ storage: null, target });
    assert.equal(getSaveManager(), manager);
    assert.equal(manager.getStatus().readOnlyReason, 'no-storage');

    const flow = new MissionFlow(FIRST_DELIVERY);
    assert.doesNotThrow(() => {
      getSaveManager()?.bindMission(MISSION_ID, flow);
      reachDeliver(flow);
      getSaveManager()?.markDirty();
      getSaveManager()?.unbindMission(MISSION_ID);
    });
    await settle();
  });

  test('a start-up failure leaves the accessor null, so getSaveManager()?.x() is a safe no-op', () => {
    const broken = {
      hydrate() {
        throw new Error('boom');
      },
      on() {},
      off() {},
    };
    assert.equal(startSaveSystem({ storage: newStorage(), target: broken }), null);
    assert.equal(getSaveManager(), null);
    assert.doesNotThrow(() => {
      getSaveManager()?.bindMission(MISSION_ID, {});
      getSaveManager()?.markDirty();
      getSaveManager()?.unbindMission(MISSION_ID);
    });
    assert.equal(getSaveManager()?.getMissionProgress(MISSION_ID) ?? null, null);
  });

  test('starting again replaces the manager, and the old one stops saving (never two writers)', async () => {
    const storage = newStorage();
    const target = new GameState();
    const first = startSaveSystem({ storage, target });
    const second = startSaveSystem({ storage, target });
    assert.notEqual(first, second);
    assert.equal(getSaveManager(), second);
    assert.equal(first.gameState, null, 'the replaced manager is detached');

    target.collectCoin('orisun-01', ECONOMY.coinValue);
    await settle();
    assert.equal(storage.writesTo(SAVE_KEYS.main), 1, 'one write, not one per manager');
  });

  test('a failed restart does not leave the previous manager behind', async () => {
    const storage = newStorage();
    const target = new GameState();
    const first = startSaveSystem({ storage, target });
    assert.equal(getSaveManager(), first);

    const broken = { hydrate() { throw new Error('boom'); }, on() {}, off() {} };
    assert.equal(startSaveSystem({ storage, target: broken }), null);
    assert.equal(getSaveManager(), null);
    assert.equal(first.gameState, null, 'the old manager no longer listens');
  });

  test('the settings key is never touched', async () => {
    const storage = newStorage();
    storage.calls.length = 0;
    const target = new GameState();
    startSaveSystem({ storage, target });
    const flow = new MissionFlow(FIRST_DELIVERY);
    getSaveManager().bindMission(MISSION_ID, flow);
    reachDeliver(flow);
    target.collectCoin('orisun-02', ECONOMY.coinValue);
    await settle();
    getSaveManager().unbindMission(MISSION_ID);
    assert.equal(storage.touched(SETTINGS_KEY), false);
  });
});
