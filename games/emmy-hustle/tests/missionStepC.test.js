// Stage 3, step C: Across Orisun Close (acrossOrisunClose) is playable, after Suya for the Hall.
// All four missions are now playable. Built exactly as the game builds it (no options).
// Real: MissionSystem, MissionFlow, the save system, GameState, the data, the textures.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSIONS, MISSION_IDS, PLAYABLE_MISSION_IDS, CUSTOMER_LOOK, ACROSS_ORISUN_CLOSE, naira,
} from '../src/missions/missionData.js';
import { CUSTOMER_LOOKS } from '../src/missions/missionTextures.js';
import { COINS } from '../src/data/neighbourhood.js';
import {
  startMoney, FAR, settle, door, pick, cust, rec, done, DEFAULT, storageWith, savedRecords,
  launch, accept, playRun, assertQuiet, gameState,
} from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const OPEN_4 = { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1) }; // missions 1 to 3 delivered: mission 4 is unlocked
const ALL_DONE = { ...OPEN_4, acrossOrisunClose: done(1) };
const TOTAL = 250 + 300 + 550 + 750;
const states = (game) => MISSION_IDS.map((id) => game.state(id));
const markers = (game) => MISSION_IDS.map((id) => game.view(id).questMarker.visible);
const targetOf = (game) => {
  const t = game.system.currentTarget();
  return t && { x: t.x, y: t.y, kind: t.kind };
};
const markerTarget = (def) => ({ x: def.shop.marker.x, y: def.shop.marker.y, kind: 'offer' });

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

describe('the definition is the approved one', () => {
  test('id, places, reward and wording', () => {
    assert.equal(M4, ACROSS_ORISUN_CLOSE);
    assert.equal(M4.id, 'acrossOrisunClose');
    assert.equal(M4.title, 'Across Orisun Close');
    assert.equal(M4.reward, 750);
    assert.deepEqual(M4.shop.door, { x: 2080, y: 554 });
    assert.deepEqual({ x: M4.pickup.x, y: M4.pickup.y }, { x: 2080, y: 554 });
    assert.deepEqual(M4.customer, { name: 'Aunty Kemi', x: 250, y: 1176, radius: 44 });
    assert.equal(M4.text.offerTitle, 'ADE MOBILE FIX');
    assert.equal(M4.text.offerBody, "Aunty Kemi at Emmy's Corner Shop has waited all week for this phone part. Long walk!");
    assert.equal(M4.text.objectivePickup, 'Pick up the phone part at Ade Mobile Fix');
    assert.equal(M4.text.objectiveDeliver, "Deliver the part to Aunty Kemi at Emmy's Corner Shop");
    assert.equal(M4.text.collectedBody, "Now take it to Aunty Kemi at Emmy's shop.");
    assert.equal(M4.text.offerReward, `Reward: ${naira(750)}`);
  });

  test('Aunty Kemi is waiting at the shop: nothing the player reads says she owns or manages it', () => {
    const words = ['owner', 'owns', 'own ', 'manager', 'manages', 'manage ', 'runs', 'her shop', 'boss', 'proprietor'];
    const shown = [M4.text.offerBody, M4.text.objectivePickup, M4.text.objectiveDeliver, M4.text.collectedBody, M4.text.doneBody, M4.text.offerTitle].join(' | ').toLowerCase();
    words.forEach((word) => assert.ok(!shown.includes(word), `must not say "${word}"`));
    assert.ok(shown.includes('aunty kemi'));
  });

  test('all four missions keep their ids, order and rewards, exactly', () => {
    assert.deepEqual(MISSIONS.map((m) => [m.id, m.reward]), [
      ['firstDelivery', 250], ['freshFromTheOven', 300], ['suyaForTheHall', 550], ['acrossOrisunClose', 750],
    ]);
    assert.deepEqual(MISSIONS.map((m) => m.customer.name), ['Mrs. Folake', 'Mama Ngozi', 'Mr. Okafor', 'Aunty Kemi']);
  });
});

