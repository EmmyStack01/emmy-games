// Stage 4D: which welcome the player gets. The pure rules and wording (src/missions/welcomeMessages.js),
// plus the one fact about GameScene that cannot be run in Node: when it asks for the welcome.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WELCOME_MESSAGES, getWelcome, announceWelcome } from '../src/missions/welcomeMessages.js';
import { MISSIONS, MISSION_IDS } from '../src/missions/missionData.js';
import { rec, done } from './support/missionGame.js';

const [M1, M2, M3, M4] = MISSIONS;
const A = WELCOME_MESSAGES.firstMission;
const B = WELCOME_MESSAGES.jobInProgress;
const D = WELCOME_MESSAGES.allJobsDone;

// progress in the shape of MissionSystem.progressSnapshot(): every mission has an entry
const progressOf = (overrides = {}) => Object.fromEntries(MISSION_IDS.map((id) => [id, overrides[id] ?? rec()]));
const missionsStub = (progress) => ({ order: [...MISSION_IDS], progressSnapshot: () => progress });

beforeEach(() => mock.method(console, 'warn', () => {}));
afterEach(() => mock.restoreAll());

describe('the approved wording and durations', () => {
  test('A: the first mission is the next job', () => {
    assert.deepEqual({ ...A }, {
      text: 'Welcome to Orisun Close, Emmy! Collect coins, or follow the ! to Lagoon Mart for your first delivery.',
      ms: 8000,
    });
  });
  test('B: a job is in progress', () => {
    assert.deepEqual({ ...B }, { text: 'Welcome back, Emmy! Your delivery is still on.', ms: 4500 });
  });
  test('D: every job is done', () => {
    assert.deepEqual({ ...D }, { text: 'Welcome back, Emmy! Every job is done. Visit any shop to replay one.', ms: 6000 });
  });
  test('there are exactly three messages (state C has none), all frozen', () => {
    assert.deepEqual(Object.keys(WELCOME_MESSAGES).sort(), ['allJobsDone', 'firstMission', 'jobInProgress']);
    assert.ok(Object.isFrozen(WELCOME_MESSAGES));
    Object.values(WELCOME_MESSAGES).forEach((message) => assert.ok(Object.isFrozen(message)));
  });
  test('only the new-player message talks about a first delivery: a returning player is never sent to one', () => {
    [B, D].forEach((message) => assert.ok(!/first|lagoon|collect/i.test(message.text), message.text));
    assert.match(A.text, /first delivery/);
  });
  test('the in-progress welcome ends before the earliest a new-job notice can follow a load (5.2 s)', () => {
    assert.ok(B.ms < 5200);
  });
});

describe('getWelcome: the four states', () => {
  test('A: nothing delivered and nothing in progress', () => {
    assert.equal(getWelcome(MISSION_IDS, progressOf()), A);
  });

  test('B: a job in progress, at either stage, for any mission, first run or replay', () => {
    const cases = {
      'first mission, pickup': { [M1.id]: rec('pickup', 1, 0, 0) },
      'first mission, delivery': { [M1.id]: rec('deliver', 1, 0, 0) },
      'a later mission, pickup': { [M1.id]: done(1), [M2.id]: rec('pickup', 1, 0, 0) },
      'a later mission, delivery': { [M1.id]: done(1), [M2.id]: done(1), [M3.id]: rec('deliver', 1, 0, 0) },
      'a replay in progress': { [M1.id]: rec('pickup', 2, 1, 1) },
      'a replay in progress while a later job waits': { [M1.id]: done(1), [M2.id]: rec('deliver', 2, 1, 1) },
    };
    Object.entries(cases).forEach(([name, overrides]) => assert.equal(getWelcome(MISSION_IDS, progressOf(overrides)), B, name));
  });

  test('C: a later job waiting gives no message (each of the three later missions)', () => {
    const waiting = { [M2.id]: { [M1.id]: done(1) }, [M3.id]: { [M1.id]: done(1), [M2.id]: done(1) }, [M4.id]: { [M1.id]: done(1), [M2.id]: done(1), [M3.id]: done(1) } };
    Object.entries(waiting).forEach(([id, overrides]) => assert.equal(getWelcome(MISSION_IDS, progressOf(overrides)), null, id));
  });

  test('C also holds when earlier jobs have been replayed', () => {
    assert.equal(getWelcome(MISSION_IDS, progressOf({ [M1.id]: done(3) })), null);
  });

  test('D: every job delivered', () => {
    assert.equal(getWelcome(MISSION_IDS, progressOf(Object.fromEntries(MISSION_IDS.map((id) => [id, done(1)])))), D);
    assert.equal(getWelcome(MISSION_IDS, progressOf(Object.fromEntries(MISSION_IDS.map((id) => [id, done(4)])))), D);
  });

  test('no mission list, no welcome (never "every job is done" for nothing)', () => {
    assert.equal(getWelcome([], {}), null);
    assert.equal(getWelcome(undefined, {}), null);
  });
});

describe('announceWelcome', () => {
  test('says the message once, with its duration, and reports it', () => {
    const say = mock.fn();
    assert.equal(announceWelcome(missionsStub(progressOf()), say), true);
    assert.equal(say.mock.callCount(), 1);
    assert.deepEqual(say.mock.calls[0].arguments, [A.text, 8000]);
  });

  test('says nothing when a later job is waiting', () => {
    const say = mock.fn();
    assert.equal(announceWelcome(missionsStub(progressOf({ [M1.id]: done(1) })), say), false);
    assert.equal(say.mock.callCount(), 0);
  });

  test('a failure reading the progress is logged, says nothing, and does not reach the caller', () => {
    const say = mock.fn();
    const missions = { order: MISSION_IDS, progressSnapshot: () => { throw new Error('snapshot boom'); } };
    assert.doesNotThrow(() => assert.equal(announceWelcome(missions, say), false));
    assert.equal(say.mock.callCount(), 0);
    assert.equal(console.warn.mock.callCount(), 1);
    assert.match(String(console.warn.mock.calls[0].arguments[0]), /Welcome/);
  });

  test('a failing say() is logged and NOT retried, and no other way of reaching the player is tried', () => {
    const say = mock.fn(() => { throw new Error('hud boom'); });
    assert.doesNotThrow(() => assert.equal(announceWelcome(missionsStub(progressOf()), say), false));
    assert.equal(say.mock.callCount(), 1);
    assert.equal(console.warn.mock.callCount(), 1);
  });

  test('mission systems that are not there at all do not break it', () => {
    assert.doesNotThrow(() => assert.equal(announceWelcome(null, mock.fn()), false));
    assert.doesNotThrow(() => assert.equal(announceWelcome({}, mock.fn()), false));
  });
});

describe('GameScene asks for the welcome only after the missions exist', () => {
  // GameScene needs Phaser and cannot run in Node, so its order is pinned from the source.
  const source = readFileSync(new URL('../src/scenes/GameScene.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

  test('it calls announceWelcome(this.missions) after new MissionSystem(...)', () => {
    const created = source.indexOf('this.missions = new MissionSystem(');
    const announced = source.indexOf('announceWelcome(this.missions)');
    assert.ok(created > 0 && announced > created);
    assert.match(source, /import \{ announceWelcome \} from '\.\.\/missions\/welcomeMessages\.js';/);
  });

  test('the old fixed message is gone: the wording lives in one place', () => {
    assert.ok(!source.includes('Welcome to Orisun Close'));
    assert.ok(!source.includes('gameState.say('));
  });
});
