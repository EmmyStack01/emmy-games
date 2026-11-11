// Stage 3, step A: Fresh From the Oven (freshFromTheOven) is playable, after The First Delivery.
// Built exactly as the game builds it (no options). (Suya for the Hall and Across Orisun Close were
// switched on in steps B and C: see missionStepB.test.js and missionStepC.test.js.) Real: MissionSystem, MissionFlow, the save system, GameState, the data.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, MISSION_IDS, FIRST_DELIVERY, FRESH_FROM_THE_OVEN, naira } from '../src/missions/missionData.js';
import {
  startMoney, FAR, settle, door, pick, cust, rec, done, DEFAULT, storageWith, savedRecords,
  launch, accept, playRun, assertQuiet, gameState,
} from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const M1_AND_2 = 250 + 300;

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

describe('the definition is the approved one', () => {
  test('id, places, reward and wording', () => {
    assert.equal(M2, FRESH_FROM_THE_OVEN);
    assert.equal(M2.id, 'freshFromTheOven');
    assert.equal(M2.title, 'Fresh From the Oven');
    assert.equal(M2.reward, 300);
    assert.deepEqual(M2.shop.door, { x: 1050, y: 554 });
    assert.deepEqual({ x: M2.pickup.x, y: M2.pickup.y }, { x: 1050, y: 554 });
    assert.deepEqual(M2.customer, { name: 'Mama Ngozi', x: 150, y: 554, radius: 44 });
    assert.equal(M2.text.offerTitle, 'BOLA BAKERY');
    assert.equal(M2.text.offerBody, "Mama Ngozi's bread is fresh from the oven. Rush it over to her shop while it's warm!");
    assert.equal(M2.text.objectivePickup, 'Pick up the bread at Bola Bakery');
    assert.equal(M2.text.objectiveDeliver, 'Deliver the bread to Mama Ngozi');
    assert.equal(M2.text.collectedBody, 'Now take it to Mama Ngozi.');
    assert.equal(M2.text.offerReward, `Reward: ${naira(300)}`);
  });
});

describe('the missions that are switched on', () => {
  test('every mission has pictures in the world', () => {
    const game = launch(storageWith());
    assert.deepEqual(game.system.units.map((u) => [u.def.id, u.playable]), [
      ['firstDelivery', true], ['freshFromTheOven', true], ['suyaForTheHall', true], ['acrossOrisunClose', true],
    ]);
    assert.ok(game.view(M1.id) && game.view(M2.id) && game.view(M3.id) && game.view(M4.id));
    game.close();
  });

});

describe('it is locked until The First Delivery has been delivered', () => {
  test('a new game: no offer at Bola Bakery, and no job marker there', () => {
    const game = launch(storageWith());
    game.at(door(M2));
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.view(M2.id).questMarker.visible, false);
    assert.equal(game.view(M1.id).questMarker.visible, true);
    game.close();
  });

  test('being at the shop while it is locked, then delivering the first mission, still does not open it', () => {
    const game = launch(storageWith());
    playRun(game, M1);
    // Emmy is now far away; the job is unlocked and waiting, but nothing was accepted
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).runId, 0);
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });
});

