// TEST-ONLY. Answers "can Emmy stand here, and can she walk there from the spawn point?"
// using the SAME solid rectangles World.js builds (solidRects.js) and the SAME collision
// box size as the player (PLAYER in config.js). It copies no collision rules of its own.
//
// Emmy's collision box sits on her feet: bodyWidth wide, bodyHeight tall, with its bottom
// edge at her y. A spot is walkable when that box overlaps no solid and stays inside the world.
import { WORLD, PLAYER } from '../../src/config.js';
import { computeSolidRects } from '../../src/systems/solidRects.js';

const CELL = 8; // search grid, in world pixels (every gap on the map is wider than this)

export function makeWalkability({ rects = computeSolidRects(), start = WORLD.spawn } = {}) {
  const halfWidth = PLAYER.bodyWidth / 2;

  const isBlocked = (x, y) => {
    const left = x - halfWidth;
    const right = x + halfWidth;
    const top = y - PLAYER.bodyHeight;
    const bottom = y;
    if (left < 0 || right > WORLD.width || top < 0 || bottom > WORLD.height) return true;
    return rects.some((r) => left < r.x + r.w && right > r.x && top < r.y + r.h && bottom > r.y);
  };

  const cols = Math.floor(WORLD.width / CELL) + 1;
  const rows = Math.floor(WORLD.height / CELL) + 1;
  const reached = new Uint8Array(cols * rows);

  // Flood fill from the start point over every spot Emmy can stand on.
  const startCol = Math.round(start.x / CELL);
  const startRow = Math.round(start.y / CELL);
  const queue = [[startCol, startRow]];
  if (!isBlocked(startCol * CELL, startRow * CELL)) reached[startRow * cols + startCol] = 1;
  while (queue.length > 0) {
    const [col, row] = queue.pop();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
      const c = col + dc;
      const r = row + dr;
      if (c < 0 || r < 0 || c >= cols || r >= rows || reached[r * cols + c]) return;
      if (isBlocked(c * CELL, r * CELL)) return;
      reached[r * cols + c] = 1;
      queue.push([c, r]);
    });
  }

  // Can Emmy, walking from the start, get within `radius` of (x, y)?
  const canReach = (x, y, radius) => {
    const span = Math.ceil(radius / CELL) + 1;
    const col = Math.round(x / CELL);
    const row = Math.round(y / CELL);
    for (let r = row - span; r <= row + span; r += 1) {
      for (let c = col - span; c <= col + span; c += 1) {
        if (c < 0 || r < 0 || c >= cols || r >= rows || !reached[r * cols + c]) continue;
        if (Math.hypot(c * CELL - x, r * CELL - y) <= radius) return true;
      }
    }
    return false;
  };

  return { isBlocked, canReach, startIsWalkable: reached[startRow * cols + startCol] === 1 };
}
