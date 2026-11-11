// The ordered mission list (Stage 1 of Milestone A): permanent ids, order, rewards, the
// preserved First Delivery, and the rules agreed for the three new missions.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSIONS,
  MISSION_IDS,
  FIRST_DELIVERY,
  FRESH_FROM_THE_OVEN,
  SUYA_FOR_THE_HALL,
  ACROSS_ORISUN_CLOSE,
  naira,
} from '../src/missions/missionData.js';
import { BUILDINGS } from '../src/data/neighbourhood.js';
import MissionSystem from '../src/missions/MissionSystem.js';
import { makeMissionScene, makePlayer, makeFakeUI } from './support/fakeMissionScene.js';

// These ids are permanent: the save file is keyed by them. A failure here means an id was
// renamed, reordered or removed. Add new missions to the END, with a new id, and list them here.
const EXPECTED_IDS = ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall', 'acrossOrisunClose'];
const EXPECTED_REWARDS = [250, 300, 550, 750];

// Every key path of an object, e.g. "shop.door.x", so two definitions can be compared by shape.
const keyPaths = (value, prefix = '') =>
  Object.keys(value)
    .flatMap((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value[key] !== null && typeof value[key] === 'object' ? keyPaths(value[key], path) : [path];
    })
    .sort();

const allText = (def) => JSON.stringify(def).toLowerCase();

describe('the mission list', () => {
  test('the ids are exactly the permanent list, in unlock order', () => {
    assert.deepEqual(MISSIONS.map((m) => m.id), EXPECTED_IDS);
    assert.deepEqual([...MISSION_IDS], EXPECTED_IDS);
  });

  test('ids are unique, non-empty strings', () => {
    assert.equal(new Set(MISSION_IDS).size, MISSION_IDS.length);
    MISSION_IDS.forEach((id) => assert.ok(typeof id === 'string' && id.length > 0));
  });

  test('the list and the id list cannot be changed by accident', () => {
    assert.equal(Object.isFrozen(MISSIONS), true);
    assert.equal(Object.isFrozen(MISSION_IDS), true);
  });

  test('the first mission is exactly FIRST_DELIVERY, and the others are the named exports', () => {
    assert.equal(MISSIONS[0], FIRST_DELIVERY);
    assert.equal(MISSIONS[1], FRESH_FROM_THE_OVEN);
    assert.equal(MISSIONS[2], SUYA_FOR_THE_HALL);
    assert.equal(MISSIONS[3], ACROSS_ORISUN_CLOSE);
  });

  test('titles are present and unique', () => {
    assert.deepEqual(MISSIONS.map((m) => m.title), [
      'The First Delivery',
      'Fresh From the Oven',
      'Suya for the Hall',
      'Across Orisun Close',
    ]);
  });
});

describe('rewards', () => {
  test('the rewards are exactly 250, 300, 550 and 750', () => {
    assert.deepEqual(MISSIONS.map((m) => m.reward), EXPECTED_REWARDS);
  });

  test('every reward is a positive whole number', () => {
    MISSIONS.forEach((m) => assert.ok(Number.isSafeInteger(m.reward) && m.reward > 0, m.id));
  });

  test('the offer card and the completion banner quote the real reward', () => {
    MISSIONS.forEach((m) => {
      assert.equal(m.text.offerReward, `Reward: ${naira(m.reward)}`, m.id);
      assert.equal(m.text.doneBody, `+${naira(m.reward)}`, m.id);
    });
  });
});

describe('The First Delivery is preserved', () => {
  test('it is exactly what the game has always played (id, places, reward, text)', () => {
    assert.deepEqual(FIRST_DELIVERY, {
      id: 'firstDelivery',
      title: 'The First Delivery',
      reward: 250,
      shop: { marker: { x: 1800, y: 324 }, door: { x: 1800, y: 554 }, offerRadius: 130 },
      pickup: { x: 1800, y: 554, radius: 26 },
      customer: { name: 'Mrs. Folake', x: 1200, y: 1005, radius: 44 },
      doneDelayMs: 3200,
      text: {
        offerKicker: 'NEW JOB',
        offerTitle: 'LAGOON MART',
        offerBody: 'Got a delivery for a customer nearby!',
        offerReward: 'Reward: \u20A6250',
        accept: 'Accept Job',
        decline: 'Not Now',
        objectivePickup: 'Pick up the package at Lagoon Mart',
        objectiveDeliver: 'Deliver the package to Mrs. Folake',
        collectedTitle: 'PACKAGE COLLECTED!',
        collectedBody: 'Now take it to the customer.',
        doneTitle: 'DELIVERY COMPLETED!',
        doneBody: '+\u20A6250',
      },
    });
  });

  test('the first mission is still the primary one, and every mission has its own job marker', () => {
    const scene = makeMissionScene();
    const { createUI } = makeFakeUI();
    const system = new MissionSystem(scene, makePlayer(), undefined, { createUI });
    assert.equal(system.def, FIRST_DELIVERY);
    assert.equal(system.flow.def, FIRST_DELIVERY);
    // Stage 3, step C: all four missions are switched on
    assert.equal(scene.images.filter((i) => i.key === 'mk_quest').length, 4);
    system.destroy();
  });
});

