// The real src/systems/Coins.js running against a fake scene.

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import gameState from '../src/state/GameState.js';
import Coins from '../src/systems/Coins.js';
import { COINS } from '../src/data/neighbourhood.js';
import { ECONOMY } from '../src/config.js';
import { makeFakeScene } from './support/fakeScene.js';

const PLAYER = {};

// Coins.js uses the shared gameState, so put it back to a brand-new game each time.
beforeEach(() => {
  gameState.removeAllListeners();
  gameState.hydrate({ money: ECONOMY.startMoney, collectedCoins: {} });
});

describe('building the coins', () => {
  test('creates one sprite per coin, each carrying its id', () => {
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, COINS);
    assert.equal(scene.sprites.length, COINS.length);
    scene.sprites.forEach((sprite, i) => {
      assert.equal(sprite.getData('coinId'), COINS[i].id);
      assert.equal(sprite.x, COINS[i].x);
      assert.equal(sprite.y, COINS[i].y);
      assert.equal(sprite.depth, COINS[i].y);
    });
  });

  test('coins collected in an earlier session are not created at all', () => {
    gameState.hydrate({ money: 650, collectedCoins: { 'orisun-01': 1, 'orisun-07': 2, 'orisun-18': 3 } });
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, COINS);
    const ids = scene.sprites.map((sprite) => sprite.getData('coinId'));
    assert.equal(ids.length, COINS.length - 3);
    ['orisun-01', 'orisun-07', 'orisun-18'].forEach((id) => assert.ok(!ids.includes(id), id));
  });

  test('a coin without an id is skipped with an error, and the others still work', () => {
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args);
    try {
      const scene = makeFakeScene();
      new Coins(scene, PLAYER, [{ x: 1, y: 2 }, { id: '', x: 3, y: 4 }, { id: 'ok-1', x: 5, y: 6 }]);
      assert.equal(scene.sprites.length, 1);
      assert.equal(scene.sprites[0].getData('coinId'), 'ok-1');
    } finally {
      console.error = original;
    }
    assert.equal(errors.length, 2);
  });
});

describe('collecting', () => {
  test('pays the coin value once, hides the coin and shows one popup', () => {
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, COINS);
    const coin = scene.sprites[0];
    scene.touch(coin);

    assert.equal(gameState.money, ECONOMY.startMoney + ECONOMY.coinValue);
    assert.equal(gameState.hasCollectedCoin(COINS[0].id), true);
    assert.equal(coin.active, false);
    assert.equal(coin.visible, false);
    assert.equal(coin.body.enable, false);
    assert.equal(scene.popups.length, 1);
    assert.equal(scene.popups[0].text, `+\u20A6${ECONOMY.coinValue}`);
  });

  test('walking over the same coin again pays nothing more', () => {
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, COINS);
    const coin = scene.sprites[0];
    scene.touch(coin);
    for (let i = 0; i < 5; i += 1) scene.touch(coin);
    assert.equal(gameState.money, ECONOMY.startMoney + ECONOMY.coinValue);
    assert.equal(scene.popups.length, 1);
  });

  test('even if the sprite is somehow re-activated, the coin id is paid only once', () => {
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, COINS);
    const coin = scene.sprites[0];
    scene.touch(coin);
    coin.active = true; // simulate a bug that revives the sprite
    scene.touch(coin);
    assert.equal(gameState.money, ECONOMY.startMoney + ECONOMY.coinValue);
    assert.equal(scene.popups.length, 1);
    assert.equal(coin.active, false);
  });

  test('two sprites that share an id (a data mistake) still pay only once', () => {
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, [{ id: 'twin', x: 1, y: 1 }, { id: 'twin', x: 2, y: 2 }]);
    scene.sprites.forEach((sprite) => scene.touch(sprite));
    assert.equal(gameState.money, ECONOMY.startMoney + ECONOMY.coinValue);
    assert.equal(scene.popups.length, 1);
  });

  test('collecting every coin pays 18 x 50 and announces progress once per coin', () => {
    let changes = 0;
    gameState.on('progress-changed', () => {
      changes += 1;
    });
    const scene = makeFakeScene();
    new Coins(scene, PLAYER, COINS);
    scene.sprites.forEach((sprite) => scene.touch(sprite));
    assert.equal(gameState.money, ECONOMY.startMoney + COINS.length * ECONOMY.coinValue);
    assert.equal(changes, COINS.length);
    assert.equal(gameState.collectedCoins.size, COINS.length);
  });
});
