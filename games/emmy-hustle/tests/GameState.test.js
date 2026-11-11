// The real src/state/GameState.js (Phaser is replaced by a test-only emitter, see
// tests/support/stub-phaser-hooks.mjs).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import defaultState, { GameState } from '../src/state/GameState.js';
import { ECONOMY } from '../src/config.js';

const record = (state, ...events) => {
  const seen = [];
  events.forEach((name) => state.on(name, (...args) => seen.push([name, ...args])));
  return seen;
};

describe('new game', () => {
  test('starts with the starting money and no collected coins', () => {
    const state = new GameState();
    assert.equal(state.money, ECONOMY.startMoney);
    assert.equal(state.collectedCoins.size, 0);
  });

  test('the shared default export is a GameState', () => {
    assert.ok(defaultState instanceof GameState);
  });
});

describe('money (existing behaviour is unchanged)', () => {
  test('addMoney emits money-changed(total, amount) for the HUD, then progress-changed', () => {
    const state = new GameState();
    const seen = record(state, 'money-changed', 'progress-changed');
    state.addMoney(250);
    assert.equal(state.money, ECONOMY.startMoney + 250);
    assert.deepEqual(seen, [['money-changed', ECONOMY.startMoney + 250, 250], ['progress-changed']]);
  });

  test('spendMoney works, and refuses without a trace when there is not enough', () => {
    const state = new GameState();
    const seen = record(state, 'money-changed', 'progress-changed');
    assert.equal(state.spendMoney(100), true);
    assert.equal(state.money, ECONOMY.startMoney - 100);
    assert.deepEqual(seen, [['money-changed', ECONOMY.startMoney - 100, -100], ['progress-changed']]);

    seen.length = 0;
    assert.equal(state.spendMoney(1_000_000), false);
    assert.equal(state.money, ECONOMY.startMoney - 100);
    assert.deepEqual(seen, []);
  });
});

describe('collectCoin', () => {
  test('pays the coin once and marks it collected', () => {
    const state = new GameState();
    assert.equal(state.collectCoin('orisun-01', ECONOMY.coinValue, 1234), true);
    assert.equal(state.money, ECONOMY.startMoney + ECONOMY.coinValue);
    assert.equal(state.hasCollectedCoin('orisun-01'), true);
    assert.equal(state.collectedCoins.get('orisun-01'), 1234);
  });

  test('a coin can never be paid twice, however often it is collected', () => {
    const state = new GameState();
    assert.equal(state.collectCoin('orisun-01', 50), true);
    for (let i = 0; i < 10; i += 1) assert.equal(state.collectCoin('orisun-01', 50), false);
    assert.equal(state.money, ECONOMY.startMoney + 50);
  });

  test('the first collection announces itself once; repeats are silent', () => {
    const state = new GameState();
    const seen = record(state, 'money-changed', 'progress-changed');
    state.collectCoin('orisun-02', 50);
    state.collectCoin('orisun-02', 50);
    assert.deepEqual(seen, [['money-changed', ECONOMY.startMoney + 50, 50], ['progress-changed']]);
  });

  test('different coins are each paid', () => {
    const state = new GameState();
    ['orisun-01', 'orisun-02', 'orisun-03'].forEach((id) => state.collectCoin(id, 50));
    assert.equal(state.money, ECONOMY.startMoney + 150);
    assert.equal(state.collectedCoins.size, 3);
  });

  test('an invalid id pays nothing and changes nothing', () => {
    const state = new GameState();
    const seen = record(state, 'money-changed', 'progress-changed');
    ['', null, undefined, 7, {}, []].forEach((id) => assert.equal(state.collectCoin(id, 50), false));
    assert.equal(state.money, ECONOMY.startMoney);
    assert.equal(state.collectedCoins.size, 0);
    assert.deepEqual(seen, []);
  });
});

describe('hydrate and snapshotProgress', () => {
  test('hydrate loads money and collected coins without paying or announcing anything', () => {
    const state = new GameState();
    const seen = record(state, 'money-changed', 'progress-changed');
    state.hydrate({ money: 650, collectedCoins: { 'orisun-01': 10, 'orisun-02': 20 } });
    assert.equal(state.money, 650);
    assert.equal(state.hasCollectedCoin('orisun-01'), true);
    assert.equal(state.hasCollectedCoin('orisun-02'), true);
    assert.equal(state.hasCollectedCoin('orisun-03'), false);
    assert.deepEqual(seen, []);
  });

  test('a hydrated coin cannot be paid again', () => {
    const state = new GameState();
    state.hydrate({ money: 550, collectedCoins: { 'orisun-01': 10 } });
    assert.equal(state.collectCoin('orisun-01', 50), false);
    assert.equal(state.money, 550);
  });

  test('snapshotProgress returns plain data, and a copy', () => {
    const state = new GameState();
    state.collectCoin('orisun-01', 50, 111);
    const snapshot = state.snapshotProgress();
    assert.deepEqual(snapshot, { money: ECONOMY.startMoney + 50, collectedCoins: { 'orisun-01': 111 } });
    snapshot.money = 1;
    snapshot.collectedCoins['orisun-09'] = 2;
    assert.equal(state.money, ECONOMY.startMoney + 50);
    assert.equal(state.hasCollectedCoin('orisun-09'), false);
  });

  test('a snapshot hydrates a fresh state to the same progress', () => {
    const a = new GameState();
    ['orisun-04', 'orisun-05'].forEach((id) => a.collectCoin(id, 50, 5));
    a.addMoney(250);
    const b = new GameState();
    b.hydrate(a.snapshotProgress());
    assert.deepEqual(b.snapshotProgress(), a.snapshotProgress());
  });
});
