// Stage 2: MissionSystem manages one MissionFlow per mission in the ordered list, with one
// active mission at a time.
//
// Real code: MissionSystem, MissionView, MissionFlow (one per mission), missionSequence,
// missionData, GameState (the shared one), SaveManager, saveSystem, saveSchema.
// Faked (support/fakeMissionScene.js): the Phaser scene, the player, the camera, the DOM
// mission UI and localStorage.
//
// Most tests make ALL four missions playable (options.playableIds) to prove the machinery.
// The real game plays the missions in PLAYABLE_MISSION_IDS (all four, since Stage 3, step C).
// "Refresh" = start the save system again on the same storage and build a new MissionSystem.

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import MissionSystem from '../src/missions/MissionSystem.js';
import MissionFlow from '../src/missions/MissionFlow.js';
import gameState from '../src/state/GameState.js';
import { startSaveSystem, getSaveManager } from '../src/state/saveSystem.js';
import { SAVE_KEYS, createDefaultSave, serializeSave } from '../src/state/saveSchema.js';
import { MISSIONS, MISSION_IDS, PLAYABLE_MISSION_IDS, FIRST_DELIVERY } from '../src/missions/missionData.js';
import { COINS } from '../src/data/neighbourhood.js';
import { ECONOMY } from '../src/config.js';
import { MemoryStorage } from './support/memoryStorage.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './support/fakeMissionScene.js';

const { startMoney } = ECONOMY;
const FAR = { x: 0, y: 0 };
const settle = () => new Promise((resolve) => setImmediate(resolve));
const [M1, M2, M3, M4] = MISSIONS;
const door = (def) => ({ x: def.shop.door.x, y: def.shop.door.y });
const pick = (def) => ({ x: def.pickup.x, y: def.pickup.y });
const cust = (def) => ({ x: def.customer.x, y: def.customer.y });

// progress records, in the shape of the save file
const rec = (state = 'available', runId = 0, completed = 0, lastPaidRunId = 0) => ({ state, runId, completed, lastPaidRunId });
const done = (n = 1) => rec('available', n, n, n); // delivered n times, nothing in progress
const DEFAULT = rec();

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

/* ----------------------------------------------------------------- helpers */

const CONTEXT = { coinIds: COINS.map((c) => c.id), missionIds: [...MISSION_IDS] };

// A save file holding the given progress (by mission id); missions not listed start fresh.
function saveText(progress = {}, { money = startMoney, collected = {} } = {}) {
  const save = createDefaultSave(money, MISSION_IDS);
  Object.entries(progress).forEach(([id, record]) => {
    save.missions[id] = record;
  });
  save.coins.collected = collected;
  return serializeSave(save, CONTEXT);
}
const storageWith = (progress, extra) => new MemoryStorage(progress ? { [SAVE_KEYS.main]: saveText(progress, extra) } : {});
const savedMain = (storage) => JSON.parse(storage.data.get(SAVE_KEYS.main));

// One page load. By default ALL missions are made playable, to prove the machinery.
// `realConfig: true` builds the system exactly as the game does: no options, so only
// PLAYABLE_MISSION_IDS can be played.
function launch(storage, { realConfig = false, playableIds = [...MISSION_IDS], missions } = {}) {
  startSaveSystem({ storage });
  const scene = makeMissionScene();
  const player = makePlayer(FAR.x, FAR.y);
  const { ui, createUI } = makeFakeUI();
  const uiBuilds = [];
  const moneyEvents = [];
  const onMoney = (_total, change) => moneyEvents.push(change);
  gameState.on('money-changed', onMoney);
  const system = new MissionSystem(scene, player, undefined, {
    createUI: (handlers) => {
      uiBuilds.push(handlers);
      return createUI(handlers);
    },
    ...(realConfig ? {} : { playableIds }),
    ...(missions ? { missions } : {}),
  });
  let time = 0;
  return {
    scene,
    player,
    ui,
    system,
    uiBuilds,
    moneyEvents,
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
    },
  };
}

