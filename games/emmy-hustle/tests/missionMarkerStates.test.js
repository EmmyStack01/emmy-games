// Stage 4A: how the job marker above each shop looks, and where the objective edge arrow points.
//
//   new job       bright gold marker, bobbing                      (unchanged)
//   active job    the shop's marker is hidden; the pickup / customer guidance shows
//   replayable    still VISIBLE, but dimmer, smaller, grey-blue and still (no bobbing)
//   locked        no marker
//
//   arrow         points only at a new job, or at the active job's pickup / customer.
//                 When there is neither (every mission delivered), there is no arrow:
//                 a shop that can only be replayed never gets one.
//
// Real: MissionSystem, MissionView, MissionFlow, the save system, GameState, the data.
// Faked: the scene, the DOM UI, localStorage. Built exactly as the game builds it.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import MissionView, { MARKER_LOOK, MARKER_STYLE } from '../src/missions/MissionView.js';
import { makeMissionTextures, QUEST_MARKER_KEY } from '../src/missions/missionTextures.js';
import { MISSIONS, MISSION_IDS } from '../src/missions/missionData.js';
import { makeMissionScene } from './support/fakeMissionScene.js';
import { makeTextureScene } from './support/fakeTextureScene.js';
import {
  startMoney, FAR, settle, door, pick, cust, done, storageWith, launch, accept, playRun, assertQuiet, gameState,
} from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const ALL_DONE = { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1), acrossOrisunClose: done(1) };
const OPEN_4 = { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1) };

// The sha256 of the ORIGINAL gold marker's 11 drawing calls, taken before the marker became a
// style. If it changes, the new-job marker has changed.
const QUEST_MARKER_SHA256 = 'e04950802662836100014d047b64cde3fa206ce187bc00e5bbeb0d50b61580d2';

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

const marker = (game, def) => game.view(def.id).questMarker;
const bobbing = (game, def) => !game.view(def.id).questBob.paused;
const visibleMarkers = (game) => MISSIONS.map((m) => marker(game, m).visible);

// How the marker looks right now, in the terms of MARKER_LOOK.
const look = (game, def) => {
  const m = marker(game, def);
  return { visible: m.visible, texture: m.textureKey, alpha: m.alpha, scale: m.scale, bobbing: bobbing(game, def) };
};
const NEW_LOOK = { visible: true, ...MARKER_LOOK.new };
const REPEAT_LOOK = { visible: true, ...MARKER_LOOK.repeatable };

const targetOf = (game) => {
  const t = game.system.currentTarget();
  return t && { x: t.x, y: t.y, kind: t.kind };
};
const markerTarget = (def) => ({ x: def.shop.marker.x, y: def.shop.marker.y, kind: 'offer' });

describe('the marker styles', () => {
  test('a replayable marker is dimmer, smaller and still; a new one is bright, full size and bobbing', () => {
    const n = MARKER_LOOK[MARKER_STYLE.NEW];
    const r = MARKER_LOOK[MARKER_STYLE.REPEATABLE];
    assert.equal(n.alpha, 1);
    assert.equal(n.scale, 1);
    assert.equal(n.bobbing, true);
    assert.ok(r.alpha < n.alpha && r.alpha <= 0.6, 'noticeably dimmer');
    assert.ok(r.scale < n.scale && r.scale <= 0.9, 'smaller');
    assert.equal(r.bobbing, false);
    assert.notEqual(r.texture, n.texture);
  });

  test('the new-job marker is the original gold marker, unchanged', () => {
    const { scene, textures } = makeTextureScene();
    makeMissionTextures(scene);
    const calls = textures[QUEST_MARKER_KEY.new].calls;
    assert.equal(QUEST_MARKER_KEY.new, 'mk_quest');
    assert.equal(calls.length, 11);
    assert.equal(createHash('sha256').update(JSON.stringify(calls)).digest('hex'), QUEST_MARKER_SHA256);
  });

  test('the replayable marker is the same shape in grey-blue, not gold', () => {
    const { scene, textures } = makeTextureScene();
    makeMissionTextures(scene);
    const gold = textures[QUEST_MARKER_KEY.new];
    const grey = textures[QUEST_MARKER_KEY.repeatable];
    assert.equal(QUEST_MARKER_KEY.repeatable, 'mk_quest_repeat');
    assert.deepEqual([grey.w, grey.h], [gold.w, gold.h]);
    assert.deepEqual(grey.calls.map(([name]) => name), gold.calls.map(([name]) => name), 'the same drawing');
    const fills = (t) => t.calls.filter(([name]) => name === 'fillStyle').map(([, colour]) => colour);
    const differing = fills(gold).filter((c, i) => c !== fills(grey)[i]);
    assert.equal(differing.length, 2, 'only the main fill and the shine change');
    const body = fills(grey)[2]; // the marker's main fill
    assert.ok((body & 0xff) > ((body >> 16) & 0xff), 'grey-blue: more blue than red');
    assert.notEqual(body, 0xffc43d);
  });
});

