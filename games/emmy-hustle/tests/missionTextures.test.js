// The customer looks. Mrs. Folake's drawing must stay exactly as it always was, and every other
// customer must be a genuinely different drawing, not Mrs. Folake under another name.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { makeMissionTextures, CUSTOMER_LOOKS, customerTextureKey } from '../src/missions/missionTextures.js';
import { MISSIONS, CUSTOMER_LOOK, PLAYABLE_MISSION_IDS } from '../src/missions/missionData.js';
import { makeTextureScene, coloursOf } from './support/fakeTextureScene.js';

// The sha256 of Mrs. Folake's 80 drawing calls, taken from the game as it was BEFORE the
// customer drawing became "a look". If this changes, her picture has changed.
const FOLAKE_CALLS = 80;
const FOLAKE_SHA256 = '8082d06194db5da7075c95115b96496a45886a1e33d6ae39df43051771ce9b98';
const NGOZI_CALLS = 98;
const NGOZI_SHA256 = '01c76c8e2e8ae6b26f3bdfe1ae80e2300bc7c47e67a21c55228474d38de385c9';
const OKAFOR_CALLS = 84;
const KEMI_CALLS = 81;
const KEMI_SHA256 = 'e2131451442dbd1f09b838d5fcde4acc5432c605e6b83c65ebbdbeb1707158bd';
const OKAFOR_SHA256 = '5b2145785df39c85914e88dc91f43cc9014bb88a4c715ce36c9f9a3ea6fcae48';
const hashOf = (texture) => createHash('sha256').update(JSON.stringify(texture.calls)).digest('hex');

const baked = () => {
  const { scene, textures } = makeTextureScene();
  makeMissionTextures(scene);
  return textures;
};

describe('texture keys', () => {
  test('Mrs. Folake keeps the key "customer"; every other look gets its own key', () => {
    assert.equal(customerTextureKey('folake'), 'customer');
    assert.equal(customerTextureKey('ngozi'), 'customer_ngozi');
    assert.equal(customerTextureKey('okafor'), 'customer_okafor');
  });

  test('every look is baked once, under a unique key, at the customer size', () => {
    const textures = baked();
    const keys = Object.keys(CUSTOMER_LOOKS).map(customerTextureKey);
    assert.equal(new Set(keys).size, keys.length);
    keys.forEach((key) => {
      assert.ok(textures[key], key);
      assert.deepEqual([textures[key].w, textures[key].h], [40, 56], key);
    });
  });

  test('baking twice does not draw anything again', () => {
    const { scene, textures } = makeTextureScene();
    makeMissionTextures(scene);
    const before = JSON.stringify(textures);
    makeMissionTextures(scene);
    assert.equal(JSON.stringify(textures), before);
  });
});

describe('Mrs. Folake is unchanged', () => {
  test('her drawing is exactly the original: same calls, same order, same numbers', () => {
    const folake = baked().customer;
    assert.equal(folake.calls.length, FOLAKE_CALLS);
    assert.equal(hashOf(folake), FOLAKE_SHA256);
  });
});

describe('Mama Ngozi, Mr. Okafor and Aunty Kemi keep their drawings', () => {
  // Pinned after each was approved. If one changes, that customer's picture has changed.
  test('Mama Ngozi: the exact drawing approved in step A', () => {
    const ngozi = baked().customer_ngozi;
    assert.equal(ngozi.calls.length, NGOZI_CALLS);
    assert.equal(hashOf(ngozi), NGOZI_SHA256);
  });

  test('Mr. Okafor: the exact drawing approved in step B', () => {
    const okafor = baked().customer_okafor;
    assert.equal(okafor.calls.length, OKAFOR_CALLS);
    assert.equal(hashOf(okafor), OKAFOR_SHA256);
  });

  test('Aunty Kemi: the drawing made in step C', () => {
    const kemi = baked().customer_kemi;
    assert.equal(kemi.calls.length, KEMI_CALLS);
    assert.equal(hashOf(kemi), KEMI_SHA256);
  });
});