// Accept a job at its shop. Emmy must be unlocked-and-waiting there.
function accept(game, def) {
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
function playRun(game, def) {
  accept(game, def);
  game.at(pick(def));
  assert.equal(game.state(def.id), 'deliver');
  game.at(cust(def));
  assert.equal(game.state(def.id), 'done');
  game.waitDone();
  assert.equal(game.state(def.id), 'available');
}

// Nothing was paid, shown or played while loading.
function assertQuiet(game, money = startMoney) {
  assert.deepEqual(game.moneyEvents, [], 'no money event');
  assert.equal(gameState.money, money);
  assert.deepEqual(game.ui.toasts, [], 'no notification');
  assert.deepEqual(game.scene.popups, [], 'no reward popup');
  assert.equal(game.scene.soundCalls, 0, 'no sound');
  assert.equal(game.ui.offerOpen, false);
}

const countersOf = (flow) => ({ runId: flow.runId, completed: flow.completed, lastPaidRunId: flow.lastPaidRunId });
const savedRecords = (storage) => savedMain(storage).missions;

/* ------------------------------------------------------------------- tests */

describe('one flow per mission', () => {
  test('there is exactly one MissionFlow for each mission, in list order, each with its own definition', () => {
    const game = launch(storageWith());
    assert.equal(game.system.units.length, MISSIONS.length);
    assert.deepEqual(game.system.units.map((u) => u.def.id), [...MISSION_IDS]);
    const flows = game.system.units.map((u) => u.flow);
    flows.forEach((flow, i) => {
      assert.ok(flow instanceof MissionFlow);
      assert.equal(flow.def, MISSIONS[i]);
      assert.equal(game.system.getFlow(MISSION_IDS[i]), flow);
    });
    assert.equal(new Set(flows).size, MISSIONS.length, 'no flow is shared or duplicated');
    assert.equal(game.system.getFlow('nope'), null);
    game.close();
  });

  test('the UI and its Accept / Not Now handlers are created exactly once', () => {
    const game = launch(storageWith());
    assert.equal(game.uiBuilds.length, 1);
    game.close();
  });

  test('the first mission is still system.flow / system.def, for code written for one mission', () => {
    const game = launch(storageWith());
    assert.equal(game.system.flow, game.flow(FIRST_DELIVERY.id));
    assert.equal(game.system.def, FIRST_DELIVERY);
    game.close();
  });

  test('a mission list with a repeated id, or an unknown playable id, is refused', () => {
    startSaveSystem({ storage: storageWith() });
    const build = (options) => new MissionSystem(makeMissionScene(), makePlayer(), undefined, { createUI: makeFakeUI().createUI, ...options });
    assert.throws(() => build({ missions: [M1, M1] }), /duplicate/);
    assert.throws(() => build({ playableIds: ['nope'] }), /not in the list/);
    assert.throws(() => build({ playableIds: [] }), /at least one playable/);
  });

  test('the single-definition form still runs just that one mission', () => {
    startSaveSystem({ storage: storageWith() });
    const system = new MissionSystem(makeMissionScene(), makePlayer(), M2, { createUI: makeFakeUI().createUI });
    assert.deepEqual(system.units.map((u) => u.def.id), [M2.id]);
    assert.equal(system.flow.def, M2);
  });
});

describe('the real game plays all four missions', () => {
  test('PLAYABLE_MISSION_IDS is all four missions, in unlock order (Stage 3, step C)', () => {
    assert.deepEqual([...PLAYABLE_MISSION_IDS], ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall', 'acrossOrisunClose']);
  });

  test('by default every mission has its own pictures in the world', () => {
    const scene = makeMissionScene();
    startSaveSystem({ storage: storageWith() });
    const system = new MissionSystem(scene, makePlayer(), undefined, { createUI: makeFakeUI().createUI });
    assert.deepEqual(system.units.map((u) => [u.def.id, u.playable, u.view !== null]), [
      ['firstDelivery', true, true],
      ['freshFromTheOven', true, true],
      ['suyaForTheHall', true, true],
      ['acrossOrisunClose', true, true],
    ]);
    ['mk_quest', 'mk_ring_blue', 'mk_ring_gold'].forEach((key) => {
      assert.equal(scene.images.filter((i) => i.key === key).length, 4, key);
    });
    // each playable mission has its own customer picture
    ['customer', 'customer_ngozi', 'customer_okafor', 'customer_kemi'].forEach((key) => {
      assert.equal(scene.images.filter((i) => i.key === key).length, 1, key);
    });
  });

  test('with every mission unlocked and nothing in progress, only the new job is checked each frame (replays are never auto-offered)', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1) }); // mission 4 is unlocked
    const game = launch(storage, { realConfig: true });
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(FAR);
    game.at(FAR);
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 0, 0, 2]); // missions 1 to 3 are replays; mission 4 is the new job
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    await settle();
    game.system.destroy();
    game.close();
  });

  test('the first mission plays as before (offer, pickup, delivery, reward) in this configuration', () => {
    const game = launch(storageWith(), { realConfig: true });
    playRun(game, M1);
    assert.equal(gameState.money, startMoney + 250);
    assert.deepEqual(game.moneyEvents, [250]);
    game.close();
  });
});