describe('a new job: bright and bobbing', () => {
  test('a new game: the first marker is bright, full size and bobbing, using the original gold marker', () => {
    const game = launch(storageWith());
    assert.deepEqual(look(game, M1), NEW_LOOK);
    assert.equal(marker(game, M1).textureKey, 'mk_quest');
    game.close();
  });

  test('the next job is bright and bobbing as soon as it is unlocked, while the delivered one goes quiet', () => {
    const game = launch(storageWith());
    playRun(game, M1);
    assert.deepEqual(look(game, M2), NEW_LOOK);
    assert.deepEqual(look(game, M1), REPEAT_LOOK);
    game.close();
  });

  test('a new marker stays bright while its offer card is open', () => {
    const game = launch(storageWith());
    game.at(door(M1));
    assert.equal(game.state(M1.id), 'offer');
    assert.deepEqual(look(game, M1), NEW_LOOK);
    game.close();
  });

  test('every mission walks through the chain: bright when new, quiet once delivered', () => {
    const game = launch(storageWith());
    MISSIONS.forEach((def) => assert.equal(bobbing(game, def), true, def.id));
    for (const [i, def] of MISSIONS.entries()) {
      // when it is this mission's turn it is unlocked, so it is the one bright marker; later ones are still locked
      assert.deepEqual(look(game, def), NEW_LOOK, `before ${def.id}`);
      MISSIONS.slice(i + 1).forEach((later) => assert.equal(marker(game, later).visible, false, `${later.id} before ${def.id}`));
      playRun(game, def);
      assert.deepEqual(look(game, def), REPEAT_LOOK, `after ${def.id}`);
    }
    game.close();
  });
});

describe('an active job: its shop marker is hidden', () => {
  test('while a mission is in progress, no shop shows a marker, new, replayable or the active one itself', () => {
    MISSIONS.forEach((active) => {
      const game = launch(storageWith(ALL_DONE));
      accept(game, active);
      assert.deepEqual(visibleMarkers(game), [false, false, false, false], `pickup of ${active.id}`);
      game.at(pick(active));
      assert.equal(game.state(active.id), 'deliver');
      assert.deepEqual(visibleMarkers(game), [false, false, false, false], `delivery of ${active.id}`);
      game.close();
    });
  });

  test('the pickup and customer guidance is untouched: ring, arrow, customer', () => {
    const game = launch(storageWith(OPEN_4));
    accept(game, M3);
    const v = game.view(M3.id);
    assert.equal(v.pickupRing.visible, true);
    assert.equal(v.pickupArrow.visible, true);
    assert.equal(v.customer.visible, true);
    assert.equal(v.customerRing.visible, false);
    game.at(pick(M3));
    assert.equal(v.pickupRing.visible, false);
    assert.equal(v.customerRing.visible, true);
    assert.equal(v.customerArrow.visible, true);
    game.close();
  });

  test('during the delivered banner the marker is still hidden, and then it comes back as a quiet replay marker', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    accept(game, M2);
    game.at(pick(M2));
    game.at(cust(M2));
    assert.equal(game.state(M2.id), 'done');
    assert.equal(marker(game, M2).visible, false);
    game.waitDone();
    assert.deepEqual(look(game, M2), REPEAT_LOOK);
    game.close();
  });

  test('replaying a delivered mission hides its marker, and it comes back quiet afterwards', () => {
    const game = launch(storageWith(ALL_DONE));
    assert.deepEqual(look(game, M2), REPEAT_LOOK);
    accept(game, M2);
    assert.equal(marker(game, M2).visible, false);
    game.at(pick(M2));
    game.at(cust(M2));
    game.waitDone();
    assert.deepEqual(look(game, M2), REPEAT_LOOK);
    assert.deepEqual(game.moneyEvents, [300]);
    game.close();
  });
});

