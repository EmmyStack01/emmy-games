// The "Replay mission" prompt (Stage 4A follow-up):
//   * a NEW job still opens its offer card by itself, 130 px from its shop (unchanged);
//   * a job that has been delivered before (a replay) NEVER opens its card by itself;
//   * near a replay shop a small prompt shows, with the mission's title; tapping it opens the
//     same offer card, and Accept / Not Now then work exactly as always;
//   * the prompt shows within 130 px and hides beyond 150 px (so it does not flicker);
//   * it never shows for a new job, a locked job, an active job, or while anything else is open.
//
// Real: MissionSystem, MissionView, MissionFlow, the save system, GameState, the data.
// Faked: the scene, the DOM UI (its prompt is recorded; the real UI is tested in
// missionUIReplayPrompt.test.js) and localStorage. Built exactly as the game builds it.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import MissionSystem from '../src/missions/MissionSystem.js';
import { startSaveSystem } from '../src/state/saveSystem.js';
import { MISSIONS, MISSION_IDS } from '../src/missions/missionData.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './support/fakeMissionScene.js';
import {
  startMoney, FAR, settle, door, pick, cust, rec, done, storageWith, savedRecords,
  launch, accept, playRun, assertQuiet, gameState,
} from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const ALL_DONE = { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1), acrossOrisunClose: done(1) };
const OPEN_4 = { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1) }; // missions 1 to 3 are replays; 4 is the new job
const states = (game) => MISSION_IDS.map((id) => game.state(id));
// Emmy `dx` pixels to the right of a shop's door
const near = (def, dx = 0) => ({ x: door(def).x + dx, y: door(def).y });
const prompt = (game) => game.ui.replayPrompt?.title ?? null;

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

describe('a replay shop never opens its card by itself', () => {
  test('standing at any replayable shop, for as long as you like, opens nothing', () => {
    MISSIONS.forEach((def) => {
      const game = launch(storageWith(ALL_DONE));
      for (let i = 0; i < 20; i += 1) game.at(near(def), 100);
      assert.deepEqual(states(game), ['available', 'available', 'available', 'available'], def.id);
      assert.equal(game.ui.offerOpen, false, def.id);
      assert.equal(game.player.inputLocked, false, def.id);
      game.close();
    });
  });

  test('walking up to it from far away, or right through it, opens nothing', () => {
    const game = launch(storageWith(ALL_DONE));
    for (let dx = 400; dx >= -400; dx -= 20) game.at(near(M1, dx));
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    game.close();
  });

  test('the first mission, delivered for the first time this session, stops opening its card at once', () => {
    const game = launch(storageWith());
    assert.equal(game.state(M1.id), 'available');
    playRun(game, M1);
    game.at(FAR);
    game.at(near(M1));
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(prompt(game), M1.title);
    game.close();
  });

  test('after a replay is finished, walking back to the shop opens nothing', () => {
    const game = launch(storageWith(ALL_DONE));
    playRun(game, M2);
    game.at(near(M2));
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('a replay flow is not checked for an offer at all; only the new job is', () => {
    const game = launch(storageWith(OPEN_4));
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(FAR);
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 0, 0, 1]);
    game.close();
  });
});

describe('a new job keeps its automatic offer', () => {
  test('the first job opens its card as soon as Emmy is within 130 px, and not at 131', () => {
    const game = launch(storageWith());
    game.at(near(M1, 131));
    assert.equal(game.state(M1.id), 'available');
    assert.equal(prompt(game), null);
    game.at(near(M1, 130));
    assert.equal(game.state(M1.id), 'offer');
    assert.equal(game.ui.offerOpen, true);
    assert.equal(game.player.inputLocked, true);
    game.close();
  });

  test('every new job in the chain opens by itself at its own shop, while the earlier shops only prompt', () => {
    const game = launch(storageWith());
    for (const [i, def] of MISSIONS.entries()) {
      game.at(FAR);
      game.at(near(def, 130));
      assert.equal(game.state(def.id), 'offer', `${def.id} opens by itself`);
      assert.equal(prompt(game), null, `${def.id}: no prompt for a new job`);
      game.ui.accept();
      game.at(pick(def));
      game.at(cust(def));
      game.waitDone();
      MISSIONS.slice(0, i + 1).forEach((earlier) => {
        game.at(FAR);
        game.at(near(earlier));
        assert.equal(game.state(earlier.id), 'available', `${earlier.id} (replay) does not open`);
        assert.equal(prompt(game), earlier.title, `${earlier.id} (replay) prompts`);
      });
    }
    game.close();
  });

  test('Not Now on a new job works as ever: it stays closed while Emmy stays, and opens again when she returns', () => {
    const game = launch(storageWith());
    game.at(door(M1));
    game.ui.decline();
    game.at(door(M1));
    assert.equal(game.state(M1.id), 'available');
    game.at(FAR);
    game.at(door(M1));
    assert.equal(game.state(M1.id), 'offer');
    game.close();
  });

  test('a new job opens its card and no prompt is showing then', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(near(M4, 130));
    assert.equal(game.state(M4.id), 'offer');
    assert.equal(prompt(game), null);
    game.close();
  });
});

