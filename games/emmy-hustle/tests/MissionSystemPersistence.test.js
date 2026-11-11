// Step 3C: mission persistence in the REAL src/missions/MissionSystem.js.
//
// Real code: MissionSystem, MissionFlow, GameState (the shared one), SaveManager, saveSystem,
// saveSchema. Faked (see support/fakeMissionScene.js): the Phaser scene, the player, the
// camera, the DOM mission UI, and localStorage (MemoryStorage).
//
// "Refreshing the page" is played by starting the save system again from the SAME storage and
// building a brand-new MissionSystem, exactly what a page reload does.

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import MissionSystem from '../src/missions/MissionSystem.js';
import gameState from '../src/state/GameState.js';
import { startSaveSystem, getSaveManager } from '../src/state/saveSystem.js';
import { SAVE_KEYS, SAVE_VERSION, createDefaultSave, serializeSave } from '../src/state/saveSchema.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { COINS } from '../src/data/neighbourhood.js';
import { ECONOMY } from '../src/config.js';
import { MemoryStorage } from './support/memoryStorage.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './support/fakeMissionScene.js';
import { FAR, AT_SHOP, AT_PICKUP, AT_CUSTOMER, MISSION_ID } from './support/missionHelpers.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1';
const SETTINGS_VALUE = '{"joystickSide":"left"}';
const { startMoney } = ECONOMY;
const { reward } = FIRST_DELIVERY;
const settle = () => new Promise((resolve) => setImmediate(resolve)); // lets queued saves run

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

/* ----------------------------------------------------------------- helpers */

const newStorage = (initial = {}) => new MemoryStorage({ [SETTINGS_KEY]: SETTINGS_VALUE, ...initial });

// Starts the (real) save system on `storage` and a brand-new MissionSystem: one page load.
function launch(storage, { startSave = true } = {}) {
  if (startSave) startSaveSystem({ storage });
  const scene = makeMissionScene();
  const player = makePlayer(FAR.x, FAR.y);
  const { ui, createUI } = makeFakeUI();
  const moneyEvents = [];
  const onMoney = (total, change) => moneyEvents.push(change);
  gameState.on('money-changed', onMoney);
  const system = new MissionSystem(scene, player, FIRST_DELIVERY, { createUI });
  let time = 0;
  const game = {
    scene,
    player,
    ui,
    system,
    moneyEvents,
    get flow() {
      return system.flow;
    },
    // Emmy stands at `point` for one frame.
    at(point) {
      player.x = point.x;
      player.y = point.y;
      time += 16;
      system.update(time, 16);
    },
    // Leaves the scene's listeners tidy (a real page reload would drop them all).
    close() {
      gameState.off('money-changed', onMoney);
    },
  };
  return game;
}

const savedMain = (storage) => JSON.parse(storage.data.get(SAVE_KEYS.main));
const savedMission = (storage) => savedMain(storage).missions[MISSION_ID];

// Plays a delivery from "available" up to carrying the package.
// A NEW job opens its offer card by itself; a replay (delivered before) shows its prompt, which the
// player taps to open the same card.
function openOffer(game) {
  game.at(AT_SHOP);
  if (game.flow.state !== 'offer') game.ui.replay();
  assert.equal(game.flow.state, 'offer');
}

function acceptAndCollect(game) {
  openOffer(game); // the offer card opens
  game.ui.accept();
  game.at(AT_PICKUP); // package collected
}

const visible = (game, key) => game.scene.image(key).visible;

// The visuals that belong to each state, checked in one place.
function expectVisuals(game, state) {
  const quest = state === 'available';
  const pickup = state === 'pickup';
  const deliver = state === 'deliver';
  assert.equal(visible(game, 'mk_quest'), quest, `quest marker in ${state}`);
  assert.equal(visible(game, 'mk_ring_blue'), pickup, `pickup ring in ${state}`);
  assert.equal(visible(game, 'mk_arrow_blue'), pickup, `pickup arrow in ${state}`);
  assert.equal(visible(game, 'customer'), pickup || deliver, `customer in ${state}`);
  assert.equal(visible(game, 'shadow'), pickup || deliver, `customer shadow in ${state}`);
  assert.equal(visible(game, 'mk_ring_gold'), deliver, `customer ring in ${state}`);
  assert.equal(visible(game, 'mk_arrow_gold'), deliver, `customer arrow in ${state}`);
  assert.equal(visible(game, 'pkg'), deliver, `package icon in ${state}`);
  const text = FIRST_DELIVERY.text;
  const expected = { pickup: text.objectivePickup, deliver: text.objectiveDeliver }[state];
  assert.equal(game.ui.objective?.text ?? null, expected ?? null, `objective line in ${state}`);
}