describe('all four missions are playable', () => {
  test('PLAYABLE_MISSION_IDS is exactly the four, in unlock order', () => {
    assert.deepEqual([...PLAYABLE_MISSION_IDS], ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall', 'acrossOrisunClose']);
    assert.deepEqual([...PLAYABLE_MISSION_IDS], [...MISSION_IDS]);
  });

  test('every mission has its own flow, its own pictures and its own customer', () => {
    const game = launch(storageWith());
    assert.deepEqual(game.system.units.map((u) => [u.def.id, u.playable, u.view !== null]), MISSION_IDS.map((id) => [id, true, true]));
    const views = MISSION_IDS.map((id) => game.view(id));
    ['questMarker', 'pickupRing', 'pickupArrow', 'customer', 'customerShadow', 'customerRing', 'customerArrow'].forEach((part) => {
      assert.equal(new Set(views.map((v) => v[part])).size, 4, part);
    });
    assert.equal(new Set(MISSION_IDS.map((id) => game.flow(id))).size, 4);
    game.close();
  });

  test('each of the four customers has a look, and no two share one', () => {
    assert.deepEqual(Object.keys(CUSTOMER_LOOKS), ['folake', 'ngozi', 'okafor', 'kemi']);
    assert.deepEqual(MISSION_IDS.map((id) => CUSTOMER_LOOK[id]), ['folake', 'ngozi', 'okafor', 'kemi']);
    const game = launch(storageWith());
    const keys = MISSION_IDS.map((id) => game.view(id).customer.key);
    assert.deepEqual(keys, ['customer', 'customer_ngozi', 'customer_okafor', 'customer_kemi']);
    assert.equal(new Set(keys).size, 4);
    game.close();
  });
});

describe('the four-mission unlock order', () => {
  test('a new game: only The First Delivery is open; the other three have no offer and no marker', () => {
    const game = launch(storageWith());
    assert.deepEqual(MISSION_IDS.map((id) => game.system.unlockedIds.has(id)), [true, false, false, false]);
    assert.deepEqual(markers(game), [true, false, false, false]);
    [M2, M3, M4].forEach((def) => {
      game.at(door(def));
      game.at(door(def));
      assert.equal(game.state(def.id), 'available', def.id);
      assert.equal(game.ui.offerOpen, false, def.id);
    });
    game.close();
  });

  test('playing them in order unlocks exactly one more each time', () => {
    const game = launch(storageWith());
    const expected = [
      [true, true, false, false],
      [true, true, true, false],
      [true, true, true, true],
    ];
    [M1, M2, M3].forEach((def, i) => {
      playRun(game, def);
      assert.deepEqual(MISSION_IDS.map((id) => game.system.unlockedIds.has(id)), expected[i], `after ${def.id}`);
    });
    game.close();
  });

  test('Across Orisun Close opens only after Suya for the Hall is delivered', () => {
    [{}, { firstDelivery: done(1) }, { firstDelivery: done(1), freshFromTheOven: done(1) }].forEach((progress, i) => {
      const game = launch(storageWith(progress));
      game.at(door(M4));
      game.at(door(M4));
      assert.equal(game.state(M4.id), 'available', `case ${i}`);
      assert.equal(game.ui.offerOpen, false, `case ${i}`);
      assert.equal(game.view(M4.id).questMarker.visible, false, `case ${i}`);
      game.close();
    });
    const game = launch(storageWith(OPEN_4));
    game.at(door(M4));
    assert.equal(game.state(M4.id), 'offer');
    game.close();
  });

  test('no mission can be skipped: a save with a later mission delivered but an earlier one not does not open it', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: DEFAULT, acrossOrisunClose: done(2) }));
    assert.equal(game.system.unlockedIds.has(M4.id), false);
    game.at(door(M4));
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('nothing is ever accepted automatically: after every delivery the next mission waits, unstarted', async () => {
    const storage = storageWith();
    const game = launch(storage);
    for (const [i, def] of [M1, M2, M3, M4].entries()) {
      playRun(game, def);
      for (let f = 0; f < 5; f += 1) game.at(cust(def)); // Emmy lingers where she delivered
      assert.equal(game.system.activeUnit(), null, `after ${def.id}`);
      MISSIONS.slice(i + 1).forEach((later) => {
        assert.equal(game.state(later.id), 'available', `${later.id} after ${def.id}`);
        assert.equal(game.flow(later.id).runId, 0, `${later.id} after ${def.id}`);
      });
      assert.equal(game.ui.offerOpen, false);
      assert.equal(game.player.inputLocked, false);
    }
    await settle();
    MISSION_IDS.forEach((id) => assert.equal(savedRecords(storage)[id].completed, 1, id));
    game.close();
  });

  test('the new job is offered only at its own shop; a replay shop prompts instead; one card at a time', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(door(M4));
    assert.deepEqual(states(game), ['available', 'available', 'available', 'offer']);
    game.ui.decline();
    game.at(FAR);
    game.at(door(M1));
    assert.deepEqual(states(game), ['available', 'available', 'available', 'available']); // a replay opens nothing by itself
    assert.equal(game.ui.replayPrompt?.title, M1.title);
    game.ui.replay();
    assert.deepEqual(states(game), ['offer', 'available', 'available', 'available']);
    game.close();
  });

  test('unlocking it does not accept it: it waits at Ade Mobile Fix with its marker showing', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) });
    const game = launch(storage);
    playRun(game, M3);
    assert.equal(game.view(M4.id).questMarker.visible, true);
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.flow(M4.id).runId, 0);
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.ui.offerOpen, false);
    await settle();
    assert.deepEqual(savedRecords(storage).acrossOrisunClose, DEFAULT);
    game.close();
  });
});

