// Tests for the save-related additions to src/missions/MissionFlow.js:
// the counters, toSave(), restore() and the second reward guard.
// (How the mission played before these additions is recorded in MissionFlow.test.js,
// which must keep passing unchanged.)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import MissionFlow from '../src/missions/MissionFlow.js';
import { FIRST_DELIVERY } from '../src/missions/missionData.js';
import { COINS } from '../src/data/neighbourhood.js';
import { validateSave, parseSave, serializeSave } from '../src/state/saveSchema.js';
import {
  FAR,
  AT_SHOP,
  AT_PICKUP,
  AT_CUSTOMER,
  MISSION_ID,
  makeFlow,
  step,
  rewards,
  rewardRunIds,
  reachOffer,
  reachPickup,
  reachDeliver,
  reachDone,
  advance,
  playUntilPaid,
  saveWith,
} from './support/missionHelpers.js';

const CONTEXT = { coinIds: COINS.map((coin) => coin.id), missionIds: [MISSION_ID] };
const progress = (state, runId, completed, lastPaidRunId) => ({ state, runId, completed, lastPaidRunId });

// The fields that describe where a flow is, for comparing two flows.
const fields = (flow) => ({
  state: flow.state,
  runId: flow.runId,
  completed: flow.completed,
  lastPaidRunId: flow.lastPaidRunId,
  paid: flow.paid,
  dismissed: flow.dismissed,
  doneTimer: flow.doneTimer,
});

describe('the new counters', () => {
  test('start at zero', () => {
    const { flow } = makeFlow();
    assert.equal(flow.completed, 0);
    assert.equal(flow.lastPaidRunId, 0);
  });

  test('accepting a job counts the run but does not count it as paid', () => {
    const { flow } = makeFlow();
    reachPickup(flow);
    assert.deepEqual(flow.toSave(), progress('pickup', 1, 0, 0));
    step(flow, AT_PICKUP);
    assert.deepEqual(flow.toSave(), progress('deliver', 1, 0, 0));
  });

  test('declining changes nothing that is saved', () => {
    const { flow } = makeFlow();
    reachOffer(flow);
    flow.decline();
    assert.deepEqual(flow.toSave(), progress('available', 0, 0, 0));
  });

  test('each paid job moves runId, completed and lastPaidRunId together', () => {
    const { flow } = makeFlow();
    for (let job = 1; job <= 3; job += 1) {
      reachDone(flow);
      assert.deepEqual(flow.toSave(), progress('available', job, job, job));
      assert.equal(flow.paid, true);
      step(flow, FAR, FIRST_DELIVERY.doneDelayMs);
    }
  });
});

describe('toSave', () => {
  const live = {
    available: () => makeFlow().flow,
    offer: () => {
      const { flow } = makeFlow();
      reachOffer(flow);
      return flow;
    },
    pickup: () => {
      const { flow } = makeFlow();
      reachPickup(flow);
      return flow;
    },
    deliver: () => {
      const { flow } = makeFlow();
      reachDeliver(flow);
      return flow;
    },
    done: () => {
      const { flow } = makeFlow();
      reachDone(flow);
      return flow;
    },
  };

  test('stores only available, pickup and deliver: offer and done are stored as available', () => {
    const expected = { available: 'available', offer: 'available', pickup: 'pickup', deliver: 'deliver', done: 'available' };
    Object.entries(live).forEach(([name, make]) => {
      const flow = make();
      assert.equal(flow.state, name);
      assert.equal(flow.toSave().state, expected[name], name);
    });
  });

  test('is plain data with exactly four fields, and a fresh object every time', () => {
    const { flow } = makeFlow();
    reachDeliver(flow);
    const first = flow.toSave();
    assert.deepEqual(Object.keys(first).sort(), ['completed', 'lastPaidRunId', 'runId', 'state']);
    assert.deepEqual(JSON.parse(JSON.stringify(first)), first);

    first.runId = 99;
    first.state = 'available';
    assert.equal(flow.runId, 1);
    assert.equal(flow.state, 'deliver');
    assert.notEqual(flow.toSave(), flow.toSave());
  });

  test('changes nothing and calls no hooks', () => {
    const { flow, events } = makeFlow();
    reachDeliver(flow);
    const before = fields(flow);
    events.length = 0;
    flow.toSave();
    flow.toSave();
    assert.deepEqual(fields(flow), before);
    assert.deepEqual(events, []);
  });

  test('always produces progress the real save schema accepts as it is, in every state', () => {
    Object.entries(live).forEach(([name, make]) => {
      const saved = make().toSave();
      const result = validateSave(saveWith(saved), CONTEXT);
      assert.equal(result.ok, true, name);
      assert.deepEqual(result.warnings, [], `${name}: the schema had to repair it`);
      assert.deepEqual(result.save.missions[MISSION_ID], saved, name);

      const text = serializeSave(saveWith(saved), CONTEXT);
      assert.deepEqual(parseSave(text, CONTEXT).save.missions[MISSION_ID], saved, name);
    });
  });
});