describe('a replayable job: visible, but dimmer, smaller and still', () => {
  test('a delivered mission keeps a VISIBLE marker with the replayable look', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    const m = marker(game, M1);
    assert.equal(m.visible, true);
    assert.deepEqual(look(game, M1), REPEAT_LOOK);
    assert.ok(m.alpha < marker(game, M2).alpha, 'dimmer than a new marker');
    assert.ok(m.scale < marker(game, M2).scale, 'smaller than a new marker');
    assert.equal(m.textureKey, 'mk_quest_repeat');
    assert.equal(bobbing(game, M1), false);
    assert.equal(bobbing(game, M2), true);
    game.close();
  });

  test('it rests at its spot above the shop, not mid-bob, and stays where the new marker would be', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    const m = marker(game, M1);
    assert.deepEqual([m.x, m.y], [M1.shop.marker.x, M1.shop.marker.y]);
    game.close();
  });

  test('it is still recognisable as a job: still there, and replayable with the prompt when Emmy walks up', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    game.at(door(M1));
    assert.equal(game.state(M1.id), 'available', 'a replay does not open its card by itself');
    assert.equal(game.ui.replayPrompt?.title, M1.title);
    assert.equal(marker(game, M1).visible, true);
    assert.deepEqual(look(game, M1), REPEAT_LOOK);
    game.ui.replay();
    assert.equal(game.state(M1.id), 'offer');
    assert.deepEqual(look(game, M1), REPEAT_LOOK);
    game.ui.accept();
    assert.equal(game.state(M1.id), 'pickup');
    game.close();
  });

  test('the offer radius is unchanged: 130 px for every shop (a new job still opens its card at exactly 130 px)', () => {
    MISSIONS.forEach((def) => assert.equal(def.shop.offerRadius, 130, def.id));
    const game = launch(storageWith({ firstDelivery: done(1) })); // mission 2 is the new job
    const { x, y } = door(M2);
    game.at({ x: x + 131, y });
    assert.equal(game.state(M2.id), 'available');
    game.at({ x: x + 130, y });
    assert.equal(game.state(M2.id), 'offer');
    game.close();
  });

  test('after all four missions are delivered, all four shop markers are visible and quiet', async () => {
    const game = launch(storageWith());
    for (const def of MISSIONS) playRun(game, def);
    assert.deepEqual(visibleMarkers(game), [true, true, true, true]);
    MISSIONS.forEach((def) => assert.deepEqual(look(game, def), REPEAT_LOOK, def.id));
    MISSIONS.forEach((def) => assert.equal(bobbing(game, def), false, def.id));
    game.close();
  });

  test('replayable markers are not a new-job marker in disguise: none of them bobs or is fully bright', () => {
    const game = launch(storageWith(ALL_DONE));
    MISSIONS.forEach((def) => {
      assert.ok(marker(game, def).alpha <= 0.6, def.id);
      assert.ok(marker(game, def).scale <= 0.9, def.id);
      assert.notEqual(marker(game, def).textureKey, 'mk_quest', def.id);
    });
    game.close();
  });
});

describe('a locked job: no marker', () => {
  test('a new game: only the first marker shows', () => {
    const game = launch(storageWith());
    assert.deepEqual(visibleMarkers(game), [true, false, false, false]);
    game.close();
  });

  test('a locked marker stays hidden until the mission before it is delivered, one step at a time', () => {
    const game = launch(storageWith());
    playRun(game, M1);
    assert.deepEqual(visibleMarkers(game), [true, true, false, false]);
    playRun(game, M2);
    assert.deepEqual(visibleMarkers(game), [true, true, true, false]);
    playRun(game, M3);
    assert.deepEqual(visibleMarkers(game), [true, true, true, true]);
    game.close();
  });

  test('a locked marker is not dressed as a replay: it is hidden and would be a new one', () => {
    const game = launch(storageWith({ firstDelivery: done(1) }));
    [M3, M4].forEach((def) => {
      assert.equal(marker(game, def).visible, false, def.id);
      assert.equal(marker(game, def).textureKey, 'mk_quest', def.id);
    });
    game.close();
  });
});

