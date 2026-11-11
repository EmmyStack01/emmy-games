// Stage 4B-2: customers talk. Greetings, delivery replies, the customer staying through "done", and
// where the bubble goes. Built the way the game builds it: the REAL MissionSystem, MissionFlow, save
// system and GameState; only the scene, the camera and the DOM UI are stand-ins.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, FIRST_DELIVERY } from '../src/missions/missionData.js';
import { getCustomerLine, DIALOGUE_KIND } from '../src/missions/customerDialogue.js';
import { FAR, door, pick, cust, rec, done, storageWith, launch, accept, startMoney, gameState } from './support/missionGame.js';

const [M1, M2, M3] = MISSIONS;
const GREETING = DIALOGUE_KIND.GREETING;
const FIRST = DIALOGUE_KIND.FIRST_DELIVERY;
const REPLAY = DIALOGUE_KIND.REPLAY;
const line = (def, kind) => getCustomerLine(def.id, kind);

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

// earlier missions already delivered once (so the mission under test is unlocked)
const earlier = (count) => Object.fromEntries(MISSIONS.slice(0, count).map((m) => [m.id, done(1)]));
function newGame(delivered = 0, options) {
  const game = launch(storageWith(earlier(delivered)), options);
  games.push(game);
  return game;
}

// Emmy `distance` px to the left of the customer, level with them.
const near = (def, distance) => ({ x: def.customer.x - distance, y: def.customer.y });

// Points the camera so the customer's feet are at (sx, feetY) on the 800 x 600 screen.
function lookAt(game, def, { zoom = 1, sx = 400, feetY = 250 } = {}) {
  const cam = game.scene.camera;
  cam.zoom = zoom;
  cam.worldView = { x: def.customer.x - sx / zoom, y: def.customer.y - feetY / zoom };
}

function toDeliver(game, def) {
  accept(game, def);
  game.at(pick(def));
  assert.equal(game.state(def.id), 'deliver');
}

// Emmy is far, then walks up to `distance` from the customer.
function approach(game, def, distance = 150) {
  game.at(near(def, 400));
  game.at(near(def, distance));
}

const said = (game) => game.ui.speech?.text ?? null;
const frames = (game, point, count, dt = 100) => {
  for (let i = 0; i < count; i += 1) game.at(point, dt);
};

describe('greeting: when it happens', () => {
  test('a customer greets Emmy once she comes within 190 px, carrying their delivery', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    game.at(near(M1, 300));
    assert.equal(said(game), null);
    game.at(near(M1, 190));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('190 px is the edge: 191 px is not close enough', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    game.at(near(M1, 300));
    game.at(near(M1, 191));
    assert.equal(said(game), null);
    game.at(near(M1, 190));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('once per approach: standing, moving closer and waiting do not repeat it', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1, 185);
    frames(game, near(M1, 150), 60);
    frames(game, near(M1, 100), 10);
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING)]);
  });

  test('never during PICKUP, and walking past in PICKUP does not use up the greeting', () => {
    const game = newGame();
    accept(game, M1);
    assert.equal(game.state(M1.id), 'pickup');
    lookAt(game, M1);
    game.at(near(M1, 400));
    game.at(near(M1, 100));
    game.at(near(M1, 20));
    assert.deepEqual(game.ui.speechLog, []);
    game.at(pick(M1));
    assert.equal(game.state(M1.id), 'deliver');
    approach(game, M1);
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING)]);
  });

  test('never for a customer that is not the active mission: other, locked and finished customers stay quiet', () => {
    const game = newGame(1); // The First Delivery is finished; Fresh From the Oven is unlocked
    lookAt(game, M1);
    game.at(near(M1, 400));
    game.at(near(M1, 100)); // finished mission's customer, nothing in progress
    for (const def of MISSIONS) {
      lookAt(game, def);
      game.at(near(def, 400));
      game.at(near(def, 100)); // available, locked or finished: none of them greets
    }
    assert.deepEqual(game.ui.speechLog, []);
    toDeliver(game, M2); // now Fresh From the Oven is the active mission
    lookAt(game, M1);
    game.at(near(M1, 400));
    game.at(near(M1, 100)); // beside another mission's customer
    lookAt(game, M3);
    game.at(near(M3, 400));
    game.at(near(M3, 100)); // beside a locked mission's customer
    assert.deepEqual(game.ui.speechLog, []);
    lookAt(game, M2);
    approach(game, M2);
    assert.deepEqual(game.ui.speechLog, [line(M2, GREETING)]);
  });

  test('every customer greets with their own line', () => {
    MISSIONS.forEach((def, i) => {
      const game = newGame(i);
      toDeliver(game, def);
      lookAt(game, def);
      approach(game, def);
      assert.equal(said(game), line(def, GREETING), def.id);
    });
  });
});