describe('independent restoration', () => {
  test('each flow gets its own saved progress, and they do not affect each other', () => {
    const progress = { firstDelivery: done(5), freshFromTheOven: done(2), suyaForTheHall: rec('pickup', 3, 2, 2), acrossOrisunClose: rec('available', 4, 1, 1) };
    const game = launch(storageWith(progress));
    assert.deepEqual(MISSION_IDS.map((id) => game.flow(id).toSave()), MISSION_IDS.map((id) => progress[id]));
    assert.equal(game.state('suyaForTheHall'), 'pickup');
    assert.equal(game.flow('firstDelivery').completed, 5);
    assert.equal(game.flow('acrossOrisunClose').runId, 4);
    assertQuiet(game);
    game.close();
  });

  MISSIONS.forEach((def, index) => {
    test(`${def.id} saved in the middle of delivery comes back carrying the package, quietly`, () => {
      const progress = {};
      MISSIONS.slice(0, index).forEach((earlier) => {
        progress[earlier.id] = done(1);
      });
      progress[def.id] = rec('deliver', 1, 0, 0);
      const game = launch(storageWith(progress));

      assert.equal(game.system.activeUnit().def.id, def.id);
      assert.equal(game.state(def.id), 'deliver');
      assert.equal(game.system.package.visible, true);
      assert.equal(game.system.package.y, game.player.y - 72);
      assert.deepEqual(game.ui.objective, { text: def.text.objectiveDeliver, kind: 'deliver' });
      const view = game.view(def.id);
      assert.equal(view.customer.visible, true);
      assert.equal(view.customerRing.visible, true);
      assert.equal(view.customerArrow.visible, true);
      assert.equal(view.pickupRing.visible, false);
      assert.equal(view.questMarker.visible, false);
      MISSIONS.filter((m) => m !== def).forEach((other) => {
        assert.equal(game.view(other.id).questMarker.visible, false, `${other.id} marker hidden while a job is in progress`);
        assert.equal(game.view(other.id).customer.visible, false);
      });
      assertQuiet(game);
      game.close();
    });

    test(`${def.id} saved after accepting comes back at the pickup stage, quietly`, () => {
      const progress = {};
      MISSIONS.slice(0, index).forEach((earlier) => {
        progress[earlier.id] = done(1);
      });
      progress[def.id] = rec('pickup', 1, 0, 0);
      const game = launch(storageWith(progress));

      assert.equal(game.system.activeUnit().def.id, def.id);
      assert.deepEqual(game.ui.objective, { text: def.text.objectivePickup, kind: 'pickup' });
      assert.equal(game.view(def.id).pickupRing.visible, true);
      assert.equal(game.view(def.id).pickupArrow.visible, true);
      assert.equal(game.view(def.id).customer.visible, true);
      assert.equal(game.view(def.id).customerRing.visible, false);
      assert.equal(game.system.package.visible, false);
      assertQuiet(game);
      game.close();
    });
  });
});

