// CHARACTERIZATION TESTS for src/missions/MissionFlow.js.
//
// These record how the delivery mission behaves TODAY, so that anything added to
// MissionFlow later (saving and restoring progress) can be shown not to have changed
// it. They only use behaviour that existed before mission persistence: no test here
// may depend on the save-related additions. If one fails after a change, that change
// altered how the mission plays.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import MissionFlow, { STATES } from '../src/missions/MissionFlow.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';

const { shop, pickup, customer } = FIRST_DELIVERY;
const FAR = { x: 0, y: 0 }; // nowhere near the shop, pickup or customer
const AT_SHOP = { x: shop.door.x, y: shop.door.y };
const AT_PICKUP = { x: pickup.x, y: pickup.y };
const AT_CUSTOMER = { x: customer.x, y: customer.y };
const nudge = (point, dx, dy = 0) => ({ x: point.x + dx, y: point.y + dy });

// Every hook call is recorded, in order, so hook order can be checked exactly.
function makeFlow(def = FIRST_DELIVERY) {
  const events = [];
  const flow = new MissionFlow(def, {
    onState: (state, prev) => events.push(['state', state, prev]),
    onPackage: (carrying) => events.push(['package', carrying]),
    onReward: (amount, runId) => events.push(['reward', amount, runId]),
  });
  return { flow, events };
}

const step = (flow, point, dtMs = 16) => flow.update(dtMs, point.x, point.y);
const rewards = (events) => events.filter(([kind]) => kind === 'reward');

function reachOffer(flow) {
  step(flow, AT_SHOP);
  assert.equal(flow.state, 'offer');
}
function reachPickup(flow) {
  reachOffer(flow);
  assert.equal(flow.accept(), true);
}
function reachDeliver(flow) {
  reachPickup(flow);
  step(flow, AT_PICKUP);
  assert.equal(flow.state, 'deliver');
}
function reachDone(flow) {
  reachDeliver(flow);
  step(flow, AT_CUSTOMER);
  assert.equal(flow.state, 'done');
}

describe('the mission as it is defined today', () => {
  test('state names', () => {
    assert.deepEqual(STATES, {
      AVAILABLE: 'available',
      OFFER: 'offer',
      PICKUP: 'pickup',
      DELIVER: 'deliver',
      DONE: 'done',
    });
  });

  test('id, reward and distances', () => {
    assert.equal(FIRST_DELIVERY.id, 'firstDelivery');
    assert.equal(FIRST_DELIVERY.title, 'The First Delivery');
    assert.equal(FIRST_DELIVERY.reward, 250);
    assert.equal(FIRST_DELIVERY.shop.offerRadius, 130);
    assert.equal(FIRST_DELIVERY.pickup.radius, 26);
    assert.deepEqual(FIRST_DELIVERY.customer, { name: 'Mrs. Folake', x: 1200, y: 1005, radius: 44 });
    assert.equal(FIRST_DELIVERY.doneDelayMs, 3200);
  });

  test('the dialogue the player reads', () => {
    assert.deepEqual(FIRST_DELIVERY.text, {
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
    });
  });
});

describe('a new flow', () => {
  test('starts available, with nothing paid and no hooks called', () => {
    const { flow, events } = makeFlow();
    assert.equal(flow.state, 'available');
    assert.equal(flow.runId, 0);
    assert.equal(flow.paid, false);
    assert.equal(flow.dismissed, false);
    assert.equal(flow.isActive, false);
    assert.deepEqual(events, []);
  });

  test('isActive is true only while picking up or delivering', () => {
    const { flow } = makeFlow();
    const seen = {};
    seen.available = flow.isActive;
    reachOffer(flow);
    seen.offer = flow.isActive;
    flow.accept();
    seen.pickup = flow.isActive;
    step(flow, AT_PICKUP);
    seen.deliver = flow.isActive;
    step(flow, AT_CUSTOMER);
    seen.done = flow.isActive;
    assert.deepEqual(seen, { available: false, offer: false, pickup: true, deliver: true, done: false });
  });

  test('hooks are optional', () => {
    const flow = new MissionFlow(FIRST_DELIVERY);
    assert.doesNotThrow(() => reachDone(flow));
    assert.doesNotThrow(() => step(flow, FAR, FIRST_DELIVERY.doneDelayMs));
    assert.equal(flow.state, 'available');
  });
});