/* ------------------------------------------------------------------- tests */

describe('a new game', () => {
  test('starts available, with the job marker and no notices', () => {
    const game = launch(newStorage());
    assert.equal(game.flow.state, 'available');
    expectVisuals(game, 'available');
    assert.deepEqual(game.ui.toasts, []);
    assert.equal(gameState.money, startMoney);
  });

  test('is bound to the save manager', async () => {
    const storage = newStorage();
    const game = launch(storage);
    assert.equal(game.system.boundToSave, true);
    gameState.addMoney(1); // any progress change triggers a save
    await settle();
    assert.deepEqual(savedMission(storage), { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 });
  });
});

describe('explicit save requests', () => {
  test('accepting a job saves it (one write), although no money moved', async () => {
    const storage = newStorage();
    const game = launch(storage);
    game.at(AT_SHOP);
    await settle();
    const before = storage.writesTo(SAVE_KEYS.main);
    game.ui.accept();
    await settle();
    assert.equal(storage.writesTo(SAVE_KEYS.main), before + 1);
    assert.deepEqual(savedMission(storage), { state: 'pickup', runId: 1, completed: 0, lastPaidRunId: 0 });
    assert.equal(savedMain(storage).money, startMoney);
  });

  test('collecting the package saves it (one write)', async () => {
    const storage = newStorage();
    const game = launch(storage);
    game.at(AT_SHOP);
    game.ui.accept();
    await settle();
    const before = storage.writesTo(SAVE_KEYS.main);
    game.at(AT_PICKUP);
    await settle();
    assert.equal(storage.writesTo(SAVE_KEYS.main), before + 1);
    assert.equal(savedMission(storage).state, 'deliver');
  });

  test('opening and declining the offer card does not write anything', async () => {
    const storage = newStorage();
    const game = launch(storage);
    game.at(AT_SHOP);
    game.ui.decline();
    await settle();
    assert.equal(storage.writesTo(SAVE_KEYS.main), 0);
  });
});

describe('restoring the pickup state', () => {
  test('accept, refresh: back at the pickup stage, with the right visuals', async () => {
    const storage = newStorage();
    const first = launch(storage);
    first.at(AT_SHOP);
    first.ui.accept();
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(game.flow.state, 'pickup');
    assert.equal(game.flow.runId, 1);
    expectVisuals(game, 'pickup');
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('the restored job can be finished normally and pays once', async () => {
    const storage = newStorage();
    const first = launch(storage);
    first.at(AT_SHOP);
    first.ui.accept();
    await settle();
    first.close();

    const game = launch(storage);
    game.at(AT_PICKUP);
    assert.equal(game.flow.state, 'deliver');
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward);
    assert.equal(game.flow.completed, 1);
    game.close();
  });

  test('the objective arrow points at the pickup point when it is off screen', async () => {
    const storage = newStorage();
    const first = launch(storage);
    first.at(AT_SHOP);
    first.ui.accept();
    await settle();
    first.close();

    const game = launch(storage);
    game.scene.camera.worldView = { x: 3000, y: 3000 }; // looking somewhere far away
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'pickup');
    game.close();
  });
});