describe('greeting: re-arming', () => {
  test('armed again only beyond 237.5 px (190 x 1.25), then it greets again on the next approach', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    game.ui.tapSpeech();
    game.at(near(M1, 200)); // 190..237.5: still inside the re-arm distance
    game.at(near(M1, 190));
    game.at(near(M1, 237.5)); // exactly 237.5 is not beyond it
    game.at(near(M1, 190));
    assert.equal(game.ui.speechLog.length, 1);
    game.at(near(M1, 237.6)); // beyond: armed again
    game.at(near(M1, 190));
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING), line(M1, GREETING)]);
  });

  test('walking beyond the re-arm distance takes a greeting that is still showing away', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    assert.equal(said(game), line(M1, GREETING));
    game.at(near(M1, 238));
    assert.equal(said(game), null);
  });

  test('each customer keeps its own flag: set by distance, spent by its own greeting', () => {
    const game = newGame(1);
    const unit = (def) => game.system.getUnit(def.id);
    assert.deepEqual(MISSIONS.map((def) => unit(def).greetArmed), [false, false, false, false]); // nothing greets on load
    game.at(FAR);
    assert.deepEqual(MISSIONS.map((def) => unit(def).greetArmed), [true, true, true, true]);
    toDeliver(game, M2);
    lookAt(game, M2);
    approach(game, M2);
    assert.equal(unit(M2).greetArmed, false);
    assert.equal(unit(M1).greetArmed, true);
    assert.equal(unit(M3).greetArmed, true);
  });

  test('loading a save in the middle of a delivery never greets, even with Emmy beside the customer', () => {
    const storage = storageWith({ [M1.id]: rec('deliver', 1, 0, 0) });
    const game = launch(storage, { at: near(M1, 100) });
    games.push(game);
    lookAt(game, M1);
    assert.equal(game.state(M1.id), 'deliver');
    game.at(near(M1, 100));
    game.at(near(M1, 60));
    assert.deepEqual(game.ui.speechLog, []);
    game.at(near(M1, 400)); // she walks away ...
    game.at(near(M1, 150)); // ... and comes back: now it greets
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING)]);
  });
});

describe('greeting: when it must wait', () => {
  test('not while an offer card is open; it greets once the card is closed (it was not used up)', () => {
    const game = newGame(1);
    toDeliver(game, M2);
    lookAt(game, M2);
    game.at(near(M2, 400));
    assert.equal(game.flow(M3.id).openOffer(), true); // another job's card opens
    assert.equal(game.ui.offerOpen, true);
    game.player.inputLocked = false; // so only the open card is holding the greeting back
    game.at(near(M2, 150));
    assert.equal(said(game), null);
    game.flow(M3.id).decline();
    game.at(near(M2, 150));
    assert.equal(said(game), line(M2, GREETING));
  });

  test('not while Emmy cannot move (inputLocked); it greets when she can', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    game.at(near(M1, 400));
    game.player.inputLocked = true;
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    game.player.inputLocked = false;
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('not while the customer is outside the safe visible area; it greets when they come into it', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    lookAt(game, M1, { feetY: 100 }); // the anchor (100 px above the feet) is at y = 0: under the HUD
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookAt(game, M1, { feetY: 110 }); // feet at 110: a bubble below them would start at 119, inside the 120 px top margin
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookAt(game, M1, { sx: 5 }); // too close to the left edge
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookAt(game, M1, { sx: 796 }); // too close to the right edge
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookAt(game, M1, { feetY: 700 }); // below the bottom margin
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookAt(game, M1, { feetY: 220 }); // anchor at y = 120: inside
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });

  // Stage 4E-1: a customer whose anchor is under the top margin is greeted when the bubble fits BELOW them
  // (this used to be refused; see the 4E-1 describe below for the short-landscape cases).
  test('4E-1: an anchor inside the top margin no longer blocks a greeting when the bubble fits below the customer', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    lookAt(game, M1, { feetY: 219 }); // anchor at y = 119: the bubble goes below the feet (228 to 276)
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('the check follows the camera zoom: near the bottom edge the bubble can only go above, and zoom decides if there is room', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    lookAt(game, M1, { zoom: 5, feetY: 560 }); // anchor = 560 - 500 = 60: no room above; below would pass the bottom margin
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookAt(game, M1, { zoom: 1, feetY: 560 }); // anchor = 460: room above
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });
});

