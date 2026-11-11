// Stage 4C: the new-job notice. Built the way the game builds it: the REAL MissionSystem, MissionFlow,
// save system and GameState (the HUD message is gameState.say); only the scene, camera and DOM UI are
// stand-ins.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, FIRST_DELIVERY } from '../src/missions/missionData.js';
import { getJobNotice, JOB_NOTICE_MS } from '../src/missions/jobNotices.js';
import MissionSystem from '../src/missions/MissionSystem.js';
import { getSaveManager, startSaveSystem } from '../src/state/saveSystem.js';
import gameState from '../src/state/GameState.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './support/fakeMissionScene.js';
import { FAR, settle, door, pick, cust, rec, done, storageWith, savedMain, launch, accept, startMoney } from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const notice = (def) => getJobNotice(def.id);
const DONE_FRAMES = Math.ceil(FIRST_DELIVERY.doneDelayMs / 100); // 32 frames of 100 ms

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

const earlier = (count) => Object.fromEntries(MISSIONS.slice(0, count).map((m) => [m.id, done(1)]));
function newGame(delivered = 0, options) {
  const game = launch(storageWith(earlier(delivered)), options);
  games.push(game);
  return game;
}
function deliver(game, def) {
  accept(game, def);
  game.at(pick(def));
  game.at(cust(def));
  assert.equal(game.state(def.id), 'done');
}
const frames = (game, point, count, dt = 100) => {
  for (let i = 0; i < count; i += 1) game.at(point, dt);
};
const marker = (game, def) => game.view(def.id).questMarker;

describe('new job notice: when it appears', () => {
  test('a first delivery announces the next job, with the approved line, for about 4.5 s', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES);
    assert.equal(game.state(M1.id), 'available');
    assert.deepEqual(game.messages, [{ text: notice(M2), ms: 4500 }]);
    assert.equal(game.messages[0].text, 'New job at Bola Bakery! Follow the ! to find it.');
  });

  test('not when DONE begins, and not at any point before DONE ends', () => {
    const game = newGame();
    deliver(game, M1);
    assert.deepEqual(game.messages, []); // DONE has just begun: the reply and the toast come first
    frames(game, FAR, DONE_FRAMES - 1); // 3.1 s into the window
    assert.equal(game.state(M1.id), 'done');
    assert.deepEqual(game.messages, []);
  });

  test('exactly once, in the frame DONE ends, together with the new job\'s marker and arrow', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES - 1);
    assert.equal(marker(game, M2).visible, false);
    assert.equal(game.system.currentTarget(), null);
    game.at(FAR, 100); // DONE ends
    assert.equal(game.messages.length, 1);
    assert.equal(marker(game, M2).visible, true);
    assert.equal(game.system.currentTarget().kind, 'offer');
    assert.deepEqual([game.system.currentTarget().x, game.system.currentTarget().y], [M2.shop.marker.x, M2.shop.marker.y]);
    frames(game, FAR, 100);
    assert.equal(game.messages.length, 1);
  });

  test('the sequence: reply, delivery toast, then (after the window) the notice; no other toast or bubble', () => {
    const game = newGame();
    deliver(game, M1);
    const toasts = game.ui.toasts.length;
    const lines = [...game.ui.speechLog];
    assert.equal(game.ui.speech?.text, lines.at(-1)); // the customer's reply is showing
    frames(game, FAR, DONE_FRAMES);
    assert.equal(game.messages.length, 1);
    assert.equal(game.ui.toasts.length, toasts, 'no second toast');
    assert.deepEqual(game.ui.speechLog, lines, 'no new speech line');
    assert.equal(game.ui.speech, null, 'the reply is gone');
    assert.equal(game.ui.toasts.at(-1).title, M1.text.doneTitle);
  });

  test('the correct notice for each of the first three missions', () => {
    [[0, M2], [1, M3], [2, M4]].forEach(([i, next]) => {
      const game = newGame(i);
      deliver(game, MISSIONS[i]);
      frames(game, FAR, DONE_FRAMES);
      assert.deepEqual(game.messages, [{ text: notice(next), ms: JOB_NOTICE_MS }], MISSIONS[i].id);
    });
  });

  test('the final mission produces no notice: nothing is left to unlock', () => {
    const game = newGame(3);
    deliver(game, M4);
    frames(game, FAR, DONE_FRAMES + 20);
    assert.equal(game.state(M4.id), 'available');
    assert.deepEqual(game.messages, []);
    assert.equal(game.system.currentTarget(), null); // the arrow simply goes
  });
});

