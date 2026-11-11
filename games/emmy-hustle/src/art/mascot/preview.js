import Phaser from 'phaser';
import Pen from './Pen.js';
import { drawMascot } from './drawMascot.js';
import { FRAME, FEET_Y, computeLayout } from './drawMascotFront.js';
import { SHEET } from './sheetLayout.js';
import { walkPose, WALK_FRAME_COUNT, STANCE_SPEED } from './walkCycle.js';
import { DEFAULT_SPEC, CONTROLS, cloneSpec, getPath, setPath, mergeSpec } from './spec.js';

// Development-only preview for the Emmy mascot. It is NOT imported by the game
// and is not part of `npm run build`.

const STORAGE_KEY = 'emmys-hustle:mascot-preview:v2';
const SPRITE_SCALE = 0.5; // planned in-game display scale of the 128px frame

const VIEWS = [
  ['front', 'Front'],
  ['back', 'Back'],
  ['left', 'Side (left)'],
  ['right', 'Side (right)'],
];

const BACKGROUNDS = [
  ['grass', 'Grass'],
  ['road', 'Road'],
  ['sidewalk', 'Sidewalk'],
  ['plaza', 'Plaza'],
  ['shop', 'Shop wall + door'],
  ['checker', 'Transparent'],
  ['white', 'White'],
  ['dark', 'Dark'],
];

const GAME_TILES = [
  { label: 'Phone · zoom 0.85', zoom: 0.85 },
  { label: 'Game · zoom 1.0', zoom: 1 },
  { label: 'Desktop · zoom 1.4', zoom: 1.4 },
];
const TILE_W = 180;
const TILE_H = 190;

const IDLE_TILES = VIEWS.map(([key, label]) => ({ key, label, canvas: null }));
const WALK_TILES = VIEWS.map(([key, label]) => ({ key, label, canvas: null }));

const STRIP_SEGMENTS = [
  ['grass', 0, 150],
  ['sidewalk', 150, 260],
  ['road', 260, 430],
  ['plaza', 430, 580],
  ['shop', 580, 720],
];
const STRIP_X = [75, 205, 345, 505, 665];
const STRIP_W = 720;
const STRIP_H = 190;
const STRIP_FEET = 150;

const state = {
  spec: loadSpec(),
  view: 'front',
  bg: 'grass',
  guides: true,
  stripZoom: 1,
  scene: null,
  raf: 0,
  statusTimer: 0,
  frames: null,
  idle: null,
  walk: null,
  anim: { playing: true, fps: SHEET.animations.idle.fps, zoom: 1.4, manualFrame: 0, frame: -1 },
  walkAnim: {
    playing: true,
    fps: SHEET.animations.walk.fps,
    zoom: 1.4,
    manualFrame: 0,
    frame: -1,
    ruler: true,
    groundSpeed: 25,
  },
};
const inputs = [];

/* ------------------------------------------------------------------ helpers */

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (v === undefined) return;
    if (k === 'text') node.textContent = v;
    else if (k === 'className') node.className = v;
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  });
  return node;
}

const format = (v) => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));

function setStatus(text, ms = 2500) {
  const node = $('#status');
  node.textContent = text;
  clearTimeout(state.statusTimer);
  if (ms) state.statusTimer = setTimeout(() => (node.textContent = ''), ms);
}

function loadSpec() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeSpec(cloneSpec(DEFAULT_SPEC), JSON.parse(raw));
  } catch (_) {
    /* ignore */
  }
  return cloneSpec(DEFAULT_SPEC);
}

function saveSpec() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.spec));
  } catch (_) {
    /* ignore */
  }
}

/* --------------------------------------------------------- Phaser rendering */

// A tiny hidden Phaser game, used only so we can draw with Phaser Graphics.
function createRenderer() {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(host);
    new Phaser.Game({
      type: Phaser.CANVAS,
      parent: host,
      width: 4,
      height: 4,
      banner: false,
      audio: { noAudio: true },
      scene: {
        create() {
          resolve(this);
        },
      },
    });
  });
}

