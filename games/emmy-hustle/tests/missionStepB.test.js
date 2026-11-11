// Stage 3, step B: Suya for the Hall (suyaForTheHall) is playable, after Fresh From the Oven.
// Built exactly as the game builds it (no options). (Across Orisun Close was switched on in step C:
// see missionStepC.test.js.)
// Real: MissionSystem, MissionFlow, the save system, GameState, the data, the textures.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSIONS, MISSION_IDS, PLAYABLE_MISSION_IDS, CUSTOMER_LOOK, FIRST_DELIVERY, FRESH_FROM_THE_OVEN, SUYA_FOR_THE_HALL, naira,
} from '../src/missions/missionData.js';
import { CUSTOMER_LOOKS } from '../src/missions/missionTextures.js';
import {
  startMoney, FAR, settle, door, pick, cust, rec, done, DEFAULT, storageWith, savedRecords,
  launch, accept, playRun, assertQuiet, gameState,
} from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const OPEN_3 = { firstDelivery: done(1), freshFromTheOven: done(1) }; // missions 1 and 2 delivered: mission 3 is unlocked
const TOTAL_1_2_3 = 250 + 300 + 550;

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

describe('the definition is the approved one', () => {
  test('id, places, reward and wording', () => {
    assert.equal(M3, SUYA_FOR_THE_HALL);
    assert.equal(M3.id, 'suyaForTheHall');
    assert.equal(M3.title, 'Suya for the Hall');
    assert.equal(M3.reward, 550);
    assert.deepEqual(M3.shop.door, { x: 420, y: 1664 });
    assert.deepEqual({ x: M3.pickup.x, y: M3.pickup.y }, { x: 420, y: 1664 });
    assert.deepEqual(M3.customer, { name: 'Mr. Okafor', x: 1830, y: 1174, radius: 44 });
    assert.equal(M3.text.offerTitle, 'WATERSIDE SUYA SPOT');
    assert.equal(M3.text.offerBody, "The Community Hall crowd is hungry! Take this suya to Mr. Okafor while it's hot.");
    assert.equal(M3.text.objectivePickup, 'Pick up the suya at Waterside Suya Spot');
    assert.equal(M3.text.objectiveDeliver, 'Deliver the suya to Mr. Okafor at the Community Hall');
    assert.equal(M3.text.collectedBody, 'Now take it to Mr. Okafor at the Hall.');
    assert.equal(M3.text.offerReward, `Reward: ${naira(550)}`);
  });

  test('the earlier missions are untouched: ids, rewards and customers', () => {
    assert.deepEqual(MISSIONS.map((m) => [m.id, m.reward]), [
      ['firstDelivery', 250], ['freshFromTheOven', 300], ['suyaForTheHall', 550], ['acrossOrisunClose', 750],
    ]);
    assert.equal(M1.customer.name, 'Mrs. Folake');
    assert.equal(M2.customer.name, 'Mama Ngozi');
    assert.equal(CUSTOMER_LOOK.firstDelivery, 'folake');
    assert.equal(CUSTOMER_LOOK.freshFromTheOven, 'ngozi');
  });

  test('it is switched on, in order, after the first two', () => {
    assert.deepEqual([...PLAYABLE_MISSION_IDS].slice(0, 3), ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall']);
  });
});

describe('unlock order', () => {
  test('a new game: Suya for the Hall is locked, with no offer and no marker', () => {
    const game = launch(storageWith());
    game.at(door(M3));
    game.at(door(M3));
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.view(M3.id).questMarker.visible, false);
    assert.equal(game.system.unlockedIds.has(M3.id), false);
    game.close();
  });

  test('delivering only the first mission does NOT unlock it (the second must be delivered too)', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    assert.equal(game.system.unlockedIds.has(M2.id), true);
    assert.equal(game.system.unlockedIds.has(M3.id), false);
    game.at(door(M3));
    game.at(door(M3));
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.view(M3.id).questMarker.visible, false);
    game.close();
  });

  test('playing the first mission and then the second unlocks it, one step at a time', () => {
    const game = launch(storageWith());
    playRun(game, M1);
    assert.equal(game.system.unlockedIds.has(M3.id), false);
    playRun(game, M2);
    assert.equal(game.system.unlockedIds.has(M3.id), true);
    assert.equal(game.system.unlockedIds.has(M4.id), false);
    game.close();
  });

  test('unlocking it does not accept it: it waits at its shop, unstarted, with its marker showing', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const game = launch(storage);
    playRun(game, M2);
    assert.equal(game.view(M3.id).questMarker.visible, true);
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.flow(M3.id).runId, 0);
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.ui.offerOpen, false);
    await settle();
    assert.deepEqual(savedRecords(storage).suyaForTheHall, DEFAULT);
    game.close();
  });

  test('the offer opens only when Emmy walks to the Suya Spot, with the approved card', () => {
    const game = launch(storageWith(OPEN_3));
    game.at(door(M3));
    assert.equal(game.state(M3.id), 'offer');
    assert.equal(game.ui.offerOpen, true);
    assert.equal(game.player.inputLocked, true);
    assert.equal(game.ui.offerText.offerTitle, 'WATERSIDE SUYA SPOT');
    assert.equal(game.ui.offerText.offerBody, M3.text.offerBody);
    assert.equal(game.ui.offerText.offerReward, `Reward: ${naira(550)}`);
    assert.equal(game.flow(M3.id).runId, 0, 'the card is open but nothing has been accepted');
    game.close();
  });

  test('Not Now leaves it unstarted, and walking away and back offers it again', () => {
    const game = launch(storageWith(OPEN_3));
    game.at(door(M3));
    game.ui.decline();
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.player.inputLocked, false);
    game.at(door(M3)); // still standing there: not offered again at once
    assert.equal(game.state(M3.id), 'available');
    game.at(FAR);
    game.at(door(M3));
    assert.equal(game.state(M3.id), 'offer');
    game.close();
  });

  test('replaying the earlier missions never unlocks it again or changes it', async () => {
    const storage = storageWith(OPEN_3);
    const game = launch(storage);
    playRun(game, M1);
    playRun(game, M2);
    playRun(game, M2);
    assert.deepEqual(game.flow(M3.id).toSave(), DEFAULT);
    assert.equal(game.system.unlockedIds.has(M3.id), true);
    await settle();
    assert.deepEqual(savedRecords(storage).suyaForTheHall, DEFAULT);
    game.close();
  });
});