describe('restore: every persisted state', () => {
  const cases = [
    ['a brand-new job (as written by the Step 2 build)', progress('available', 0, 0, 0), { isActive: false, paid: false }],
    ['available after three paid jobs', progress('available', 3, 3, 3), { isActive: false, paid: true }],
    ['heading to the pickup on job 4', progress('pickup', 4, 3, 3), { isActive: true, paid: false }],
    ['carrying the package on job 4', progress('deliver', 4, 3, 3), { isActive: true, paid: false }],
  ];

  cases.forEach(([name, saved, expected]) => {
    test(`${name}`, () => {
      const { flow, events } = makeFlow();
      assert.equal(flow.restore(saved), true);
      assert.deepEqual(flow.toSave(), saved, 'toSave gives back exactly what was restored');
      assert.equal(flow.state, saved.state);
      assert.equal(flow.isActive, expected.isActive);
      assert.equal(flow.paid, expected.paid);
      assert.equal(flow.dismissed, false);
      assert.equal(flow.doneTimer, 0);
      assert.deepEqual(events, [], 'restoring calls no hooks at all');
    });
  });

  test('restoring a brand-new save gives exactly the same flow as a new one', () => {
    const fresh = makeFlow().flow;
    const restored = makeFlow().flow;
    restored.restore(progress('available', 0, 0, 0));
    assert.deepEqual(fields(restored), fields(fresh));
  });

  test('a restored flow does not mutate the saved object it was given', () => {
    const saved = progress('deliver', 2, 1, 1);
    const copy = { ...saved };
    const { flow } = makeFlow();
    flow.restore(saved);
    step(flow, AT_CUSTOMER);
    assert.deepEqual(saved, copy);
  });
});

describe('restore never triggers hooks or rewards', () => {
  test('across every combination of state and counters, however odd', () => {
    const states = ['available', 'offer', 'pickup', 'deliver', 'done', 'junk', '', null, undefined, 7];
    const counts = [0, 1, 2, 3, -1, 1.5, NaN, Infinity, '2', null, undefined];
    let combinations = 0;
    states.forEach((state) => {
      counts.forEach((runId) => {
        counts.forEach((lastPaidRunId) => {
          const { flow, events } = makeFlow();
          flow.restore({ state, runId, completed: runId, lastPaidRunId });
          for (let frame = 0; frame < 5; frame += 1) step(flow, FAR);
          combinations += 1;
          assert.deepEqual(events, [], `state=${state} runId=${runId} lastPaidRunId=${lastPaidRunId}`);
        });
      });
    });
    assert.ok(combinations > 1000);
  });

  test('a restored flow that is merely idle never pays anything', () => {
    const { flow, events } = makeFlow();
    flow.restore(progress('deliver', 2, 1, 1));
    for (let frame = 0; frame < 500; frame += 1) step(flow, FAR);
    assert.deepEqual(events, []);
    assert.equal(flow.state, 'deliver');
  });
});