// Draws one drawn view ('front' | 'back' | 'side') at `size` px, returns a plain canvas.
// pose: see computeLayout() (lift for idle, bobDy/legL/legR/armL/armR for walking).
function bakeFrame(size, drawView, pose = {}) {
  const scene = state.scene;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  drawMascot(new Pen(g, size / FRAME), state.spec, drawView, pose);

  const key = `mascot_${drawView}_${size}`;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  g.generateTexture(key, size, size);
  g.destroy();

  const src = scene.textures.get(key).getSourceImage();
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  out.getContext('2d').drawImage(src, 0, 0);
  return out;
}

function flipH(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

// view: 'front' | 'back' | 'left' | 'right'
function bakeView(view, size, pose = {}) {
  if (view === 'right') return flipH(bakeFrame(size, 'side', pose));
  return bakeFrame(size, view === 'left' ? 'side' : view, pose);
}

/* -------------------------------------------------------------- backgrounds */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// z = camera-zoom-like scale (1 world pixel = z canvas pixels).
function paintBackground(ctx, w, h, kind, z, floorY) {
  const fy = floorY ?? h * 0.78;
  switch (kind) {
    case 'grass': {
      ctx.fillStyle = '#7ccf6e';
      ctx.fillRect(0, 0, w, h);
      const r = rng(7);
      const n = Math.round((w * h) / (700 * z * z));
      for (let i = 0; i < n; i++) {
        const x = r() * w;
        const y = r() * h;
        ctx.fillStyle = i % 2 ? '#8fdc80' : '#6bbb5e';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3 * z, y - 7 * z);
        ctx.lineTo(x + 6 * z, y);
        ctx.fill();
      }
      break;
    }
    case 'road': {
      ctx.fillStyle = '#434a58';
      ctx.fillRect(0, 0, w, h);
      const r = rng(11);
      const n = Math.round((w * h) / (120 * z * z));
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 ? '#4d5565' : '#3a404c';
        ctx.fillRect(r() * w, r() * h, 2 * z, 2 * z);
      }
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 4 * z;
      ctx.setLineDash([38 * z, 28 * z]);
      ctx.beginPath();
      ctx.moveTo(0, Math.max(10 * z, fy - 60 * z));
      ctx.lineTo(w, Math.max(10 * z, fy - 60 * z));
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'sidewalk': {
      ctx.fillStyle = '#e9dcc0';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#cdbc98';
      ctx.lineWidth = 2 * z;
      const step = 32 * z;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      break;
    }
    case 'plaza': {
      const step = 32 * z;
      for (let y = 0, row = 0; y < h; y += step, row++) {
        for (let x = 0, col = 0; x < w; x += step, col++) {
          ctx.fillStyle = (row + col) % 2 ? '#eab883' : '#f2c999';
          ctx.fillRect(x, y, step, step);
        }
      }
      break;
    }
    case 'shop': {
      ctx.fillStyle = '#ffe0b2';
      ctx.fillRect(0, 0, w, fy);
      ctx.fillStyle = '#2a9d8f';
      ctx.fillRect(0, 0, w, Math.min(fy * 0.25, 34 * z));
      ctx.fillStyle = '#e9dcc0';
      ctx.fillRect(0, fy, w, h - fy);
      const dw = 34 * z;
      const dh = 62 * z;
      const dx = w * 0.14;
      ctx.fillStyle = '#7b4a2d';
      ctx.fillRect(dx, fy - dh, dw, dh);
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3 * z;
      ctx.strokeRect(dx, fy - dh, dw, dh);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(dx + dw - 6 * z, fy - dh / 2, 2 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(0, fy - 1.5 * z, w, 3 * z);
      break;
    }
    case 'checker': {
      const step = 12;
      for (let y = 0, row = 0; y < h; y += step, row++) {
        for (let x = 0, col = 0; x < w; x += step, col++) {
          ctx.fillStyle = (row + col) % 2 ? '#dcdcdc' : '#f6f6f6';
          ctx.fillRect(x, y, step, step);
        }
      }
      break;
    }
    case 'dark':
      ctx.fillStyle = '#10131f';
      ctx.fillRect(0, 0, w, h);
      break;
    default:
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
  }
}

function drawShadow(ctx, x, y, z) {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y - 1.5 * z, 15 * z, 5 * z, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGuides(ctx, cx, feetY, z, W, H) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,70,70,0.9)';
  ctx.beginPath();
  ctx.moveTo(0, Math.round(feetY) + 0.5);
  ctx.lineTo(W, Math.round(feetY) + 0.5);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,220,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(Math.round(cx) + 0.5, 0);
  ctx.lineTo(Math.round(cx) + 0.5, H);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,170,0,0.95)';
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(cx - 11 * z + 0.5, feetY - 14 * z + 0.5, 22 * z, 14 * z); // 22x14 collision box
  ctx.restore();
}