describe('the offer', () => {
  test('appears when Emmy is at the shop, with the hook called once', () => {
    const { flow, events } = makeFlow();
    step(flow, FAR);
    assert.equal(flow.state, 'available');
    assert.deepEqual(events, []);

    step(flow, AT_SHOP);
    assert.equal(flow.state, 'offer');
    assert.deepEqual(events, [['state', 'offer', 'available']]);
  });

  test('the offer radius is inclusive: 130 px opens it, 131 px does not', () => {
    const inside = makeFlow().flow;
    step(inside, nudge(AT_SHOP, 130));
    assert.equal(inside.state, 'offer');

    const outside = makeFlow().flow;
    step(outside, nudge(AT_SHOP, 131));
    assert.equal(outside.state, 'available');
  });

  test('stays open, silently, while Emmy waits', () => {
    const { flow, events } = makeFlow();
    reachOffer(flow);
    events.length = 0;
    for (let i = 0; i < 20; i += 1) step(flow, AT_SHOP);
    step(flow, FAR);
    assert.equal(flow.state, 'offer');
    assert.deepEqual(events, []);
  });

  test('"Not Now" closes it and it stays closed until Emmy walks away and back', () => {
    const { flow, events } = makeFlow();
    reachOffer(flow);
    events.length = 0;

    assert.equal(flow.decline(), true);
    assert.equal(flow.state, 'available');
    assert.equal(flow.dismissed, true);
    assert.equal(flow.runId, 0);
    assert.deepEqual(events, [['state', 'available', 'offer']]);

    events.length = 0;
    for (let i = 0; i < 10; i += 1) step(flow, AT_SHOP);
    assert.equal(flow.state, 'available');
    assert.deepEqual(events, []);

    step(flow, FAR);
    assert.equal(flow.dismissed, false);
    step(flow, AT_SHOP);
    assert.equal(flow.state, 'offer');
  });
});

describe('accepting', () => {
  test('only works while the offer is open', () => {
    const { flow, events } = makeFlow();
    assert.equal(flow.accept(), false); // available
    reachDeliver(flow);
    events.length = 0;
    assert.equal(flow.accept(), false); // deliver
    assert.equal(flow.runId, 1);
    step(flow, AT_CUSTOMER);
    events.length = 0;
    assert.equal(flow.accept(), false); // done
    assert.equal(flow.runId, 1);
    assert.deepEqual(events, []);
  });

  test('starts job 1: run id up, reward unpaid, package hook BEFORE the state hook', () => {
    const { flow, events } = makeFlow();
    reachOffer(flow);
    events.length = 0;

    assert.equal(flow.accept(), true);
    assert.equal(flow.state, 'pickup');
    assert.equal(flow.runId, 1);
    assert.equal(flow.paid, false);
    assert.deepEqual(events, [['package', false], ['state', 'pickup', 'offer']]);
  });

  test('declining only works while the offer is open', () => {
    const { flow, events } = makeFlow();
    assert.equal(flow.decline(), false);
    reachPickup(flow);
    events.length = 0;
    assert.equal(flow.decline(), false);
    assert.equal(flow.state, 'pickup');
    assert.deepEqual(events, []);
  });
});

describe('picking up', () => {
  test('nothing happens away from the collection point', () => {
    const { flow, events } = makeFlow();
    reachPickup(flow);
    events.length = 0;
    step(flow, FAR);
    step(flow, nudge(AT_PICKUP, 27));
    assert.equal(flow.state, 'pickup');
    assert.deepEqual(events, []);
  });

  test('at the collection point: package hook (true) BEFORE the state hook', () => {
    const { flow, events } = makeFlow();
    reachPickup(flow);
    events.length = 0;
    step(flow, AT_PICKUP);
    assert.equal(flow.state, 'deliver');
    assert.deepEqual(events, [['package', true], ['state', 'deliver', 'pickup']]);
  });

  test('the pickup radius is inclusive: 26 px collects, 27 px does not', () => {
    const inside = makeFlow().flow;
    reachPickup(inside);
    step(inside, nudge(AT_PICKUP, 26));
    assert.equal(inside.state, 'deliver');

    const outside = makeFlow().flow;
    reachPickup(outside);
    step(outside, nudge(AT_PICKUP, 27));
    assert.equal(outside.state, 'pickup');
  });

  test('the package is collected once: standing there again changes nothing', () => {
    const { flow, events } = makeFlow();
    reachDeliver(flow);
    events.length = 0;
    for (let i = 0; i < 10; i += 1) step(flow, AT_PICKUP);
    assert.equal(flow.state, 'deliver');
    assert.deepEqual(events, []);
  });
});