describe('a restored job carries on exactly as a live one would', () => {
  test('restored at the pickup: collect, deliver, paid once as run 4', () => {
    const { flow, events } = makeFlow();
    flow.restore(progress('pickup', 4, 3, 3));
    step(flow, FAR);
    assert.deepEqual(events, []);

    step(flow, AT_PICKUP);
    assert.deepEqual(events, [['package', true], ['state', 'deliver', 'pickup']]);
    events.length = 0;
    step(flow, AT_CUSTOMER);
    assert.deepEqual(events, [['state', 'done', 'deliver'], ['package', false], ['reward', 250, 4]]);
    assert.deepEqual(flow.toSave(), progress('available', 4, 4, 4));
  });

  test('restored while carrying: only the customer pays, and only once', () => {
    const { flow, events } = makeFlow();
    flow.restore(progress('deliver', 4, 3, 3));
    step(flow, AT_PICKUP);
    step(flow, FAR);
    assert.deepEqual(events, []);

    step(flow, AT_CUSTOMER);
    assert.deepEqual(rewards(events), [['reward', 250, 4]]);
    for (let i = 0; i < 30; i += 1) {
      flow.complete();
      step(flow, AT_CUSTOMER);
    }
    assert.equal(rewards(events).length, 1);
    assert.deepEqual(flow.toSave(), progress('available', 4, 4, 4));
  });

  test('restored as available: the offer appears and the next job is run 4', () => {
    const { flow, events } = makeFlow();
    flow.restore(progress('available', 3, 3, 3));
    step(flow, AT_SHOP);
    assert.equal(flow.state, 'offer');
    flow.accept();
    assert.equal(flow.runId, 4);
    assert.equal(flow.paid, false);
    events.length = 0;
    step(flow, AT_PICKUP);
    step(flow, AT_CUSTOMER);
    assert.deepEqual(rewardRunIds(events), [4]);
    assert.deepEqual(flow.toSave(), progress('available', 4, 4, 4));
  });
});

describe('restore makes unusable data safe', () => {
  test('a run that is already paid is never resumed, and then cannot be paid', () => {
    ['pickup', 'deliver'].forEach((state) => {
      const { flow, events } = makeFlow();
      flow.restore(progress(state, 3, 3, 3));
      assert.equal(flow.state, 'available', state);
      assert.equal(flow.paid, true);
      step(flow, AT_CUSTOMER);
      assert.equal(flow.complete(), false);
      assert.deepEqual(events, []);
    });
  });

  test('a run id behind the last paid run is raised, so ids are never reused', () => {
    const { flow } = makeFlow();
    flow.restore(progress('pickup', 1, 5, 5));
    assert.deepEqual(flow.toSave(), progress('available', 5, 5, 5));
  });

  test('"offer", "done" and unknown states become "available"', () => {
    ['offer', 'done', 'junk', '', null, undefined, 7].forEach((state) => {
      const { flow } = makeFlow();
      flow.restore({ state, runId: 2, completed: 1, lastPaidRunId: 1 });
      assert.equal(flow.state, 'available', String(state));
    });
  });

  test('a job in progress with run id 0 is impossible, so it becomes "available"', () => {
    ['pickup', 'deliver'].forEach((state) => {
      const { flow } = makeFlow();
      flow.restore(progress(state, 0, 0, 0));
      assert.equal(flow.state, 'available');
    });
  });

  test('counters that are not whole numbers (0 or more) become 0', () => {
    [-1, 1.5, NaN, Infinity, -Infinity, '2', null, undefined, {}, [], true, 1e300].forEach((bad) => {
      const { flow } = makeFlow();
      flow.restore({ state: 'available', runId: bad, completed: bad, lastPaidRunId: bad });
      assert.deepEqual(flow.toSave(), progress('available', 0, 0, 0), String(bad));
    });
  });

  test('extra fields in the saved data are ignored', () => {
    const { flow } = makeFlow();
    flow.restore({ ...progress('pickup', 2, 1, 1), position: { x: 1, y: 2 }, cheat: true });
    assert.deepEqual(flow.toSave(), progress('pickup', 2, 1, 1));
  });

  test('things that are not saved progress are ignored: the flow is left as it was', () => {
    [null, undefined, 'deliver', 5, true, []].forEach((bad) => {
      const { flow } = makeFlow();
      reachPickup(flow);
      const before = fields(flow);
      assert.equal(flow.restore(bad), false, String(bad));
      assert.deepEqual(fields(flow), before);
    });
  });

  test('restoring replaces everything, including timers and the "Not Now" flag', () => {
    const { flow } = makeFlow();
    reachDone(flow);
    step(flow, AT_SHOP, 1000); // part-way through the "done" banner, standing at the shop
    flow.dismissed = true;
    flow.restore(progress('available', 5, 5, 5));
    assert.deepEqual(fields(flow), {
      state: 'available',
      runId: 5,
      completed: 5,
      lastPaidRunId: 5,
      paid: true,
      dismissed: false,
      doneTimer: 0,
    });
  });
});