describe('new job notice: when it must not appear', () => {
  test('replaying a mission never announces anything, even with the next job already unlocked', () => {
    MISSIONS.forEach((def, i) => {
      const game = newGame(i + 1); // this mission was delivered before
      deliver(game, def);
      frames(game, FAR, DONE_FRAMES + 5);
      assert.deepEqual(game.messages, [], def.id);
    });
  });

  test('a replay does not announce a job the player has simply not started yet (newJobId flips, the unlocked set does not)', () => {
    const game = newGame(1); // First Delivery done: Fresh From the Oven is unlocked and still new
    assert.equal(game.system.newJobId, M2.id);
    deliver(game, M1); // replay: newJobId goes null while it is in progress and back to M2 afterwards
    frames(game, FAR, DONE_FRAMES + 5);
    assert.equal(game.system.newJobId, M2.id);
    assert.deepEqual(game.messages, []);
  });

  test('loading existing progress announces nothing, however far the player got', () => {
    for (let delivered = 0; delivered <= 4; delivered += 1) {
      const game = newGame(delivered);
      frames(game, FAR, 40);
      assert.deepEqual(game.messages, [], `${delivered} delivered`);
    }
  });

  test('loading a save in the middle of a job announces nothing, now or when that job is finished (a replay)', () => {
    const game = launch(storageWith({ [M1.id]: done(1), [M2.id]: rec('deliver', 1, 0, 0) }));
    games.push(game);
    frames(game, FAR, 20);
    game.at(cust(M2));
    assert.equal(game.state(M2.id), 'done');
    frames(game, FAR, DONE_FRAMES);
    // finishing M2 for the FIRST time does open M3, so that one is announced; loading itself said nothing
    assert.deepEqual(game.messages, [{ text: notice(M3), ms: 4500 }]);
  });

  test('declining an offer announces nothing', () => {
    const game = newGame(1);
    game.at(FAR);
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'offer');
    game.ui.decline();
    assert.equal(game.state(M2.id), 'available');
    frames(game, FAR, 10);
    assert.deepEqual(game.messages, []);
  });

  test('declining the NEW job\'s offer after its notice does not announce it again', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES);
    assert.equal(game.messages.length, 1);
    game.at(door(M2));
    game.ui.decline();
    frames(game, FAR, 10);
    game.at(door(M2));
    game.ui.decline();
    assert.equal(game.messages.length, 1);
  });

  test('a mission that cannot be played here is never announced', () => {
    startSaveSystem({ storage: storageWith() });
    const player = makePlayer(FAR.x, FAR.y);
    const { createUI } = makeFakeUI();
    const system = new MissionSystem(makeMissionScene(), player, undefined, { createUI, playableIds: [M1.id] });
    const heard = [];
    const onMessage = (text) => heard.push(text);
    gameState.on('message', onMessage);
    try {
      let time = 0;
      const at = (p, dt = 100) => {
        player.x = p.x;
        player.y = p.y;
        time += dt;
        system.update(time, dt);
      };
      at(FAR);
      at(door(M1));
      system.ui.accept();
      at(pick(M1));
      at(cust(M1));
      for (let i = 0; i < 40; i += 1) at(FAR);
      assert.equal(system.getFlow(M1.id).state, 'available');
      assert.deepEqual(heard, []);
    } finally {
      gameState.off('message', onMessage);
      system.destroy();
    }
  });
});

