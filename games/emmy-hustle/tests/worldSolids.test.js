// World.js must build exactly the solids in solidRects.js: no more, no fewer. This is what
// stops the world and the geometry tests from silently drifting apart.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import World from '../src/systems/World.js';
import { computeSolidRects } from '../src/systems/solidRects.js';
import { BUILDINGS, TREES, BUSHES, LAMPS, BENCHES, STALLS, VEHICLES } from '../src/data/neighbourhood.js';
import { WORLD } from '../src/config.js';
import { makeWorldScene, buildWholeWorld } from './support/fakeWorldScene.js';

const key = (r) => [r.x, r.y, r.w, r.h].join(',');
const sortedKeys = (list) => list.map(key).sort();

function buildWorld(onFlowers) {
  const scene = makeWorldScene();
  const world = new World(scene);
  buildWholeWorld(world, onFlowers);
  return { scene, world };
}

describe('solidRects.js', () => {
  const rects = computeSolidRects();

  test('has one solid for the water, one per building and one per prop', () => {
    const expected = 1 + BUILDINGS.length + TREES.length + BUSHES.length + LAMPS.length + BENCHES.length + STALLS.length + VEHICLES.length + 1; // water, ..., fountain
    assert.equal(rects.length, expected);
  });

  test('every rectangle has a positive size', () => {
    rects.forEach((r) => {
      assert.ok(r.w > 0 && r.h > 0, key(r));
      [r.x, r.y, r.w, r.h].forEach((n) => assert.ok(Number.isFinite(n), key(r)));
    });
  });

  test('every building footprint is the whole building', () => {
    BUILDINGS.forEach((b) => {
      const wanted = { x: b.x - b.w / 2, y: b.base - b.h, w: b.w, h: b.h };
      assert.ok(rects.some((r) => key(r) === key(wanted)), `building ${b.id}`);
    });
  });

  test('the water is solid from the water line to the bottom of the world', () => {
    assert.ok(rects.some((r) => r.x === 0 && r.y === WORLD.waterY && r.w === WORLD.width && r.h === WORLD.height - WORLD.waterY));
  });
});

describe('World.js uses the shared solids', () => {
  test('it creates exactly the rectangles solidRects.js lists', () => {
    const { scene } = buildWorld();
    assert.deepEqual(sortedKeys(scene.zones), sortedKeys(computeSolidRects()));
  });

  test('its own solidRects list (used to place flowers) is the same list', () => {
    const { world } = buildWorld();
    assert.deepEqual(sortedKeys(world.solidRects), sortedKeys(computeSolidRects()));
  });

  test('every solid is added to the collision group, once', () => {
    const { scene } = buildWorld();
    assert.equal(scene.groupMembers.length, computeSolidRects().length);
    assert.equal(new Set(scene.groupMembers).size, scene.groupMembers.length);
  });

  test('all solids exist before the flowers are scattered (flowers avoid solids)', () => {
    let seen = -1;
    buildWorld((count) => {
      seen = count;
    });
    assert.equal(seen, computeSolidRects().length);
  });
});