function labelText(ctx, text, x, y) {
  ctx.save();
  ctx.font = 'bold 11px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.fillStyle = '#ffffff';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Scrolling ticks on the ground, to check for foot sliding. The ground moves
// opposite to the walking direction.
function drawRuler(ctx, view, cx, feetY, z, offset) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 2;
  const period = 22 * z;
  if (view === 'left' || view === 'right') {
    const dir = view === 'left' ? 1 : -1; // facing left: the ground moves right
    const o = (((offset * dir) % period) + period) % period;
    for (let x = o - period; x < TILE_W; x += period) {
      ctx.beginPath();
      ctx.moveTo(x, feetY + 3 * z);
      ctx.lineTo(x, feetY + 10 * z);
      ctx.stroke();
    }
  } else {
    const dir = view === 'front' ? -1 : 1; // walking toward the camera: the ground moves up
    const o = (((offset * dir) % period) + period) % period;
    for (let y = o - period; y < TILE_H; y += period) {
      [
        [cx - 52 * z, cx - 34 * z],
        [cx + 34 * z, cx + 52 * z],
      ].forEach(([x0, x1]) => {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
      });
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ drawing */

function drawGameTiles(art128) {
  GAME_TILES.forEach((tile) => {
    const ctx = tile.canvas.getContext('2d');
    const z = tile.zoom;
    const feetY = TILE_H * 0.78;
    const cx = TILE_W / 2;
    paintBackground(ctx, TILE_W, TILE_H, state.bg, z, feetY);
    drawShadow(ctx, cx, feetY, z);
    const s = SPRITE_SCALE * z;
    ctx.drawImage(art128, cx - 64 * s, feetY - FEET_Y * s, FRAME * s, FRAME * s);
    if (state.guides) drawGuides(ctx, cx, feetY, z, TILE_W, TILE_H);
  });
}

function drawDetail(canvas, art, k) {
  const size = FRAME * k;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const z = 2 * k; // 1 world pixel = 2 frame pixels at native size
  paintBackground(ctx, size, size, state.bg, z, FEET_Y * k);
  drawShadow(ctx, size / 2, FEET_Y * k, z);
  ctx.drawImage(art, 0, 0);
  if (state.guides) {
    drawGuides(ctx, size / 2, FEET_Y * k, z, size, size);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    ctx.restore();
  }
}

function drawStrip(art128) {
  const z = state.stripZoom;
  const canvas = $('#strip');
  canvas.width = Math.round(STRIP_W * z);
  canvas.height = Math.round(STRIP_H * z);
  canvas.style.width = `${canvas.width}px`;
  const ctx = canvas.getContext('2d');
  const feetY = STRIP_FEET * z;

  STRIP_SEGMENTS.forEach(([kind, x0, x1]) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 * z, 0, (x1 - x0) * z, canvas.height);
    ctx.clip();
    ctx.translate(x0 * z, 0);
    paintBackground(ctx, (x1 - x0) * z, canvas.height, kind, z, feetY);
    ctx.restore();
  });

  const s = SPRITE_SCALE * z;
  STRIP_X.forEach((x) => {
    const px = x * z;
    drawShadow(ctx, px, feetY, z);
    ctx.drawImage(art128, px - 64 * s, feetY - FEET_Y * s, FRAME * s, FRAME * s);
    if (state.guides) drawGuides(ctx, px, feetY, z, 0, 0);
  });
}

// All four standing views side by side: native size on top, in-game size below.
function drawTurnaround(frames) {
  const canvas = $('#turnaround');
  const W = 512;
  const TOP = 128;
  const BOT = 110;
  canvas.width = W;
  canvas.height = TOP + BOT;
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, TOP);
  ctx.clip();
  paintBackground(ctx, W, TOP, state.bg, 2, FEET_Y);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, TOP, W, BOT);
  ctx.clip();
  ctx.translate(0, TOP);
  paintBackground(ctx, W, BOT, state.bg, 1, BOT * 0.78);
  ctx.restore();

  const feetBottom = TOP + BOT * 0.78;
  VIEWS.forEach(([view, label], i) => {
    const x = i * 128 + 64;
    drawShadow(ctx, x, FEET_Y, 2);
    ctx.drawImage(frames[view], i * 128, 0);

    drawShadow(ctx, x, feetBottom, 1);
    const s = SPRITE_SCALE;
    ctx.drawImage(frames[view], x - 64 * s, feetBottom - FEET_Y * s, FRAME * s, FRAME * s);

    if (state.guides) {
      drawGuides(ctx, x, FEET_Y, 2, 0, 0);
      drawGuides(ctx, x, feetBottom, 1, 0, 0);
    }
    labelText(ctx, label, x, 12);
  });
}