describe('restoring the deliver state', () => {
  test('collect, refresh repeatedly: still carrying, every time, with nothing replayed', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    await settle();
    first.close();
    const snapshot = JSON.stringify(savedMain(storage));

    for (let i = 0; i < 4; i += 1) {
      const game = launch(storage);
      assert.equal(game.flow.state, 'deliver', `refresh ${i + 1}`);
      assert.equal(game.flow.runId, 1);
      expectVisuals(game, 'deliver');
      assert.deepEqual(game.ui.toasts, [], 'no collection toast');
      assert.equal(game.scene.soundCalls, 0);
      assert.equal(gameState.money, startMoney);
      game.close();
      await settle();
    }
    // loading never rewrote the save with different content
    assert.equal(JSON.stringify(savedMain(storage)).replace(/"savedAt":\d+/, ''), snapshot.replace(/"savedAt":\d+/, ''));
  });

  test('the package icon is right above Emmy at once, then follows her', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    await settle();
    first.close();

    const game = launch(storage);
    const icon = game.scene.image('pkg');
    assert.equal(icon.visible, true);
    assert.equal(icon.x, game.player.x);
    assert.equal(icon.y, game.player.y - 72);
    assert.equal(icon.depth, game.player.depth + 1);
    game.at({ x: 500, y: 700 });
    assert.equal(icon.x, 500);
    game.close();
  });

  test('the objective arrow points at the customer when it is off screen', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    await settle();
    first.close();

    const game = launch(storage);
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'deliver');
    game.close();
  });

  test('the restored delivery completes and pays exactly once', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    await settle();
    first.close();

    const game = launch(storage);
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward);
    assert.deepEqual(game.moneyEvents, [reward]);
    assert.equal(game.ui.toasts.length, 1);
    assert.equal(game.ui.toasts[0].title, FIRST_DELIVERY.text.doneTitle);
    assert.equal(visible(game, 'pkg'), false);
    game.close();
  });
});

describe('"offer" and "done" are restored as "available"', () => {
  test('saved while the offer card is open: refresh shows no card, only the job marker', async () => {
    const storage = newStorage();
    const first = launch(storage);
    first.at(AT_SHOP);
    assert.equal(first.flow.state, 'offer');
    assert.equal(first.ui.offerOpen, true);
    gameState.collectCoin(COINS[0].id, 5); // any progress change makes a save
    await settle();
    assert.equal(savedMission(storage).state, 'available');
    first.close();

    const game = launch(storage);
    assert.equal(game.flow.state, 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    expectVisuals(game, 'available');
    game.close();
  });

  test('saved while "delivery completed" is showing: refresh is available, paid once, no banner', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    first.at(AT_CUSTOMER);
    assert.equal(first.flow.state, 'done');
    await settle();
    assert.equal(savedMission(storage).state, 'available');
    first.close();

    const game = launch(storage);
    assert.equal(game.flow.state, 'available');
    expectVisuals(game, 'available');
    assert.deepEqual(game.ui.toasts, []);
    assert.equal(gameState.money, startMoney + reward);
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });
});

describe('restoring never triggers gameplay events', () => {
  for (const stage of ['pickup', 'deliver', 'available (paid)']) {
    test(`restoring ${stage}: no money, popup, toast or sound`, async () => {
      const storage = newStorage();
      const first = launch(storage);
      if (stage === 'pickup') {
        first.at(AT_SHOP);
        first.ui.accept();
      } else {
        acceptAndCollect(first);
        if (stage !== 'deliver') first.at(AT_CUSTOMER);
      }
      await settle();
      first.close();
      const money = savedMain(storage).money;

      const game = launch(storage);
      game.at(FAR); // a few quiet frames
      game.at(FAR);
      assert.equal(gameState.money, money);
      assert.deepEqual(game.moneyEvents, []);
      assert.deepEqual(game.scene.popups, []);
      assert.deepEqual(game.ui.toasts, []);
      assert.equal(game.scene.soundCalls, 0);
      game.close();
    });
  }
});

describe('completing a delivery and reloading', () => {
  test('refresh right after delivering: the reward is not paid again', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    first.at(AT_CUSTOMER);
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.money, startMoney + reward);
    game.at(AT_CUSTOMER); // standing on the customer changes nothing: no package, no job
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward);
    assert.equal(game.flow.completed, 1);
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('page lost before the queued save ran: money and mission still agree (still deliver, no reward yet)', async () => {
    const storage = newStorage();
    const first = launch(storage);
    acceptAndCollect(first);
    await settle();
    first.at(AT_CUSTOMER); // paid in memory, save queued but not run yet
    first.close();
    // ...the page is lost HERE: the stored file is the one from before delivery

    const game = launch(storage);
    assert.equal(game.flow.state, 'deliver');
    assert.equal(gameState.money, startMoney);
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward); // paid exactly once, in this session
    await settle();
    assert.equal(savedMission(storage).lastPaidRunId, 1);
    game.close();
  });

  test('every write made during a whole delivery keeps money and mission consistent', async () => {
    const storage = newStorage();
    const writes = [];
    const originalSet = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === SAVE_KEYS.main) writes.push(JSON.parse(value));
      return originalSet(key, value);
    };
    const game = launch(storage);
    game.at(AT_SHOP);
    game.ui.accept();
    await settle(); // write 1: accepted
    game.at(AT_PICKUP);
    await settle(); // write 2: package collected
    game.at(AT_CUSTOMER);
    await settle(); // write 3: delivered, paid
    game.close();

    assert.equal(writes.length, 3);
    for (const save of writes) {
      const mission = save.missions[MISSION_ID];
      const paid = mission.lastPaidRunId >= 1;
      assert.equal(save.money, paid ? startMoney + reward : startMoney, JSON.stringify(mission));
      assert.equal(mission.completed, mission.lastPaidRunId);
    }
    const last = writes[writes.length - 1];
    assert.deepEqual(last.missions[MISSION_ID], { state: 'available', runId: 1, completed: 1, lastPaidRunId: 1 });
    assert.equal(last.money, startMoney + reward);
  });

  test('the reward and the mission progress are in the SAME single write', async () => {
    const storage = newStorage();
    const game = launch(storage);
    acceptAndCollect(game);
    await settle();
    const before = storage.writesTo(SAVE_KEYS.main);
    game.at(AT_CUSTOMER);
    await settle();
    assert.equal(storage.writesTo(SAVE_KEYS.main), before + 1);
    game.close();
  });
});