describe('Aunty Kemi', () => {
  test('is drawn with her own picture, different from the other three', () => {
    const game = launch(storageWith());
    const own = game.view(M4.id).customer.key;
    assert.equal(own, 'customer_kemi');
    [M1, M2, M3].forEach((def) => assert.notEqual(game.view(def.id).customer.key, own, def.id));
    game.close();
  });

  test('waits at Emmy\'s Corner Shop once the job is accepted, and nobody else is showing', () => {
    const game = launch(storageWith(OPEN_4));
    assert.equal(game.view(M4.id).customer.visible, false, 'not before the job is accepted');
    accept(game, M4);
    const view = game.view(M4.id);
    assert.equal(view.customer.visible, true);
    assert.deepEqual([view.customer.x, view.customer.y], [250, 1176]);
    [M1, M2, M3].forEach((def) => assert.equal(game.view(def.id).customer.visible, false, def.id));
    game.close();
  });

  test('picking up the coin at the shop door does not deliver the part (the coin is 60 px away, the radius is 44)', () => {
    const coin = COINS.find((c) => c.id === 'orisun-16');
    assert.deepEqual([coin.x, coin.y], [190, 1172]);
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    game.at(pick(M4));
    assert.equal(game.state(M4.id), 'deliver');
    game.at({ x: coin.x, y: coin.y });
    game.at({ x: coin.x, y: coin.y });
    assert.equal(game.state(M4.id), 'deliver');
    assert.deepEqual(game.moneyEvents, []);
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, [750]);
    game.close();
  });
});

describe('playing it', () => {
  test('the offer card at Ade Mobile Fix is the approved one, and nothing is accepted yet', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(door(M4));
    assert.equal(game.state(M4.id), 'offer');
    assert.equal(game.ui.offerOpen, true);
    assert.equal(game.player.inputLocked, true);
    assert.equal(game.ui.offerText.offerTitle, 'ADE MOBILE FIX');
    assert.equal(game.ui.offerText.offerBody, M4.text.offerBody);
    assert.equal(game.ui.offerText.offerReward, `Reward: ${naira(750)}`);
    assert.equal(game.flow(M4.id).runId, 0);
    game.close();
  });

  test('Not Now leaves it unstarted, and walking away and back offers it again', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(door(M4));
    game.ui.decline();
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.player.inputLocked, false);
    game.at(door(M4));
    assert.equal(game.state(M4.id), 'available');
    game.at(FAR);
    game.at(door(M4));
    assert.equal(game.state(M4.id), 'offer');
    game.close();
  });

  test('accepting shows the pickup objective, the blue ring at Ade Mobile Fix and Aunty Kemi waiting', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    assert.deepEqual(game.ui.objective, { text: 'Pick up the phone part at Ade Mobile Fix', kind: 'pickup' });
    const view = game.view(M4.id);
    assert.deepEqual([view.pickupRing.x, view.pickupRing.y], [2080, 554]);
    assert.equal(view.pickupRing.visible, true);
    assert.equal(view.pickupArrow.visible, true);
    assert.equal(view.customerRing.visible, false);
    assert.equal(game.system.package.visible, false);
    assert.equal(game.ui.offerOpen, false);
    assert.equal(game.player.inputLocked, false);
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('collecting the phone part shows the approved notice, the new objective and the existing package icon', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    game.at(pick(M4));
    assert.equal(game.state(M4.id), 'deliver');
    assert.deepEqual(game.ui.toasts, [{ title: 'PACKAGE COLLECTED!', body: "Now take it to Aunty Kemi at Emmy's shop.", kind: 'pickup' }]);
    assert.deepEqual(game.ui.objective, { text: "Deliver the part to Aunty Kemi at Emmy's Corner Shop", kind: 'deliver' });
    assert.equal(game.system.package.visible, true);
    assert.equal(game.system.package.key, 'pkg');
    const view = game.view(M4.id);
    assert.equal(view.customerRing.visible, true);
    assert.equal(view.customerArrow.visible, true);
    assert.equal(view.pickupRing.visible, false);
    game.close();
  });

  test('delivering to Aunty Kemi pays exactly N750 once', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    game.at(pick(M4));
    game.ui.toasts.length = 0;
    game.at(cust(M4));
    for (let i = 0; i < 6; i += 1) game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, [750]);
    assert.equal(gameState.money, startMoney + 750);
    assert.deepEqual(game.ui.toasts, [{ title: 'DELIVERY COMPLETED!', body: '+\u20A6750', kind: 'done' }]);
    assert.deepEqual(game.scene.popups.map((p) => p.text), ['+\u20A6750']);
    assert.equal(game.system.package.visible, false);
    game.close();
  });

  test('reaching the shop without the part delivers nothing', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(cust(M4));
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, []);
    assert.equal(game.state(M4.id), 'available');
    game.close();
  });
});