describe('greeting: how long it stays, and tapping it', () => {
  test('about 3.5 seconds of game time, then it is gone and does not come back by itself', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    frames(game, near(M1, 150), 34); // 3.4 s
    assert.equal(said(game), line(M1, GREETING));
    frames(game, near(M1, 150), 1); // 3.5 s
    assert.equal(said(game), null);
    frames(game, near(M1, 150), 40);
    assert.equal(game.ui.speechLog.length, 1);
  });

  test('a long frame counts for at most 100 ms (the game\'s usual cap)', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    game.at(near(M1, 150), 60000);
    assert.equal(said(game), line(M1, GREETING));
  });

  test('tapping it dismisses it, and it does not come straight back', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    game.ui.tapSpeech();
    assert.equal(said(game), null);
    assert.equal(game.system.speech, null);
    frames(game, near(M1, 150), 20);
    frames(game, near(M1, 100), 10);
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING)]);
  });

  test('tapping changes nothing else: Emmy is not locked, the mission goes on, the delivery still completes', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    game.ui.tapSpeech();
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.state(M1.id), 'deliver');
    game.at(cust(M1));
    assert.equal(game.state(M1.id), 'done');
    assert.equal(gameState.money, startMoney + M1.reward);
  });
});

describe('delivery replies', () => {
  test('the first successful delivery gets the first-delivery line', () => {
    MISSIONS.forEach((def, i) => {
      const game = newGame(i);
      toDeliver(game, def);
      game.at(cust(def));
      assert.equal(game.state(def.id), 'done');
      assert.equal(said(game), line(def, FIRST), def.id);
      assert.equal(game.flow(def.id).completed, 1);
    });
  });

  test('every later delivery gets the replay line', () => {
    MISSIONS.forEach((def, i) => {
      const game = newGame(i + 1); // this mission has been delivered once already
      toDeliver(game, def);
      game.at(cust(def));
      assert.equal(game.state(def.id), 'done');
      assert.equal(game.flow(def.id).completed, 2);
      assert.equal(said(game), line(def, REPLAY), def.id);
    });
  });

  test('first, then replay, then replay again, in one session', () => {
    const game = newGame();
    for (const kind of [FIRST, REPLAY, REPLAY]) {
      toDeliver(game, M1);
      game.at(cust(M1));
      assert.equal(said(game), line(M1, kind));
      game.waitDone();
      assert.equal(game.state(M1.id), 'available');
    }
    assert.deepEqual(game.ui.speechLog, [line(M1, FIRST), line(M1, REPLAY), line(M1, REPLAY)]);
  });

  test('a delivery after a page reload is a replay (the saved count says so)', () => {
    const storage = storageWith({ [M1.id]: done(1) });
    const game = launch(storage);
    games.push(game);
    assert.deepEqual(game.ui.speechLog, []); // loading says nothing
    toDeliver(game, M1);
    game.at(cust(M1));
    assert.equal(said(game), line(M1, REPLAY));
  });

  test('it replaces a greeting that is still showing: no queue, one bubble', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    assert.equal(said(game), line(M1, GREETING));
    game.at(cust(M1));
    assert.equal(said(game), line(M1, FIRST));
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING), line(M1, FIRST)]);
    assert.ok(!Array.isArray(game.system.speech)); // one line, never a list
    assert.equal(game.system.speech.dialogueKind, FIRST);
    game.waitDone();
    frames(game, FAR, 50);
    assert.equal(said(game), null);
    assert.equal(game.ui.speechLog.length, 2); // nothing was waiting
  });

  test('it lasts the whole "done" window (3.2 s), and goes when the customer does', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(cust(M1));
    const total = Math.ceil(FIRST_DELIVERY.doneDelayMs / 100);
    frames(game, cust(M1), total - 1);
    assert.equal(game.state(M1.id), 'done');
    assert.equal(said(game), line(M1, FIRST));
    assert.equal(game.view(M1.id).customer.visible, true);
    frames(game, cust(M1), 1);
    assert.equal(game.state(M1.id), 'available');
    assert.equal(said(game), null);
    assert.equal(game.view(M1.id).customer.visible, false);
  });

  test('it is said once: repeated updates in the "done" state do not repeat it', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(cust(M1));
    frames(game, cust(M1), 20, 50);
    frames(game, FAR, 5, 50);
    assert.deepEqual(game.ui.speechLog, [line(M1, FIRST)]);
  });

  test('loading a save says nothing: no reply, no greeting, no bubble', () => {
    const game = launch(storageWith({ [M1.id]: done(2), [M2.id]: rec('pickup', 1, 0, 0) }));
    games.push(game);
    assert.deepEqual(game.ui.speechLog, []);
    assert.equal(game.ui.speech, null);
    assert.equal(game.system.speech, null);
  });

  test('tapping the reply dismisses it, and it does not come back', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(cust(M1));
    game.ui.tapSpeech();
    assert.equal(said(game), null);
    frames(game, cust(M1), 10);
    assert.deepEqual(game.ui.speechLog, [line(M1, FIRST)]);
    assert.equal(game.state(M1.id), 'done'); // the mission carries on to the end of its window
  });

  test('a reply is not a promotion or a hint about the next job: only the approved line is said', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(cust(M1));
    assert.deepEqual(Object.keys(game.system.speech).sort(), ['dialogueKind', 'remainingMs', 'unit']);
    assert.deepEqual(game.ui.toasts.at(-1), { title: M1.text.doneTitle, body: M1.text.doneBody, kind: 'done' });
  });
});