describe('independent save bindings', () => {
  test('every flow is bound to the save manager, under its own id', () => {
    const game = launch(storageWith());
    const manager = getSaveManager();
    assert.equal(game.system.boundToSave, true);
    assert.deepEqual([...manager.missionSources.keys()].sort(), [...MISSION_IDS].sort());
    MISSION_IDS.forEach((id) => assert.equal(manager.missionSources.get(id), game.flow(id), id));
    game.close();
  });

  test('progress in one mission is saved without touching the others', async () => {
    const storage = storageWith({ firstDelivery: done(2) });
    const game = launch(storage);
    accept(game, M2);
    await settle();
    const saved = savedRecords(storage);
    assert.deepEqual(saved.freshFromTheOven, rec('pickup', 1, 0, 0));
    assert.deepEqual(saved.firstDelivery, done(2));
    assert.deepEqual(saved.suyaForTheHall, DEFAULT);
    assert.deepEqual(saved.acrossOrisunClose, DEFAULT);
    game.close();
  });

  test('a refresh without destroy does not leave two sets of bindings: the new flows own them', () => {
    const storage = storageWith();
    const first = launch(storage);
    const second = launch(storage);
    const manager = getSaveManager();
    assert.equal(manager.missionSources.size, MISSIONS.length);
    MISSION_IDS.forEach((id) => assert.equal(manager.missionSources.get(id), second.flow(id)));
    first.close();
    second.close();
  });
});

describe('destroying the mission system', () => {
  test('it unbinds every mission, closes the UI and removes the package', () => {
    const game = launch(storageWith());
    game.system.destroy();
    const manager = getSaveManager();
    assert.equal(manager.missionSources.size, 0);
    assert.equal(game.system.boundToSave, false);
    assert.equal(game.ui.destroyed, true);
    assert.equal(game.system.package.destroyed, true);
    assert.equal(game.player.inputLocked, false);
    game.close();
  });

  test('the last progress of every mission is kept, and a dead flow can no longer change the save', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const game = launch(storage);
    accept(game, M2);
    game.system.destroy();
    game.flow(M2.id).runId = 99; // a flow that is no longer connected
    game.flow(M1.id).completed = 99;
    gameState.collectCoin(COINS[0].id, ECONOMY.coinValue); // some later save
    await settle();
    const saved = savedRecords(storage);
    assert.deepEqual(saved.freshFromTheOven, rec('pickup', 1, 0, 0));
    assert.deepEqual(saved.firstDelivery, done(1));
    game.close();
  });

  test('destroying while the offer card is open frees the player, and destroying twice is harmless', () => {
    const game = launch(storageWith());
    game.at(door(M1));
    assert.equal(game.player.inputLocked, true);
    game.system.destroy();
    assert.equal(game.player.inputLocked, false);
    assert.doesNotThrow(() => game.system.destroy());
    game.close();
  });

  test('destroy works when there is no save manager', () => {
    startSaveSystem({ storage: storageWith(), target: null }); // start-up fails: no manager
    assert.equal(getSaveManager(), null);
    const system = new MissionSystem(makeMissionScene(), makePlayer(), undefined, { createUI: makeFakeUI().createUI, playableIds: [...MISSION_IDS] });
    assert.equal(system.boundToSave, false);
    assert.doesNotThrow(() => system.destroy());
  });
});

