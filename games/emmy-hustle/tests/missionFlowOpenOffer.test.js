// MissionFlow.openOffer(): opens the offer card because the player asked for it (the "Replay
// mission" prompt). It works only from "available", pays nothing and moves no counter.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import MissionFlow, { STATES } from '../src/missions/MissionFlow.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { FAR, AT_SHOP, makeFlow, step, reachDone } from './support/missionHelpers.js';

const completed = () => {
  const { flow } = makeFlow();
  reachDone(flow);
  step(flow, FAR, FIRST_DELIVERY.doneDelayMs); // back to "available", delivered once
  return flow;
};

describe('openOffer()', () => {
  test('opens the offer from "available", exactly once, and tells the hooks', () => {
    const calls = [];
    const flow = new MissionFlow(FIRST_DELIVERY, { onState: (state, prev) => calls.push([state, prev]) });
    assert.equal(flow.openOffer(), true);
    assert.equal(flow.state, STATES.OFFER);
    assert.deepEqual(calls, [[STATES.OFFER, STATES.AVAILABLE]]);
    assert.equal(flow.openOffer(), false);
    assert.equal(calls.length, 1);
  });

  test('works for a replay: a delivered mission opens its card on request', () => {
    const flow = completed();
    assert.equal(flow.state, STATES.AVAILABLE);
    assert.equal(flow.openOffer(), true);
    assert.equal(flow.state, STATES.OFFER);
  });

  test('does nothing from any other state', () => {
    [STATES.OFFER, STATES.PICKUP, STATES.DELIVER, STATES.DONE].forEach((state) => {
      const { flow } = makeFlow();
      flow.state = state;
      assert.equal(flow.openOffer(), false, state);
      assert.equal(flow.state, state, state);
    });
  });

  test('pays nothing and changes no counter: opening the card is not accepting it', () => {
    const rewards = [];
    const flow = new MissionFlow(FIRST_DELIVERY, { onReward: (amount) => rewards.push(amount) });
    reachDone(flow);
    step(flow, FAR, FIRST_DELIVERY.doneDelayMs);
    const before = flow.toSave();
    const paidBefore = rewards.length;
    flow.openOffer();
    assert.deepEqual(flow.toSave(), { ...before, state: 'available' }); // an open offer is saved as "available"
    assert.equal(flow.runId, before.runId);
    assert.equal(flow.completed, before.completed);
    assert.equal(rewards.length, paidBefore);
  });

  test('the card it opens behaves as always: Accept starts a new run, Not Now closes it', () => {
    const accepted = completed();
    accepted.openOffer();
    const runBefore = accepted.runId;
    assert.equal(accepted.accept(), true);
    assert.equal(accepted.state, STATES.PICKUP);
    assert.equal(accepted.runId, runBefore + 1);

    const declined = completed();
    declined.openOffer();
    assert.equal(declined.decline(), true);
    assert.equal(declined.state, STATES.AVAILABLE);
  });

  test('walking up to the shop still opens the offer by itself (the flow itself is unchanged)', () => {
    const { flow } = makeFlow();
    step(flow, FAR);
    step(flow, AT_SHOP);
    assert.equal(flow.state, STATES.OFFER);
  });

  test('an offer declined while Emmy stays at the shop stays closed until she leaves and returns, as ever', () => {
    const { flow } = makeFlow();
    step(flow, AT_SHOP); // the offer opens by itself
    flow.decline();
    step(flow, AT_SHOP);
    assert.equal(flow.state, STATES.AVAILABLE);
    step(flow, FAR);
    step(flow, AT_SHOP);
    assert.equal(flow.state, STATES.OFFER);
  });
});