describe('Mr. Okafor', () => {
  test('is drawn with his own picture, different from Mrs. Folake and Mama Ngozi', () => {
    const game = launch(storageWith());
    const keys = [M1, M2, M3].map((m) => game.view(m.id).customer.key);
    assert.deepEqual(keys, ['customer', 'customer_ngozi', 'customer_okafor']);
    assert.equal(new Set(keys).size, 3);
    game.close();
  });

  test('waits at the Community Hall door once the job is accepted', () => {
    const game = launch(storageWith(OPEN_3));
    assert.equal(game.view(M3.id).customer.visible, false, 'not before the job is accepted');
    accept(game, M3);
    const view = game.view(M3.id);
    assert.equal(view.customer.visible, true);
    assert.deepEqual([view.customer.x, view.customer.y], [1830, 1174]);
    assert.equal(game.view(M1.id).customer.visible, false);
    assert.equal(game.view(M2.id).customer.visible, false);
    game.close();
  });
});

describe('playing it', () => {
  test('accepting shows the pickup objective, the blue ring at the Suya Spot and Mr. Okafor waiting', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    assert.deepEqual(game.ui.objective, { text: 'Pick up the suya at Waterside Suya Spot', kind: 'pickup' });
    const view = game.view(M3.id);
    assert.deepEqual([view.pickupRing.x, view.pickupRing.y], [420, 1664]);
    assert.equal(view.pickupRing.visible, true);
    assert.equal(view.pickupArrow.visible, true);
    assert.equal(view.customerRing.visible, false);
    assert.equal(game.system.package.visible, false);
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('collecting the suya shows the approved notice, the new objective and the existing package icon', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    game.at(pick(M3));
    assert.equal(game.state(M3.id), 'deliver');
    assert.deepEqual(game.ui.toasts, [{ title: 'PACKAGE COLLECTED!', body: 'Now take it to Mr. Okafor at the Hall.', kind: 'pickup' }]);
    assert.deepEqual(game.ui.objective, { text: 'Deliver the suya to Mr. Okafor at the Community Hall', kind: 'deliver' });
    assert.equal(game.system.package.visible, true);
    assert.equal(game.system.package.key, 'pkg');
    const view = game.view(M3.id);
    assert.equal(view.customerRing.visible, true);
    assert.equal(view.customerArrow.visible, true);
    assert.equal(view.pickupRing.visible, false);
    game.close();
  });

  test('delivering to Mr. Okafor pays exactly N550 once', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    game.at(pick(M3));
    game.ui.toasts.length = 0;
    game.at(cust(M3));
    for (let i = 0; i < 6; i += 1) game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    assert.equal(gameState.money, startMoney + 550);
    assert.deepEqual(game.ui.toasts, [{ title: 'DELIVERY COMPLETED!', body: '+\u20A6550', kind: 'done' }]);
    assert.deepEqual(game.scene.popups.map((p) => p.text), ['+\u20A6550']);
    assert.equal(game.system.package.visible, false);
    game.close();
  });

  test('reaching the Community Hall without the suya delivers nothing', () => {
    const game = launch(storageWith(OPEN_3));
    game.at(cust(M3));
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, []);
    assert.equal(game.state(M3.id), 'available');
    game.close();
  });

  test('the three live missions use their own markers, rings and customers', () => {
    const game = launch(storageWith(OPEN_3));
    const views = [M1, M2, M3].map((m) => game.view(m.id));
    ['questMarker', 'pickupRing', 'pickupArrow', 'customer', 'customerShadow', 'customerRing', 'customerArrow'].forEach((part) => {
      assert.equal(new Set(views.map((v) => v[part])).size, 3, part);
    });
    assert.deepEqual(views.map((v) => v.questMarker.x), [M1.shop.marker.x, M2.shop.marker.x, M3.shop.marker.x]);
    game.close();
  });
});