describe('the customer stays through "done"', () => {
  test('customer and shadow stay; the ring and the arrow (the guidance) go', () => {
    const game = newGame();
    const view = game.view(M1.id);
    accept(game, M1);
    assert.equal(view.customer.visible, true); // waiting while Emmy fetches the parcel
    game.at(pick(M1));
    assert.deepEqual([view.customer.visible, view.customerShadow.visible, view.customerRing.visible, view.customerArrow.visible], [true, true, true, true]);
    game.at(cust(M1));
    assert.equal(game.state(M1.id), 'done');
    assert.deepEqual([view.customer.visible, view.customerShadow.visible, view.customerRing.visible, view.customerArrow.visible], [true, true, false, false]);
    assert.equal(game.ui.arrow, null);
    assert.equal(game.ui.objective, null);
  });

  test('the customer disappears when "done" ends, as before', () => {
    const game = newGame();
    const view = game.view(M1.id);
    toDeliver(game, M1);
    game.at(cust(M1));
    game.waitDone();
    assert.equal(game.state(M1.id), 'available');
    assert.deepEqual([view.customer.visible, view.customerShadow.visible, view.customerRing.visible, view.customerArrow.visible], [false, false, false, false]);
  });

  test('only the delivered mission\'s customer is shown', () => {
    const game = newGame(1);
    toDeliver(game, M2);
    game.at(cust(M2));
    MISSIONS.forEach((def) => assert.equal(game.view(def.id).customer.visible, def.id === M2.id, def.id));
  });

  test('the customer cannot be used again: no second reward, no second reply, no new offer', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(cust(M1));
    frames(game, cust(M1), 20, 50); // Emmy stands on the customer
    assert.equal(game.system.flow.complete(), false);
    assert.equal(game.moneyEvents.length, 1);
    assert.equal(gameState.money, startMoney + M1.reward);
    assert.deepEqual(game.ui.speechLog, [line(M1, FIRST)]);
    assert.equal(game.state(M1.id), 'done');
    assert.equal(game.ui.offerOpen, false);
    frames(game, door(M1), 3); // not even at the shop during "done"
    assert.equal(game.ui.offerOpen, false);
  });

  test('reward, progress and the "done" length are unchanged', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(cust(M1));
    assert.deepEqual(game.moneyEvents, [M1.reward]);
    assert.equal(game.flow(M1.id).completed, 1);
    assert.equal(FIRST_DELIVERY.doneDelayMs, 3200);
    frames(game, FAR, 31);
    assert.equal(game.state(M1.id), 'done');
    frames(game, FAR, 1);
    assert.equal(game.state(M1.id), 'available');
  });
});

