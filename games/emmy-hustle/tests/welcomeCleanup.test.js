// Stage 4E-2 (C4): the first-time welcome says "follow the ! to Lagoon Mart for your first delivery".
// Once that first job is accepted it is out of date, so it leaves the HUD, and ONLY that message does.
// REAL Hud, MissionSystem, MissionFlow, save system and GameState; only the page's DOM, the Phaser
// scene and localStorage are stand-ins. No browser and no device.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, FIRST_DELIVERY } from '../src/missions/missionData.js';
import { getJobNotice, JOB_NOTICE_MS } from '../src/missions/jobNotices.js';
import { WELCOME_MESSAGES, announceWelcome } from '../src/missions/welcomeMessages.js';
import { SAVE_KEYS } from '../src/state/saveSchema.js';
import gameState from '../src/state/GameState.js';
import Hud from '../src/ui/Hud.js';
import { installFakeDom } from './support/fakeDom.js';
import { FAR, settle, cust, pick, rec, done, storageWith, savedMain, launch, accept } from './support/missionGame.js';

const [M1, M2, M3] = MISSIONS;
const A = WELCOME_MESSAGES.firstMission;
const B = WELCOME_MESSAGES.jobInProgress;
const D = WELCOME_MESSAGES.allJobsDone;
const DONE_FRAMES = Math.ceil(FIRST_DELIVERY.doneDelayMs / 100);

let dom = null;
let hud = null;
let games = [];

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  mock.timers.enable({ apis: ['setTimeout'] });
  dom = installFakeDom();
  hud = new Hud();
});
afterEach(() => {
  games.forEach((game) => game.close());
  games = [];
  hud.destroy();
  dom.restore();
  mock.timers.reset();
  mock.restoreAll();
});

const slot = () => dom.document.getElementById('hud-message');
const shown = () => slot().classList.contains('visible');
function restore(progress = {}, extra) {
  const game = launch(storageWith(progress, extra));
  games.push(game);
  return game;
}
// Walks a first-ever delivery through to the end of its banner (the new-job notice comes then)
function deliverFirstJob(game) {
  accept(game, M1);
  game.at(pick(M1));
  game.at(cust(M1));
  for (let i = 0; i < DONE_FRAMES; i += 1) game.at(FAR, 100);
}