describe('one mission at a time', () => {
  test('while Suya for the Hall is in progress, the other shops cannot offer and only its markers show', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    [M1, M2].forEach((def) => {
      game.at(door(def));
      game.at(door(def));
      assert.equal(game.state(def.id), 'available', def.id);
      assert.equal(game.view(def.id).questMarker.visible, false, def.id);
      assert.equal(game.view(def.id).customer.visible, false, def.id);
    });
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.view(M3.id).questMarker.visible, false);
    assert.equal(game.view(M3.id).customer.visible, true);
    game.close();
  });

  test('the same holds in the delivery stage', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    game.at(pick(M3));
    game.at(door(M1));
    game.at(door(M2));
    assert.equal(game.state(M1.id), 'available');
    assert.equal(game.state(M2.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('while another mission is in progress, the Suya Spot cannot offer', () => {
    [M1, M2].forEach((def) => {
      const game = launch(storageWith(OPEN_3));
      accept(game, def);
      game.at(door(M3));
      game.at(door(M3));
      assert.equal(game.state(M3.id), 'available', def.id);
      assert.equal(game.ui.offerOpen, false, def.id);
      assert.equal(game.view(M3.id).questMarker.visible, false, def.id);
      game.close();
    });
  });

  test('only the active flow is updated, and Across Orisun Close never is', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(door(M1));
    game.at(pick(M3));
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 0, 2, 0]);
    game.close();
  });

  test('with nothing in progress and every mission unlocked, only the new job is checked (replays are chosen with the prompt)', () => {
    const game = launch(storageWith({ ...OPEN_3, suyaForTheHall: done(1) }));
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(FAR);
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 0, 0, 1]);
    game.close();
  });

  test('the shops are far apart: only the right shop offers at each place', () => {
    const game = launch(storageWith(OPEN_3));
    game.at(cust(M3)); // the Community Hall
    game.at(cust(M2)); // Mama Ngozi's shop
    game.at(cust(M1)); // Unity Square
    MISSIONS.forEach((def) => assert.equal(game.state(def.id), 'available', def.id));
    game.at(door(M3));
    assert.deepEqual(MISSION_IDS.map((id) => game.state(id)), ['available', 'available', 'offer', 'available']);
    game.close();
  });
});

