// Stage 4C: the new-job notices. Pure text, keyed by mission id, separate from missionData.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { JOB_NOTICES, JOB_NOTICE_MS, getJobNotice } from '../src/missions/jobNotices.js';
import { MISSIONS, MISSION_IDS } from '../src/missions/missionData.js';

// The approved wording, written out in full so any change to a line fails here.
const APPROVED = {
  freshFromTheOven: 'New job at Bola Bakery! Follow the ! to find it.',
  suyaForTheHall: 'New job at Waterside Suya Spot! Follow the ! to find it.',
  acrossOrisunClose: 'New job at Ade Mobile Fix! Follow the ! to find it.',
};

describe('job notices: the approved wording', () => {
  Object.entries(APPROVED).forEach(([id, text]) => {
    test(id, () => {
      assert.equal(JOB_NOTICES[id], text);
      assert.equal(getJobNotice(id), text);
    });
  });

  test('exactly the three missions that open up after a delivery have a notice', () => {
    assert.deepEqual(Object.keys(JOB_NOTICES).sort(), Object.keys(APPROVED).sort());
    assert.deepEqual(Object.keys(JOB_NOTICES).sort(), MISSION_IDS.slice(1).sort());
  });

  test('the first mission has no notice: it is open from the start (the welcome message covers it)', () => {
    assert.equal(getJobNotice(MISSION_IDS[0]), null);
    assert.ok(!(MISSION_IDS[0] in JOB_NOTICES));
  });

  test('each notice names its mission\'s own shop (as the offer card spells it)', () => {
    MISSIONS.slice(1).forEach((m) => {
      assert.ok(JOB_NOTICES[m.id].toUpperCase().includes(m.text.offerTitle), `${m.id}: ${m.text.offerTitle}`);
    });
  });

  test('every notice is short, plain and different from the others', () => {
    const seen = new Set();
    Object.values(JOB_NOTICES).forEach((text) => {
      assert.equal(text, text.trim());
      assert.ok(text.length > 0 && text.length <= 70, `${text.length} characters`);
      assert.ok(!/[\r\n\t]/.test(text));
      assert.ok(!seen.has(text));
      seen.add(text);
    });
  });

  test('it is shown for about 4.5 seconds', () => {
    assert.equal(JOB_NOTICE_MS, 4500);
  });
});

describe('job notices: lookup', () => {
  test('returns null, and never throws, for an unknown id or a wrong kind of value', () => {
    assert.equal(getJobNotice('noSuchMission'), null);
    assert.equal(getJobNotice(''), null);
    assert.equal(getJobNotice(), null);
    assert.equal(getJobNotice(null), null);
    assert.equal(getJobNotice(42), null);
    assert.equal(getJobNotice({}), null);
    assert.equal(getJobNotice(['freshFromTheOven']), null);
  });

  test('inherited object names are not missions', () => {
    ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'].forEach((name) => {
      assert.equal(getJobNotice(name), null, name);
    });
  });
});

describe('job notices: immutability', () => {
  test('the data is frozen and a line cannot be changed, added or removed', () => {
    assert.ok(Object.isFrozen(JOB_NOTICES));
    assert.throws(() => {
      JOB_NOTICES.freshFromTheOven = 'Hello';
    }, TypeError);
    assert.throws(() => {
      JOB_NOTICES.extra = 'More';
    }, TypeError);
    assert.throws(() => {
      delete JOB_NOTICES.suyaForTheHall;
    }, TypeError);
    assert.equal(getJobNotice('freshFromTheOven'), APPROVED.freshFromTheOven);
  });
});

describe('job notices: kept apart from the mission data', () => {
  test('missionData.js has no notice text in it', () => {
    MISSIONS.forEach((mission) => {
      ['jobNotice', 'notice', 'newJobNotice', 'unlockNotice'].forEach((key) => {
        assert.ok(!(key in mission), `${mission.id}.${key}`);
        assert.ok(!(key in mission.text), `${mission.id}.text.${key}`);
      });
    });
  });
});