describe('only one mission is active at a time', () => {
  // Missions 1 and 2 delivered before: 1 and 2 can be replayed, 3 is the new job, 4 is locked.
  const open = () => storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) });

  test('while a job is in progress, no other mission offers, however close Emmy walks to it', () => {
    const game = launch(open());
    accept(game, M1);
    [M2, M3, M4].forEach((def) => {
      game.at(door(def));
      game.at(door(def));
      assert.equal(game.state(def.id), 'available', def.id);
    });
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.system.activeUnit().def.id, M1.id);
    game.close();
  });

  test('the same holds once the package is collected (deliver stage)', () => {
    const game = launch(open());
    accept(game, M1);
    game.at(pick(M1));
    assert.equal(game.state(M1.id), 'deliver');
    [M2, M3].forEach((def) => {
      game.at(door(def));
      assert.equal(game.state(def.id), 'available');
    });
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('only the active flow receives frame updates', () => {
    const game = launch(open());
    accept(game, M2);
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(door(M3));
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 1, 0, 0]);
    game.at(pick(M2));
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 2, 0, 0]);
    game.close();
  });

  test('with no job in progress, only an unlocked NEW job is checked (replays are chosen with the prompt; a locked job is never updated)', () => {
    const game = launch(open());
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(FAR);
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 0, 1, 0]); // 1 and 2 are replays, 3 is new, 4 is locked
    game.close();
  });

  test('only the active mission shows its markers and its objective', () => {
    const game = launch(open());
    // waiting: the three unlocked shops show a job marker, the locked one does not
    assert.deepEqual(MISSION_IDS.map((id) => game.view(id).questMarker.visible), [true, true, true, false]);

    accept(game, M3);
    assert.deepEqual(MISSION_IDS.map((id) => game.view(id).questMarker.visible), [false, false, false, false]);
    assert.equal(game.view(M3.id).pickupRing.visible, true);
    assert.equal(game.view(M3.id).customer.visible, true);
    [M1, M2, M4].forEach((def) => {
      const view = game.view(def.id);
      [view.pickupRing, view.pickupArrow, view.customer, view.customerShadow, view.customerRing, view.customerArrow].forEach((o) => assert.equal(o.visible, false, def.id));
    });
    assert.deepEqual(game.ui.objective, { text: M3.text.objectivePickup, kind: 'pickup' });
    game.close();
  });

  test('the arrow points at the active mission only', () => {
    const game = launch(open());
    accept(game, M3);
    game.scene.camera.worldView = { x: 0, y: 0 }; // looking at the top-left corner
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'pickup');
    game.at(pick(M3));
    game.at(pick(M3));
    assert.equal(game.ui.arrow?.kind, 'deliver');
    game.close();
  });

  test('Accept never starts a mission while another is in progress (the card just closes)', () => {
    const game = launch(open());
    accept(game, M1);
    game.flow(M2.id).state = 'offer'; // force an offer card for another mission, which should not happen
    game.ui.accept();
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).runId, 1); // unchanged
    assert.equal(game.state(M1.id), 'pickup');
    assert.equal(game.system.units.filter((u) => u.flow.isActive).length, 1);
    game.close();
  });

  test('Accept and Not Now do nothing when no card is open', () => {
    const game = launch(open());
    game.ui.accept();
    game.ui.decline();
    MISSION_IDS.forEach((id) => assert.equal(game.state(id), 'available'));
    game.close();
  });

  test('a new job and a replay on the same spot: only the new job opens its card, and the replay shows no prompt meanwhile', () => {
    // a test-only third mission (a new job) whose shop door sits exactly on the second mission's (a replay) door
    const clash = { ...M3, shop: { ...M3.shop, door: { ...M2.shop.door } } };
    const game = launch(open(), { missions: [M1, M2, clash, M4] });
    game.at(door(M2));
    assert.equal(game.state(clash.id), 'offer', 'the new job opens by itself');
    assert.equal(game.state(M2.id), 'available', 'the replay does not');
    assert.equal(game.ui.replayPrompt, null, 'and nothing is prompted while a card is open');
    game.ui.accept();
    assert.equal(game.state(clash.id), 'pickup');
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.ui.replayPrompt, null);
    game.close();
  });

  test('a locked mission never offers, and its marker stays hidden', () => {
    const game = launch(storageWith());
    game.at(door(M2));
    game.at(door(M3));
    game.at(door(M4));
    [M2, M3, M4].forEach((def) => {
      assert.equal(game.state(def.id), 'available');
      assert.equal(game.view(def.id).questMarker.visible, false, def.id);
    });
    assert.equal(game.view(M1.id).questMarker.visible, true);
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });
});

describe('completing a mission never accepts another', () => {
  test('delivering the first mission unlocks the second but leaves it available and unstarted', async () => {
    const storage = storageWith();
    const game = launch(storage);
    assert.equal(game.system.unlockedIds.has(M2.id), false);
    accept(game, M1);
    game.at(pick(M1));
    game.at(cust(M1));
    assert.equal(game.state(M1.id), 'done');
    assert.equal(game.system.unlockedIds.has(M2.id), true); // unlocked at once, from the saved count
    assert.equal(game.system.unlockedIds.has(M3.id), false);
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).runId, 0);
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.ui.offerOpen, false);

    game.waitDone(); // the banner ends, far from every shop
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.view(M2.id).questMarker.visible, true); // its marker appears, nothing else
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.ui.objective, null);
    await settle();
    assert.deepEqual(savedRecords(storage).freshFromTheOven, DEFAULT);
    game.close();
  });

  test('the second mission starts only when the player opens its offer and accepts it', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'offer'); // the card opens by itself...
    assert.equal(game.flow(M2.id).runId, 0); // ...but nothing has started
    game.ui.decline();
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).runId, 0);
    game.at(FAR);
    game.at(door(M2));
    game.ui.accept();
    assert.equal(game.state(M2.id), 'pickup');
    assert.equal(game.flow(M2.id).runId, 1);
    game.close();
  });

  test('while the delivered banner is showing, another shop cannot offer; it can right after', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M1);
    game.at(pick(M1));
    game.at(cust(M1));
    assert.equal(game.state(M1.id), 'done');
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'available', 'no offer during the banner');
    for (let i = 0; i < 40; i += 1) game.at(door(M2), 100); // the banner ends
    assert.equal(game.state(M1.id), 'available');
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'offer', 'the offer opens afterwards');
    game.close();
  });

  test('Not Now never starts anything', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) }));
    game.at(door(M3));
    game.ui.decline();
    assert.equal(game.system.activeUnit(), null);
    MISSION_IDS.forEach((id) => assert.notEqual(game.state(id), 'pickup'));
    game.close();
  });
});

