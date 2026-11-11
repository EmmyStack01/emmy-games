// Stage 4B-1: the customers' dialogue. Pure text, keyed by mission id, separate from missionData.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOMER_DIALOGUE, DIALOGUE_KIND, getCustomerLine } from '../src/missions/customerDialogue.js';
import { MISSIONS, MISSION_IDS, PLAYABLE_MISSION_IDS } from '../src/missions/missionData.js';

// The approved wording, written out in full so any change to a line fails here.
const APPROVED = {
  firstDelivery: {
    // Mrs. Folake
    greeting: 'Over here, Emmy! Is that my parcel?',
    firstDelivery: 'Thank you, Emmy! Right on time.',
    replay: "Another one already? You're quick!",
  },
  freshFromTheOven: {
    // Mama Ngozi
    greeting: 'Is that my bread? It smells wonderful!',
    firstDelivery: 'Still warm! God bless you, Emmy.',
    replay: 'Right on time again. Thank you!',
  },
  suyaForTheHall: {
    // Mr. Okafor
    greeting: 'Ah, the suya! The hall is hungry!',
    firstDelivery: 'At last! Thank you, Emmy.',
    replay: 'Hot and spicy, just as we like it!',
  },
  acrossOrisunClose: {
    // Aunty Kemi
    greeting: 'Is that my phone part? Finally!',
    firstDelivery: 'You crossed all of Orisun Close for me. Thank you!',
    replay: 'Another long haul, and still smiling. Thank you!',
  },
};

const KINDS = ['greeting', 'firstDelivery', 'replay'];

describe('customer dialogue: coverage', () => {
  test('the dialogue kinds are exactly greeting, firstDelivery and replay', () => {
    assert.deepEqual(DIALOGUE_KIND, { GREETING: 'greeting', FIRST_DELIVERY: 'firstDelivery', REPLAY: 'replay' });
  });

  test('every mission has dialogue, and nothing else does', () => {
    assert.deepEqual(Object.keys(CUSTOMER_DIALOGUE).sort(), [...MISSION_IDS].sort());
    assert.deepEqual(Object.keys(CUSTOMER_DIALOGUE).sort(), Object.keys(APPROVED).sort());
  });

  test('every playable mission has dialogue', () => {
    PLAYABLE_MISSION_IDS.forEach((id) => assert.ok(CUSTOMER_DIALOGUE[id], id));
  });

  test('every mission has exactly the three lines', () => {
    MISSION_IDS.forEach((id) => assert.deepEqual(Object.keys(CUSTOMER_DIALOGUE[id]).sort(), [...KINDS].sort(), id));
  });
});

describe('customer dialogue: the approved lines', () => {
  Object.entries(APPROVED).forEach(([id, lines]) => {
    KINDS.forEach((kind) => {
      test(`${id} / ${kind}`, () => {
        assert.equal(CUSTOMER_DIALOGUE[id][kind], lines[kind]);
        assert.equal(getCustomerLine(id, kind), lines[kind]);
      });
    });
  });

  test('the four customers are the four missions in order: Folake, Ngozi, Okafor, Kemi', () => {
    const names = MISSIONS.map((m) => m.customer.name);
    assert.deepEqual(names, ['Mrs. Folake', 'Mama Ngozi', 'Mr. Okafor', 'Aunty Kemi']);
    assert.deepEqual(MISSION_IDS, ['firstDelivery', 'freshFromTheOven', 'suyaForTheHall', 'acrossOrisunClose']);
  });

  test('every line is short, plain, one line of text and different from the others', () => {
    const seen = new Set();
    MISSION_IDS.forEach((id) =>
      KINDS.forEach((kind) => {
        const text = CUSTOMER_DIALOGUE[id][kind];
        assert.equal(typeof text, 'string');
        assert.equal(text, text.trim(), `${id}/${kind} has stray spaces`);
        assert.ok(text.length > 0 && text.length <= 60, `${id}/${kind} is ${text.length} characters`);
        assert.ok(!/[\r\n\t]/.test(text), `${id}/${kind} has a line break`);
        assert.ok(!seen.has(text), `${id}/${kind} repeats another line`);
        seen.add(text);
      }),
    );
  });
});

describe('customer dialogue: lookup', () => {
  test('returns null, and never throws, for an unknown mission or kind', () => {
    assert.equal(getCustomerLine('noSuchMission', 'greeting'), null);
    assert.equal(getCustomerLine('firstDelivery', 'goodbye'), null);
    assert.equal(getCustomerLine('firstDelivery'), null);
    assert.equal(getCustomerLine(), null);
    assert.equal(getCustomerLine(null, null), null);
    assert.equal(getCustomerLine(42, 'greeting'), null);
    assert.equal(getCustomerLine({}, 'greeting'), null);
  });

  test('inherited object names are not missions or kinds', () => {
    ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'].forEach((name) => {
      assert.equal(getCustomerLine(name, 'greeting'), null, name);
      assert.equal(getCustomerLine('firstDelivery', name), null, name);
    });
  });

  test('the kind constants work with the lookup', () => {
    assert.equal(getCustomerLine('firstDelivery', DIALOGUE_KIND.GREETING), APPROVED.firstDelivery.greeting);
    assert.equal(getCustomerLine('freshFromTheOven', DIALOGUE_KIND.FIRST_DELIVERY), APPROVED.freshFromTheOven.firstDelivery);
    assert.equal(getCustomerLine('suyaForTheHall', DIALOGUE_KIND.REPLAY), APPROVED.suyaForTheHall.replay);
  });
});

describe('customer dialogue: immutability', () => {
  test('the data, each customer and the kinds are frozen', () => {
    assert.ok(Object.isFrozen(CUSTOMER_DIALOGUE));
    assert.ok(Object.isFrozen(DIALOGUE_KIND));
    MISSION_IDS.forEach((id) => assert.ok(Object.isFrozen(CUSTOMER_DIALOGUE[id]), id));
  });

  test('a line cannot be changed, added or removed', () => {
    assert.throws(() => {
      CUSTOMER_DIALOGUE.firstDelivery.greeting = 'Hello';
    }, TypeError);
    assert.throws(() => {
      CUSTOMER_DIALOGUE.firstDelivery.extra = 'More';
    }, TypeError);
    assert.throws(() => {
      delete CUSTOMER_DIALOGUE.firstDelivery.replay;
    }, TypeError);
    assert.throws(() => {
      CUSTOMER_DIALOGUE.newMission = {};
    }, TypeError);
    assert.equal(getCustomerLine('firstDelivery', 'greeting'), APPROVED.firstDelivery.greeting);
  });
});

describe('customer dialogue: kept apart from the mission data', () => {
  test('missionData.js has no dialogue in it', () => {
    MISSIONS.forEach((mission) => {
      ['greeting', 'firstDelivery', 'replay', 'dialogue', 'speech'].forEach((key) => {
        assert.ok(!(key in mission), `${mission.id}.${key}`);
        assert.ok(!(key in mission.customer), `${mission.id}.customer.${key}`);
        assert.ok(!(key in mission.text), `${mission.id}.text.${key}`);
      });
    });
  });
});