describe('unlocking it', () => {
  test('delivering The First Delivery once unlocks it at its shop and does not accept it', async () => {
    const storage = storageWith();
    const game = launch(storage);
    assert.equal(game.system.unlockedIds.has(M2.id), false);
    playRun(game, M1);
    assert.equal(game.system.unlockedIds.has(M2.id), true);
    assert.equal(game.view(M2.id).questMarker.visible, true);
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.system.activeUnit(), null);
    await settle();
    assert.deepEqual(savedRecords(storage).freshFromTheOven, DEFAULT);
    game.close();
  });

  test('the offer opens only when Emmy walks to Bola Bakery, with the approved card', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'offer');
    assert.equal(game.ui.offerOpen, true);
    assert.equal(game.player.inputLocked, true);
    assert.equal(game.ui.offerText.offerTitle, 'BOLA BAKERY');
    assert.equal(game.ui.offerText.offerBody, M2.text.offerBody);
    assert.equal(game.ui.offerText.offerReward, `Reward: ${naira(300)}`);
    assert.equal(game.flow(M2.id).runId, 0, 'the card is open but nothing has been accepted');
    game.close();
  });

  test('replaying The First Delivery does not unlock it again or change it', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const game = launch(storage);
    playRun(game, M1);
    playRun(game, M1);
    assert.equal(game.flow(M1.id).completed, 3);
    assert.deepEqual(game.flow(M2.id).toSave(), DEFAULT);
    await settle();
    assert.deepEqual(savedRecords(storage).freshFromTheOven, DEFAULT);
    game.close();
  });

  test('the arrow points at the new job: Bola Bakery, not the first shop', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    assert.equal(game.system.newJobId, M2.id);
    game.at(FAR);
    const target = game.system.currentTarget();
    assert.equal(target.kind, 'offer');
    assert.deepEqual({ x: target.x, y: target.y }, { x: M2.shop.marker.x, y: M2.shop.marker.y });
    game.scene.camera.worldView = { x: 0, y: 0 }; // the shop is off screen
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'offer');
    game.close();
  });

  test('before the first delivery, the arrow still points at Lagoon Mart', () => {
    const game = launch(storageWith());
    game.at(FAR);
    const target = game.system.currentTarget();
    assert.deepEqual({ x: target.x, y: target.y }, { x: M1.shop.marker.x, y: M1.shop.marker.y });
    game.close();
  });

  test('once every mission has been delivered there is no new job, and no arrow (a replay shop never gets one)', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1), acrossOrisunClose: done(1) }));
    game.scene.camera.worldView = { x: 0, y: 0 }; // every shop is off screen
    game.at(FAR);
    assert.equal(game.system.newJobId, null);
    assert.equal(game.system.currentTarget(), null);
    assert.equal(game.ui.arrow, null);
    game.close();
  });
});

describe('playing it', () => {
  test('accepting shows the pickup objective, the blue ring at Bola Bakery and Mama Ngozi waiting', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M2);
    assert.deepEqual(game.ui.objective, { text: 'Pick up the bread at Bola Bakery', kind: 'pickup' });
    const view = game.view(M2.id);
    assert.deepEqual([view.pickupRing.x, view.pickupRing.y], [1050, 554]);
    assert.equal(view.pickupRing.visible, true);
    assert.equal(view.pickupArrow.visible, true);
    assert.equal(view.customer.key, 'customer_ngozi');
    assert.deepEqual([view.customer.x, view.customer.y], [150, 554]);
    assert.equal(view.customer.visible, true);
    assert.equal(view.customerRing.visible, false);
    assert.equal(game.system.package.visible, false);
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('collecting the bread shows the approved notice, the new objective and the existing package icon', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M2);
    game.at(pick(M2));
    assert.equal(game.state(M2.id), 'deliver');
    assert.deepEqual(game.ui.toasts, [{ title: 'PACKAGE COLLECTED!', body: 'Now take it to Mama Ngozi.', kind: 'pickup' }]);
    assert.deepEqual(game.ui.objective, { text: 'Deliver the bread to Mama Ngozi', kind: 'deliver' });
    assert.equal(game.system.package.visible, true);
    assert.equal(game.system.package.key, 'pkg');
    const view = game.view(M2.id);
    assert.equal(view.customerRing.visible, true);
    assert.equal(view.customerArrow.visible, true);
    assert.equal(view.pickupRing.visible, false);
    game.close();
  });

  test('delivering to Mama Ngozi pays exactly N300 once', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M2);
    game.at(pick(M2));
    game.ui.toasts.length = 0;
    game.at(cust(M2));
    for (let i = 0; i < 6; i += 1) game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, [300]);
    assert.equal(gameState.money, startMoney + 300);
    assert.deepEqual(game.ui.toasts, [{ title: 'DELIVERY COMPLETED!', body: '+\u20A6300', kind: 'done' }]);
    assert.deepEqual(game.scene.popups.map((p) => p.text), ['+\u20A6300']);
    assert.equal(game.system.package.visible, false);
    game.close();
  });

  test('Mama Ngozi looks different from Mrs. Folake, and each keeps her own picture', () => {
    const game = launch(storageWith());
    assert.equal(game.view(M1.id).customer.key, 'customer');
    assert.equal(game.view(M2.id).customer.key, 'customer_ngozi');
    assert.notEqual(game.view(M1.id).customer.key, game.view(M2.id).customer.key);
    game.close();
  });

  test('the two missions use their own markers, rings and customers', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    const a = game.view(M1.id);
    const b = game.view(M2.id);
    ['questMarker', 'pickupRing', 'pickupArrow', 'customer', 'customerShadow', 'customerRing', 'customerArrow'].forEach((part) => {
      assert.notEqual(a[part], b[part], part);
    });
    assert.deepEqual([a.questMarker.x, b.questMarker.x], [M1.shop.marker.x, M2.shop.marker.x]);
    game.close();
  });
});