describe('the first-time welcome appears exactly as before', () => {
  test('a new player is welcomed with the same wording, 8 seconds long', () => {
    const game = restore();
    assert.equal(announceWelcome(game.system), true);
    assert.equal(slot().textContent, A.text);
    assert.equal(A.text, 'Welcome to Orisun Close, Emmy! Collect coins, or follow the ! to Lagoon Mart for your first delivery.');
    assert.equal(A.ms, 8000);
    assert.equal(shown(), true);
    mock.timers.tick(7999);
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('walking about without accepting leaves it up for its whole time', () => {
    const game = restore();
    announceWelcome(game.system);
    for (let i = 0; i < 30; i += 1) game.at({ x: 100 + i, y: 100 });
    mock.timers.tick(5000);
    assert.equal(shown(), true);
    assert.equal(slot().textContent, A.text);
  });

  test('opening the offer card and saying Not Now does not clear it (nothing has been accepted)', () => {
    const game = restore();
    announceWelcome(game.system);
    game.at(FAR);
    game.at({ x: M1.shop.door.x, y: M1.shop.door.y });
    assert.equal(game.state(M1.id), 'offer');
    assert.equal(shown(), true);
    game.ui.decline();
    assert.equal(game.state(M1.id), 'available');
    assert.equal(shown(), true);
    assert.equal(slot().textContent, A.text);
  });
});

describe('accepting the first mission clears the outdated welcome', () => {
  test('it goes at once, if it is still showing', () => {
    const game = restore();
    announceWelcome(game.system);
    mock.timers.tick(2000);
    accept(game, M1);
    assert.equal(game.state(M1.id), 'pickup');
    assert.equal(shown(), false);
    assert.equal(hud.shownText, null);
  });

  test('its old timer is cancelled: a message shown afterwards keeps its own full time', () => {
    const game = restore();
    announceWelcome(game.system);
    mock.timers.tick(2000);
    accept(game, M1);
    gameState.say('Another message', 3000);
    mock.timers.tick(2999); // the welcome's timer would have fired at 6000 ms after the welcome
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('if the welcome has already timed out, accepting does nothing to the HUD', () => {
    const game = restore();
    announceWelcome(game.system);
    mock.timers.tick(8000);
    assert.equal(shown(), false);
    assert.doesNotThrow(() => accept(game, M1));
    assert.equal(game.state(M1.id), 'pickup');
    assert.equal(shown(), false);
  });

  test('accepting is otherwise unchanged: the objective, the markers and the package state are as before', () => {
    const game = restore();
    announceWelcome(game.system);
    accept(game, M1);
    assert.equal(game.ui.objective?.text, M1.text.objectivePickup);
    assert.equal(game.ui.objective?.kind, 'pickup');
    assert.equal(game.ui.arrow?.kind ?? 'pickup', 'pickup');
    assert.equal(game.flow(M1.id).runId, 1);
  });

  test('it sends no new message, queues nothing and changes nothing that is saved', async () => {
    const storage = storageWith({});
    const game = launch(storage);
    games.push(game);
    announceWelcome(game.system);
    const sent = game.messages.length;
    accept(game, M1);
    await settle();
    assert.equal(game.messages.length, sent, 'accepting says nothing new');
    const saved = savedMain(storage);
    assert.deepEqual(Object.keys(saved).sort(), ['coins', 'missions', 'money', 'savedAt', 'v']);
    assert.ok(!JSON.stringify(saved).includes('Welcome'));
    assert.ok(storage.data.has(SAVE_KEYS.main));
  });
});

describe('the cleanup is asked for only when the first mission is accepted', () => {
  test('one request for the first job\'s accept, with the welcome text; none for any later job', () => {
    const game = restore();
    const clear = mock.method(gameState, 'clearMessage');
    accept(game, M1);
    assert.equal(clear.mock.callCount(), 1);
    assert.deepEqual(clear.mock.calls[0].arguments, [A.text]);
    game.at(pick(M1));
    game.at(cust(M1));
    for (let i = 0; i < DONE_FRAMES; i += 1) game.at(FAR, 100);
    accept(game, M2);
    assert.equal(clear.mock.callCount(), 1, 'accepting the second job asks for nothing');
  });

  test('declining an offer, or a refused accept, asks for nothing', () => {
    const game = restore();
    const clear = mock.method(gameState, 'clearMessage');
    game.at(FAR);
    game.at({ x: M1.shop.door.x, y: M1.shop.door.y });
    game.ui.decline();
    assert.equal(clear.mock.callCount(), 0);
    game.ui.accept(); // no card is open any more: nothing to accept
    assert.equal(clear.mock.callCount(), 0);
  });
});

describe('only the outdated welcome is ever cleared', () => {
  test('a newer, unrelated message is left alone, and runs its own full time', () => {
    const game = restore();
    announceWelcome(game.system);
    mock.timers.tick(1000);
    gameState.say('Something else happened', 4000); // replaces the welcome in the single slot
    accept(game, M1);
    assert.equal(shown(), true);
    assert.equal(slot().textContent, 'Something else happened');
    mock.timers.tick(3999);
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('a message with similar wording is left alone too (only the exact welcome text goes)', () => {
    [`${A.text} (again)`, A.text.slice(0, -1), A.text.toUpperCase(), `${A.text} `].forEach((similar) => {
      const game = restore();
      gameState.say(similar, 4000);
      accept(game, M1);
      assert.equal(shown(), true, similar);
      assert.equal(slot().textContent, similar);
      games.pop().close();
      mock.timers.tick(4000);
    });
  });

  test('the HUD ignores a clear request for a message that is not the one showing', () => {
    gameState.say('Showing', 5000);
    gameState.clearMessage('Not showing');
    assert.equal(shown(), true);
    assert.equal(hud.shownText, 'Showing');
    gameState.clearMessage(null);
    gameState.clearMessage(undefined);
    gameState.clearMessage('');
    assert.equal(shown(), true);
  });

  test('a clear request that arrives after the message has gone does nothing', () => {
    gameState.say('Gone soon', 1000);
    mock.timers.tick(1000);
    assert.equal(shown(), false);
    gameState.say('Newer', 5000);
    gameState.clearMessage('Gone soon');
    assert.equal(shown(), true);
    assert.equal(slot().textContent, 'Newer');
  });

  test('the same text cannot be cleared twice, and clearing is not a message', () => {
    const seen = [];
    const onMessage = (text) => seen.push(text);
    gameState.on('message', onMessage);
    try {
      gameState.say('Once', 5000);
      gameState.clearMessage('Once');
      assert.equal(shown(), false);
      gameState.say('Newer', 5000);
      gameState.clearMessage('Once');
      assert.equal(shown(), true);
      assert.deepEqual(seen, ['Once', 'Newer']);
    } finally {
      gameState.off('message', onMessage);
    }
  });

  test('a destroyed HUD no longer listens', () => {
    gameState.say('Showing', 5000);
    hud.destroy();
    assert.doesNotThrow(() => gameState.clearMessage('Showing'));
    assert.equal(shown(), true); // nobody was listening
    hud = new Hud(); // for afterEach
  });
});

describe('returning players and finished players keep their welcome', () => {
  test('a job in progress: "Your delivery is still on" stays for its 4.5 s, whatever Emmy does', () => {
    const game = restore({ [M1.id]: rec('pickup', 1, 0, 0) });
    announceWelcome(game.system);
    assert.equal(slot().textContent, B.text);
    game.at(pick(M1)); // collects the package: no accept happens
    mock.timers.tick(4499);
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('every job done: the all-done welcome stays even when the first job is replayed (accepted again)', () => {
    const allDone = Object.fromEntries(MISSIONS.map((m) => [m.id, done(1)]));
    const game = restore(allDone);
    announceWelcome(game.system);
    assert.equal(slot().textContent, D.text);
    accept(game, M1); // a replay: the accept goes through the same path
    assert.equal(game.state(M1.id), 'pickup');
    assert.equal(shown(), true);
    assert.equal(slot().textContent, D.text);
    mock.timers.tick(5999);
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('a later job waiting: still no welcome, and accepting that job changes nothing', () => {
    const game = restore({ [M1.id]: done(1) });
    announceWelcome(game.system);
    assert.equal(shown(), false);
    accept(game, M2);
    assert.equal(game.state(M2.id), 'pickup');
    assert.equal(shown(), false);
  });
});

describe('Stage 4C new-job notices are not affected', () => {
  test('after the first delivery the notice appears, with its wording, and lasts 4.5 s', () => {
    const game = restore();
    announceWelcome(game.system);
    deliverFirstJob(game);
    assert.equal(slot().textContent, getJobNotice(M2.id));
    assert.equal(JOB_NOTICE_MS, 4500);
    assert.equal(shown(), true);
    mock.timers.tick(4499);
    assert.equal(shown(), true);
    mock.timers.tick(1);
    assert.equal(shown(), false);
  });

  test('accepting the next job, or replaying the first, while the notice is up does not clear it', () => {
    const game = restore();
    announceWelcome(game.system);
    deliverFirstJob(game);
    assert.equal(slot().textContent, getJobNotice(M2.id));
    accept(game, M2);
    assert.equal(shown(), true);
    assert.equal(slot().textContent, getJobNotice(M2.id));
    game.at(pick(M2));
    game.at(cust(M2));
    for (let i = 0; i < DONE_FRAMES; i += 1) game.at(FAR, 100);
    assert.equal(slot().textContent, getJobNotice(M3.id));
    accept(game, M1); // replay the first job with a notice up
    assert.equal(shown(), true);
    assert.equal(slot().textContent, getJobNotice(M3.id));
  });

  test('the whole first-time path: welcome, accept (welcome gone), deliver, notice', () => {
    const game = restore();
    announceWelcome(game.system);
    accept(game, M1);
    assert.equal(shown(), false);
    game.at(pick(M1));
    assert.equal(shown(), false); // no stray message
    game.at(cust(M1));
    for (let i = 0; i < DONE_FRAMES; i += 1) game.at(FAR, 100);
    assert.equal(slot().textContent, getJobNotice(M2.id));
    assert.equal(shown(), true);
  });

  test('speech bubbles, toasts and rewards are unchanged by the cleanup', () => {
    const game = restore();
    announceWelcome(game.system);
    accept(game, M1);
    game.at(pick(M1));
    game.at(cust(M1));
    assert.deepEqual(game.ui.toasts.map((t) => t.title), [M1.text.collectedTitle, M1.text.doneTitle]);
    assert.equal(game.moneyEvents.length, 1);
    assert.equal(game.moneyEvents[0], M1.reward);
    assert.ok(game.ui.speechLog.length >= 1);
  });
});

describe('failure safety', () => {
  test('if clearing the welcome fails, the job is still accepted, one warning is logged, and the game goes on', () => {
    const game = restore();
    announceWelcome(game.system);
    const boom = () => {
      throw new Error('clear boom');
    };
    gameState.on('message-clear', boom);
    try {
      assert.doesNotThrow(() => accept(game, M1));
      assert.equal(game.state(M1.id), 'pickup');
      const warnings = console.warn.mock.calls.filter(({ arguments: args }) => String(args[0]).includes('welcome message could not be cleared'));
      assert.equal(warnings.length, 1);
      game.at(pick(M1));
      game.at(cust(M1));
      assert.equal(game.state(M1.id), 'done');
      assert.equal(game.moneyEvents[0], M1.reward);
    } finally {
      gameState.off('message-clear', boom);
    }
  });

  test('with no HUD at all (no message element) the request is harmless', () => {
    hud.destroy();
    const bare = installFakeDom();
    bare.hud.children.length = 0; // no #hud-message
    const bareHud = new Hud();
    try {
      assert.doesNotThrow(() => gameState.clearMessage(A.text));
      assert.doesNotThrow(() => gameState.say('hello', 100));
    } finally {
      bareHud.destroy();
      bare.restore();
      dom = installFakeDom();
      hud = new Hud();
    }
  });
});