describe('repeated completion attempts and replaying', () => {
  test('forcing completion again and again pays once', async () => {
    const game = launch(newStorage());
    acceptAndCollect(game);
    game.at(AT_CUSTOMER);
    for (let i = 0; i < 5; i += 1) {
      assert.equal(game.flow.complete(), false);
      game.at(AT_CUSTOMER);
    }
    assert.equal(gameState.money, startMoney + reward);
    assert.deepEqual(game.moneyEvents, [reward]);
    game.close();
  });

  test('three legitimate runs, with a refresh between each, pay exactly three times', async () => {
    const storage = newStorage();
    let game = launch(storage);
    for (let run = 1; run <= 3; run += 1) {
      game.at(FAR);
      acceptAndCollect(game);
      game.at(AT_CUSTOMER);
      assert.equal(gameState.money, startMoney + reward * run, `after run ${run}`);
      game.at(AT_CUSTOMER); // standing there afterwards pays nothing
      await settle();
      game.close();

      game = launch(storage); // refresh
      assert.equal(gameState.money, startMoney + reward * run);
      assert.deepEqual(savedMission(storage), { state: 'available', runId: run, completed: run, lastPaidRunId: run });
    }
    assert.equal(game.flow.completed, 3);
    game.close();
  });

  test('a job replayed after a reload resumes and pays once, even with a refresh in the middle', async () => {
    const storage = newStorage();
    let game = launch(storage);
    acceptAndCollect(game);
    game.at(AT_CUSTOMER);
    await settle();
    game.close();

    game = launch(storage); // refresh, then take the job again
    game.at(FAR);
    openOffer(game);
    game.ui.accept();
    await settle();
    game.close();

    game = launch(storage); // refresh in pickup of run 2
    assert.equal(game.flow.state, 'pickup');
    assert.equal(game.flow.runId, 2);
    game.at(AT_PICKUP);
    await settle();
    game.close();

    game = launch(storage); // refresh in deliver of run 2
    assert.equal(game.flow.state, 'deliver');
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward * 2);
    assert.deepEqual(game.moneyEvents, [reward]);
    game.close();
  });
});

describe('the saved snapshot', () => {
  test('holds money, coins and mission progress together and consistently', async () => {
    const storage = newStorage();
    const game = launch(storage);
    gameState.collectCoin(COINS[0].id, ECONOMY.coinValue);
    acceptAndCollect(game);
    game.at(AT_CUSTOMER);
    await settle();
    game.close();

    const save = savedMain(storage);
    assert.equal(save.v, SAVE_VERSION);
    assert.equal(save.money, startMoney + ECONOMY.coinValue + reward);
    assert.deepEqual(Object.keys(save.coins.collected), [COINS[0].id]);
    assert.deepEqual(save.missions[MISSION_ID], { state: 'available', runId: 1, completed: 1, lastPaidRunId: 1 });
  });
});