describe('the objective arrow', () => {
  test('after only the first mission, it points at Bola Bakery', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    assert.equal(game.system.newJobId, M2.id);
    const target = game.system.currentTarget();
    assert.deepEqual({ x: target.x, y: target.y }, { x: M2.shop.marker.x, y: M2.shop.marker.y });
    game.close();
  });

  test('once the second mission is delivered, it points at the Suya Spot, not at an earlier shop', () => {
    const game = launch(storageWith(OPEN_3));
    game.at(FAR);
    assert.equal(game.system.newJobId, M3.id);
    const target = game.system.currentTarget();
    assert.equal(target.kind, 'offer');
    assert.deepEqual({ x: target.x, y: target.y }, { x: M3.shop.marker.x, y: M3.shop.marker.y });
    game.scene.camera.worldView = { x: 0, y: 0 }; // the shop is off screen
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'offer');
    game.close();
  });

  test('the arrow moves to the Suya Spot right after the second mission is delivered, in the same session', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    playRun(game, M2);
    assert.equal(game.system.newJobId, M3.id);
    const target = game.system.currentTarget();
    assert.deepEqual({ x: target.x, y: target.y }, { x: M3.shop.marker.x, y: M3.shop.marker.y });
    game.close();
  });

  test('during the job it points at the pickup, then at Mr. Okafor', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'pickup');
    assert.deepEqual(game.system.currentTarget(), { x: 420, y: 1664 - 30, kind: 'pickup' });
    game.at(pick(M3));
    game.at(pick(M3));
    assert.equal(game.ui.arrow?.kind, 'deliver');
    assert.deepEqual(game.system.currentTarget(), { x: 1830, y: 1174 - 40, kind: 'deliver' });
    game.close();
  });

  test('there is no arrow while the offer card is open or the delivered banner is showing', () => {
    const game = launch(storageWith(OPEN_3));
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(door(M3));
    assert.equal(game.system.currentTarget(), null);
    game.ui.accept();
    game.at(pick(M3));
    game.at(cust(M3));
    assert.equal(game.state(M3.id), 'done');
    assert.equal(game.system.currentTarget(), null);
    game.close();
  });

  test('once Suya for the Hall is delivered, the arrow points at the next job, Ade Mobile Fix', () => {
    const game = launch(storageWith({ ...OPEN_3, suyaForTheHall: done(1) }));
    game.at(FAR);
    assert.equal(game.system.newJobId, M4.id);
    const target = game.system.currentTarget();
    assert.deepEqual({ x: target.x, y: target.y }, { x: M4.shop.marker.x, y: M4.shop.marker.y });
    game.close();
  });
});

