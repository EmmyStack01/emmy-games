// End to end: the real GameState, Coins, SaveManager and startSaveSystem together,
// with a fake localStorage and a fake scene. "Reloading" means what a browser reload
// does to the game: all in-memory state is gone, only storage survives.

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import gameState from '../src/state/GameState.js';
import Coins from '../src/systems/Coins.js';
import { startSaveSystem } from '../src/state/saveSystem.js';
import { COINS } from '../src/data/neighbourhood.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { ECONOMY } from '../src/config.js';
import { SAVE_KEYS, parseSave } from '../src/state/saveSchema.js';
import { makeFakeScene } from './support/fakeScene.js';
import { MemoryStorage } from './support/memoryStorage.js';

const SETTINGS_KEY = 'emmys-hustle:settings:v1';
const SETTINGS_VALUE = JSON.stringify({ joystickSide: 'right' });
const CONTEXT = { coinIds: COINS.map((coin) => coin.id), missionIds: [FIRST_DELIVERY.id] };
const { startMoney, coinValue } = ECONOMY;

const newStorage = (extra = {}, options) => new MemoryStorage({ [SETTINGS_KEY]: SETTINGS_VALUE, ...extra }, options);
const saved = (storage) => parseSave(storage.getItem(SAVE_KEYS.main), CONTEXT);
const settle = () => new Promise((resolve) => setImmediate(resolve)); // lets the queued save run

// A fresh page load: the game's memory is reset, then the game starts up as BootScene does.
function loadPage(storage) {
  gameState.removeAllListeners();
  gameState.hydrate({ money: startMoney, collectedCoins: {} });
  const manager = startSaveSystem({ storage });
  const scene = makeFakeScene();
  new Coins(scene, {}, COINS);
  return { manager, scene };
}

const idsOnScreen = (scene) => scene.sprites.map((sprite) => sprite.getData('coinId'));
const walkOver = (scene, id) => scene.touch(scene.sprites.find((sprite) => sprite.getData('coinId') === id));
async function collect(scene, ...ids) {
  for (const id of ids) {
    walkOver(scene, id);
    await settle(); // each coin is its own moment, so its own save
  }
}

beforeEach(() => mock.method(console, 'warn', () => {}));
afterEach(() => mock.restoreAll());

describe('saving as coins are collected', () => {
  test('a collected coin and the new balance are saved together', async () => {
    const storage = newStorage();
    const { scene } = loadPage(storage);
    await collect(scene, 'orisun-03');
    const { ok, save } = saved(storage);
    assert.equal(ok, true);
    assert.equal(save.money, startMoney + coinValue);
    assert.deepEqual(Object.keys(save.coins.collected), ['orisun-03']);
  });

  test('a new game writes nothing until something is collected', async () => {
    const storage = newStorage();
    loadPage(storage);
    await settle();
    assert.deepEqual(storage.keys(), [SETTINGS_KEY]);
  });
});

describe('reloading', () => {
  test('collected coins stay collected, money is kept, and they cannot be collected again', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    await collect(page.scene, 'orisun-01', 'orisun-09');

    page = loadPage(storage);
    assert.equal(gameState.money, startMoney + 2 * coinValue);
    assert.equal(page.scene.sprites.length, COINS.length - 2);
    assert.ok(!idsOnScreen(page.scene).includes('orisun-01'));
    assert.ok(!idsOnScreen(page.scene).includes('orisun-09'));

    // the remaining coins still work, and pay as before
    await collect(page.scene, 'orisun-02');
    assert.equal(gameState.money, startMoney + 3 * coinValue);
  });

  test('DUPLICATE REWARD: collecting an already-collected coin id after a reload pays nothing', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    await collect(page.scene, 'orisun-05');

    page = loadPage(storage);
    const before = gameState.money;
    assert.equal(gameState.collectCoin('orisun-05', coinValue), false);
    assert.equal(gameState.money, before);
    await settle();
    assert.equal(saved(storage).save.money, before);
  });

  test('DUPLICATE REWARD: reloading repeatedly never changes the balance', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    await collect(page.scene, 'orisun-01', 'orisun-02', 'orisun-03');
    const expected = startMoney + 3 * coinValue;
    for (let i = 0; i < 5; i += 1) {
      page = loadPage(storage);
      await settle();
      assert.equal(gameState.money, expected);
      assert.equal(saved(storage).save.money, expected);
    }
  });

  test('collecting every coin, then reloading, leaves none to collect and no extra money', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    await collect(page.scene, ...COINS.map((coin) => coin.id));
    assert.equal(gameState.money, startMoney + COINS.length * coinValue);

    page = loadPage(storage);
    assert.equal(page.scene.sprites.length, 0);
    assert.equal(gameState.money, startMoney + COINS.length * coinValue);
  });

  test('money from other sources (a mission reward) is saved too, and mission state is not touched yet', async () => {
    const storage = newStorage();
    loadPage(storage);
    gameState.addMoney(250);
    await settle();

    const page = loadPage(storage);
    assert.equal(gameState.money, startMoney + 250);
    assert.equal(page.scene.sprites.length, COINS.length);
    assert.deepEqual(saved(storage).save.missions[FIRST_DELIVERY.id], { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 });
  });

  test('INVARIANT: money is always the start amount plus the coins collected, through any mix of collecting and reloading', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    let seed = 20261025;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let step = 0; step < 60; step += 1) {
      if (random() < 0.3) {
        page = loadPage(storage);
      } else {
        const remaining = idsOnScreen(page.scene).filter((id) => !gameState.hasCollectedCoin(id));
        if (remaining.length > 0) await collect(page.scene, remaining[Math.floor(random() * remaining.length)]);
      }
      const collected = gameState.collectedCoins.size;
      assert.equal(gameState.money, startMoney + collected * coinValue, `step ${step}`);
      assert.equal(page.scene.sprites.filter((sprite) => sprite.active).length, COINS.length - collected, `step ${step}`);
      if (storage.data.has(SAVE_KEYS.main)) {
        const { save } = saved(storage);
        assert.equal(save.money, startMoney + Object.keys(save.coins.collected).length * coinValue, `saved, step ${step}`);
      }
    }
  });
});

