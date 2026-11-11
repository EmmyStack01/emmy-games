// The arrow's real position after each delivery, with the game's own data and updateArrow() maths.
import { MISSIONS } from '/home/claude/work/src/missions/missionData.js';
import { WORLD, CAMERA } from '/home/claude/work/src/config.js';
const VPS = JSON.parse(process.argv[2]);
const M = { l: 36, r: 36, t: 120, b: 170 }; // MissionSystem.updateArrow margins
const out = [];
for (const [w, h] of VPS) {
  const wanted = Math.min(Math.max(Math.min(w, h) / CAMERA.targetShortSide, CAMERA.minZoom), CAMERA.maxZoom);
  const zoom = Math.max(wanted, Math.max(w / WORLD.width, h / WORLD.height));
  for (let i = 0; i < 3; i++) {
    const from = MISSIONS[i], next = MISSIONS[i + 1];
    // Emmy has just delivered: standing on the customer (and a few px around it)
    for (const [ox, oy] of [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30]]) {
      const px = from.customer.x + ox, py = from.customer.y + oy;
      const vw = w / zoom, vh = h / zoom;
      const vx = Math.min(Math.max(px - vw / 2, 0), WORLD.width - vw);
      const vy = Math.min(Math.max(py - CAMERA.followOffsetY - vh / 2, 0), WORLD.height - vh);
      const t = next.shop.marker;
      const sx = (t.x - vx) * zoom, sy = (t.y - vy) * zoom;
      const onScreen = sx > M.l && sx < w - M.r && sy > M.t && sy < h - M.b;
      if (onScreen) { out.push({ w, h, from: from.id, next: next.id, off: [ox, oy], arrow: null, sx, sy }); continue; }
      const cx = w / 2, cy = h / 2, dx = sx - cx, dy = sy - cy;
      const scaleX = (dx > 0 ? w - M.r - cx : cx - M.l) / Math.max(Math.abs(dx), 1e-6);
      const scaleY = (dy > 0 ? h - M.b - cy : cy - M.t) / Math.max(Math.abs(dy), 1e-6);
      const k = Math.min(scaleX, scaleY);
      out.push({ w, h, from: from.id, next: next.id, off: [ox, oy], arrow: { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) }, sx, sy });
    }
  }
}
console.log(JSON.stringify(out));