describe('one mission at a time, across all four', () => {
  test('while any mission is in progress, no other shop offers, and only its markers show', () => {
    MISSIONS.forEach((active) => {
      const game = launch(storageWith(ALL_DONE));
      accept(game, active);
      MISSIONS.filter((m) => m !== active).forEach((other) => {
        game.at(door(other));
        game.at(door(other));
        assert.equal(game.state(other.id), 'available', `${other.id} during ${active.id}`);
        assert.equal(game.view(other.id).questMarker.visible, false, `${other.id} during ${active.id}`);
        assert.equal(game.view(other.id).customer.visible, false, `${other.id} during ${active.id}`);
      });
      assert.equal(game.ui.offerOpen, false, active.id);
      assert.equal(game.system.units.filter((u) => u.flow.isActive).length, 1, active.id);
      assert.equal(game.view(active.id).customer.visible, true, active.id);
      game.close();
    });
  });

  test('the same holds in the delivery stage of Across Orisun Close', () => {
    const game = launch(storageWith(ALL_DONE));
    accept(game, M4);
    game.at(pick(M4));
    [M1, M2, M3].forEach((def) => game.at(door(def)));
    assert.deepEqual(states(game), ['available', 'available', 'available', 'deliver']);
    assert.equal(game.ui.offerOpen, false);
    game.close();
  });

  test('only the active flow is updated', () => {
    const game = launch(storageWith(ALL_DONE));
    accept(game, M4);
    const spies = MISSION_IDS.map((id) => mock.method(game.flow(id), 'update'));
    game.at(door(M1));
    game.at(pick(M4));
    assert.deepEqual(spies.map((s) => s.mock.callCount()), [0, 0, 0, 2]);
    game.close();
  });

  test('Lagoon Mart and Ade Mobile Fix are 280 px apart: each shop reacts only for its own job', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(door(M1));
    assert.deepEqual(states(game), ['available', 'available', 'available', 'available']); // the replay shop: prompt only
    assert.equal(game.ui.replayPrompt?.title, M1.title);
    game.at(FAR);
    game.at(door(M4));
    assert.deepEqual(states(game), ['available', 'available', 'available', 'offer']); // the new job opens its card
    assert.equal(game.ui.replayPrompt, null);
    game.close();
  });

  test('a mission accepted twice in a row is not possible: accepting does nothing once it is in progress', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    const runId = game.flow(M4.id).runId;
    game.ui.accept();
    game.ui.accept();
    assert.equal(game.flow(M4.id).runId, runId);
    assert.equal(game.state(M4.id), 'pickup');
    game.close();
  });
});