describe('replaying it', () => {
  test('three runs pay 550 each, and nothing else in the save moves', async () => {
    const storage = storageWith(OPEN_3);
    const game = launch(storage);
    for (let run = 1; run <= 3; run += 1) {
      playRun(game, M3);
      assert.equal(gameState.money, startMoney + 550 * run, `run ${run}`);
    }
    assert.deepEqual(game.moneyEvents, [550, 550, 550]);
    await settle();
    const saved = savedRecords(storage);
    assert.deepEqual(saved.suyaForTheHall, done(3));
    assert.deepEqual(saved.firstDelivery, done(1));
    assert.deepEqual(saved.freshFromTheOven, done(1));
    assert.deepEqual(saved.acrossOrisunClose, DEFAULT);
    game.close();
  });

  test('replaying never unlocks anything again or accepts anything', () => {
    const game = launch(storageWith({ ...OPEN_3, suyaForTheHall: done(1) }));
    const unlockedBefore = [...game.system.unlockedIds];
    playRun(game, M3);
    playRun(game, M1);
    playRun(game, M2);
    assert.deepEqual([...game.system.unlockedIds], unlockedBefore);
    assert.equal(game.system.activeUnit(), null);
    assert.deepEqual(game.flow(M4.id).toSave(), DEFAULT);
    game.close();
  });

  test('all three can be played in any order once unlocked, each paying its own reward', () => {
    const game = launch(storageWith(OPEN_3));
    playRun(game, M3);
    playRun(game, M1);
    playRun(game, M2);
    playRun(game, M3);
    assert.deepEqual(game.moneyEvents, [550, 250, 300, 550]);
    assert.equal(gameState.money, startMoney + 1650);
    game.close();
  });

  test('standing on the customer, or repeated completion attempts, pay once per run', () => {
    const game = launch(storageWith(OPEN_3));
    accept(game, M3);
    game.at(pick(M3));
    game.at(cust(M3));
    for (let i = 0; i < 10; i += 1) game.at(cust(M3));
    for (let i = 0; i < 5; i += 1) assert.equal(game.flow(M3.id).complete(), false);
    assert.deepEqual(game.moneyEvents, [550]);
    game.close();
  });
});

