// Stage 4D with the REAL MissionSystem, save system, GameState and HUD: restoring is silent; the
// welcome is chosen from the restored (and repaired) progress; a failure cannot hurt the game; and
// the Stage 4C new-job notice still replaces it in the HUD's single message slot.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, FIRST_DELIVERY } from '../src/missions/missionData.js';
import { getJobNotice } from '../src/missions/jobNotices.js';
import { WELCOME_MESSAGES, announceWelcome } from '../src/missions/welcomeMessages.js';
import { getSaveManager } from '../src/state/saveSystem.js';
import { SAVE_KEYS } from '../src/state/saveSchema.js';
import gameState from '../src/state/GameState.js';
import Hud from '../src/ui/Hud.js';
import { COINS } from '../src/data/neighbourhood.js';
import { installFakeDom } from './support/fakeDom.js';
import { FAR, settle, cust, pick, rec, done, storageWith, savedMain, launch, accept, startMoney } from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const A = { ...WELCOME_MESSAGES.firstMission };
const B = { ...WELCOME_MESSAGES.jobInProgress };
const D = { ...WELCOME_MESSAGES.allJobsDone };
const DONE_FRAMES = Math.ceil(FIRST_DELIVERY.doneDelayMs / 100);

let games = [];
beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  games.forEach((game) => game.close());
  games = [];
  mock.restoreAll();
});

function restore(progress, extra) {
  const game = launch(storageWith(progress, extra));
  games.push(game);
  return game;
}
const allDone = Object.fromEntries(MISSIONS.map((m) => [m.id, done(1)]));

describe('restoring is silent', () => {
  const saves = {
    'a fresh save': {},
    'a job at pickup': { [M1.id]: rec('pickup', 1, 0, 0) },
    'a job being delivered': { [M1.id]: done(1), [M2.id]: rec('deliver', 1, 0, 0) },
    'a later job waiting': { [M1.id]: done(1) },
    'everything delivered': allDone,
  };
  Object.entries(saves).forEach(([name, progress]) => {
    test(`${name}: building the MissionSystem says nothing (the welcome is asked for separately)`, () => {
      const game = restore(progress);
      assert.deepEqual(game.messages, []);
    });
  });
});

describe('the welcome for each restored state', () => {
  test('A: a fresh save', () => {
    const game = restore({});
    assert.equal(announceWelcome(game.system), true);
    assert.deepEqual(game.messages, [A]);
  });

  test('A: a returning player with coins and extra money but no mission progress', () => {
    const collected = Object.fromEntries(COINS.slice(0, 4).map((coin) => [coin.id, 1_700_000_000_000]));
    const game = restore({}, { money: startMoney + 1234, collected });
    assert.equal(gameState.collectedCoins.size, 4); // the progress really was restored
    assert.equal(gameState.money, startMoney + 1234);
    announceWelcome(game.system);
    assert.deepEqual(game.messages, [A]);
  });

  test('B: returning during pickup, during delivery, in a later job, and in a replay', () => {
    const cases = {
      'pickup': { [M1.id]: rec('pickup', 1, 0, 0) },
      'delivery': { [M1.id]: rec('deliver', 1, 0, 0) },
      'a later job': { [M1.id]: done(1), [M2.id]: done(1), [M3.id]: rec('deliver', 1, 0, 0) },
      'a replay': { [M1.id]: rec('pickup', 2, 1, 1) },
    };
    Object.entries(cases).forEach(([name, progress]) => {
      const game = restore(progress);
      assert.ok(game.system.activeUnit(), `${name}: a job is in progress after restoring`);
      announceWelcome(game.system);
      assert.deepEqual(game.messages, [B], name);
    });
  });

  test('C: a later job waiting gets no welcome (and keeps its marker and arrow)', () => {
    const waiting = { [M2.id]: { [M1.id]: done(1) }, [M3.id]: { [M1.id]: done(1), [M2.id]: done(1) }, [M4.id]: { [M1.id]: done(1), [M2.id]: done(1), [M3.id]: done(1) } };
    Object.entries(waiting).forEach(([id, progress]) => {
      const game = restore(progress);
      assert.equal(game.system.newJobId, id);
      assert.equal(announceWelcome(game.system), false);
      assert.deepEqual(game.messages, [], id);
      assert.equal(game.system.currentTarget().kind, 'offer', 'the arrow still points to the waiting job');
    });
  });

  test('D: every job delivered', () => {
    const game = restore(allDone);
    announceWelcome(game.system);
    assert.deepEqual(game.messages, [D]);
    assert.equal(game.system.currentTarget(), null);
  });
});

describe('damaged saves: the REPAIRED progress decides', () => {
  test('a job saved as in progress while still locked is repaired to nothing, so it is a new player (A), not B', () => {
    const game = restore({ [M2.id]: rec('pickup', 1, 0, 0) }); // the first job was never delivered
    assert.equal(game.system.activeUnit(), null);
    assert.deepEqual(MISSIONS.map((m) => game.system.progressSnapshot()[m.id].state), ['available', 'available', 'available', 'available']);
    announceWelcome(game.system);
    assert.deepEqual(game.messages, [A]);
  });

  test('two jobs saved as in progress: one is kept, the other reset, and the welcome is B', () => {
    const game = restore({ [M1.id]: done(1), [M2.id]: rec('pickup', 2, 1, 1), [M3.id]: rec('deliver', 1, 0, 0) });
    const snapshot = game.system.progressSnapshot();
    assert.equal(snapshot[M2.id].state, 'pickup');
    assert.equal(snapshot[M3.id].state, 'available'); // repaired: only one job may be in progress
    assert.equal(game.system.activeUnit().def.id, M2.id);
    announceWelcome(game.system);
    assert.deepEqual(game.messages, [B]);
  });
});