describe('rewards: exactly once per delivery run', () => {
  test('replaying The First Delivery pays 250 every time', async () => {
    const storage = storageWith();
    const game = launch(storage);
    for (let run = 1; run <= 3; run += 1) {
      playRun(game, M1);
      assert.equal(gameState.money, startMoney + 250 * run, `run ${run}`);
    }
    assert.deepEqual(game.moneyEvents, [250, 250, 250]);
    assert.equal(game.flow(M1.id).completed, 3);
    await settle();
    assert.deepEqual(savedRecords(storage).firstDelivery, done(3));
    game.close();
  });

  test('standing on the customer, or repeated completion attempts, pay once', () => {
    const game = launch(storageWith());
    accept(game, M1);
    game.at(pick(M1));
    game.at(cust(M1));
    for (let i = 0; i < 10; i += 1) game.at(cust(M1));
    for (let i = 0; i < 5; i += 1) assert.equal(game.flow(M1.id).complete(), false);
    assert.deepEqual(game.moneyEvents, [250]);
    assert.equal(game.scene.popups.length, 1);
    assert.equal(game.ui.toasts.filter((t) => t.title === M1.text.doneTitle).length, 1);
    game.close();
  });

  test('each of the four missions pays its own reward once, in order, with a refresh between runs', async () => {
    const storage = storageWith();
    let game = launch(storage);
    let total = startMoney;
    for (const def of MISSIONS) {
      playRun(game, def);
      total += def.reward;
      assert.equal(gameState.money, total, def.id);
      await settle();
      game.close();
      game = launch(storage); // refresh
      assert.equal(gameState.money, total, `after refreshing following ${def.id}`);
      assertQuiet(game, total);
    }
    assert.equal(total, startMoney + 250 + 300 + 550 + 750);
    MISSION_IDS.forEach((id) => assert.equal(game.flow(id).completed, 1, id));
    game.close();
  });

  test('refreshing in pickup, again and again, then finishing, pays once', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) });
    let game = launch(storage);
    accept(game, M3);
    await settle();
    game.close();
    for (let i = 0; i < 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M3.id), 'pickup', `refresh ${i + 1}`);
      assertQuiet(game);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(pick(M3));
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    game.close();
  });

  test('refreshing in delivery, again and again, then finishing, pays once', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    let game = launch(storage);
    accept(game, M2);
    game.at(pick(M2));
    await settle();
    game.close();
    for (let i = 0; i < 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M2.id), 'deliver', `refresh ${i + 1}`);
      assert.equal(game.system.package.visible, true);
      assertQuiet(game);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(cust(M2));
    game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, [300]);
    assert.equal(gameState.money, startMoney + 300);
    game.close();
  });

  test('refreshing immediately after completion does not pay again, and keeps the unlock', async () => {
    const storage = storageWith();
    const first = launch(storage);
    accept(first, M1);
    first.at(pick(M1));
    first.at(cust(M1));
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.money, startMoney + 250);
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.system.unlockedIds.has(M2.id), true);
    game.at(cust(M1));
    game.at(cust(M1));
    assert.deepEqual(game.moneyEvents, []);
    assert.equal(game.flow(M1.id).completed, 1);
    assert.equal(game.system.activeUnit(), null);
    game.close();
  });

  test('a page lost before the queued save ran leaves money and mission in agreement (resume, paid once)', async () => {
    const storage = storageWith();
    const first = launch(storage);
    accept(first, M1);
    first.at(pick(M1));
    await settle();
    first.at(cust(M1)); // paid in memory; the save is queued but never runs
    first.close();

    const game = launch(storage);
    assert.equal(game.state(M1.id), 'deliver');
    assert.equal(gameState.money, startMoney);
    game.at(cust(M1));
    assert.deepEqual(game.moneyEvents, [250]);
    game.close();
  });
});