describe('new job notice: no duplicates, no side effects', () => {
  test('repeated updates and repeated completion calls never say it twice', () => {
    const game = newGame();
    deliver(game, M1);
    for (let i = 0; i < 20; i += 1) {
      game.at(cust(M1), 50); // Emmy stands on the customer through the window
      game.flow(M1.id).complete(); // and the completion is asked for again and again
    }
    frames(game, FAR, DONE_FRAMES + 50);
    assert.equal(game.messages.length, 1);
    assert.equal(game.system.pendingNewJob, null); // used up
    game.flow(M1.id).complete();
    frames(game, FAR, 10);
    assert.equal(game.messages.length, 1);
  });

  test('it does not open or accept a job: the new mission stays available and Emmy can move', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES);
    assert.equal(game.messages.length, 1);
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.system.offeringUnit(), null);
    assert.equal(game.flow(M2.id).runId, 0);
    assert.equal(game.moneyEvents.length, 1); // only the one delivery was paid
  });

  test('the job still works normally afterwards: walk to the shop, the offer opens, accept, deliver, announce the next', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES);
    game.at(door(M2)); // the existing offer behaviour is untouched
    assert.equal(game.state(M2.id), 'offer');
    game.ui.accept();
    assert.equal(game.state(M2.id), 'pickup');
    game.at(pick(M2));
    game.at(cust(M2));
    frames(game, FAR, DONE_FRAMES);
    assert.deepEqual(game.messages.map((m) => m.text), [notice(M2), notice(M3)]);
    assert.deepEqual(game.moneyEvents, [M1.reward, M2.reward]);
  });

  test('nothing is ever announced by the notice about rewards, progress or the objective line', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES);
    assert.equal(game.ui.objective, null);
    assert.equal(game.flow(M1.id).completed, 1);
    assert.equal(game.flow(M2.id).completed, 0);
  });
});

describe('new job notice: saving and loading', () => {
  test('no new save fields: the save file has exactly the same shape as before', async () => {
    const storage = storageWith();
    const game = launch(storage);
    games.push(game);
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES);
    await settle();
    const saved = savedMain(storage);
    assert.deepEqual(Object.keys(saved).sort(), ['coins', 'missions', 'money', 'savedAt', 'v']);
    MISSIONS.forEach((m) => assert.deepEqual(Object.keys(saved.missions[m.id]).sort(), ['completed', 'lastPaidRunId', 'runId', 'state'], m.id));
    assert.equal(saved.missions[M1.id].completed, 1);
    assert.ok(!JSON.stringify(saved).includes('notice'));
    assert.ok(!JSON.stringify(saved).includes('Bola'));
  });

  test('a save restored in the middle of DONE: the new job is there, with marker and arrow, but no delayed notice', async () => {
    const storage = storageWith();
    const first = launch(storage);
    games.push(first);
    deliver(first, M1);
    frames(first, FAR, 5); // the window is still open
    assert.equal(first.state(M1.id), 'done');
    assert.deepEqual(first.messages, []);
    await settle(); // the delivery was saved when it happened
    first.close();

    const second = launch(storage); // the player closed the game here, and came back
    games.push(second);
    assert.equal(second.state(M1.id), 'available');
    assert.equal(second.state(M2.id), 'available');
    assert.equal(second.flow(M1.id).completed, 1);
    assert.equal(marker(second, M2).visible, true);
    assert.equal(second.system.currentTarget().kind, 'offer');
    frames(second, FAR, 80);
    assert.deepEqual(second.messages, []);
    assert.deepEqual(first.messages, []);
    assert.equal(second.system.pendingNewJob, null);
  });

  test('destroying the system in the middle of DONE cannot produce a late notice', () => {
    const game = newGame();
    deliver(game, M1);
    assert.ok(game.system.pendingNewJob, 'a new job is waiting to be announced');
    game.system.destroy();
    assert.equal(game.system.pendingNewJob, null);
    // the delivery window ending afterwards (a flow still wired to its hook) says nothing
    try {
      game.flow(M1.id).update(FIRST_DELIVERY.doneDelayMs + 100, FAR.x, FAR.y);
    } catch {
      // the scene is gone; whatever it does, it must not announce
    }
    assert.deepEqual(game.messages, []);
  });

  test('even a stale pending record cannot announce after destroy (the check itself, not just the clearing)', () => {
    const game = newGame();
    deliver(game, M1);
    const pending = game.system.pendingNewJob;
    game.system.destroy();
    game.system.pendingNewJob = pending; // as if it had been left behind
    game.system.announceNewJob(pending.after);
    assert.deepEqual(game.messages, []);
  });

  test('only the delivered mission going available again announces it: another mission doing so does not use it up', () => {
    const game = newGame();
    deliver(game, M1);
    assert.equal(game.flow(M3.id).openOffer(), true); // another mission opens and closes its card during the window
    game.flow(M3.id).decline();
    assert.equal(game.state(M3.id), 'available');
    assert.deepEqual(game.messages, []);
    assert.equal(game.system.pendingNewJob.after, game.system.getUnit(M1.id));
    frames(game, FAR, DONE_FRAMES);
    assert.deepEqual(game.messages, [{ text: notice(M2), ms: 4500 }]);
  });
});