describe('the objective edge arrow', () => {
  test('it points at a new job when there is one, even while replayable shops exist', () => {
    const game = launch(storageWith());
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.deepEqual(targetOf(game), markerTarget(M1));
    assert.equal(game.ui.arrow?.kind, 'offer');
    playRun(game, M1);
    game.at(FAR);
    assert.deepEqual(targetOf(game), markerTarget(M2)); // not the dimmed first shop
    playRun(game, M2);
    assert.deepEqual(targetOf(game), markerTarget(M3));
    playRun(game, M3);
    assert.deepEqual(targetOf(game), markerTarget(M4));
    game.close();
  });

  test('it points at the active mission: its pickup first, then its customer, for every mission', () => {
    MISSIONS.forEach((def) => {
      const game = launch(storageWith(ALL_DONE));
      game.scene.camera.worldView = { x: 0, y: 0 };
      accept(game, def);
      game.at(FAR);
      assert.deepEqual(targetOf(game), { x: def.pickup.x, y: def.pickup.y - 30, kind: 'pickup' }, `${def.id} pickup`);
      assert.equal(game.ui.arrow?.kind, 'pickup');
      game.at(pick(def));
      game.at(pick(def));
      assert.deepEqual(targetOf(game), { x: def.customer.x, y: def.customer.y - 40, kind: 'deliver' }, `${def.id} customer`);
      assert.equal(game.ui.arrow?.kind, 'deliver');
      game.close();
    });
  });

  test('a new job and an active replay: the active mission wins while it is in progress', () => {
    const game = launch(storageWith({ firstDelivery: done(1) })); // mission 2 is the new job
    game.scene.camera.worldView = { x: 0, y: 0 };
    accept(game, M1); // replay the first mission
    game.at(FAR);
    assert.equal(targetOf(game).kind, 'pickup');
    assert.deepEqual({ x: targetOf(game).x, y: targetOf(game).y }, { x: M1.pickup.x, y: M1.pickup.y - 30 });
    game.at(pick(M1));
    game.at(cust(M1));
    game.waitDone();
    assert.deepEqual(targetOf(game), markerTarget(M2)); // and then back to the new job
    game.close();
  });

  test('when all four missions are delivered there is no arrow at all', () => {
    const game = launch(storageWith(ALL_DONE));
    game.scene.camera.worldView = { x: 0, y: 0 }; // every shop is off screen
    game.at(FAR);
    assert.equal(game.system.newJobId, null);
    assert.equal(game.system.activeUnit(), null);
    assert.equal(game.system.currentTarget(), null);
    assert.equal(game.ui.arrow, null);
    game.close();
  });

  test('it stays gone, wherever Emmy walks and however long the game runs', () => {
    const game = launch(storageWith(ALL_DONE));
    const spots = [FAR, { x: 1200, y: 800 }, { x: 600, y: 1500 }, { x: 2200, y: 300 }, { x: 150, y: 1700 }];
    spots.forEach((spot, i) => {
      game.scene.camera.worldView = { x: spot.x - 400, y: spot.y - 300 };
      for (let f = 0; f < 5; f += 1) game.at(spot, 100);
      assert.equal(game.ui.arrow, null, `spot ${i}`);
    });
    game.close();
  });

  test('it disappears when the last new job is delivered and does not come back', () => {
    const game = launch(storageWith(OPEN_4));
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.deepEqual(targetOf(game), markerTarget(M4)); // the last new job
    accept(game, M4);
    game.at(pick(M4));
    game.at(cust(M4));
    assert.equal(game.state(M4.id), 'done');
    assert.equal(game.system.currentTarget(), null);
    game.waitDone();
    assert.equal(game.system.newJobId, null);
    assert.equal(game.system.currentTarget(), null);
    game.at(FAR);
    assert.equal(game.ui.arrow, null);
    game.close();
  });

  test('no arrow, and no replay marker disappears, after a refresh of a finished game', async () => {
    const storage = storageWith(ALL_DONE, { money: 3000 });
    const game = launch(storage);
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.equal(game.ui.arrow, null);
    assert.deepEqual(visibleMarkers(game), [true, true, true, true]);
    assertQuiet(game, 3000);
    await settle();
    game.close();
  });

  test('there is no arrow while an offer card is open or the delivered banner is showing', () => {
    const game = launch(storageWith(OPEN_4));
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(door(M4));
    assert.equal(game.system.currentTarget(), null);
    game.ui.accept();
    game.at(pick(M4));
    game.at(cust(M4));
    assert.equal(game.system.currentTarget(), null);
    game.close();
  });
});