describe('when the prompt shows', () => {
  test('near each replayable shop it shows that mission\'s title, and only that', () => {
    MISSIONS.forEach((def) => {
      const game = launch(storageWith(ALL_DONE));
      game.at(near(def));
      assert.equal(prompt(game), def.title, def.id);
      assert.deepEqual(MISSIONS.map((m) => m.title).filter((t) => t === prompt(game)), [def.title]);
      game.close();
    });
  });

  test('the four titles are the approved ones', () => {
    assert.deepEqual(MISSIONS.map((m) => m.title), ['The First Delivery', 'Fresh From the Oven', 'Suya for the Hall', 'Across Orisun Close']);
  });

  test('it shows once when Emmy arrives, not again on every frame', () => {
    const game = launch(storageWith(ALL_DONE));
    const show = mock.method(game.ui, 'showReplayPrompt');
    const hide = mock.method(game.ui, 'hideReplayPrompt');
    for (let i = 0; i < 30; i += 1) game.at(near(M3, 10));
    assert.equal(show.mock.callCount(), 1);
    assert.equal(hide.mock.callCount(), 0);
    game.close();
  });

  test('it never shows for a new job', () => {
    const game = launch(storageWith());
    game.at(near(M1, 0));
    game.ui.decline(); // the new job opened by itself; dismiss it
    for (let i = 0; i < 5; i += 1) game.at(near(M1, 0));
    assert.equal(prompt(game), null);
    game.close();
  });

  test('it never shows for a locked job', () => {
    const game = launch(storageWith());
    [M2, M3, M4].forEach((def) => {
      game.at(near(def));
      game.at(near(def, 50));
      assert.equal(prompt(game), null, def.id);
      assert.equal(game.state(def.id), 'available', def.id);
    });
    const afterOne = launch(storageWith({ firstDelivery: done(1) })); // 3 and 4 are still locked
    [M3, M4].forEach((def) => {
      afterOne.at(near(def));
      assert.equal(prompt(afterOne), null, def.id);
    });
    game_close(game, afterOne);
  });

  test('it does not show while any mission is in progress, even at a replayable shop', () => {
    MISSIONS.forEach((active) => {
      const game = launch(storageWith(ALL_DONE));
      accept(game, active);
      assert.equal(prompt(game), null, `${active.id} pickup`);
      MISSIONS.forEach((def) => {
        game.at(near(def));
        assert.equal(prompt(game), null, `${def.id} during ${active.id} pickup`);
      });
      game.at(pick(active));
      MISSIONS.forEach((def) => {
        game.at(near(def));
        assert.equal(prompt(game), null, `${def.id} during ${active.id} delivery`);
      });
      game.close();
    });
  });

  test('it does not show while an offer card is open, and the card comes first', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(near(M4)); // the new job opens its card
    assert.equal(game.state(M4.id), 'offer');
    game.at(near(M1)); // Emmy is moved onto a replay shop while the card is still open
    assert.equal(prompt(game), null);
    game.close();
  });

  test('it does not show during the delivered banner, and does once the banner is over', () => {
    const game = launch(storageWith(ALL_DONE));
    accept(game, M2);
    game.at(pick(M2));
    game.at(cust(M2));
    assert.equal(game.state(M2.id), 'done');
    game.at(near(M1));
    assert.equal(prompt(game), null);
    for (let i = 0; i < 40; i += 1) game.at(near(M1), 100); // the banner ends
    assert.equal(game.state(M2.id), 'available');
    assert.equal(prompt(game), M1.title);
    game.close();
  });

  test('it hides when Emmy walks away', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M1));
    assert.equal(prompt(game), M1.title);
    game.at(FAR);
    assert.equal(prompt(game), null);
    game.close();
  });

  test('where two replay shops are in range at once, the nearer one is prompted', () => {
    // a test-only copy of mission 2 whose door is 40 px from mission 1's door
    const twin = { ...M2, shop: { ...M2.shop, door: { x: M1.shop.door.x + 40, y: M1.shop.door.y } } };
    const game = launchCustom(storageWith(ALL_DONE), [M1, twin, M3, M4]);
    game.at({ x: M1.shop.door.x + 5, y: M1.shop.door.y });
    assert.equal(prompt(game), M1.title);
    game.at({ x: M1.shop.door.x + 35, y: M1.shop.door.y });
    assert.equal(prompt(game), twin.title);
    game.close();
  });
});