describe('damaged saves with several missions in progress', () => {
  test('the first active mission in order is kept; the other goes back to available with its counters', async () => {
    const storage = storageWith({ firstDelivery: rec('deliver', 2, 1, 1), freshFromTheOven: rec('pickup', 1, 0, 0) });
    const game = launch(storage);
    assert.equal(game.system.activeUnit().def.id, M1.id);
    assert.equal(game.state(M1.id), 'deliver');
    assert.equal(game.state(M2.id), 'available');
    assert.deepEqual(countersOf(game.flow(M2.id)), { runId: 1, completed: 0, lastPaidRunId: 0 });
    assert.deepEqual(countersOf(game.flow(M1.id)), { runId: 2, completed: 1, lastPaidRunId: 1 });
    assert.equal(game.system.package.visible, true);
    assert.deepEqual(game.ui.objective, { text: M1.text.objectiveDeliver, kind: 'deliver' });
    assert.equal(game.view(M2.id).pickupRing.visible, false);
    assertQuiet(game);

    await settle(); // the repair is saved
    const saved = savedRecords(storage);
    assert.deepEqual(saved.firstDelivery, rec('deliver', 2, 1, 1));
    assert.deepEqual(saved.freshFromTheOven, rec('available', 1, 0, 0));
    game.close();
  });

  test('with three in progress, the first unlocked one in order stays and the rest are reset, keeping completed counts', async () => {
    const storage = storageWith({
      firstDelivery: done(1),
      freshFromTheOven: rec('pickup', 4, 3, 3),
      suyaForTheHall: rec('deliver', 2, 1, 1),
      acrossOrisunClose: rec('pickup', 1, 0, 0),
    });
    const game = launch(storage);
    assert.equal(game.system.activeUnit().def.id, M2.id);
    assert.equal(game.state(M2.id), 'pickup');
    assert.deepEqual(game.flow(M3.id).toSave(), rec('available', 2, 1, 1));
    assert.deepEqual(game.flow(M4.id).toSave(), rec('available', 1, 0, 0));
    assert.equal(game.flow(M1.id).completed, 1);
    assert.equal(game.flow(M2.id).completed, 3);
    assert.equal(game.flow(M3.id).completed, 1);
    assert.deepEqual(game.ui.objective, { text: M2.text.objectivePickup, kind: 'pickup' });
    assertQuiet(game);
    await settle();
    const saved = savedRecords(storage);
    assert.deepEqual(saved.suyaForTheHall, rec('available', 2, 1, 1));
    assert.deepEqual(saved.acrossOrisunClose, rec('available', 1, 0, 0));
    game.close();
  });

  test('the first in ORDER wins, not the one with the biggest numbers', () => {
    const game = launch(storageWith({ firstDelivery: rec('pickup', 1, 0, 0), freshFromTheOven: rec('deliver', 9, 8, 8) }));
    assert.equal(game.system.activeUnit().def.id, M1.id);
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).completed, 8);
    game.close();
  });

  test('a locked mission cannot stay in progress; it goes back to available, not active', () => {
    const game = launch(storageWith({ suyaForTheHall: rec('pickup', 1, 0, 0) })); // missions 1 and 2 not delivered
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.view(M1.id).questMarker.visible, true);
    assert.equal(game.ui.objective, null);
    assert.equal(game.system.package.visible, false);
    assertQuiet(game);
    game.close();
  });

  test('a mission that is not switched on stays out of the game: it is reset (a custom configuration, since the real one now plays all four)', () => {
    const threeOnly = ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall'];
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1), acrossOrisunClose: rec('deliver', 1, 0, 0) }), { playableIds: threeOnly });
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.system.package.visible, false);
    assert.equal(game.view(M1.id).questMarker.visible, true);
    assertQuiet(game);
    game.close();
  });

  test('every mission in progress at once: the first is kept and nothing is paid or lost', () => {
    const progress = {};
    MISSIONS.forEach((def, i) => {
      progress[def.id] = rec('deliver', 2, i === 0 ? 1 : 1, 1);
    });
    const game = launch(storageWith(progress));
    assert.equal(game.system.activeUnit().def.id, M1.id);
    assert.equal(game.system.units.filter((u) => u.flow.isActive).length, 1);
    MISSIONS.forEach((def) => assert.equal(game.flow(def.id).completed, 1, def.id));
    assertQuiet(game);
    game.close();
  });

  test('the kept mission can then be finished, paying once, and the reset ones can be played later', () => {
    const game = launch(storageWith({ firstDelivery: rec('deliver', 2, 1, 1), freshFromTheOven: rec('pickup', 1, 0, 0) }));
    game.at(cust(M1));
    assert.deepEqual(game.moneyEvents, [250]);
    game.waitDone();
    playRun(game, M2); // the reset mission starts a new run
    assert.deepEqual(game.moneyEvents, [250, 300]);
    assert.equal(game.flow(M2.id).completed, 1);
    game.close();
  });

  test('a healthy save is not rewritten just because it was loaded', async () => {
    const storage = storageWith({ firstDelivery: rec('deliver', 2, 1, 1) });
    const game = launch(storage);
    await settle();
    assert.equal(storage.writesTo(SAVE_KEYS.main), 0);
    game.close();
  });
});