describe('new job notice: a failing HUD cannot interrupt the game', () => {
  test('a HUD listener that throws does not stop DONE -> AVAILABLE, the reward, the save, or later jobs', async () => {
    const storage = storageWith();
    const game = launch(storage);
    games.push(game);
    const boom = () => {
      throw new Error('hud boom');
    };
    gameState.on('message', boom);
    try {
      const markDirty = mock.method(getSaveManager(), 'markDirty');
      assert.doesNotThrow(() => deliver(game, M1));
      assert.ok(markDirty.mock.callCount() > 0, 'the delivery requested a save'); // saves are asked for at pickup, deliver and done
      const savesAtDelivery = markDirty.mock.callCount();
      assert.doesNotThrow(() => frames(game, FAR, DONE_FRAMES)); // the notice is attempted here, and fails
      assert.equal(game.state(M1.id), 'available');
      assert.ok(markDirty.mock.callCount() >= savesAtDelivery);
      await settle();
      assert.equal(savedMain(storage).money, startMoney + M1.reward); // and the saved file has the reward and the progress
      assert.equal(savedMain(storage).missions[M1.id].completed, 1);
      assert.deepEqual(game.moneyEvents, [M1.reward]); // paid exactly once
      assert.equal(game.moneyEvents.length, 1);
      assert.equal(game.system.pendingNewJob, null);
      assert.equal(marker(game, M2).visible, true); // the new job's marker and arrow are still there
      assert.equal(game.system.currentTarget().kind, 'offer');
      const failures = console.warn.mock.calls.filter(({ arguments: a }) => String(a[0]).includes('new-job notice failed'));
      assert.equal(failures.length, 1, 'the failure was logged, not swallowed');

      // and the game carries on: the next job can be accepted, delivered and paid
      assert.doesNotThrow(() => deliver(game, M2));
      assert.doesNotThrow(() => frames(game, FAR, DONE_FRAMES));
      assert.deepEqual(game.moneyEvents, [M1.reward, M2.reward]);
      assert.equal(game.state(M2.id), 'available');
      await settle();
      assert.equal(savedMain(storage).money, startMoney + M1.reward + M2.reward);
      assert.equal(savedMain(storage).missions[M2.id].completed, 1);
    } finally {
      gameState.off('message', boom);
    }
  });

  test('the guard covers the notice only: another error in the same step is not swallowed', () => {
    const game = newGame();
    deliver(game, M1);
    frames(game, FAR, DONE_FRAMES - 1);
    game.ui.setObjective = () => {
      throw new Error('setObjective boom');
    };
    assert.throws(() => game.at(FAR, 100), /setObjective boom/);
  });
});