describe('repeated completion attempts', () => {
  test('a delivered job pays once, however many attempts follow', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    for (let i = 0; i < 100; i += 1) {
      assert.equal(flow.complete(), false);
      step(flow, AT_CUSTOMER);
    }
    assert.deepEqual(rewardRunIds(events), [1]);
    assert.equal(flow.completed, 1);
    assert.equal(flow.lastPaidRunId, 1);
  });

  test('the lastPaidRunId guard works on its own: even with the state AND the paid flag forced back, the run cannot pay', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    flow.state = 'deliver';
    flow.paid = false;
    assert.equal(flow.complete(), false);
    step(flow, AT_CUSTOMER);
    assert.deepEqual(rewardRunIds(events), [1]);
    assert.equal(flow.completed, 1);
  });

  test('the same holds for a restored flow', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    const afterDelivery = flow.toSave();

    const reloaded = makeFlow();
    reloaded.flow.restore(afterDelivery);
    reloaded.flow.state = 'deliver';
    reloaded.flow.paid = false;
    assert.equal(reloaded.flow.complete(), false);
    step(reloaded.flow, AT_CUSTOMER);
    assert.deepEqual(reloaded.events, []);
    assert.deepEqual(rewardRunIds(events), [1]);
  });

  test('the guard never blocks a genuine new job', () => {
    const { flow, events } = makeFlow();
    reachDone(flow);
    step(flow, FAR, FIRST_DELIVERY.doneDelayMs);
    reachDone(flow);
    assert.deepEqual(rewardRunIds(events), [1, 2]);
  });
});

describe('reloading while carrying the package', () => {
  test('any number of reloads leaves the job unpaid and carrying; delivering pays it once', () => {
    let { flow, events } = makeFlow();
    reachDeliver(flow);
    let saved = flow.toSave();
    assert.deepEqual(saved, progress('deliver', 1, 0, 0));

    for (let reload = 0; reload < 5; reload += 1) {
      ({ flow, events } = makeFlow());
      flow.restore(saved);
      for (let frame = 0; frame < 20; frame += 1) step(flow, FAR);
      assert.deepEqual(events, [], `reload ${reload}`);
      assert.deepEqual(flow.toSave(), saved, `reload ${reload}`);
    }

    ({ flow, events } = makeFlow());
    flow.restore(saved);
    step(flow, AT_CUSTOMER);
    assert.deepEqual(rewards(events), [['reward', 250, 1]]);
    saved = flow.toSave();
    assert.deepEqual(saved, progress('available', 1, 1, 1));

    for (let reload = 0; reload < 5; reload += 1) {
      ({ flow, events } = makeFlow());
      flow.restore(saved);
      step(flow, AT_CUSTOMER);
      step(flow, AT_CUSTOMER);
      assert.deepEqual(events, [], `after delivery, reload ${reload}`);
      assert.deepEqual(flow.toSave(), saved);
    }
  });
});