describe('placing the bubble (no camera events: update() does it)', () => {
  test('uses the camera scroll and zoom, and anchors 100 world px above the customer\'s feet', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1, { zoom: 2, sx: 400, feetY: 400 });
    approach(game, M1);
    assert.deepEqual(game.ui.speechSpot, { x: 400, feetY: 400, anchorY: 200, viewWidth: 800, viewHeight: 600 });
  });

  test('follows the camera as it scrolls', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1, { zoom: 2, sx: 400, feetY: 400 });
    approach(game, M1);
    game.scene.camera.worldView.x += 30; // the camera moves right: the customer moves left on screen
    game.at(near(M1, 150));
    assert.equal(game.ui.speechSpot.x, 340);
    game.scene.camera.worldView.y -= 10;
    game.at(near(M1, 150));
    assert.equal(game.ui.speechSpot.feetY, 420);
    assert.equal(game.ui.speechSpot.anchorY, 220);
  });

  test('is placed when shown, and not at all while nothing is said', () => {
    const game = newGame();
    frames(game, FAR, 30);
    assert.equal(game.ui.speechPlacements, 0);
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    assert.ok(game.ui.speechPlacements >= 1);
    game.ui.tapSpeech();
    const placed = game.ui.speechPlacements;
    frames(game, near(M1, 150), 20);
    assert.equal(game.ui.speechPlacements, placed);
  });
});

describe('placing the bubble from the camera\'s "prerender" event', () => {
  test('listens to the camera, places the bubble when the camera has moved, and only then', () => {
    const game = newGame(0, { cameraEvents: true });
    const cam = game.scene.camera;
    assert.equal(cam.listenerCount('prerender'), 1);
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    assert.equal(game.ui.speechPlacements, 1); // once, when it was shown
    frames(game, near(M1, 150), 5);
    assert.equal(game.ui.speechPlacements, 1); // update() does not place it: the camera has not rendered yet
    cam.worldView = { x: cam.worldView.x + 20, y: cam.worldView.y }; // the camera follows Emmy ...
    cam.emit('prerender'); // ... and then renders
    assert.equal(game.ui.speechPlacements, 2);
    assert.equal(game.ui.speechSpot.x, 380); // placed with the NEW camera position
  });

  test('a camera event with no bubble does nothing', () => {
    const game = newGame(0, { cameraEvents: true });
    game.scene.camera.emit('prerender');
    game.scene.camera.emit('prerender');
    assert.equal(game.ui.speechPlacements, 0);
  });

  test('the reply is placed from it too', () => {
    const game = newGame(0, { cameraEvents: true });
    toDeliver(game, M1);
    game.at(cust(M1));
    const placed = game.ui.speechPlacements;
    game.scene.camera.emit('prerender');
    assert.equal(game.ui.speechPlacements, placed + 1);
  });

  test('destroying the system removes the listener and the bubble state', () => {
    const game = newGame(0, { cameraEvents: true });
    const cam = game.scene.camera;
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    game.system.destroy();
    assert.equal(cam.listenerCount('prerender'), 0);
    assert.equal(game.system.speech, null);
    assert.equal(game.ui.destroyed, true);
    const placed = game.ui.speechPlacements;
    assert.doesNotThrow(() => cam.emit('prerender'));
    assert.equal(game.ui.speechPlacements, placed);
    assert.doesNotThrow(() => game.system.destroy()); // twice is fine
  });
});