describe('delivering and the reward', () => {
  test('nothing happens away from the customer', () => {
    const { flow, events } = makeFlow();
    reachDeliver(flow);
    events.length = 0;
    step(flow, FAR);
    step(flow, nudge(AT_CUSTOMER, 45));
    assert.equal(flow.state, 'deliver');
    assert.equal(flow.paid, false);
    assert.deepEqual(events, []);
  });

  test('the customer radius is inclusive: 44 px delivers, 45 px does not', () => {
    const inside = makeFlow().flow;
    reachDeliver(inside);
    step(inside, nudge(AT_CUSTOMER, 44));
    assert.equal(inside.state, 'done');

    const outside = makeFlow().flow;
    reachDeliver(outside);
    step(outside, nudge(AT_CUSTOMER, 45));
    assert.equal(outside.state, 'deliver');
  });

  test('delivery hooks fire in this exact order: state, package off, then reward (250, run 1)', () => {
    const { flow, events } = makeFlow();
    reachDeliver(flow);
    events.length = 0;
    step(flow, AT_CUSTOMER);
    assert.equal(flow.state, 'done');
    assert.equal(flow.paid, true);
    assert.deepEqual(events, [['state', 'done', 'deliver'], ['package', false], ['reward', 250, 1]]);
  });

  test('the reward is paid once per job, however often delivery is attempted', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    for (let i = 0; i < 50; i += 1) {
      assert.equal(flow.complete(), false);
      step(flow, AT_CUSTOMER);
    }
    assert.equal(rewards(events).length, 1);
  });

  test('the paid flag is a second guard: even if the state were forced back to "deliver", a paid job cannot pay again', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    flow.state = 'deliver'; // simulate a bug that puts the flow back into "deliver"
    assert.equal(flow.paid, true);
    assert.equal(flow.complete(), false);
    step(flow, AT_CUSTOMER);
    assert.equal(rewards(events).length, 1);
  });

  test('complete() works only while delivering', () => {
    const { flow, events } = makeFlow();
    assert.equal(flow.complete(), false); // available
    reachOffer(flow);
    assert.equal(flow.complete(), false); // offer
    flow.accept();
    assert.equal(flow.complete(), false); // pickup
    assert.equal(rewards(events).length, 0);

    step(flow, AT_PICKUP);
    assert.equal(flow.complete(), true); // deliver
    assert.equal(rewards(events).length, 1);
  });

  test('the amount comes from the mission definition', () => {
    const { flow, events } = makeFlow({ ...FIRST_DELIVERY, reward: 999 });
    reachDone(flow);
    assert.deepEqual(rewards(events), [['reward', 999, 1]]);
  });
});

describe('after delivery', () => {
  test('"done" lasts doneDelayMs (3200), counted across frames, then the job is available again', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    events.length = 0;

    step(flow, FAR, 1000);
    step(flow, FAR, 1000);
    step(flow, FAR, 1199);
    assert.equal(flow.state, 'done');
    step(flow, FAR, 1);
    assert.equal(flow.state, 'available');
    assert.deepEqual(events, [['state', 'available', 'done']]);
  });

  test('standing at the shop when it ends does not pop the offer open under Emmy', () => {
    const { flow } = makeFlow();
    reachDone(flow);
    step(flow, AT_SHOP, 3200);
    assert.equal(flow.state, 'available');
    assert.equal(flow.dismissed, true);
    step(flow, AT_SHOP);
    assert.equal(flow.state, 'available');

    step(flow, FAR);
    step(flow, AT_SHOP);
    assert.equal(flow.state, 'offer');
  });

  test('away from the shop when it ends, the offer appears on the next visit', () => {
    const { flow } = makeFlow();
    reachDone(flow);
    step(flow, FAR, 3200);
    assert.equal(flow.dismissed, false);
    step(flow, AT_SHOP);
    assert.equal(flow.state, 'offer');
  });

  test('the paid flag stays set until the next job is accepted', () => {
    const { flow } = makeFlow();
    reachDone(flow);
    assert.equal(flow.paid, true);
    step(flow, FAR, 3200);
    assert.equal(flow.paid, true);
    reachOffer(flow);
    assert.equal(flow.paid, true);
    flow.accept();
    assert.equal(flow.paid, false);
  });
});

describe('replaying', () => {
  test('every job pays again, once, with its own run id', () => {
    const { flow, events } = makeFlow();
    for (let job = 1; job <= 3; job += 1) {
      reachDone(flow);
      step(flow, FAR, 3200);
      assert.equal(flow.runId, job);
    }
    assert.deepEqual(rewards(events), [['reward', 250, 1], ['reward', 250, 2], ['reward', 250, 3]]);
  });

  test('the whole first job, hook by hook', () => {
    const { flow, events } = makeFlow();
    step(flow, AT_SHOP);
    flow.accept();
    step(flow, AT_PICKUP);
    step(flow, AT_CUSTOMER);
    step(flow, FAR, 3200);
    assert.deepEqual(events, [
      ['state', 'offer', 'available'],
      ['package', false],
      ['state', 'pickup', 'offer'],
      ['package', true],
      ['state', 'deliver', 'pickup'],
      ['state', 'done', 'deliver'],
      ['package', false],
      ['reward', 250, 1],
      ['state', 'available', 'done'],
    ]);
  });
});

describe('setState', () => {
  test('moving to the state it is already in does nothing', () => {
    const { flow, events } = makeFlow();
    flow.setState('available');
    assert.deepEqual(events, []);
    flow.setState('pickup');
    assert.deepEqual(events, [['state', 'pickup', 'available']]);
  });
});