describe('compatibility with other saved data', () => {
  test('a save with no mission progress (older save) starts the mission fresh', () => {
    const context = { coinIds: COINS.map((c) => c.id), missionIds: [MISSION_ID] };
    const old = createDefaultSave(777, [MISSION_ID]);
    const game = launch(newStorage({ [SAVE_KEYS.main]: serializeSave(old, context) }));
    assert.equal(game.flow.state, 'available');
    assert.equal(game.flow.runId, 0);
    assert.equal(gameState.money, 777);
    expectVisuals(game, 'available');
    game.close();
  });

  test('a saved run that is already paid is never resumed as a job in progress', () => {
    const context = { coinIds: COINS.map((c) => c.id), missionIds: [MISSION_ID] };
    const odd = createDefaultSave(500, [MISSION_ID]);
    odd.missions[MISSION_ID] = { state: 'deliver', runId: 1, completed: 1, lastPaidRunId: 1 };
    const game = launch(newStorage({ [SAVE_KEYS.main]: serializeSave(odd, context) }));
    assert.equal(game.flow.state, 'available');
    expectVisuals(game, 'available');
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, 500);
    game.close();
  });

  test('coins collected during a mission and the settings key are untouched by mission saving', async () => {
    const storage = newStorage();
    const first = launch(storage);
    gameState.collectCoin(COINS[1].id, ECONOMY.coinValue);
    acceptAndCollect(first);
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.hasCollectedCoin(COINS[1].id), true);
    assert.equal(gameState.hasCollectedCoin(COINS[0].id), false);
    assert.equal(storage.data.get(SETTINGS_KEY), SETTINGS_VALUE);
    assert.equal(storage.touched(SETTINGS_KEY), false);
    game.close();
  });
});

describe('leaving the scene', () => {
  test('destroy() keeps the last progress in later saves and ignores the dead flow', async () => {
    const storage = newStorage();
    const game = launch(storage);
    game.at(AT_SHOP);
    game.ui.accept();
    await settle();
    game.system.destroy();
    assert.equal(game.system.boundToSave, false);
    assert.equal(game.ui.destroyed, true);

    game.flow.accept(); // ignored (not in offer), and anyway nothing is listening any more
    gameState.collectCoin(COINS[2].id, ECONOMY.coinValue); // some later save
    await settle();
    assert.equal(savedMission(storage).state, 'pickup');
    game.close();
  });

  test('destroying twice is harmless', () => {
    const game = launch(newStorage());
    game.system.destroy();
    assert.doesNotThrow(() => game.system.destroy());
    game.close();
  });
});

describe('when saving is unavailable', () => {
  test('no save manager at all: the whole mission still plays and pays', () => {
    startSaveSystem({ storage: newStorage(), target: null }); // start-up fails, so there is no manager
    assert.equal(getSaveManager(), null);
    gameState.hydrate({ money: startMoney, collectedCoins: {} });

    const game = launch(newStorage(), { startSave: false });
    assert.equal(game.system.boundToSave, false);
    assert.equal(game.flow.state, 'available');
    acceptAndCollect(game);
    expectVisuals(game, 'deliver');
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward);
    assert.doesNotThrow(() => game.system.destroy());
    game.close();
  });

  test('storage missing: a manager exists but cannot save; the mission still plays', () => {
    const game = launch(null);
    assert.equal(getSaveManager().readOnly, true);
    acceptAndCollect(game);
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward);
    game.close();
  });

  test('storage that refuses writes: the mission still plays', async () => {
    const storage = newStorage();
    storage.failSet = '*';
    const game = launch(storage);
    acceptAndCollect(game);
    game.at(AT_CUSTOMER);
    await settle();
    assert.equal(gameState.money, startMoney + reward);
    game.close();
  });

  test('a manager that throws while reading mission progress: the mission starts fresh', () => {
    startSaveSystem({ storage: newStorage() });
    mock.method(getSaveManager(), 'getMissionProgress', () => {
      throw new Error('boom');
    });
    const game = launch(newStorage(), { startSave: false });
    assert.equal(game.flow.state, 'available');
    expectVisuals(game, 'available');
    acceptAndCollect(game);
    game.at(AT_CUSTOMER);
    assert.equal(gameState.money, startMoney + reward);
    game.close();
  });

  test('a manager that throws when asked to save: the game keeps going', () => {
    startSaveSystem({ storage: newStorage() });
    mock.method(getSaveManager(), 'markDirty', () => {
      throw new Error('boom');
    });
    const game = launch(newStorage(), { startSave: false });
    assert.doesNotThrow(() => acceptAndCollect(game));
    assert.equal(game.flow.state, 'deliver');
    game.close();
  });
});
