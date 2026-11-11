// The gold pin that used to bob above Emmy's Corner Shop from the first frame has been removed.
// This guards against it coming back, and checks that what must NOT change did not:
// Emmy's Corner Shop itself, and the mission arrows that guide the player to the missions.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import Phaser from 'phaser';
import World from '../src/systems/World.js';
import { generateAllTextures } from '../src/systems/TextureFactory.js';
import { makeMissionTextures } from '../src/missions/missionTextures.js';
import { computeSolidRects, buildingSolid } from '../src/systems/solidRects.js';
import * as MAP from '../src/data/neighbourhood.js';
import { MISSIONS } from '../src/missions/missionData.js';
import { makeWorldScene, buildWholeWorld } from './support/fakeWorldScene.js';
import { makeTextureScene } from './support/fakeTextureScene.js';
import { FAR, done, storageWith, launch, accept, pick, cust } from './support/missionGame.js';

const [, , , M4] = MISSIONS;
const OLD_PIN_POSITION = { x: 190, y: 936 }; // where the pin used to float, above the shop

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});
afterEach(() => mock.restoreAll());

function buildWorld() {
  const scene = makeWorldScene();
  const world = new World(scene);
  buildWholeWorld(world);
  return { scene, world };
}

describe('the pin above Emmy\'s Corner Shop is gone', () => {
  test('the world places no "marker" picture, and nothing at the pin\'s old position', () => {
    const { scene } = buildWorld();
    assert.equal(scene.images.filter((i) => i.key === 'marker').length, 0);
    assert.equal(scene.images.filter((i) => i.x === OLD_PIN_POSITION.x && i.y === OLD_PIN_POSITION.y).length, 0);
  });

  test('World no longer has a way to place it', () => {
    const { world } = buildWorld();
    assert.equal(typeof world.placeHomeMarker, 'undefined');
  });

  test('its texture is no longer made', () => {
    // The test stand-in for Phaser has no random numbers, angles or colour maths, which the ground
    // tiles and props use. These stand-ins only need to let the drawing run: the test looks at
    // WHICH textures are made, not at how they look.
    const saved = { Math: Phaser.Math, Display: Phaser.Display };
    Phaser.Math = { Between: (min) => min, DegToRad: (deg) => (deg * Math.PI) / 180 };
    const colour = (c) => ({ color: c, darken: () => colour(c), lighten: () => colour(c) });
    Phaser.Display = { Color: { ValueToColor: colour } };
    try {
      const { scene, textures } = makeTextureScene();
      generateAllTextures(scene);
      assert.ok(!('marker' in textures));
      assert.ok(Object.keys(textures).length > 10, 'the other textures are still made');
    } finally {
      ['Math', 'Display'].forEach((name) => {
        if (saved[name] === undefined) delete Phaser[name];
        else Phaser[name] = saved[name];
      });
    }
  });

  test('the map data no longer holds a position for it', () => {
    assert.equal(MAP.HOME, undefined);
  });
});

describe('Emmy\'s Corner Shop is exactly where and what it was', () => {
  const shop = MAP.BUILDINGS.find((b) => b.id === 'emmy');

  test('same name, position and size', () => {
    assert.equal(shop.name, "Emmy's Corner Shop");
    assert.deepEqual([shop.x, shop.base, shop.w, shop.h], [190, 1156, 240, 200]);
  });

  test('it is still built: its sign is drawn and its footprint is still solid', () => {
    const { scene } = buildWorld();
    assert.ok(scene.texts.some((t) => t.text === "Emmy's Corner Shop"));
    const footprint = buildingSolid(shop);
    assert.ok(computeSolidRects().some((r) => JSON.stringify(r) === JSON.stringify(footprint)));
    assert.ok(scene.zones.some((z) => JSON.stringify(z) === JSON.stringify(footprint)));
  });
});

describe('the mission arrows are untouched', () => {
  test('the mission arrow textures are still made', () => {
    const { scene, textures } = makeTextureScene();
    makeMissionTextures(scene);
    assert.ok('mk_arrow_blue' in textures);
    assert.ok('mk_arrow_gold' in textures);
  });

  test('each mission still has its own pickup arrow and customer arrow in the world', () => {
    const game = launch(storageWith());
    assert.equal(game.scene.images.filter((i) => i.key === 'mk_arrow_blue').length, MISSIONS.length);
    assert.equal(game.scene.images.filter((i) => i.key === 'mk_arrow_gold').length, MISSIONS.length);
    game.close();
  });

  test('the edge-of-screen arrow still guides the player: to the new job, then the pickup, then the customer', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1) }));
    game.scene.camera.worldView = { x: 0, y: 0 };
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'offer'); // to Ade Mobile Fix, the new job
    accept(game, M4);
    game.at(FAR);
    assert.equal(game.ui.arrow?.kind, 'pickup');
    game.at(pick(M4));
    game.at(pick(M4));
    assert.equal(game.ui.arrow?.kind, 'deliver');
    game.close();
  });

  test('Aunty Kemi\'s own gold arrow still shows over her while the part is being delivered', () => {
    const game = launch(storageWith({ firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1) }));
    accept(game, M4);
    game.at(pick(M4));
    const view = game.view(M4.id);
    assert.equal(view.customerArrow.visible, true);
    assert.deepEqual([view.customerArrow.x, view.customerArrow.y], [M4.customer.x, M4.customer.y - 74]);
    game.at(cust(M4));
    game.close();
  });
});