describe('completing and replaying after a reload', () => {
  test('each job after each reload is paid once, with the next run id', () => {
    let { flow, events } = makeFlow();
    reachDone(flow);
    let saved = flow.toSave();

    for (let job = 2; job <= 4; job += 1) {
      ({ flow, events } = makeFlow());
      flow.restore(saved);
      playUntilPaid(flow, events, 1);
      assert.deepEqual(rewardRunIds(events), [job], `job ${job}`);
      saved = flow.toSave();
      assert.deepEqual(saved, progress('available', job, job, job));
    }
  });
});

describe('saves written by the Step 2 build', () => {
  // Step 2 wrote the missions section untouched: a brand-new entry for the mission.
  const STEP_2_SAVE = JSON.stringify({
    v: 1,
    savedAt: 1_791_720_000_000,
    money: 600,
    coins: { collected: { 'orisun-01': 1_791_719_000_000, 'orisun-02': 1_791_719_500_000 } },
    missions: { firstDelivery: { state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 } },
  });

  test('the schema accepts it unchanged and the flow starts exactly like a new game', () => {
    const parsed = parseSave(STEP_2_SAVE, CONTEXT);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.warnings, []);

    const fresh = makeFlow().flow;
    const { flow, events } = makeFlow();
    assert.equal(flow.restore(parsed.save.missions[MISSION_ID]), true);
    assert.deepEqual(fields(flow), fields(fresh));
    assert.deepEqual(events, []);
  });

  test('the first job after upgrading plays and pays normally, as run 1', () => {
    const parsed = parseSave(STEP_2_SAVE, CONTEXT);
    const { flow, events } = makeFlow();
    flow.restore(parsed.save.missions[MISSION_ID]);
    playUntilPaid(flow, events, 1);
    assert.deepEqual(rewards(events), [['reward', 250, 1]]);
    assert.deepEqual(flow.toSave(), progress('available', 1, 1, 1));
  });
});