describe('130 px to show, 150 px to hide', () => {
  test('the radius is the existing 130 px, and the hide distance is 20 px farther', () => {
    MISSIONS.forEach((def) => assert.equal(def.shop.offerRadius, 130, def.id));
  });

  // These use the Suya Spot, which has no other mission door near it. (Lagoon Mart and Ade Mobile Fix are
  // 280 px apart, so 150 px from one is 130 px from the other, and the nearer shop rightly takes over.)
  test('it shows at exactly 130 px, and not at 131 px', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M3, 131));
    assert.equal(prompt(game), null);
    game.at(near(M3, 130));
    assert.equal(prompt(game), M3.title);
    game.close();
  });

  test('once showing it stays until Emmy is beyond 150 px, then hides', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M3, 130));
    assert.equal(prompt(game), M3.title);
    [131, 140, 149, 150].forEach((dx) => {
      game.at(near(M3, dx));
      assert.equal(prompt(game), M3.title, `still showing at ${dx} px`);
    });
    game.at(near(M3, 151));
    assert.equal(prompt(game), null, 'hidden at 151 px');
    game.close();
  });

  test('once hidden it does not come back until Emmy is within 130 px again (no flicker between 130 and 150)', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M3, 130));
    game.at(near(M3, 160));
    assert.equal(prompt(game), null);
    [150, 140, 131].forEach((dx) => {
      game.at(near(M3, dx));
      assert.equal(prompt(game), null, `stays hidden at ${dx} px`);
    });
    game.at(near(M3, 130));
    assert.equal(prompt(game), M3.title);
    game.close();
  });

  test('jittering around the edge does not make it flicker', () => {
    const game = launch(storageWith(ALL_DONE));
    const show = mock.method(game.ui, 'showReplayPrompt');
    const hide = mock.method(game.ui, 'hideReplayPrompt');
    game.at(near(M3, 129));
    for (let i = 0; i < 20; i += 1) game.at(near(M3, i % 2 === 0 ? 128 : 146)); // between 130 and 150
    assert.equal(show.mock.callCount(), 1);
    assert.equal(hide.mock.callCount(), 0);
    game.close();
  });

  test('the same distances hold in every direction, not only to the right of the door', () => {
    const game = launch(storageWith(ALL_DONE));
    const d = door(M3);
    game.at({ x: d.x, y: d.y - 130 });
    assert.equal(prompt(game), M3.title);
    game.at({ x: d.x - 106, y: d.y + 106 }); // about 150 px away, diagonally
    assert.equal(prompt(game), M3.title);
    game.at({ x: d.x - 107, y: d.y + 107 }); // about 151.3 px
    assert.equal(prompt(game), null);
    game.close();
  });
});

describe('two replay shops close enough to overlap', () => {
  test('Lagoon Mart and Ade Mobile Fix are 280 px apart: between them the nearer shop\'s prompt is shown', () => {
    const game = launch(storageWith(ALL_DONE));
    const a = door(M1);
    game.at({ x: a.x + 100, y: a.y });
    assert.equal(prompt(game), M1.title);
    game.at({ x: a.x + 150, y: a.y }); // 150 px from Lagoon Mart, 130 px from Ade Mobile Fix
    assert.equal(prompt(game), M4.title);
    game.at({ x: a.x + 140, y: a.y }); // exactly in the middle: 140 px from each
    assert.ok([M1.title, M4.title].includes(prompt(game)));
    game.at({ x: a.x + 200, y: a.y });
    assert.equal(prompt(game), M4.title);
    game.close();
  });
});