// Both idle frames of the front, back and side views at native size.
function drawIdleFrames(idle) {
  const canvas = $('#idle-frames');
  const W = FRAME * 6;
  const TOP = 14;
  const H = FRAME + TOP;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  paintBackground(ctx, W, H, state.bg, 2, TOP + FEET_Y);

  const neutral = computeLayout(state.spec);
  [
    ['front', 'Front'],
    ['back', 'Back'],
    ['left', 'Side'],
  ].forEach(([key, label], vi) => {
    for (let i = 0; i < 2; i++) {
      const x = (vi * 2 + i) * FRAME;
      drawShadow(ctx, x + 64, TOP + FEET_Y, 2);
      ctx.drawImage(idle[key][i], x, TOP);

      if (state.guides) {
        drawGuides(ctx, x + 64, TOP + FEET_Y, 2, W, H);
        ctx.save();
        ctx.strokeStyle = 'rgba(120,255,120,0.9)'; // neutral shoulder line
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, TOP + neutral.shoulderY + 0.5);
        ctx.lineTo(x + FRAME, TOP + neutral.shoulderY + 0.5);
        ctx.stroke();
        ctx.restore();
      }
      labelText(ctx, `${label} · frame ${i + 1}`, x + 64, 10);
    }
  });
}

// All 6 walk frames for front, back and side at native size.
function drawWalkFrames(walk) {
  const canvas = $('#walk-frames');
  const ROW_H = FRAME + 14;
  const W = FRAME * WALK_FRAME_COUNT;
  const H = ROW_H * 3;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  [
    ['front', 'Front'],
    ['back', 'Back'],
    ['left', 'Side'],
  ].forEach(([key, label], r) => {
    const rowTop = r * ROW_H;
    const feetY = rowTop + 14 + FEET_Y;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rowTop, W, ROW_H);
    ctx.clip();
    ctx.translate(0, rowTop);
    paintBackground(ctx, W, ROW_H, state.bg, 2, 14 + FEET_Y);
    ctx.restore();

    for (let k = 0; k < WALK_FRAME_COUNT; k++) {
      const x = k * FRAME;
      drawShadow(ctx, x + 64, feetY, 2);
      ctx.drawImage(walk[key][k], x, rowTop + 14);
      if (state.guides) drawGuides(ctx, x + 64, feetY, 2, 0, 0);
      labelText(ctx, `${label} · ${k + 1}`, x + 64, rowTop + 10);
    }
    if (state.guides) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,70,70,0.9)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(feetY) + 0.5);
      ctx.lineTo(W, Math.round(feetY) + 0.5);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawIdleAnim() {
  if (!state.idle) return;
  const { zoom, frame } = state.anim;
  IDLE_TILES.forEach((tile) => {
    const ctx = tile.canvas.getContext('2d');
    const feetY = TILE_H * 0.78;
    const cx = TILE_W / 2;
    paintBackground(ctx, TILE_W, TILE_H, state.bg, zoom, feetY);
    drawShadow(ctx, cx, feetY, zoom);
    const s = SPRITE_SCALE * zoom;
    ctx.drawImage(state.idle[tile.key][frame], cx - 64 * s, feetY - FEET_Y * s, FRAME * s, FRAME * s);
    if (state.guides) drawGuides(ctx, cx, feetY, zoom, TILE_W, TILE_H);
  });
}

