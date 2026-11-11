// The coin list in src/data/neighbourhood.js: ids, positions and the values that the
// save depends on.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COINS } from '../src/data/neighbourhood.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { ECONOMY, WORLD } from '../src/config.js';
import { createDefaultSave, validateSave, parseSave, serializeSave } from '../src/state/saveSchema.js';

// These ids are permanent: a renamed id would make that coin collectable again for
// everyone who already picked it up. If you add a coin, add its id here too; if one
// of these fails, ask whether you really meant to change it.
const EXPECTED_IDS = [
  'orisun-01', 'orisun-02', 'orisun-03', 'orisun-04', 'orisun-05', 'orisun-06',
  'orisun-07', 'orisun-08', 'orisun-09', 'orisun-10', 'orisun-11', 'orisun-12',
  'orisun-13', 'orisun-14', 'orisun-15', 'orisun-16', 'orisun-17', 'orisun-18',
];

const context = () => ({ coinIds: COINS.map((coin) => coin.id), missionIds: [FIRST_DELIVERY.id] });

describe('coin ids', () => {
  test('every coin has an explicit, non-empty string id', () => {
    COINS.forEach((coin) => {
      assert.equal(typeof coin.id, 'string');
      assert.match(coin.id, /^orisun-\d{2}$/);
    });
  });

  test('ids are unique', () => {
    assert.equal(new Set(COINS.map((coin) => coin.id)).size, COINS.length);
  });

  test('the ids are exactly the permanent list', () => {
    assert.deepEqual(COINS.map((coin) => coin.id), EXPECTED_IDS);
  });

  test('every coin sits inside the world', () => {
    COINS.forEach(({ id, x, y }) => {
      assert.ok(Number.isFinite(x) && x > 0 && x < WORLD.width, `${id} x=${x}`);
      assert.ok(Number.isFinite(y) && y > 0 && y < WORLD.height, `${id} y=${y}`);
    });
  });
});

describe('values the save relies on are unchanged', () => {
  test('18 coins worth 50 each, and a new game starts with 500', () => {
    assert.equal(COINS.length, 18);
    assert.equal(ECONOMY.coinValue, 50);
    assert.equal(ECONOMY.startMoney, 500);
  });

  test('the mission id used by the save is "firstDelivery"', () => {
    assert.equal(FIRST_DELIVERY.id, 'firstDelivery');
  });
});

describe('the real coin ids work with the save schema', () => {
  test('a new game validates', () => {
    const save = createDefaultSave(ECONOMY.startMoney, [FIRST_DELIVERY.id]);
    assert.equal(validateSave(save, context()).ok, true);
  });

  test('a save with every coin collected keeps all of them', () => {
    const save = createDefaultSave(ECONOMY.startMoney + COINS.length * ECONOMY.coinValue, [FIRST_DELIVERY.id]);
    COINS.forEach((coin, index) => {
      save.coins.collected[coin.id] = 1_791_000_000_000 + index;
    });
    const result = validateSave(save, context());
    assert.equal(result.ok, true);
    assert.equal(Object.keys(result.save.coins.collected).length, COINS.length);
    assert.deepEqual(result.warnings, []);
    assert.equal(parseSave(serializeSave(save, context()), context()).ok, true);
  });
});