describe('old saves that only know firstDelivery', () => {
  function oldSave(record, money = 800) {
    const save = createDefaultSave(money, [FIRST_DELIVERY.id]);
    save.missions[FIRST_DELIVERY.id] = record;
    return serializeSave(save, { coinIds: CONTEXT.coinIds, missionIds: [FIRST_DELIVERY.id] });
  }

  test('a finished-before save restores the first mission, the others start fresh, and it plays on', async () => {
    const storage = new MemoryStorage({ [SAVE_KEYS.main]: oldSave(done(3)) });
    const game = launch(storage, { realConfig: true });
    assert.equal(game.flow(M1.id).completed, 3);
    MISSION_IDS.slice(1).forEach((id) => assert.deepEqual(game.flow(id).toSave(), DEFAULT, id));
    assertQuiet(game, 800);
    playRun(game, M1);
    assert.equal(gameState.money, 1050);
    await settle();
    const saved = savedRecords(storage);
    assert.deepEqual(saved.firstDelivery, done(4));
    MISSION_IDS.slice(1).forEach((id) => assert.deepEqual(saved[id], DEFAULT, id));
    game.close();
  });

  test('an old save taken mid-delivery resumes carrying the package', () => {
    const storage = new MemoryStorage({ [SAVE_KEYS.main]: oldSave(rec('deliver', 1, 0, 0)) });
    const game = launch(storage, { realConfig: true });
    assert.equal(game.state(M1.id), 'deliver');
    assert.equal(game.system.package.visible, true);
    assert.deepEqual(game.ui.objective, { text: FIRST_DELIVERY.text.objectiveDeliver, kind: 'deliver' });
    assertQuiet(game, 800);
    game.at(cust(M1));
    assert.deepEqual(game.moneyEvents, [250]);
    game.close();
  });
});

describe('nothing is paid, shown or played while restoring', () => {
  const scenarios = {
    'a new game': undefined,
    'delivered once': { firstDelivery: done(1) },
    'in pickup': { firstDelivery: rec('pickup', 1, 0, 0) },
    'in delivery': { firstDelivery: rec('deliver', 1, 0, 0) },
    'a replay in delivery': { firstDelivery: rec('deliver', 4, 3, 3) },
    'in the middle of the third mission': { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: rec('deliver', 1, 0, 0) },
    'two missions in progress': { firstDelivery: rec('pickup', 1, 0, 0), freshFromTheOven: rec('deliver', 1, 0, 0) },
  };
  Object.entries(scenarios).forEach(([name, progress]) => {
    test(`${name}: restoring (and a few quiet frames) causes no money, popup, notification or sound`, () => {
      const game = launch(storageWith(progress));
      game.at(FAR);
      game.at(FAR);
      assertQuiet(game);
      game.close();
    });
  });
});