// ---------------------------------------------------------------------------------------
// WORST-CASE REWARD TIMING
//
// What is simulated. A game session plays two whole jobs. At EVERY point where the
// flow calls a hook, and again between every public call, a snapshot is taken with
// flow.toSave(): the progress a save would capture at that exact instant. Then, for every
// snapshot, a brand-new session is started from it (restore) and played on until it has
// earned three more rewards. "paidBefore" lists the rewards whose payout had COMPLETED in
// the old session before the snapshot instant; "paidAfter" those paid by the new session.
//
// What it proves, about MissionFlow only:
//   1. No snapshot, taken at any instant, ever lets a run be paid twice (once in the old
//      session and again after restoring, or twice after restoring).
//   2. A payout never completes before the run is recorded as paid (lastPaidRunId).
//   3. A run can be recorded as paid before its payout has completed ONLY during
//      complete() itself, at three named instants. A snapshot taken there and restored
//      would LOSE that reward; it can never duplicate it. That is the safe direction.
//
// What it does NOT prove. It says nothing about money (MissionFlow does not know about
// money), about how or when a save is written to storage, or about the browser or device
// being stopped at an arbitrary moment: a real save only captures these instants if it is
// taken inside complete() itself. Keeping saves out of that window, and money in the same
// snapshot, is the job of the SaveManager and MissionSystem steps (3B, 3C), and storage
// atomicity is a browser property that no test here can guarantee.
// ---------------------------------------------------------------------------------------
describe('worst-case reward timing (a snapshot taken at every possible instant)', () => {
  function recordTwoJobs() {
    const snapshots = [];
    const paidSoFar = []; // run ids whose payout has completed
    const snap = (at) => snapshots.push({ at, saved: flow.toSave(), paidBefore: [...paidSoFar] });
    const flow = new MissionFlow(FIRST_DELIVERY, {
      onState: (state, prev) => snap(`onState ${prev}->${state}`),
      onPackage: (carrying) => snap(`onPackage(${carrying}) while ${flow.state}`),
      onReward: (amount, runId) => {
        snap('onReward, before it is paid'); // the payout has not completed yet
        paidSoFar.push(runId);
      },
    });
    snap('start');
    for (let moves = 0; moves < 80 && paidSoFar.length < 2; moves += 1) {
      advance(flow);
      snap('between calls');
    }
    assert.deepEqual(paidSoFar, [1, 2], 'the scripted play paid both jobs');
    return snapshots;
  }

  const snapshots = recordTwoJobs();
  const INSIDE_COMPLETE = ['onState deliver->done', 'onPackage(false) while done', 'onReward, before it is paid'];

  function sessionFrom(saved) {
    const { flow, events } = makeFlow();
    flow.restore(saved);
    assert.deepEqual(events, [], 'restoring calls no hooks');
    playUntilPaid(flow, events, 3);
    return rewardRunIds(events);
  }

  test('every snapshot is progress the schema accepts exactly as it is', () => {
    assert.ok(snapshots.length > 25);
    snapshots.forEach(({ at, saved }) => {
      const result = validateSave(saveWith(saved), CONTEXT);
      assert.equal(result.ok, true, at);
      assert.deepEqual(result.warnings, [], at);
    });
  });

  test('1. no run is ever paid twice, whichever instant is restored', () => {
    snapshots.forEach(({ at, saved, paidBefore }) => {
      const paidAfter = sessionFrom(saved);
      assert.equal(paidAfter.length, 3, at);
      assert.equal(new Set(paidAfter).size, paidAfter.length, `${at}: the new session paid a run twice`);
      paidAfter.forEach((runId) => {
        assert.ok(runId > saved.lastPaidRunId, `${at}: run ${runId} was already recorded as paid`);
        assert.ok(!paidBefore.includes(runId), `${at}: run ${runId} was paid before and again after restoring`);
      });
    });
  });

  test('2. a payout never completes before its run is recorded as paid', () => {
    const early = snapshots.filter(({ saved, paidBefore }) => paidBefore.some((runId) => saved.lastPaidRunId < runId));
    assert.deepEqual(early.map(({ at }) => at), []);
  });

  test('3. a run is recorded as paid before its payout completes only inside complete(), at three instants', () => {
    [1, 2].forEach((run) => {
      const early = snapshots.filter(({ saved, paidBefore }) => saved.lastPaidRunId >= run && !paidBefore.includes(run));
      assert.deepEqual(
        early.map(({ at }) => at),
        INSIDE_COMPLETE,
        `run ${run}`
      );
    });
  });

  test('those three instants lose the reward rather than duplicate it; every other instant pays it exactly once', () => {
    [1, 2].forEach((run) => {
      snapshots.forEach(({ at, saved, paidBefore }) => {
        // only look at snapshots taken while this run is the job in progress or just finished
        if (saved.runId !== run) return;
        const payoutsInTotal = (paidBefore.includes(run) ? 1 : 0) + (sessionFrom(saved).includes(run) ? 1 : 0);
        if (INSIDE_COMPLETE.includes(at)) assert.equal(payoutsInTotal, 0, `${at}: expected the reward to be lost, not repeated`);
        else if (saved.state === 'available' && saved.lastPaidRunId < run) return; // run accepted but abandoned: not a payout question
        else assert.equal(payoutsInTotal, 1, `${at} (run ${run}) should pay exactly once in total`);
      });
    });
  });
});