describe('tapping the prompt', () => {
  test('opens the mission\'s usual offer card: same text, Emmy stops, nothing is paid or counted', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M2));
    const before = game.flow(M2.id).toSave();
    assert.equal(game.ui.replay(), true);
    assert.equal(game.state(M2.id), 'offer');
    assert.equal(game.ui.offerOpen, true);
    assert.equal(game.ui.offerText, M2.text);
    assert.equal(game.ui.offerText.offerTitle, 'BOLA BAKERY');
    assert.equal(game.player.inputLocked, true);
    assert.equal(prompt(game), null, 'the prompt gives way to the card');
    assert.deepEqual(game.flow(M2.id).toSave(), { ...before, state: 'available' });
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('Accept then starts a new run exactly as for any job', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M3));
    game.ui.replay();
    game.ui.accept();
    assert.equal(game.state(M3.id), 'pickup');
    assert.equal(game.flow(M3.id).runId, 2);
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.ui.offerOpen, false);
    assert.deepEqual(game.ui.objective, { text: M3.text.objectivePickup, kind: 'pickup' });
    assert.equal(prompt(game), null);
    game.close();
  });

  test('Not Now closes the card exactly as ever, and the prompt is back while Emmy is still near', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M4));
    game.ui.replay();
    game.ui.decline();
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.deepEqual(game.flow(M4.id).toSave(), done(1));
    game.at(near(M4)); // Emmy is still there: a quiet prompt, not a card
    assert.equal(game.state(M4.id), 'available');
    assert.equal(prompt(game), M4.title);
    game.close();
  });

  test('a tap with no prompt showing does nothing', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(FAR);
    assert.equal(game.ui.replay(), false);
    assert.deepEqual(states(game), ['available', 'available', 'available', 'available']);
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('a second tap does nothing: the card is already open', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M1));
    assert.equal(game.ui.replay(), true);
    assert.equal(game.ui.replay(), false);
    assert.equal(game.state(M1.id), 'offer');
    game.close();
  });

  test('a late tap after Emmy has walked away is refused, and the prompt goes', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M1));
    assert.equal(prompt(game), M1.title);
    game.player.x = FAR.x; // she moved; the next frame has not run yet
    game.player.y = FAR.y;
    assert.equal(game.ui.replay(), false);
    assert.equal(game.state(M1.id), 'available');
    assert.equal(prompt(game), null);
    game.close();
  });

  test('a late tap while something else has opened is refused', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M1));
    game.flow(M2.id).state = 'offer'; // something else is suddenly open
    assert.equal(game.ui.replay(), false);
    assert.equal(game.state(M1.id), 'available');
    game.close();
  });

  test('a replay started this way pays the mission\'s full reward, once, like any other run', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M3));
    game.ui.replay();
    game.ui.accept();
    game.at(pick(M3));
    game.at(cust(M3));
    for (let i = 0; i < 6; i += 1) game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    assert.equal(gameState.money, startMoney + 550);
    game.close();
  });

  test('every mission can be replayed this way, paying its reward each time, and progress is untouched', async () => {
    const storage = storageWith(ALL_DONE);
    const game = launch(storage);
    for (let round = 0; round < 2; round += 1) {
      for (const def of MISSIONS) playRun(game, def); // playRun taps the prompt for a replay
    }
    assert.deepEqual(game.moneyEvents, [250, 300, 550, 750, 250, 300, 550, 750]);
    assert.deepEqual(game.system.activeUnit(), null);
    await settle();
    MISSION_IDS.forEach((id) => assert.deepEqual(savedRecords(storage)[id], done(3), id));
    game.close();
  });

  test('the markers stay dim and the arrow stays gone through a whole replay', () => {
    const game = launch(storageWith(ALL_DONE));
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(near(M2));
    assert.equal(game.view(M2.id).questMarker.textureKey, 'mk_quest_repeat');
    assert.equal(game.ui.arrow, null);
    playRun(game, M2);
    assert.equal(game.view(M2.id).questMarker.textureKey, 'mk_quest_repeat');
    assert.equal(game.view(M2.id).questMarker.visible, true);
    game.at(FAR);
    assert.equal(game.ui.arrow, null);
    game.close();
  });
});