describe('the three new missions', () => {
  const NEW = [FRESH_FROM_THE_OVEN, SUYA_FOR_THE_HALL, ACROSS_ORISUN_CLOSE];

  test('each has the same shape as FIRST_DELIVERY, so MissionFlow can run it', () => {
    const shape = keyPaths(FIRST_DELIVERY);
    NEW.forEach((m) => assert.deepEqual(keyPaths(m), shape, m.id));
  });

  test('they start at the approved shops, and the pickup is the shop door', () => {
    const wanted = [
      ['freshFromTheOven', 'bola', 'Bola Bakery', 1050, 554],
      ['suyaForTheHall', 'suya', 'Waterside Suya Spot', 420, 1664],
      ['acrossOrisunClose', 'ade', 'Ade Mobile Fix', 2080, 554],
    ];
    wanted.forEach(([id, buildingId, name, x, y]) => {
      const mission = MISSIONS.find((m) => m.id === id);
      const building = BUILDINGS.find((b) => b.id === buildingId);
      assert.equal(building.name, name);
      assert.deepEqual(mission.shop.door, { x, y }, id);
      assert.deepEqual(mission.shop.door, { x: building.x, y: building.base + 18 }, id);
      assert.deepEqual({ x: mission.pickup.x, y: mission.pickup.y }, { x, y }, id);
      assert.equal(mission.text.offerTitle, name.toUpperCase(), id);
    });
  });

  test('the customers and their places are the approved ones', () => {
    assert.deepEqual(FRESH_FROM_THE_OVEN.customer, { name: 'Mama Ngozi', x: 150, y: 554, radius: 44 });
    assert.deepEqual(SUYA_FOR_THE_HALL.customer, { name: 'Mr. Okafor', x: 1830, y: 1174, radius: 44 });
    assert.deepEqual(ACROSS_ORISUN_CLOSE.customer, { name: 'Aunty Kemi', x: 250, y: 1176, radius: 44 });
  });

  test('they use the same radii and timing as the first mission (offer radius stays 130)', () => {
    NEW.forEach((m) => {
      assert.equal(m.shop.offerRadius, 130, m.id);
      assert.equal(m.pickup.radius, FIRST_DELIVERY.pickup.radius, m.id);
      assert.equal(m.doneDelayMs, FIRST_DELIVERY.doneDelayMs, m.id);
    });
  });

  test('every text line is a non-empty string, and names the right people and places', () => {
    NEW.forEach((m) => {
      Object.entries(m.text).forEach(([key, value]) => {
        assert.ok(typeof value === 'string' && value.trim().length > 0, `${m.id}.${key}`);
      });
    });
    assert.match(FRESH_FROM_THE_OVEN.text.objectiveDeliver, /Mama Ngozi/);
    assert.match(SUYA_FOR_THE_HALL.text.objectiveDeliver, /Mr\. Okafor/);
    assert.match(ACROSS_ORISUN_CLOSE.text.objectiveDeliver, /Aunty Kemi/);
  });

  test('Aunty Kemi is at Emmy\'s Corner Shop, with no claim that she owns or runs it', () => {
    const text = allText(ACROSS_ORISUN_CLOSE);
    assert.match(text, /aunty kemi at emmy's corner shop has waited all week/);
    ['owner', 'owns', 'manager', 'manages', 'runs the', 'her shop', 'boss'].forEach((word) => {
      assert.ok(!text.includes(word), `the Across Orisun Close text must not say "${word}"`);
    });
  });

  test('no mission text carries Emmy STACK01 promotional messaging', () => {
    MISSIONS.forEach((m) => assert.ok(!allText(m).includes('stack01'), m.id));
  });

  test('no dialogue is defined yet (customer dialogue is a later stage)', () => {
    MISSIONS.forEach((m) => {
      assert.equal('dialogue' in m, false, m.id);
      assert.equal('dialogue' in m.customer, false, m.id);
    });
  });
});