describe('missing or damaged saves', () => {
  test('a damaged main save is recovered from the backup, and money still matches the coins', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    await collect(page.scene, 'orisun-01', 'orisun-02', 'orisun-03');
    storage.setItem(SAVE_KEYS.main, '{"v":1,"money":'); // damage it

    page = loadPage(storage);
    const collected = gameState.collectedCoins.size;
    assert.equal(collected, 2, 'the backup is one change behind the main save');
    assert.equal(gameState.money, startMoney + collected * coinValue);
    assert.equal(page.scene.sprites.length, COINS.length - collected);
    assert.equal(saved(storage).ok, true, 'the main key is repaired');
    assert.ok(storage.data.has(SAVE_KEYS.corrupt), 'the damaged text is kept');
  });

  test('both saves damaged: the game starts fresh, keeps the damaged data, and saves again', async () => {
    const storage = newStorage({ [SAVE_KEYS.main]: 'garbage', [SAVE_KEYS.backup]: '[]oops' });
    const { scene } = loadPage(storage);
    assert.equal(gameState.money, startMoney);
    assert.equal(scene.sprites.length, COINS.length);
    assert.equal(storage.getItem(SAVE_KEYS.main), 'garbage', 'untouched until progress is made');

    await collect(scene, 'orisun-04');
    assert.equal(saved(storage).save.money, startMoney + coinValue);
    const kept = JSON.parse(storage.getItem(SAVE_KEYS.corrupt)).entries.map((entry) => entry.raw);
    assert.ok(kept.includes('garbage') && kept.includes('[]oops'));
  });

  test('a save with a tampered balance is rejected, not trusted', async () => {
    const storage = newStorage();
    let page = loadPage(storage);
    await collect(page.scene, 'orisun-01');
    const tampered = JSON.parse(storage.getItem(SAVE_KEYS.main));
    tampered.money = 'rich';
    storage.setItem(SAVE_KEYS.main, JSON.stringify(tampered));

    page = loadPage(storage);
    assert.equal(Number.isFinite(gameState.money), true);
    assert.equal(gameState.money, startMoney, 'there is no backup yet, so this is a fresh start');
  });

  test('a save from a newer game is left alone while the game still runs', async () => {
    const newer = JSON.stringify({ v: 99, money: 12345 });
    const storage = newStorage({ [SAVE_KEYS.main]: newer });
    const { scene } = loadPage(storage);
    await collect(scene, 'orisun-01');
    assert.equal(gameState.money, startMoney + coinValue);
    assert.equal(storage.getItem(SAVE_KEYS.main), newer);
  });

  test('no usable storage: the game runs, coins still pay once, nothing throws', async () => {
    gameState.removeAllListeners();
    gameState.hydrate({ money: startMoney, collectedCoins: {} });
    const manager = startSaveSystem({ storage: null });
    assert.equal(manager.getStatus().readOnlyReason, 'no-storage');
    const scene = makeFakeScene();
    new Coins(scene, {}, COINS);
    walkOver(scene, 'orisun-01');
    walkOver(scene, 'orisun-01');
    await settle();
    assert.equal(gameState.money, startMoney + coinValue);
  });

  test('if the save system itself fails to start, the game still starts (without saving)', () => {
    const errors = mock.method(console, 'error', () => {});
    const broken = { hydrate() { throw new Error('boom'); }, on() {}, off() {} };
    assert.equal(startSaveSystem({ storage: newStorage(), target: broken }), null);
    assert.equal(errors.mock.callCount(), 1);
  });
});

describe('settings stay separate from progress', () => {
  test('the joystick settings are never read or written by saving, loading or recovering', async () => {
    const storage = newStorage({ [SAVE_KEYS.main]: 'garbage' });
    storage.calls.length = 0;
    let page = loadPage(storage);
    await collect(page.scene, 'orisun-01', 'orisun-02');
    page = loadPage(storage);
    await collect(page.scene, 'orisun-03');
    assert.equal(storage.touched(SETTINGS_KEY), false);
    assert.equal(storage.getItem(SETTINGS_KEY), SETTINGS_VALUE);
  });

  test('every save key differs from the settings key', () => {
    assert.ok(!Object.values(SAVE_KEYS).includes(SETTINGS_KEY));
  });
});