describe('the bubble does not outlive its mission or scene', () => {
  test('a new page load starts clean: no bubble, nothing carried over', () => {
    const first = newGame();
    toDeliver(first, M1);
    lookAt(first, M1);
    approach(first, M1);
    first.system.destroy();
    const second = newGame(0);
    assert.equal(second.ui.speech, null);
    assert.equal(second.system.speech, null);
    assert.deepEqual(second.ui.speechLog, []);
  });

  test('no dialogue text is stored anywhere but customerDialogue.js (the bubble only holds what it was told)', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookAt(game, M1);
    approach(game, M1);
    assert.deepEqual(Object.keys(game.system.speech).sort(), ['dialogueKind', 'remainingMs', 'unit']);
  });
});

// ---------------------------------------------------------------------------------------------
// Stage 4E-1: greetings on short landscape screens, and keeping clear of the joystick. REAL
// MissionSystem, MissionFlow, save system and GameState; the camera, the DOM and the screen
// geometry (bubble size, safe-area insets, joystick circle) are stand-ins. No browser, no device.
// ---------------------------------------------------------------------------------------------

const NOTCH = { top: 0, right: 47, bottom: 21, left: 47 };
const BUBBLE = { width: 240, height: 58 }; // what the browser measures for a two-line greeting

// A phone held sideways: 740 x 360 at zoom 0.8 (the game's own zoom there). The customer's feet are put at (sx, feetY).
function lookShort(game, def, { sx = 370, feetY = 202, width = 740, height = 360, zoom = 0.8 } = {}) {
  const cam = game.scene.camera;
  cam.width = width;
  cam.height = height;
  cam.zoom = zoom;
  cam.worldView = { x: def.customer.x - sx / zoom, y: def.customer.y - feetY / zoom };
}
const joystick = (side, width = 740, height = 360, size = 132) => ({
  cx: side === 'right' ? width - 4 - size / 2 : 4 + size / 2,
  cy: height - 4 - size / 2,
  r: size / 2,
});