function drawWalkAnim(now) {
  if (!state.walk) return;
  const w = state.walkAnim;
  const { zoom, frame } = w;
  const offset = w.ruler && w.playing ? (now / 1000) * w.groundSpeed * zoom : 0;
  WALK_TILES.forEach((tile) => {
    const ctx = tile.canvas.getContext('2d');
    const feetY = TILE_H * 0.78;
    const cx = TILE_W / 2;
    paintBackground(ctx, TILE_W, TILE_H, state.bg, zoom, feetY);
    if (w.ruler) drawRuler(ctx, tile.key, cx, feetY, zoom, offset);
    drawShadow(ctx, cx, feetY, zoom);
    const s = SPRITE_SCALE * zoom;
    ctx.drawImage(state.walk[tile.key][frame], cx - 64 * s, feetY - FEET_Y * s, FRAME * s, FRAME * s);
    if (state.guides) drawGuides(ctx, cx, feetY, zoom, TILE_W, TILE_H);
  });
}

function animLoop(now) {
  requestAnimationFrame(animLoop);

  if (state.idle) {
    const a = state.anim;
    const frame = a.playing ? Math.floor((now / 1000) * a.fps) % 2 : a.manualFrame;
    if (frame !== a.frame) {
      a.frame = frame;
      drawIdleAnim();
    }
  }

  if (state.walk) {
    const w = state.walkAnim;
    const frame = w.playing
      ? Math.floor((now / 1000) * w.fps) % WALK_FRAME_COUNT
      : w.manualFrame;
    if (frame !== w.frame || (w.ruler && w.playing)) {
      w.frame = frame;
      drawWalkAnim(now);
    }
  }
}

function render() {
  try {
    const breathe = { lift: state.spec.idle.lift };

    const frames = {};
    frames.front = bakeFrame(128, 'front');
    frames.back = bakeFrame(128, 'back');
    frames.left = bakeFrame(128, 'side');
    frames.right = flipH(frames.left);
    state.frames = frames;

    const idle = {
      front: [frames.front, bakeFrame(128, 'front', breathe)],
      back: [frames.back, bakeFrame(128, 'back', breathe)],
      left: [frames.left, bakeFrame(128, 'side', breathe)],
    };
    idle.right = [frames.right, flipH(idle.left[1])];
    state.idle = idle;

    const walk = { front: [], back: [], left: [] };
    for (let k = 0; k < WALK_FRAME_COUNT; k++) {
      walk.front.push(bakeFrame(128, 'front', walkPose(k, 'front', state.spec.walk)));
      walk.back.push(bakeFrame(128, 'back', walkPose(k, 'back', state.spec.walk)));
      walk.left.push(bakeFrame(128, 'side', walkPose(k, 'side', state.spec.walk)));
    }
    walk.right = walk.left.map(flipH);
    state.walk = walk;

    const current = frames[state.view];
    drawGameTiles(current);
    drawDetail($('#detail2'), bakeView(state.view, 256), 2);
    drawDetail($('#detail4'), bakeView(state.view, 512), 4);
    drawStrip(current);
    drawTurnaround(frames);
    drawIdleFrames(idle);
    drawWalkFrames(walk);
    state.anim.frame = -1; // make the animation loop redraw the tiles
    state.walkAnim.frame = -1;
  } catch (err) {
    console.error(err);
    setStatus(`Render error: ${err.message}`, 0);
  }
}

function scheduleRender() {
  cancelAnimationFrame(state.raf);
  state.raf = requestAnimationFrame(() => {
    render();
    saveSpec();
  });
}

/* ----------------------------------------------------------------------- UI */

function buildControls() {
  const root = $('#controls-body');
  CONTROLS.forEach((section) => {
    const details = el('details', { open: !!section.open });
    details.append(el('summary', { text: section.title }));

    section.items.forEach((item) => {
      const row = el('label', { className: 'row' });
      const name = el('span', { className: 'row-label', text: item.label });
      let input;
      let out = null;

      if (item.type === 'color') {
        input = el('input', { type: 'color' });
      } else if (item.type === 'checkbox') {
        input = el('input', { type: 'checkbox' });
      } else {
        input = el('input', { type: 'range', min: item.min, max: item.max, step: item.step });
        out = el('output');
      }

      input.addEventListener('input', () => {
        let value;
        if (item.type === 'color') value = input.value;
        else if (item.type === 'checkbox') value = input.checked;
        else value = parseFloat(input.value);
        setPath(state.spec, item.path, value);
        if (out) out.textContent = format(value);
        scheduleRender();
      });

      row.append(name, input);
      row.append(out || el('span'));
      details.append(row);
      inputs.push({ item, input, out });
    });

    root.append(details);
  });
}