describe('progression, rewards and saving are untouched', () => {
  test('replaying every mission pays its full reward, and the markers go quiet again each time', () => {
    const game = launch(storageWith(ALL_DONE));
    const paid = [];
    for (let round = 0; round < 2; round += 1) {
      for (const def of MISSIONS) {
        playRun(game, def);
        paid.push(def.reward);
        assert.deepEqual(look(game, def), REPEAT_LOOK, def.id);
      }
    }
    assert.deepEqual(game.moneyEvents, paid);
    assert.equal(gameState.money, startMoney + 2 * (250 + 300 + 550 + 750));
    game.close();
  });

  test('the whole game in order: rewards 250, 300, 550, 750 once each, and saved progress is as before', async () => {
    const storage = storageWith();
    const game = launch(storage);
    for (const def of MISSIONS) playRun(game, def);
    assert.deepEqual(game.moneyEvents, [250, 300, 550, 750]);
    await settle();
    const saved = JSON.parse(storage.data.get('emmys-hustle:save'));
    MISSION_IDS.forEach((id) => assert.deepEqual(saved.missions[id], { state: 'available', runId: 1, completed: 1, lastPaidRunId: 1 }, id));
    assert.deepEqual(Object.keys(saved).sort(), ['coins', 'missions', 'money', 'savedAt', 'v']);
    game.close();
  });

  test('the marker style is derived from saved progress: it is right after every refresh, quietly', async () => {
    const storage = storageWith();
    let game = launch(storage);
    let total = startMoney;
    for (const [i, def] of MISSIONS.entries()) {
      playRun(game, def);
      total += def.reward;
      await settle();
      game.close();
      game = launch(storage); // refresh
      assertQuiet(game, total);
      MISSIONS.forEach((m, j) => {
        const expected = j <= i ? REPEAT_LOOK : j === i + 1 ? NEW_LOOK : { ...NEW_LOOK, visible: false };
        assert.deepEqual(look(game, m), expected, `${m.id} after refreshing following ${def.id}`);
      });
    }
    game.close();
  });

  test('refreshing in the middle of a replay: no marker shows for the job in progress, the rest are quiet', async () => {
    const storage = storageWith(ALL_DONE);
    let game = launch(storage);
    accept(game, M3);
    await settle();
    game.close();
    game = launch(storage);
    assert.equal(game.state(M3.id), 'pickup');
    assert.deepEqual(visibleMarkers(game), [false, false, false, false]);
    assertQuiet(game);
    game.at(pick(M3));
    game.at(cust(M3));
    game.waitDone();
    assert.deepEqual(visibleMarkers(game), [true, true, true, true]);
    assert.deepEqual(game.moneyEvents, [550]);
    game.close();
  });
});

describe('MissionView on its own', () => {
  const build = () => {
    const scene = makeMissionScene();
    const view = new MissionView(scene, M1);
    return { scene, view };
  };

  test('a new view starts as a new marker, bobbing', () => {
    const { view } = build();
    assert.equal(view.markerStyle, MARKER_STYLE.NEW);
    assert.equal(view.questBob.paused, false);
    assert.equal(view.questMarker.alpha, 1);
  });

  test('going quiet pauses the bob once and puts the marker back at its spot; going bright resumes it', () => {
    const { view } = build();
    const pause = mock.method(view.questBob, 'pause');
    const resume = mock.method(view.questBob, 'resume');
    view.questMarker.setPosition(M1.shop.marker.x, M1.shop.marker.y - 6); // caught mid-bob
    view.apply('available', { markerStyle: MARKER_STYLE.REPEATABLE });
    view.apply('available', { markerStyle: MARKER_STYLE.REPEATABLE });
    assert.equal(pause.mock.callCount(), 1, 'changing to the same style again does nothing');
    assert.equal(view.questMarker.y, M1.shop.marker.y);
    view.apply('available', { markerStyle: MARKER_STYLE.NEW });
    assert.equal(resume.mock.callCount(), 1);
    assert.deepEqual([view.questMarker.alpha, view.questMarker.scale, view.questMarker.textureKey], [1, 1, 'mk_quest']);
  });

  test('the style survives the marker being hidden, so it is right when it comes back', () => {
    const { view } = build();
    view.apply('available', { markerOpen: false, markerStyle: MARKER_STYLE.REPEATABLE });
    assert.equal(view.questMarker.visible, false);
    view.apply('available', { markerOpen: true, markerStyle: MARKER_STYLE.REPEATABLE });
    assert.equal(view.questMarker.visible, true);
    assert.equal(view.questMarker.alpha, MARKER_LOOK.repeatable.alpha);
  });

  test('an unknown style is a programming error', () => {
    const { view } = build();
    assert.throws(() => view.apply('available', { markerStyle: 'glowing' }), /unknown marker style/);
  });

  test('visibility still follows the mission state, whatever the style', () => {
    const { view } = build();
    [MARKER_STYLE.NEW, MARKER_STYLE.REPEATABLE].forEach((style) => {
      ['available', 'offer'].forEach((state) => {
        view.apply(state, { markerStyle: style });
        assert.equal(view.questMarker.visible, true, `${style} / ${state}`);
      });
      ['pickup', 'deliver', 'done'].forEach((state) => {
        view.apply(state, { markerStyle: style });
        assert.equal(view.questMarker.visible, false, `${style} / ${state}`);
      });
    });
  });
});