describe('4E-1 greeting: short landscape (740 x 360)', () => {
  test('a customer level with Emmy greets (before 4E-1 their anchor was right on the top margin)', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookShort(game, M1, { feetY: 202 });
    approach(game, M1);
    assert.equal(said(game), line(M1, GREETING));
  });

  test('customers slightly north of Emmy greet too: 16, 40 and 90 world px north', () => {
    [186, 170, 130].forEach((feetY) => {
      const game = newGame();
      toDeliver(game, M1);
      lookShort(game, M1, { feetY });
      approach(game, M1);
      assert.equal(said(game), line(M1, GREETING), `feet at ${feetY}`);
    });
  });

  test('a customer hidden under the HUD waits, is not greeted, and still has the greeting when they come into view', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    lookShort(game, M1, { feetY: 90 });
    game.at(near(M1, 150));
    frames(game, near(M1, 150), 20);
    assert.equal(said(game), null);
    assert.equal(game.system.getUnit(M1.id).greetArmed, true); // not used up
    lookShort(game, M1, { feetY: 160 });
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
    assert.equal(game.system.getUnit(M1.id).greetArmed, false);
  });

  test('the greeting distance is unchanged: 190 yes, 191 no', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookShort(game, M1);
    game.at(near(M1, 300));
    game.at(near(M1, 191));
    assert.equal(said(game), null);
    game.at(near(M1, 190));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('the re-arm distance is unchanged: beyond 237.5 only, then it greets again on the next approach', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookShort(game, M1);
    approach(game, M1);
    game.ui.tapSpeech();
    game.at(near(M1, 237.5));
    game.at(near(M1, 190));
    assert.equal(game.ui.speechLog.length, 1);
    game.at(near(M1, 237.6));
    game.at(near(M1, 190));
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING), line(M1, GREETING)]);
  });

  test('it still greets once per approach, however long Emmy stands there', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookShort(game, M1);
    approach(game, M1, 185);
    frames(game, near(M1, 150), 60);
    frames(game, near(M1, 100), 10);
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING)]);
  });

  test('it lasts 3.5 s and then goes, as before', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookShort(game, M1);
    approach(game, M1);
    frames(game, near(M1, 150), 34);
    assert.equal(said(game), line(M1, GREETING));
    frames(game, near(M1, 150), 1);
    assert.equal(said(game), null);
  });

  test('when no bubble fits, the greeting waits (stays armed) and no line is shown or counted', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    game.ui.speechLayout = BUBBLE;
    // 568 x 320: above would reach into the top margin, below would pass the bottom margin
    lookShort(game, M1, { width: 568, height: 320, sx: 284, feetY: 250 });
    frames(game, near(M1, 150), 30);
    assert.deepEqual(game.ui.speechLog, []);
    assert.equal(game.system.getUnit(M1.id).greetArmed, true);
    lookShort(game, M1, { width: 568, height: 320, sx: 284, feetY: 200 }); // now it fits below
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('a customer outside the screen sides is still not greeted', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    lookShort(game, M1, { sx: 5 });
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookShort(game, M1, { sx: 736 });
    game.at(near(M1, 150));
    assert.equal(said(game), null);
  });

  test('the greeting check asks about the greeting line and the customer\'s real screen position', () => {
    const game = newGame();
    toDeliver(game, M1);
    lookShort(game, M1, { feetY: 186 });
    approach(game, M1);
    const last = game.ui.canPlaceCalls.at(-1);
    assert.equal(last.text, line(M1, GREETING));
    assert.deepEqual(last.spot, { x: 370, feetY: 186, anchorY: 106, viewWidth: 740, viewHeight: 360 });
  });
});

describe('4E-1 greeting: portrait is unchanged (390 x 844, zoom 0.87)', () => {
  const lookPortrait = (game, def, { sx = 195, feetY = 424 } = {}) => lookShort(game, def, { sx, feetY, width: 390, height: 844, zoom: 0.87 });

  test('customers level with, north of and south of Emmy all greet', () => {
    [424, 330, 260, 560, 700].forEach((feetY) => {
      const game = newGame();
      toDeliver(game, M1);
      lookPortrait(game, M1, { feetY });
      approach(game, M1);
      assert.equal(said(game), line(M1, GREETING), `feet at ${feetY}`);
    });
  });

  test('a customer under the HUD or beside the screen edge still waits', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    lookPortrait(game, M1, { feetY: 60 });
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookPortrait(game, M1, { sx: 5 });
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookPortrait(game, M1, { sx: 386 });
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookPortrait(game, M1);
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('a joystick on the screen makes no difference in portrait', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.ui.speechLayout = { ...BUBBLE, joystick: joystick('right', 390, 844) };
    lookPortrait(game, M1, { sx: 300, feetY: 780 }); // right above the joystick corner
    approach(game, M1);
    assert.equal(said(game), line(M1, GREETING));
  });
});