describe('the objective arrow, through the whole game', () => {
  test('it points at the next new job after each delivery, in the same session', () => {
    const game = launch(storageWith());
    game.at(FAR);
    assert.deepEqual(targetOf(game), markerTarget(M1));
    playRun(game, M1);
    assert.equal(game.system.newJobId, M2.id);
    assert.deepEqual(targetOf(game), markerTarget(M2));
    playRun(game, M2);
    assert.equal(game.system.newJobId, M3.id);
    assert.deepEqual(targetOf(game), markerTarget(M3));
    playRun(game, M3);
    assert.equal(game.system.newJobId, M4.id);
    assert.deepEqual(targetOf(game), markerTarget(M4));
    game.close();
  });

  test('after Suya for the Hall, an off-screen Ade Mobile Fix gets an arrow, even though earlier shops are also waiting', () => {
    const game = launch(storageWith(OPEN_4));
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.deepEqual(targetOf(game), markerTarget(M4));
    assert.equal(game.ui.arrow?.kind, 'offer');
    game.close();
  });

  test('the arrow is right after a refresh too', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) });
    const first = launch(storage);
    playRun(first, M3);
    await settle();
    first.close();
    const game = launch(storage);
    game.at(FAR);
    assert.deepEqual(targetOf(game), markerTarget(M4));
    game.close();
  });

  test('during the job it points at the pickup, then at Aunty Kemi', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'pickup');
    assert.deepEqual(targetOf(game), { x: 2080, y: 554 - 30, kind: 'pickup' });
    game.at(pick(M4));
    game.at(pick(M4));
    assert.equal(game.ui.arrow?.kind, 'deliver');
    assert.deepEqual(targetOf(game), { x: 250, y: 1176 - 40, kind: 'deliver' });
    game.close();
  });

  test('there is no arrow while the offer card is open or the delivered banner is showing', () => {
    const game = launch(storageWith(OPEN_4));
    game.at(door(M4));
    assert.equal(game.system.currentTarget(), null);
    game.ui.accept();
    game.at(pick(M4));
    game.at(cust(M4));
    assert.equal(game.state(M4.id), 'done');
    assert.equal(game.system.currentTarget(), null);
    game.close();
  });

  test('when every mission has been delivered there is no new job, and no arrow at all (replay shops get none)', () => {
    const game = launch(storageWith(ALL_DONE));
    game.scene.camera.worldView = { x: 0, y: 0 }; // every shop is off screen
    game.at(FAR);
    assert.equal(game.system.newJobId, null);
    assert.equal(targetOf(game), null);
    assert.equal(game.ui.arrow, null);
    game.close();
  });

  test('delivering the last mission leaves no new job and no mission in progress', () => {
    const game = launch(storageWith(OPEN_4));
    playRun(game, M4);
    assert.equal(game.system.newJobId, null);
    assert.equal(game.system.activeUnit(), null);
    assert.deepEqual(markers(game), [true, true, true, true]);
    game.close();
  });
});

describe('replaying all four missions', () => {
  test('every replay pays that mission\'s full reward, every time', async () => {
    const storage = storageWith(ALL_DONE);
    const game = launch(storage);
    const rewards = [];
    for (let round = 0; round < 3; round += 1) {
      for (const def of MISSIONS) {
        playRun(game, def);
        rewards.push(def.reward);
      }
    }
    assert.deepEqual(game.moneyEvents, rewards);
    assert.equal(gameState.money, startMoney + 3 * TOTAL);
    await settle();
    MISSION_IDS.forEach((id) => assert.deepEqual(savedRecords(storage)[id], done(4), id));
    game.close();
  });

  test('replaying Across Orisun Close three times pays 750 each', () => {
    const game = launch(storageWith(ALL_DONE));
    for (let run = 1; run <= 3; run += 1) {
      playRun(game, M4);
      assert.equal(gameState.money, startMoney + 750 * run, `run ${run}`);
    }
    assert.deepEqual(game.moneyEvents, [750, 750, 750]);
    game.close();
  });

  test('replaying never unlocks anything again, accepts anything or changes another mission', () => {
    const game = launch(storageWith(ALL_DONE));
    const unlockedBefore = [...game.system.unlockedIds];
    [M4, M2, M1, M3].forEach((def) => playRun(game, def));
    assert.deepEqual([...game.system.unlockedIds], unlockedBefore);
    assert.equal(game.system.activeUnit(), null);
    assert.deepEqual(MISSION_IDS.map((id) => game.flow(id).completed), [2, 2, 2, 2]);
    game.close();
  });

  test('standing on the customer, or repeated completion attempts, pay once per run', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M4);
    game.at(pick(M4));
    game.at(cust(M4));
    for (let i = 0; i < 10; i += 1) game.at(cust(M4));
    for (let i = 0; i < 5; i += 1) assert.equal(game.flow(M4.id).complete(), false);
    assert.deepEqual(game.moneyEvents, [750]);
    game.close();
  });
});