describe('one mission at a time', () => {
  test('while Fresh From the Oven is in progress, Lagoon Mart cannot offer and only Mama Ngozi\'s markers show', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M2);
    game.at(door(M1));
    game.at(door(M1));
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.view(M1.id).questMarker.visible, false);
    assert.equal(game.view(M2.id).questMarker.visible, false);
    assert.equal(game.view(M1.id).customer.visible, false);
    assert.equal(game.view(M2.id).customer.visible, true);
    game.close();
  });

  test('while The First Delivery is in progress, Bola Bakery cannot offer', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M1);
    game.at(door(M2));
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.view(M2.id).questMarker.visible, false);
    game.close();
  });

  test('only the active mission is updated', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M2);
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(door(M1));
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 1, 0, 0]);
    game.close();
  });

  test('the shops are far enough apart that nothing opens or is prompted at the wrong place', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    game.at(cust(M1)); // Unity Square
    game.at(cust(M2)); // Mama Ngozi's shop
    assert.equal(game.ui.replayPrompt, null);
    game.at(pick(M1));
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.state(M1.id), 'available'); // Lagoon Mart is a replay: it prompts, it does not open
    assert.equal(game.ui.replayPrompt?.title, M1.title);
    game.at(door(M2));
    assert.equal(game.state(M2.id), 'offer'); // Bola Bakery is the new job: it opens its card
    assert.equal(game.ui.replayPrompt, null);
    game.close();
  });
});

describe('replaying it', () => {
  test('three runs pay 300 each, and nothing else in the save moves', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const game = launch(storage);
    for (let run = 1; run <= 3; run += 1) {
      playRun(game, M2);
      assert.equal(gameState.money, startMoney + 300 * run, `run ${run}`);
    }
    assert.deepEqual(game.moneyEvents, [300, 300, 300]);
    await settle();
    const saved = savedRecords(storage);
    assert.deepEqual(saved.freshFromTheOven, done(3));
    assert.deepEqual(saved.firstDelivery, done(1));
    assert.deepEqual(saved.suyaForTheHall, DEFAULT);
    assert.deepEqual(saved.acrossOrisunClose, DEFAULT);
    game.close();
  });

  test('replaying a completed mission never unlocks anything again or accepts anything', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) }));
    const unlockedBefore = [...game.system.unlockedIds];
    playRun(game, M2);
    playRun(game, M1);
    assert.deepEqual([...game.system.unlockedIds], unlockedBefore);
    assert.equal(game.system.activeUnit(), null);
    [M3, M4].forEach((def) => assert.deepEqual(game.flow(def.id).toSave(), DEFAULT, def.id));
    game.close();
  });

  test('both missions can be played in any order once unlocked, each paying its own reward', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    playRun(game, M2);
    playRun(game, M1);
    playRun(game, M2);
    assert.deepEqual(game.moneyEvents, [300, 250, 300]);
    assert.equal(gameState.money, startMoney + 850);
    game.close();
  });
});