describe('4E-1 greeting: the joystick and the safe area (740 x 360)', () => {
  ['right', 'left'].forEach((side) => test(`joystick on the ${side}: a customer right above it waits; one with room beside them greets`, () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    game.ui.speechLayout = { ...BUBBLE, joystick: joystick(side) };
    const blocked = side === 'right' ? 600 : 140; // the bubble cannot get clear of the joystick and still point at them
    const free = side === 'right' ? 520 : 220;
    lookShort(game, M1, { sx: blocked, feetY: 340 });
    frames(game, near(M1, 150), 10);
    assert.deepEqual(game.ui.speechLog, []);
    assert.equal(game.system.getUnit(M1.id).greetArmed, true);
    lookShort(game, M1, { sx: free, feetY: 340 });
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  }));

  test('without a joystick the same customer greets (the joystick is the only reason it waited)', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.ui.speechLayout = BUBBLE;
    lookShort(game, M1, { sx: 600, feetY: 340 });
    approach(game, M1);
    assert.equal(said(game), line(M1, GREETING));
  });

  test('safe-area insets: a customer inside the notch margin waits, one beside it greets', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    game.ui.speechLayout = { ...BUBBLE, insets: NOTCH };
    lookShort(game, M1, { sx: 40, feetY: 200 }); // inside 12 + 47 = 59
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookShort(game, M1, { sx: 80, feetY: 200 });
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });

  test('safe-area bottom inset: no room below the customer, so it waits', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.at(near(M1, 400));
    game.ui.speechLayout = { ...BUBBLE, insets: { top: 0, right: 0, bottom: 21, left: 0 } };
    lookShort(game, M1, { feetY: 262 });
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    lookShort(game, M1, { feetY: 240 });
    game.at(near(M1, 150));
    assert.equal(said(game), line(M1, GREETING));
  });
});

describe('4E-1 greeting: the check is presentation only', () => {
  test('a delivery reply is not held back by the check: it shows even where a greeting would wait', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.ui.speechLayout = BUBBLE;
    lookShort(game, M1, { width: 568, height: 320, sx: 284, feetY: 250 }); // no room for a greeting
    game.at(near(M1, 150));
    assert.equal(said(game), null);
    game.at(cust(M1));
    assert.equal(game.state(M1.id), 'done');
    assert.equal(said(game), line(M1, FIRST));
  });

  test('the check changes no toast, HUD message, money or money event', () => {
    const game = newGame();
    toDeliver(game, M1);
    const before = { toasts: game.ui.toasts.length, messages: game.messages.length, money: gameState.money, events: game.moneyEvents.length, soundCalls: game.scene.soundCalls };
    lookShort(game, M1, { feetY: 170 });
    approach(game, M1);
    frames(game, near(M1, 150), 40);
    assert.equal(said(game), null); // it has come and gone
    assert.deepEqual(game.ui.speechLog, [line(M1, GREETING)]);
    assert.ok(game.ui.canPlaceCalls.length >= 1);
    assert.deepEqual(
      { toasts: game.ui.toasts.length, messages: game.messages.length, money: gameState.money, events: game.moneyEvents.length, soundCalls: game.scene.soundCalls },
      before,
    );
  });

  test('a UI without the check (an older stand-in) still works: the placement rules run with the default size', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.ui.canPlaceSpeech = undefined;
    lookShort(game, M1, { feetY: 186 });
    approach(game, M1);
    assert.equal(said(game), line(M1, GREETING));
    const quiet = newGame();
    toDeliver(quiet, M1);
    quiet.ui.canPlaceSpeech = undefined;
    quiet.at(near(M1, 400));
    lookShort(quiet, M1, { feetY: 90 }); // under the HUD
    quiet.at(near(M1, 150));
    assert.equal(said(quiet), null);
  });

  test('if the check itself throws: no greeting, no crash, one warning, and the delivery still completes and pays once', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.ui.canPlaceSpeech = () => {
      throw new Error('check boom');
    };
    lookShort(game, M1);
    game.at(near(M1, 400));
    assert.doesNotThrow(() => frames(game, near(M1, 150), 50));
    assert.deepEqual(game.ui.speechLog, []);
    const warnings = console.warn.mock.calls.filter(({ arguments: args }) => String(args[0]).includes('A greeting check failed'));
    assert.equal(warnings.length, 1, 'said once, not every frame');
    game.at(cust(M1));
    assert.equal(game.state(M1.id), 'done');
    assert.equal(gameState.money, startMoney + M1.reward);
    assert.equal(said(game), line(M1, FIRST));
  });

  test('a check that answers anything but true is a no', () => {
    const game = newGame();
    toDeliver(game, M1);
    game.ui.canPlaceSpeech = () => 'yes';
    lookShort(game, M1);
    approach(game, M1);
    assert.equal(said(game), null);
  });
});