describe('saving and restoring Across Orisun Close', () => {
  test('accepting is saved by itself, without any money moving', async () => {
    const storage = storageWith(OPEN_4);
    const game = launch(storage);
    accept(game, M4);
    await settle();
    assert.deepEqual(savedRecords(storage).acrossOrisunClose, rec('pickup', 1, 0, 0));
    game.close();
  });

  test('refreshing during pickup, again and again: back at the pickup, quietly', async () => {
    const storage = storageWith(OPEN_4);
    let game = launch(storage);
    accept(game, M4);
    await settle();
    game.close();
    for (let i = 1; i <= 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M4.id), 'pickup', `refresh ${i}`);
      assert.deepEqual(game.ui.objective, { text: M4.text.objectivePickup, kind: 'pickup' });
      assert.equal(game.view(M4.id).pickupRing.visible, true);
      assert.equal(game.view(M4.id).customer.key, 'customer_kemi');
      assert.deepEqual(markers(game), [false, false, false, false]);
      assertQuiet(game, startMoney);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(pick(M4));
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, [750]);
    game.close();
  });

  test('refreshing during delivery, again and again: still carrying the part, no notice replayed', async () => {
    const storage = storageWith(OPEN_4);
    let game = launch(storage);
    accept(game, M4);
    game.at(pick(M4));
    await settle();
    game.close();
    for (let i = 1; i <= 3; i += 1) {
      game = launch(storage);
      assert.equal(game.state(M4.id), 'deliver', `refresh ${i}`);
      assert.equal(game.system.package.visible, true);
      assert.deepEqual(game.ui.objective, { text: M4.text.objectiveDeliver, kind: 'deliver' });
      assert.equal(game.view(M4.id).customerRing.visible, true);
      assertQuiet(game, startMoney);
      await settle();
      game.close();
    }
    game = launch(storage);
    game.at(cust(M4));
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, [750]);
    game.close();
  });

  test('refreshing immediately after completing it: paid once, available, nothing replayed', async () => {
    const storage = storageWith(OPEN_4);
    const first = launch(storage);
    accept(first, M4);
    first.at(pick(M4));
    first.at(cust(M4));
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(gameState.money, startMoney + 750);
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.flow(M4.id).completed, 1);
    assert.equal(game.system.newJobId, null);
    assertQuiet(game, startMoney + 750);
    game.at(cust(M4));
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, []);
    game.close();
  });

  test('refreshing after unlocking it (Suya for the Hall just finished): waiting, not started, not paid', async () => {
    const storage = storageWith({ firstDelivery: done(1), freshFromTheOven: done(1) });
    const first = launch(storage);
    playRun(first, M3);
    await settle();
    first.close();

    const game = launch(storage);
    assert.equal(game.system.unlockedIds.has(M4.id), true);
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.flow(M4.id).runId, 0);
    assert.equal(game.view(M4.id).questMarker.visible, true);
    assert.equal(game.ui.objective, null);
    assert.equal(game.system.activeUnit(), null);
    assertQuiet(game, startMoney + 550);
    game.close();
  });

  test('refreshing in the middle of a replay and completing it pays once', async () => {
    const storage = storageWith({ ...OPEN_4, acrossOrisunClose: done(2) });
    let game = launch(storage);
    accept(game, M4);
    await settle();
    game.close();

    game = launch(storage);
    assert.deepEqual(game.flow(M4.id).toSave(), rec('pickup', 3, 2, 2));
    assertQuiet(game);
    game.at(pick(M4));
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, [750]);
    assert.equal(game.flow(M4.id).completed, 3);
    game.close();
  });

  test('a page lost before the queued save ran leaves money and mission in agreement', async () => {
    const storage = storageWith(OPEN_4);
    const first = launch(storage);
    accept(first, M4);
    first.at(pick(M4));
    await settle();
    first.at(cust(M4)); // paid in memory; the save is queued but never runs
    first.close();

    const game = launch(storage);
    assert.equal(game.state(M4.id), 'deliver');
    assert.equal(gameState.money, startMoney);
    game.at(cust(M4));
    assert.deepEqual(game.moneyEvents, [750]);
    game.close();
  });

  test('older saves: first mission only, and the first three missions, both load with nothing paid', () => {
    const one = launch(storageWith({ firstDelivery: done(7) }, { money: 1500 }));
    assert.deepEqual(MISSION_IDS.map((id) => one.system.unlockedIds.has(id)), [true, true, false, false]);
    assertQuiet(one, 1500);
    one.close();
    const three = launch(storageWith(OPEN_4, { money: 2500 }));
    assert.equal(three.system.unlockedIds.has(M4.id), true);
    assert.equal(three.state(M4.id), 'available');
    assertQuiet(three, 2500);
    three.close();
  });

  test('a damaged save with Suya and Across Orisun Close both in progress keeps Suya and resets the other, losing nothing', async () => {
    const storage = storageWith({ ...OPEN_4, suyaForTheHall: rec('deliver', 2, 1, 1), acrossOrisunClose: rec('pickup', 4, 3, 3) });
    const game = launch(storage);
    assert.equal(game.system.activeUnit().def.id, M3.id);
    assert.deepEqual(game.flow(M4.id).toSave(), rec('available', 4, 3, 3));
    assertQuiet(game);
    await settle();
    assert.deepEqual(savedRecords(storage).acrossOrisunClose, rec('available', 4, 3, 3));
    game.close();
  });

  test('a damaged save with it in progress but still locked resets it: it cannot be played early', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), acrossOrisunClose: rec('deliver', 1, 0, 0) }));
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.state(M4.id), 'available');
    assert.equal(game.system.package.visible, false);
    assertQuiet(game);
    game.close();
  });

  test('a damaged save with all four in progress keeps the first and resets the rest, keeping every counter', () => {
    const progress = {};
    MISSIONS.forEach((def) => {
      progress[def.id] = rec('deliver', 2, 1, 1);
    });
    const game = launch(storageWith(progress));
    assert.equal(game.system.activeUnit().def.id, M1.id);
    assert.equal(game.system.units.filter((u) => u.flow.isActive).length, 1);
    MISSION_IDS.forEach((id) => assert.equal(game.flow(id).completed, 1, id));
    assertQuiet(game);
    game.close();
  });
});