describe('every customer is a different drawing from every other', () => {
  const textures = baked();
  const looks = Object.keys(CUSTOMER_LOOKS);
  const pairs = looks.flatMap((a, i) => looks.slice(i + 1).map((b) => [a, b]));
  const roles = ['skin', 'shoes', 'dress', 'pattern', 'wrap', 'wrapStripe'];
  // what makes the SILHOUETTE different: apron, robe band, headwear, beard, glasses, knot side, waving hand
  const features = (spec) => [spec.apron !== null, spec.trim !== null, spec.headwear, spec.beard !== null, spec.glasses !== null, spec.knotSide, spec.waveSide].join('|');

  test('there are four looks to compare, one per customer', () => {
    assert.equal(looks.length, 4);
  });

  pairs.forEach(([a, b]) => {
    const ta = textures[customerTextureKey(a)];
    const tb = textures[customerTextureKey(b)];

    test(`${a} and ${b}: different drawings, not one renamed`, () => {
      assert.notEqual(hashOf(ta), hashOf(tb));
      const length = Math.max(ta.calls.length, tb.calls.length);
      let differing = 0;
      for (let i = 0; i < length; i += 1) {
        if (JSON.stringify(ta.calls[i]) !== JSON.stringify(tb.calls[i])) differing += 1;
      }
      assert.ok(differing > 30, `only ${differing} drawing calls differ`);
    });

    test(`${a} and ${b}: skin, shoes, dress, pattern and headwear colours all differ`, () => {
      roles.forEach((role) => assert.notEqual(CUSTOMER_LOOKS[a][role], CUSTOMER_LOOKS[b][role], role));
    });

    test(`${a} and ${b}: different silhouettes`, () => {
      assert.notEqual(features(CUSTOMER_LOOKS[a]), features(CUSTOMER_LOOKS[b]));
    });
  });

  test('every look has every part defined', () => {
    Object.entries(CUSTOMER_LOOKS).forEach(([look, spec]) => {
      ['skin', 'shoes', 'dress', 'pattern', 'wrap', 'wrapStripe', 'knotSide', 'waveSide', 'headwear'].forEach((part) => {
        assert.ok(spec[part] !== undefined, `${look}.${part}`);
      });
      ['apron', 'trim', 'beard', 'glasses'].forEach((part) => assert.ok(part in spec, `${look}.${part}`));
      assert.ok(['left', 'right'].includes(spec.knotSide));
      assert.ok(['left', 'right'].includes(spec.waveSide));
      assert.ok(['wrap', 'cap', 'puff'].includes(spec.headwear));
    });
  });

  test('the optional features are only drawn for the looks that have them', () => {
    // Mr. Okafor's cap, robe band and beard add drawing calls; Folake and Ngozi have none of them
    assert.ok(textures.customer_okafor.calls.some(([name]) => name === 'fillTriangle'));
    assert.ok(!textures.customer.calls.some(([name]) => name === 'fillTriangle'));
    assert.ok(!textures.customer_ngozi.calls.some(([name]) => name === 'fillTriangle'));
    assert.ok(coloursOf(textures.customer_okafor).has(CUSTOMER_LOOKS.okafor.beard));
    assert.ok(!coloursOf(textures.customer_ngozi).has(CUSTOMER_LOOKS.okafor.trim));
    // Aunty Kemi's glasses are the only stroked circles, and only she has them
    const strokes = (key) => textures[key].calls.filter(([name]) => name === 'strokeCircle').length;
    assert.equal(strokes('customer_kemi'), 2);
    ['customer', 'customer_ngozi', 'customer_okafor'].forEach((key) => assert.equal(strokes(key), 0, key));
  });
});

describe('which mission uses which look', () => {
  test('every look named for a mission exists', () => {
    Object.entries(CUSTOMER_LOOK).forEach(([missionId, look]) => {
      assert.ok(MISSIONS.some((m) => m.id === missionId), missionId);
      assert.ok(look in CUSTOMER_LOOKS, `${missionId} -> ${look}`);
    });
  });

  test('The First Delivery is Mrs. Folake', () => {
    assert.equal(CUSTOMER_LOOK.firstDelivery, 'folake');
  });

  test('no two customers share a look (a different person is a different picture)', () => {
    const looks = Object.values(CUSTOMER_LOOK);
    assert.equal(new Set(looks).size, looks.length);
  });

  test('every mission that can be played has a look of its own', () => {
    PLAYABLE_MISSION_IDS.forEach((id) => assert.ok(CUSTOMER_LOOK[id], id));
  });
});
