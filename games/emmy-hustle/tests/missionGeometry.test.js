// Where the missions happen must be somewhere Emmy can actually stand and walk to.
// The checks use the shared solids (solidRects.js) and the real player box size, so they
// follow the real collision rules. They are geometry only: they say nothing about how a
// route feels to walk on a phone.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS } from '../src/missions/missionData.js';
import { COINS } from '../src/data/neighbourhood.js';
import { WORLD } from '../src/config.js';
import { makeWalkability } from './support/walkability.js';

const walk = makeWalkability();
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const STAND_ON_IT = 12; // "Emmy can stand on the spot itself", allowing for the search grid

describe('the walkable map', () => {
  test('the spawn point is walkable', () => {
    assert.equal(walk.startIsWalkable, true);
    assert.equal(walk.isBlocked(WORLD.spawn.x, WORLD.spawn.y), false);
  });

  test('every coin can be reached from the spawn point', () => {
    COINS.forEach((coin) => assert.equal(walk.canReach(coin.x, coin.y, 20), true, coin.id));
  });
});

describe('mission locations', () => {
  MISSIONS.forEach((mission) => {
    describe(mission.id, () => {
      const { shop, pickup, customer } = mission;

      test('the shop door, the pickup and the customer are not inside anything solid', () => {
        [['door', shop.door], ['pickup', pickup], ['customer', customer]].forEach(([name, p]) => {
          assert.equal(walk.isBlocked(p.x, p.y), false, `${name} (${p.x}, ${p.y})`);
        });
      });

      test('Emmy can walk from the spawn point to the door, the pickup and the customer', () => {
        assert.equal(walk.canReach(shop.door.x, shop.door.y, STAND_ON_IT), true, 'door');
        assert.equal(walk.canReach(pickup.x, pickup.y, STAND_ON_IT), true, 'pickup');
        assert.equal(walk.canReach(customer.x, customer.y, STAND_ON_IT), true, 'customer');
      });

      test('the pickup is inside the offer radius, so it is reached from the offer card', () => {
        assert.ok(dist(pickup, shop.door) <= shop.offerRadius);
      });

      test('everything is inside the world', () => {
        [shop.door, shop.marker, pickup, customer].forEach((p) => {
          assert.ok(p.x > 0 && p.x < WORLD.width && p.y > 0 && p.y < WORLD.height, `(${p.x}, ${p.y})`);
        });
      });

      test('the customer is clear of every shop door, so no offer card pops up on delivery', () => {
        MISSIONS.forEach((other) => {
          assert.ok(dist(customer, other.shop.door) > other.shop.offerRadius, `${customer.name} vs ${other.id} door`);
        });
      });
    });
  });

  test('no two shop doors are close enough for their offer cards to overlap', () => {
    MISSIONS.forEach((a, i) => {
      MISSIONS.slice(i + 1).forEach((b) => {
        assert.ok(dist(a.shop.door, b.shop.door) > a.shop.offerRadius + b.shop.offerRadius, `${a.id} vs ${b.id}`);
      });
    });
  });

  test('every mission has its own shop', () => {
    assert.equal(new Set(MISSIONS.map((m) => `${m.shop.door.x},${m.shop.door.y}`)).size, MISSIONS.length);
  });
});
