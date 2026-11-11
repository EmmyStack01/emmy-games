// The ONE place that decides which parts of Orisun Close are solid. It is pure (no Phaser,
// no scene), so the world builder (World.js) and the tests read exactly the same list: a
// rule changed here changes the game and the tests together, and nothing can drift apart.
//
// Each rectangle is { x, y, w, h } with (x, y) the TOP-LEFT corner, in world pixels.

import { WORLD } from '../config.js';
import * as D from '../data/neighbourhood.js';

// The water below the boardwalk.
export const waterSolid = () => ({
  x: 0,
  y: WORLD.waterY,
  w: WORLD.width,
  h: WORLD.height - WORLD.waterY,
});

// A building's whole footprint, so Emmy can never walk through it.
export const buildingSolid = (b) => ({ x: b.x - b.w / 2, y: b.base - b.h, w: b.w, h: b.h });

// Trunk only.
export const treeSolid = ([type, x, y]) => {
  const w = type === 'palm' ? 14 : 18;
  return { x: x - w / 2, y: y - 18, w, h: 14 };
};

export const bushSolid = ([x, y]) => ({ x: x - 18, y: y - 14, w: 36, h: 12 });
export const lampSolid = ([x, y]) => ({ x: x - 5, y: y - 10, w: 10, h: 8 });
export const benchSolid = ([x, y]) => ({ x: x - 26, y: y - 12, w: 52, h: 10 });
export const stallSolid = ([x, y]) => ({ x: x - 40, y: y - 24, w: 80, h: 22 });
export const vehicleSolid = ({ x, base }) => ({ x: x - 58, y: base - 30, w: 116, h: 28 });
export const fountainSolid = () => ({
  x: D.FOUNTAIN.x - 52,
  y: D.FOUNTAIN.base - 46,
  w: 104,
  h: 42,
});

// Every solid rectangle in the neighbourhood, built from the data in neighbourhood.js.
export function computeSolidRects() {
  return [
    waterSolid(),
    ...D.BUILDINGS.map(buildingSolid),
    ...D.TREES.map(treeSolid),
    ...D.BUSHES.map(bushSolid),
    ...D.LAMPS.map(lampSolid),
    ...D.BENCHES.map(benchSolid),
    ...D.STALLS.map(stallSolid),
    ...D.VEHICLES.map(vehicleSolid),
    fountainSolid(),
  ];
}
