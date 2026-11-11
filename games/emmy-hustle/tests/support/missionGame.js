// TEST-ONLY. Helpers for tests that play the missions through the REAL MissionSystem, MissionFlow,
// save system and GameState, built exactly the way GameScene builds them (no options): so only
// the missions in PLAYABLE_MISSION_IDS can be played. Faked: the scene, the DOM UI, localStorage.
// "Refresh" = start the save system again on the same storage and build a new MissionSystem.
import assert from 'node:assert/strict';
import MissionSystem from '../../src/missions/MissionSystem.js';
import gameState from '../../src/state/GameState.js';
import { startSaveSystem } from '../../src/state/saveSystem.js';
import { SAVE_KEYS, createDefaultSave, serializeSave } from '../../src/state/saveSchema.js';
import { MISSION_IDS } from '../../src/missions/missionData.js';
import { COINS } from '../../src/data/neighbourhood.js';
import { ECONOMY } from '../../src/config.js';
import { MemoryStorage } from './memoryStorage.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './fakeMissionScene.js';

export const { startMoney } = ECONOMY;
export const FAR = { x: 0, y: 0 };
export const settle = () => new Promise((resolve) => setImmediate(resolve));

export const door = (def) => ({ x: def.shop.door.x, y: def.shop.door.y });
export const pick = (def) => ({ x: def.pickup.x, y: def.pickup.y });
export const cust = (def) => ({ x: def.customer.x, y: def.customer.y });

// progress records, in the shape of the save file
export const rec = (state = 'available', runId = 0, completed = 0, lastPaidRunId = 0) => ({ state, runId, completed, lastPaidRunId });
export const done = (n = 1) => rec('available', n, n, n); // delivered n times, nothing in progress
export const DEFAULT = rec();

const CONTEXT = { coinIds: COINS.map((c) => c.id), missionIds: [...MISSION_IDS] };

// A save file holding the given progress (by mission id); missions not listed start fresh.
export function saveText(progress = {}, { money = startMoney, collected = {} } = {}) {
  const save = createDefaultSave(money, MISSION_IDS);
  Object.entries(progress).forEach(([id, record]) => {
    save.missions[id] = record;
  });
  save.coins.collected = collected;
  return serializeSave(save, CONTEXT);
}
export const storageWith = (progress, extra) => new MemoryStorage(progress ? { [SAVE_KEYS.main]: saveText(progress, extra) } : {});
export const savedMain = (storage) => JSON.parse(storage.data.get(SAVE_KEYS.main));
export const savedRecords = (storage) => savedMain(storage).missions;

// One page load, built exactly as the game builds it. cameraEvents: true gives the stand-in camera
// Phaser's on / off / emit; `at` is where Emmy starts.
export function launch(storage, { cameraEvents = false, at = FAR } = {}) {
  startSaveSystem({ storage });
  const scene = makeMissionScene({ cameraEvents });
  const player = makePlayer(at.x, at.y);
  const { ui, createUI } = makeFakeUI();
  const moneyEvents = [];
  const onMoney = (_total, change) => moneyEvents.push(change);
  gameState.on('money-changed', onMoney);
  const messages = []; // HUD messages (gameState.say): { text, ms }
  const onMessage = (text, ms) => messages.push({ text, ms });
  gameState.on('message', onMessage);
  const system = new MissionSystem(scene, player, undefined, { createUI });
  let time = 0;
  return {
    scene,
    player,
    ui,
    system,
    moneyEvents,
    messages,
    flow: (id) => system.getFlow(id),
    view: (id) => system.getView(id),
    state: (id) => system.getFlow(id).state,
    // Emmy stands at `point` for one frame (frames are capped at 100 ms by the system).
    at(point, dt = 16) {
      player.x = point.x;
      player.y = point.y;
      time += dt;
      system.update(time, dt);
    },
    // Lets the "delivery completed" banner finish, so the mission is available again.
    waitDone(point = FAR) {
      for (let i = 0; i < 40; i += 1) this.at(point, 100);
    },
    close() {
      gameState.off('money-changed', onMoney);
      gameState.off('message', onMessage);
    },
  };
}

// Walk to a shop and accept its offer.
export function accept(game, def) {
  game.at(FAR);
  game.at(door(def));
  if (game.state(def.id) !== 'offer') {
    // a replay shop does not open its card by itself: the player taps its "Replay mission" prompt
    assert.equal(game.ui.replayPrompt?.title, def.title, `${def.id} should be showing its replay prompt`);
    game.ui.replay();
  }
  assert.equal(game.state(def.id), 'offer', `${def.id} should be offering`);
  game.ui.accept();
  assert.equal(game.state(def.id), 'pickup');
}

// A whole run: accept, collect, deliver, and let the banner end.
export function playRun(game, def) {
  accept(game, def);
  game.at(pick(def));
  assert.equal(game.state(def.id), 'deliver');
  game.at(cust(def));
  assert.equal(game.state(def.id), 'done');
  game.waitDone();
  assert.equal(game.state(def.id), 'available');
}

// Nothing was paid, shown or played while loading.
export function assertQuiet(game, money = startMoney) {
  assert.deepEqual(game.moneyEvents, [], 'no money event');
  assert.equal(gameState.money, money);
  assert.deepEqual(game.ui.toasts, [], 'no notification');
  assert.deepEqual(game.scene.popups, [], 'no reward popup');
  assert.equal(game.scene.soundCalls, 0, 'no sound');
  assert.equal(game.ui.offerOpen, false);
}

export { gameState };