describe('a welcome failure cannot interrupt the game', () => {
  test('a throwing HUD listener: no error, no retry, logged, and the missions carry on normally', async () => {
    const storage = storageWith({ [M1.id]: rec('deliver', 1, 0, 0) });
    const game = launch(storage);
    games.push(game);
    let heard = 0;
    const boom = () => {
      heard += 1;
      throw new Error('hud boom');
    };
    gameState.on('message', boom);
    try {
      assert.doesNotThrow(() => assert.equal(announceWelcome(game.system), false));
      assert.equal(heard, 1, 'not retried');
      assert.equal(console.warn.mock.calls.filter(({ arguments: a }) => String(a[0]).includes('[Welcome]')).length, 1);
      // restoration was already done and is untouched; the game is fully playable
      assert.equal(game.state(M1.id), 'deliver');
      assert.doesNotThrow(() => game.at(cust(M1)));
      assert.equal(game.state(M1.id), 'done');
      assert.deepEqual(game.moneyEvents, [M1.reward]);
      await settle();
      assert.equal(savedMain(storage).money, startMoney + M1.reward); // and it was saved
      assert.equal(savedMain(storage).missions[M1.id].completed, 1);
    } finally {
      gameState.off('message', boom);
    }
  });

  test('a mission system whose progress cannot be read: no welcome, no error', () => {
    const game = restore({});
    game.system.progressSnapshot = () => {
      throw new Error('snapshot boom');
    };
    assert.doesNotThrow(() => assert.equal(announceWelcome(game.system), false));
    assert.deepEqual(game.messages, []);
  });
});

describe('save data is untouched by the welcome', () => {
  test('announcing writes nothing and asks for no save', async () => {
    const storage = storageWith({ [M1.id]: done(1), [M2.id]: rec('deliver', 1, 0, 0) });
    const game = launch(storage);
    games.push(game);
    const before = storage.getItem(SAVE_KEYS.main);
    const markDirty = mock.method(getSaveManager(), 'markDirty');
    announceWelcome(game.system);
    await settle();
    assert.equal(markDirty.mock.callCount(), 0);
    assert.equal(storage.getItem(SAVE_KEYS.main), before);
  });

  test('the save file has the same shape as before, welcome or not', async () => {
    const storage = storageWith({});
    const game = launch(storage);
    games.push(game);
    announceWelcome(game.system);
    accept(game, M1);
    game.at(pick(M1));
    game.at(cust(M1));
    await settle();
    const saved = savedMain(storage);
    assert.deepEqual(Object.keys(saved).sort(), ['coins', 'missions', 'money', 'savedAt', 'v']);
    MISSIONS.forEach((m) => assert.deepEqual(Object.keys(saved.missions[m.id]).sort(), ['completed', 'lastPaidRunId', 'runId', 'state']));
    assert.ok(!JSON.stringify(saved).includes('Welcome'));
  });
});

describe('with the real HUD: one message slot, and the Stage 4C notice still replaces the welcome', () => {
  let dom = null;
  let hud = null;
  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] });
    dom = installFakeDom();
    hud = new Hud();
  });
  afterEach(() => {
    hud.destroy();
    dom.restore();
    mock.timers.reset();
  });
  const slot = () => dom.document.getElementById('hud-message');
  const shown = () => slot().classList.contains('visible');

  test('the welcome is shown in the HUD message for its own duration', () => {
    const game = restore({ [M1.id]: rec('pickup', 1, 0, 0) });
    announceWelcome(game.system);
    assert.equal(slot().textContent, B.text);
    assert.equal(shown(), true);
    mock.timers.tick(4499);
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('a later job waiting leaves the HUD message empty', () => {
    const game = restore({ [M1.id]: done(1) });
    announceWelcome(game.system);
    assert.equal(slot().textContent, '');
    assert.equal(shown(), false);
  });

  test('delivering the first-ever job: the 4C notice REPLACES the welcome, and the welcome\'s old timer does not hide it', () => {
    const game = restore({ [M1.id]: rec('deliver', 1, 0, 0) });
    announceWelcome(game.system);
    assert.equal(slot().textContent, B.text);
    mock.timers.tick(3000); // 3 s into the welcome
    game.at(cust(M1)); // deliver; the notice comes when the "done" window ends
    assert.equal(slot().textContent, B.text);
    for (let i = 0; i < DONE_FRAMES; i += 1) game.at(FAR, 100);
    assert.equal(slot().textContent, getJobNotice(M2.id)); // replaced, not queued
    assert.equal(shown(), true);
    mock.timers.tick(1600); // 4.6 s after the welcome: its timer would have fired at 4.5 s
    assert.equal(shown(), true, 'the notice outlives the welcome\'s timer');
    mock.timers.tick(2900); // 4.5 s after the notice
    assert.equal(shown(), false);
  });
});
