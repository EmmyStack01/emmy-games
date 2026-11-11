// TEST-ONLY helpers for mission tests: where the points of the mission are, a flow that
// records every hook call in order, and a way to play a job from whatever state it is in.
import MissionFlow from '../../src/missions/MissionFlow.js';
import { FIRST_DELIVERY } from '../../src/missions/missionData.js';
import { createDefaultSave } from '../../src/state/saveSchema.js';

const { shop, pickup, customer } = FIRST_DELIVERY;

export const FAR = { x: 0, y: 0 }; // nowhere near the shop, pickup or customer
export const AT_SHOP = { x: shop.door.x, y: shop.door.y };
export const AT_PICKUP = { x: pickup.x, y: pickup.y };
export const AT_CUSTOMER = { x: customer.x, y: customer.y };
export const MISSION_ID = FIRST_DELIVERY.id;

// A flow whose hook calls are all recorded in `events`, in order.
export function makeFlow(def = FIRST_DELIVERY) {
  const events = [];
  const flow = new MissionFlow(def, {
    onState: (state, prev) => events.push(['state', state, prev]),
    onPackage: (carrying) => events.push(['package', carrying]),
    onReward: (amount, runId) => events.push(['reward', amount, runId]),
  });
  return { flow, events };
}

export const step = (flow, point, dtMs = 16) => flow.update(dtMs, point.x, point.y);
export const rewards = (events) => events.filter(([kind]) => kind === 'reward');
export const rewardRunIds = (events) => rewards(events).map(([, , runId]) => runId);

export function reachOffer(flow) {
  step(flow, AT_SHOP);
  if (flow.state !== 'offer') throw new Error(`expected offer, got ${flow.state}`);
}
export function reachPickup(flow) {
  reachOffer(flow);
  flow.accept();
}
export function reachDeliver(flow) {
  reachPickup(flow);
  step(flow, AT_PICKUP);
}
export function reachDone(flow) {
  reachDeliver(flow);
  step(flow, AT_CUSTOMER);
}

// One move toward finishing the job, from any state.
export function advance(flow) {
  switch (flow.state) {
    case 'available':
      step(flow, FAR); // leave first, so a "Not Now" offer can reopen
      step(flow, AT_SHOP);
      break;
    case 'offer':
      flow.accept();
      break;
    case 'pickup':
      step(flow, AT_PICKUP);
      break;
    case 'deliver':
      step(flow, AT_CUSTOMER);
      break;
    default: // done
      step(flow, FAR, FIRST_DELIVERY.doneDelayMs);
  }
}

// Plays on until `count` more rewards have been paid by this flow (or gives up).
export function playUntilPaid(flow, events, count, maxMoves = 60) {
  const target = rewards(events).length + count;
  for (let i = 0; i < maxMoves && rewards(events).length < target; i += 1) advance(flow);
}

// A whole save file holding this mission progress (for checking it against saveSchema.js).
export function saveWith(progress, overrides = {}) {
  const save = createDefaultSave(500, [MISSION_ID]);
  save.missions[MISSION_ID] = progress;
  return { ...save, ...overrides };
}