function syncControls() {
  inputs.forEach(({ item, input, out }) => {
    const value = getPath(state.spec, item.path);
    if (item.type === 'checkbox') input.checked = !!value;
    else input.value = value;
    if (out) out.textContent = format(value);
  });
}

function buildTileSet(rootSelector, tiles) {
  const root = $(rootSelector);
  tiles.forEach((tile) => {
    const figure = el('figure');
    tile.canvas = el('canvas', { width: TILE_W, height: TILE_H });
    figure.append(tile.canvas, el('figcaption', { text: tile.label }));
    root.append(figure);
  });
}

function buildTiles() {
  const root = $('#tiles');
  GAME_TILES.forEach((tile) => {
    const figure = el('figure');
    tile.canvas = el('canvas', { width: TILE_W, height: TILE_H });
    figure.append(tile.canvas, el('figcaption', { text: tile.label }));
    root.append(figure);
  });
}

function buildViewButtons() {
  const root = $('#view-buttons');
  VIEWS.forEach(([key, label]) => {
    const btn = el('button', { type: 'button', text: label });
    if (key === state.view) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.view = key;
      root.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
    root.append(btn);
  });
}

function buildBackgroundButtons() {
  const root = $('#bg-buttons');
  BACKGROUNDS.forEach(([key, label]) => {
    const btn = el('button', { type: 'button', text: label });
    if (key === state.bg) btn.classList.add('active');
    btn.addEventListener('click', () => {
      state.bg = key;
      root.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
    root.append(btn);
  });
}

function download(canvas, name) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

// Idle + walk frames placed on the real sheet layout (1024x512). Row 3 is reserved and stays empty.
function exportSheet() {
  if (!state.idle || !state.walk) return;
  const f = SHEET.frameSize;
  const sheet = document.createElement('canvas');
  sheet.width = SHEET.columns * f;
  sheet.height = SHEET.rows * f;
  const ctx = sheet.getContext('2d');
  const sources = {
    front: { idle: state.idle.front, walk: state.walk.front },
    back: { idle: state.idle.back, walk: state.walk.back },
    side: { idle: state.idle.left, walk: state.walk.left },
  };
  Object.entries(SHEET.rowOfView).forEach(([view, row]) => {
    SHEET.animations.idle.frames.forEach((col, i) => {
      ctx.drawImage(sources[view].idle[i], col * f, row * f);
    });
    SHEET.animations.walk.frames.forEach((col, i) => {
      ctx.drawImage(sources[view].walk[i], col * f, row * f);
    });
  });
  download(sheet, `emmy-sheet-${sheet.width}x${sheet.height}.png`);
  setStatus('Exported the sheet (idle + walk; row 4 is reserved).');
}

async function copySettings() {
  const text = JSON.stringify(state.spec, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    setStatus('Settings copied to clipboard.');
  } catch (_) {
    $('#import-box').value = text;
    $('#import-details').open = true;
    $('#import-box').select();
    setStatus('Clipboard blocked: settings are in the box below. Copy them from there.', 6000);
  }
}

// Ground speed (world px/s) at which a planted foot does not slide in the side view.
function matchFeetSpeed() {
  return Math.round(STANCE_SPEED * state.spec.walk.strideSide * 0.5 * state.walkAnim.fps * 10) / 10;
}

function wireButtons() {
  $('#btn-reset').addEventListener('click', () => {
    state.spec = cloneSpec(DEFAULT_SPEC);
    syncControls();
    scheduleRender();
    setStatus('Reset to defaults.');
  });

  $('#btn-copy').addEventListener('click', copySettings);

  $('#btn-export-128').addEventListener('click', () => {
    download(bakeView(state.view, 128), `emmy-${state.view}-128.png`);
    setStatus(`Exported ${state.view} 128×128 transparent PNG.`);
  });
  $('#btn-export-512').addEventListener('click', () => {
    download(bakeView(state.view, 512), `emmy-${state.view}-512.png`);
    setStatus(`Exported ${state.view} 512×512 transparent PNG.`);
  });
  $('#btn-export-turn').addEventListener('click', () => {
    if (!state.frames) return;
    const sheet = document.createElement('canvas');
    sheet.width = 512;
    sheet.height = 128;
    const ctx = sheet.getContext('2d');
    VIEWS.forEach(([view], i) => ctx.drawImage(state.frames[view], i * 128, 0));
    download(sheet, 'emmy-turnaround-512x128.png');
    setStatus('Exported turnaround (front, back, left, right) PNG.');
  });
  $('#btn-export-sheet').addEventListener('click', exportSheet);

  $('#import-apply').addEventListener('click', () => {
    try {
      const parsed = JSON.parse($('#import-box').value);
      state.spec = mergeSpec(cloneSpec(DEFAULT_SPEC), parsed);
      syncControls();
      scheduleRender();
      setStatus('Settings applied.');
    } catch (_) {
      setStatus('That is not valid settings JSON.', 4000);
    }
  });

  $('#guides').addEventListener('change', (e) => {
    state.guides = e.target.checked;
    render();
  });

  $('#strip-zoom').addEventListener('change', (e) => {
    state.stripZoom = parseFloat(e.target.value);
    render();
  });

  // idle animation controls
  $('#idle-play').addEventListener('change', (e) => {
    state.anim.playing = e.target.checked;
    state.anim.frame = -1;
  });
  $('#idle-fps').addEventListener('input', (e) => {
    state.anim.fps = parseFloat(e.target.value);
    $('#idle-fps-out').textContent = e.target.value;
  });
  $('#idle-zoom').addEventListener('change', (e) => {
    state.anim.zoom = parseFloat(e.target.value);
    state.anim.frame = -1;
  });
  $('#idle-frame').addEventListener('change', (e) => {
    state.anim.manualFrame = parseInt(e.target.value, 10);
    state.anim.frame = -1;
  });

  // walk animation controls
  $('#walk-play').addEventListener('change', (e) => {
    state.walkAnim.playing = e.target.checked;
    state.walkAnim.frame = -1;
  });
  $('#walk-fps').addEventListener('input', (e) => {
    state.walkAnim.fps = parseFloat(e.target.value);
    $('#walk-fps-out').textContent = e.target.value;
  });
  $('#walk-zoom').addEventListener('change', (e) => {
    state.walkAnim.zoom = parseFloat(e.target.value);
    state.walkAnim.frame = -1;
  });
  $('#walk-frame').addEventListener('change', (e) => {
    state.walkAnim.manualFrame = parseInt(e.target.value, 10);
    state.walkAnim.frame = -1;
  });
  $('#walk-ruler').addEventListener('change', (e) => {
    state.walkAnim.ruler = e.target.checked;
    state.walkAnim.frame = -1;
  });
  $('#walk-speed').addEventListener('input', (e) => {
    state.walkAnim.groundSpeed = parseFloat(e.target.value);
    $('#walk-speed-out').textContent = e.target.value;
  });
  $('#walk-match').addEventListener('click', () => {
    const v = matchFeetSpeed();
    state.walkAnim.groundSpeed = v;
    $('#walk-speed').value = v;
    $('#walk-speed-out').textContent = v;
    setStatus(`Ground speed set to ${v} px/s (no foot sliding in the side view).`);
  });
}

async function init() {
  buildControls();
  syncControls();
  buildTiles();
  buildTileSet('#idle-anim', IDLE_TILES);
  buildTileSet('#walk-anim', WALK_TILES);
  buildViewButtons();
  buildBackgroundButtons();
  wireButtons();

  $('#idle-fps').value = state.anim.fps;
  $('#idle-fps-out').textContent = state.anim.fps;
  $('#idle-zoom').value = String(state.anim.zoom);

  state.walkAnim.groundSpeed = matchFeetSpeed();
  $('#walk-fps').value = state.walkAnim.fps;
  $('#walk-fps-out').textContent = state.walkAnim.fps;
  $('#walk-zoom').value = String(state.walkAnim.zoom);
  $('#walk-speed').value = state.walkAnim.groundSpeed;
  $('#walk-speed-out').textContent = state.walkAnim.groundSpeed;

  setStatus('Starting renderer…', 0);
  state.scene = await createRenderer();
  render();
  requestAnimationFrame(animLoop);
  setStatus('Ready.');
}

init();