describe('the whole game, with a refresh after every mission', () => {
  test('250, then 300, then 550, then 750, in order, each once: 1,850 in all', async () => {
    const storage = storageWith();
    let game = launch(storage);
    let total = startMoney;
    for (const def of MISSIONS) {
      playRun(game, def);
      total += def.reward;
      assert.equal(gameState.money, total, def.id);
      await settle();
      game.close();
      game = launch(storage); // refresh
      assert.equal(gameState.money, total, `after refreshing following ${def.id}`);
      assertQuiet(game, total);
    }
    assert.equal(total, startMoney + TOTAL);
    assert.equal(TOTAL, 1850);
    MISSION_IDS.forEach((id) => assert.equal(game.flow(id).completed, 1, id));
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.system.newJobId, null);
    game.close();
  });

  test('refreshing in the middle of every mission, pickup and delivery, still pays each once', async () => {
    const storage = storageWith();
    let game = launch(storage);
    let total = startMoney;
    for (const def of MISSIONS) {
      accept(game, def);
      await settle();
      game.close();
      game = launch(storage); // refresh in pickup
      assert.equal(game.state(def.id), 'pickup', def.id);
      game.at(pick(def));
      await settle();
      game.close();
      game = launch(storage); // refresh in delivery
      assert.equal(game.state(def.id), 'deliver', def.id);
      assertQuiet(game, total);
      game.at(cust(def));
      total += def.reward;
      assert.deepEqual(game.moneyEvents, [def.reward], def.id);
      game.waitDone();
      await settle();
      game.close();
      game = launch(storage); // refresh after completing
      assert.equal(gameState.money, total, def.id);
    }
    assert.equal(total, startMoney + TOTAL);
    game.close();
  });

  test('once everything is delivered, a refresh shows no offers and no objective, and nothing is paid', async () => {
    const storage = storageWith(ALL_DONE, { money: 3000 });
    const game = launch(storage);
    game.at(FAR);
    game.at(FAR);
    assertQuiet(game, 3000);
    assert.equal(game.ui.objective, null);
    assert.deepEqual(states(game), ['available', 'available', 'available', 'available']);
    assert.deepEqual(markers(game), [true, true, true, true]);
    await settle();
    game.close();
  });
});