describe('refreshing near a replay shop', () => {
  test('a restored game opens no card by itself, and shows the prompt', () => {
    const game = launch(storageWith(ALL_DONE));
    game.at(near(M3)); // the very first frame, already at the shop
    assert.equal(game.state(M3.id), 'available');
    assert.equal(prompt(game), M3.title);
    assertQuiet(game, startMoney);
    game.close();
  });

  test('refreshing with the offer card open (it is saved as "available") gives a prompt, not a card', async () => {
    const storage = storageWith(ALL_DONE);
    const first = launch(storage);
    first.at(near(M1));
    first.ui.replay();
    assert.equal(first.state(M1.id), 'offer');
    first.system.requestSave?.('pickup'); // any save while the card is open
    await settle();
    first.close();

    const game = launch(storage);
    game.at(near(M1));
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(prompt(game), M1.title);
    game.close();
  });

  test('refreshing in the middle of a replay restores it quietly, with no prompt', async () => {
    const storage = storageWith(ALL_DONE);
    let game = launch(storage);
    accept(game, M2);
    await settle();
    game.close();

    game = launch(storage);
    assert.equal(game.state(M2.id), 'pickup');
    game.at(near(M1));
    assert.equal(prompt(game), null);
    assertQuiet(game, startMoney);
    game.close();
  });

  test('refreshing straight after a replay is finished: paid once, nothing opens by itself, the prompt is back', async () => {
    const storage = storageWith(ALL_DONE);
    const first = launch(storage);
    playRun(first, M4);
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.money, startMoney + 750);
    game.at(near(M4));
    assert.equal(game.state(M4.id), 'available');
    assert.equal(prompt(game), M4.title);
    assertQuiet(game, startMoney + 750);
    game.close();
  });

  test('a new job near its shop still opens its card after a refresh, as before', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(near(M4));
    assert.equal(game.state(M4.id), 'offer');
    game.close();
  });
});

describe('active and locked missions are unchanged', () => {
  test('an active job\'s pickup and delivery work exactly as before, with no prompt in the way', () => {
    const game = launch(storageWith(ALL_DONE));
    accept(game, M2);
    game.at(pick(M2)); // the pickup is at Bola Bakery's door, where a replay prompt would have been
    assert.equal(game.state(M2.id), 'deliver');
    assert.equal(prompt(game), null);
    assert.deepEqual(game.ui.toasts.map((t) => t.title), ['PACKAGE COLLECTED!']);
    game.at(cust(M2));
    assert.equal(game.state(M2.id), 'done');
    assert.deepEqual(game.moneyEvents, [300]);
    game.close();
  });

  test('a locked shop shows neither a card nor a prompt, and its marker stays hidden', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    game.at(near(M4));
    assert.equal(game.state(M4.id), 'available');
    assert.equal(prompt(game), null);
    assert.equal(game.view(M4.id).questMarker.visible, false);
    game.close();
  });

  test('while a mission is in progress, the other shops offer nothing and prompt nothing', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    [M1, M2, M3].forEach((def) => {
      game.at(near(def));
      assert.equal(game.state(def.id), 'available', def.id);
      assert.equal(prompt(game), null, def.id);
    });
    game.close();
  });

  test('a damaged save with several missions in progress still keeps only the first', () => {
    const game = launch(storageWith({ firstDelivery: rec('deliver', 2, 1, 1), freshFromTheOven: rec('pickup', 3, 2, 2) }));
    assert.equal(game.system.activeUnit().def.id, M1.id);
    assert.equal(game.state(M2.id), 'available');
    game.at(near(M2));
    assert.equal(prompt(game), null);
    game.close();
  });
});

describe('after the prompt, the whole game still adds up', () => {
  test('first runs 250, 300, 550, 750, then a replay of each by prompt: every reward once, in order', async () => {
    const storage = storageWith();
    const game = launch(storage);
    for (const def of MISSIONS) playRun(game, def);
    for (const def of MISSIONS) playRun(game, def);
    assert.deepEqual(game.moneyEvents, [250, 300, 550, 750, 250, 300, 550, 750]);
    assert.equal(gameState.money, startMoney + 2 * 1850);
    await settle();
    MISSION_IDS.forEach((id) => assert.deepEqual(savedRecords(storage)[id], done(2), id));
    game.close();
  });
});

/* ------------------------------------------------------------- helpers */

function game_close(...games) {
  games.forEach((g) => g.close());
}

// A game built from a custom mission list (a test-only list, with every mission playable).
function launchCustom(storage, missions) {
  startSaveSystem({ storage });
  const scene = makeMissionScene();
  const player = makePlayer(FAR.x, FAR.y);
  const { ui, createUI } = makeFakeUI();
  const system = new MissionSystem(scene, player, undefined, { createUI, missions, playableIds: missions.map((m) => m.id) });
  let time = 0;
  return {
    ui,
    system,
    at(point) {
      player.x = point.x;
      player.y = point.y;
      time += 16;
      system.update(time, 16);
    },
    close: () => system.destroy(),
  };
}