describe('saving and restoring', () => {
  test('accepting is saved by itself, without any money moving', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const game = launch(storage);
    accept(game, M2);
    await settle();
    assert.deepEqual(savedRecords(storage).freshFromTheOven, rec('pickup', 1, 0, 0));
    game.close();
  });

  test('refreshing during pickup, again and again: back at the pickup, quietly', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    let game = launch(storage);
    accept(game, M2);
    await settle();
    game.close();
    for (let i = 1; i <= 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M2.id), 'pickup', `refresh ${i}`);
      assert.deepEqual(game.ui.objective, { text: M2.text.objectivePickup, kind: 'pickup' });
      assert.equal(game.view(M2.id).pickupRing.visible, true);
      assert.equal(game.view(M2.id).customer.key, 'customer_ngozi');
      assert.equal(game.view(M1.id).questMarker.visible, false);
      assertQuiet(game, startMoney);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(pick(M2));
    game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, [300]);
    game.close();
  });

  test('refreshing during delivery, again and again: still carrying the bread, no notice replayed', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    let game = launch(storage);
    accept(game, M2);
    game.at(pick(M2));
    await settle();
    game.close();
    for (let i = 1; i <= 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M2.id), 'deliver', `refresh ${i}`);
      assert.equal(game.system.package.visible, true);
      assert.deepEqual(game.ui.objective, { text: M2.text.objectiveDeliver, kind: 'deliver' });
      assert.equal(game.view(M2.id).customerRing.visible, true);
      assertQuiet(game, startMoney);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(cust(M2));
    game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, [300]);
    game.close();
  });

  test('refreshing immediately after completing it: paid once, still available, nothing replayed', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const first = launch(storage);
    accept(first, M2);
    first.at(pick(M2));
    first.at(cust(M2));
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.money, startMoney + 300);
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).completed, 1);
    assertQuiet(game, startMoney + 300);
    game.at(cust(M2));
    game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('refreshing after unlocking it (the first delivery just finished): it is waiting, not started, not paid', async () => {
    const storage = storageWith();
    const first = launch(storage);
    playRun(first, M1);
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(game.system.unlockedIds.has(M2.id), true);
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.flow(M2.id).runId, 0);
    assert.equal(game.view(M2.id).questMarker.visible, true);
    assert.equal(game.ui.objective, null);
    assert.equal(game.system.activeUnit(), null);
    assertQuiet(game, startMoney + 250);
    game.close();
  });

  test('refreshing in the middle of a replay and completing it pays once', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: done(2) });
    let game = launch(storage);
    accept(game, M2);
    await settle();
    game.close();

    game = launch(storage);
    assert.equal(game.state(M2.id), 'pickup');
    assert.deepEqual(game.flow(M2.id).toSave(), rec('pickup', 3, 2, 2));
    assertQuiet(game);
    game.at(pick(M2));
    game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, [300]);
    assert.equal(game.flow(M2.id).completed, 3);
    game.close();
  });

  test('a page lost before the queued save ran leaves money and mission in agreement', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const first = launch(storage);
    accept(first, M2);
    first.at(pick(M2));
    await settle();
    first.at(cust(M2)); // paid in memory; the save is queued but never runs
    first.close();

    const game = launch(storage);
    assert.equal(game.state(M2.id), 'deliver');
    assert.equal(gameState.money, startMoney);
    game.at(cust(M2));
    assert.deepEqual(game.moneyEvents, [300]);
    game.close();
  });

  test('an old save with only the first mission completed unlocks it, with nothing paid', () => {
    const game = launch(storageWith({ firstDelivery: done(7) }, { money: 1500 }));
    assert.equal(game.system.unlockedIds.has(M2.id), true);
    assert.equal(game.state(M2.id), 'available');
    assertQuiet(game, 1500);
    game.close();
  });

  test('a damaged save with both missions in progress keeps the first and resets the second, losing nothing', async () => {
    const storage = storageWith({ firstDelivery: rec('deliver', 2, 1, 1), freshFromTheOven: rec('pickup', 3, 2, 2) });
    const game = launch(storage);
    assert.equal(game.system.activeUnit().def.id, M1.id);
    assert.deepEqual(game.flow(M2.id).toSave(), rec('available', 3, 2, 2));
    assertQuiet(game);
    await settle();
    assert.deepEqual(savedRecords(storage).freshFromTheOven, rec('available', 3, 2, 2));
    game.close();
  });
});

describe('the whole sequence so far, with a refresh at every step', () => {
  test('first delivery, then Fresh From the Oven: 250 then 300, in order, each once', async () => {
    const storage = storageWith();
    let game = launch(storage);
    playRun(game, M1);
    await settle();
    game.close();

    game = launch(storage);
    assert.equal(gameState.money, startMoney + 250);
    playRun(game, M2);
    assert.equal(gameState.money, startMoney + M1_AND_2);
    await settle();
    game.close();

    game = launch(storage);
    assert.equal(gameState.money, startMoney + M1_AND_2);
    assert.equal(game.flow(M1.id).completed, 1);
    assert.equal(game.flow(M2.id).completed, 1);
    assertQuiet(game, startMoney + M1_AND_2);
    game.close();
  });
});