describe('saving and restoring', () => {
  test('accepting is saved by itself, without any money moving', async () => {
    const storage = storageWith(OPEN_3);
    const game = launch(storage);
    accept(game, M3);
    await settle();
    assert.deepEqual(savedRecords(storage).suyaForTheHall, rec('pickup', 1, 0, 0));
    game.close();
  });

  test('refreshing during pickup, again and again: back at the pickup, quietly', async () => {
    const storage = storageWith(OPEN_3);
    let game = launch(storage);
    accept(game, M3);
    await settle();
    game.close();
    for (let i = 1; i <= 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M3.id), 'pickup', `refresh ${i}`);
      assert.deepEqual(game.ui.objective, { text: M3.text.objectivePickup, kind: 'pickup' });
      assert.equal(game.view(M3.id).pickupRing.visible, true);
      assert.equal(game.view(M3.id).customer.key, 'customer_okafor');
      assert.equal(game.view(M1.id).questMarker.visible, false);
      assert.equal(game.view(M2.id).questMarker.visible, false);
      assertQuiet(game, startMoney);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(pick(M3));
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    game.close();
  });

  test('refreshing during delivery, again and again: still carrying the suya, no notice replayed', async () => {
    const storage = storageWith(OPEN_3);
    let game = launch(storage);
    accept(game, M3);
    game.at(pick(M3));
    await settle();
    game.close();
    for (let i = 1; i <= 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M3.id), 'deliver', `refresh ${i}`);
      assert.equal(game.system.package.visible, true);
      assert.deepEqual(game.ui.objective, { text: M3.text.objectiveDeliver, kind: 'deliver' });
      assert.equal(game.view(M3.id).customerRing.visible, true);
      assertQuiet(game, startMoney);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(cust(M3));
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    game.close();
  });

  test('refreshing immediately after completing it: paid once, still available, mission 4 unlocked but unstarted', async () => {
    const storage = storageWith(OPEN_3);
    const first = launch(storage);
    accept(first, M3);
    first.at(pick(M3));
    first.at(cust(M3));
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.money, startMoney + 550);
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.flow(M3.id).completed, 1);
    assert.equal(game.system.unlockedIds.has(M4.id), true);
    assert.equal(game.state(M4.id), 'available');
    assertQuiet(game, startMoney + 550);
    game.at(cust(M3));
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('refreshing after unlocking it (the second mission just finished): waiting, not started, not paid', async () => {
    const storage = storageWith({ firstDelivery: done(1) });
    const first = launch(storage);
    playRun(first, M2);
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(game.system.unlockedIds.has(M3.id), true);
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.flow(M3.id).runId, 0);
    assert.equal(game.view(M3.id).questMarker.visible, true);
    assert.equal(game.ui.objective, null);
    assert.equal(game.system.activeUnit(), null);
    assertQuiet(game, startMoney + 300);
    assert.equal(game.system.newJobId, M3.id);
    game.close();
  });

  test('refreshing in the middle of a replay and completing it pays once', async () => {
    const storage = storageWith({ ...OPEN_3, suyaForTheHall: done(2) });
    let game = launch(storage);
    accept(game, M3);
    await settle();
    game.close();

    game = launch(storage);
    assert.equal(game.state(M3.id), 'pickup');
    assert.deepEqual(game.flow(M3.id).toSave(), rec('pickup', 3, 2, 2));
    assertQuiet(game);
    game.at(pick(M3));
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    assert.equal(game.flow(M3.id).completed, 3);
    game.close();
  });

  test('a page lost before the queued save ran leaves money and mission in agreement', async () => {
    const storage = storageWith(OPEN_3);
    const first = launch(storage);
    accept(first, M3);
    first.at(pick(M3));
    await settle();
    first.at(cust(M3)); // paid in memory; the save is queued but never runs
    first.close();

    const game = launch(storage);
    assert.equal(game.state(M3.id), 'deliver');
    assert.equal(gameState.money, startMoney);
    game.at(cust(M3));
    assert.deepEqual(game.moneyEvents, [550]);
    game.close();
  });

  test('an older save (only the first two missions delivered) unlocks it, with nothing paid', () => {
    const game = launch(storageWith({ firstDelivery: done(7), freshFromTheOven: done(2) }, { money: 2000 }));
    assert.equal(game.system.unlockedIds.has(M3.id), true);
    assert.equal(game.state(M3.id), 'available');
    assertQuiet(game, 2000);
    game.close();
  });

  test('a damaged save with two missions in progress keeps the first in order and resets Suya, losing nothing', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: rec('deliver', 2, 1, 1), suyaForTheHall: rec('pickup', 4, 3, 3) });
    const game = launch(storage);
    assert.equal(game.system.activeUnit().def.id, M2.id);
    assert.deepEqual(game.flow(M3.id).toSave(), rec('available', 4, 3, 3));
    assertQuiet(game);
    await settle();
    assert.deepEqual(savedRecords(storage).suyaForTheHall, rec('available', 4, 3, 3));
    game.close();
  });

  test('a damaged save with Suya in progress but locked resets it: it cannot be played early', () => {
    const game = launch(storageWith({ firstDelivery: done(1), suyaForTheHall: rec('deliver', 1, 0, 0) })); // mission 2 not delivered
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.state(M3.id), 'available');
    assert.equal(game.system.package.visible, false);
    assertQuiet(game);
    game.close();
  });
});

describe('the whole sequence so far, with a refresh after every mission', () => {
  test('250, then 300, then 550, in order, each once', async () => {
    const storage = storageWith();
    let game = launch(storage);
    let total = startMoney;
    for (const def of [M1, M2, M3]) {
      playRun(game, def);
      total += def.reward;
      assert.equal(gameState.money, total, def.id);
      await settle();
      game.close();
      game = launch(storage); // refresh
      assert.equal(gameState.money, total, `after refreshing following ${def.id}`);
      assertQuiet(game, total);
    }
    assert.equal(total, startMoney + TOTAL_1_2_3);
    [M1, M2, M3].forEach((def) => assert.equal(game.flow(def.id).completed, 1, def.id));
    assert.deepEqual(game.flow(M4.id).toSave(), DEFAULT);
    game.close();
  });

  test('the four rewards in the data are exactly 250, 300, 550 and 750', () => {
    assert.deepEqual([FIRST_DELIVERY, FRESH_FROM_THE_OVEN, SUYA_FOR_THE_HALL, M4].map((m) => m.reward), [250, 300, 550, 750]);
  });
});
