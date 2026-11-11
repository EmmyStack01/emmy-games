import Phaser from 'phaser';
import { BUILDING } from '../config.js';
import { BUILDINGS } from '../data/neighbourhood.js';
import { THEME } from '../theme.js';

// Every graphic in the environment is drawn here and baked into a texture once
// at startup. Baked textures are far cheaper on mobile than live Graphics.
// Colours come from theme.js. Light comes from the top-left: lit edges on the left,
// shade on the right, shadows falling to the right.

const OUTLINE = THEME.outline;
const PROP_OW = THEME.propOutlineWidth;

const darker = (c, p = 15) => Phaser.Display.Color.ValueToColor(c).darken(p).color;
const lighter = (c, p = 15) => Phaser.Display.Color.ValueToColor(c).lighten(p).color;

function bake(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
}

// Rounded rectangle with an outline.
function part(g, x, y, w, h, r, fill, ow = PROP_OW) {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(x - ow, y - ow, w + 2 * ow, h + 2 * ow, r + ow);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, r);
}

// Group of circles with one shared outline.
function blobs(g, list, fill, outline = OUTLINE, grow = PROP_OW + 0.4) {
  g.fillStyle(outline, 1);
  list.forEach(([x, y, r]) => g.fillCircle(x, y, r + grow));
  g.fillStyle(fill, 1);
  list.forEach(([x, y, r]) => g.fillCircle(x, y, r));
}

// Size of the cast shadow a building throws to its right. World.js uses this too.
export function buildingShadowGeometry(spec) {
  const sw = Math.round(spec.h * 0.3); // how far it reaches
  const hs = Math.round(spec.h * 0.55) + 6; // how tall it is
  const ss = Math.round(sw * 0.3); // how much the top edge slopes down
  return { sw, hs, ss };
}

export function generateAllTextures(scene) {
  makeTiles(scene);
  makeEmmy(scene);
  makeNature(scene);
  makeStreetProps(scene);
  makeVehicles(scene);
  makePickups(scene);
  BUILDINGS.forEach((spec) => {
    makeBuilding(scene, spec);
    makeBuildingShadow(scene, spec);
  });
}

/* ---------------------------------------------------------------- tiles */

function makeTiles(scene) {
  const T = THEME;

  // NOTE: tiled textures use power-of-two sizes so they repeat on all devices.
  bake(scene, 'grass', 64, 64, (g) => {
    g.fillStyle(T.grass.base, 1);
    g.fillRect(0, 0, 64, 64);
    // very soft light/dark patches (kept away from the edges so the tile doesn't show seams)
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 ? T.grass.light : T.grass.dark, 0.14);
      g.fillEllipse(
        Phaser.Math.Between(20, 44),
        Phaser.Math.Between(20, 44),
        Phaser.Math.Between(16, 24),
        Phaser.Math.Between(10, 16)
      );
    }
    for (let i = 0; i < 26; i++) {
      const x = Phaser.Math.Between(4, 58);
      const y = Phaser.Math.Between(8, 60);
      g.fillStyle(i % 2 ? T.grass.light : T.grass.dark, 1);
      g.fillTriangle(x, y, x + 3, y - 7, x + 6, y);
    }
  });

  bake(scene, 'road', 64, 64, (g) => {
    g.fillStyle(T.road.base, 1);
    g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 28; i++) {
      g.fillStyle(i % 2 ? T.road.light : T.road.dark, 1);
      g.fillRect(Phaser.Math.Between(0, 61), Phaser.Math.Between(0, 61), 2, 2);
    }
  });

  bake(scene, 'sidewalk', 32, 32, (g) => {
    g.fillStyle(T.sidewalk.base, 1);
    g.fillRect(0, 0, 32, 32);
    g.lineStyle(2, T.sidewalk.line, 1);
    g.strokeRect(1, 1, 30, 30);
  });

  bake(scene, 'dash_h', 64, 8, (g) => {
    g.fillStyle(T.road.dash, 1);
    g.fillRoundedRect(6, 2, 38, 4, 2);
  });

  bake(scene, 'dash_v', 8, 64, (g) => {
    g.fillStyle(T.road.dash, 1);
    g.fillRoundedRect(2, 6, 4, 38, 2);
  });

  bake(scene, 'plaza', 64, 64, (g) => {
    g.fillStyle(T.plaza.b, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(T.plaza.a, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    g.lineStyle(2, T.plaza.line, 1);
    g.strokeRect(1, 1, 30, 30);
    g.strokeRect(33, 1, 30, 30);
    g.strokeRect(1, 33, 30, 30);
    g.strokeRect(33, 33, 30, 30);
  });

  bake(scene, 'water', 64, 64, (g) => {
    g.fillStyle(T.water.base, 1);
    g.fillRect(0, 0, 64, 64);
    g.lineStyle(3, T.water.wave, 0.9);
    [[8, 16], [40, 40], [20, 56], [46, 10]].forEach(([x, y]) => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 5, y - 3);
      g.lineTo(x + 10, y);
      g.lineTo(x + 15, y - 3);
      g.strokePath();
    });
  });

  bake(scene, 'plank', 64, 32, (g) => {
    g.fillStyle(T.plank.base, 1);
    g.fillRect(0, 0, 64, 32);
    g.lineStyle(2, T.plank.line, 1);
    g.lineBetween(0, 1, 64, 1);
    g.lineBetween(0, 17, 64, 17);
    g.lineBetween(20, 1, 20, 17);
    g.lineBetween(52, 17, 52, 32);
  });

  // Emmy's shadow: soft, navy-tinted and leaning right (light from the top-left).
  bake(scene, 'shadow', 40, 14, (g) => {
    g.fillStyle(T.shadow, 0.12);
    g.fillEllipse(22, 7, 36, 13);
    g.fillStyle(T.shadow, 0.28);
    g.fillEllipse(22, 7, 29, 10);
  });
}

/* --------------------------------------------- placeholder Emmy (fallback) */

function drawEmmy(g, phase) {
  const SKIN = 0x8d5524;
  const HAIR = 0x1f1b24;
  const SHIRT = 0xffb703;
  const PRINT = 0xe63946;
  const JEANS = 0x2f5da8;
  const SHOE = 0xfdfdfd;

  const liftL = phase === 1 ? 4 : 0;
  const liftR = phase === 2 ? 4 : 0;
  const swing = phase === 1 ? 2 : phase === 2 ? -2 : 0;

  part(g, 12, 40, 7, 10 - liftL, 2, JEANS);
  part(g, 21, 40, 7, 10 - liftR, 2, JEANS);
  part(g, 10, 48 - liftL, 10, 5, 2, SHOE);
  part(g, 20, 48 - liftR, 10, 5, 2, SHOE);

  part(g, 6, 29 + swing, 5, 11, 2, SKIN);
  part(g, 29, 29 - swing, 5, 11, 2, SKIN);

  part(g, 11, 27, 18, 16, 5, SHIRT);
  g.fillStyle(PRINT, 1);
  [[16, 32], [24, 32], [20, 37], [15, 40], [25, 40]].forEach(([x, y]) => g.fillCircle(x, y, 2));

  g.fillStyle(OUTLINE, 1);
  g.fillCircle(8, 10, 8);
  g.fillCircle(32, 10, 8);
  g.fillStyle(HAIR, 1);
  g.fillCircle(8, 10, 6);
  g.fillCircle(32, 10, 6);
  g.fillStyle(OUTLINE, 1);
  g.fillCircle(20, 14, 14.5);
  g.fillStyle(HAIR, 1);
  g.fillCircle(20, 14, 12.5);
  g.fillStyle(0xffd166, 1);
  g.fillCircle(8, 10, 2.2);
  g.fillCircle(32, 10, 2.2);

  g.fillStyle(OUTLINE, 1);
  g.fillCircle(20, 21, 11);
  g.fillStyle(SKIN, 1);
  g.fillCircle(20, 21, 9.5);
  g.fillStyle(0x1d1d1d, 1);
  g.fillEllipse(15.5, 20, 3.2, 4.4);
  g.fillEllipse(24.5, 20, 3.2, 4.4);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16.2, 19, 0.9);
  g.fillCircle(25.2, 19, 0.9);
  g.lineStyle(1.5, HAIR, 1);
  g.lineBetween(13, 16.5, 18, 16);
  g.lineBetween(22, 16, 27, 16.5);
  g.lineStyle(2, 0x3a1c0b, 1);
  g.beginPath();
  g.arc(20, 23, 3.6, 0.25, Math.PI - 0.25, false);
  g.strokePath();
  g.fillStyle(0xe76f51, 0.35);
  g.fillCircle(12.5, 23.5, 2);
  g.fillCircle(27.5, 23.5, 2);
}

function makeEmmy(scene) {
  bake(scene, 'emmy_idle', 40, 56, (g) => drawEmmy(g, 0));
  bake(scene, 'emmy_walk_a', 40, 56, (g) => drawEmmy(g, 1));
  bake(scene, 'emmy_walk_b', 40, 56, (g) => drawEmmy(g, 2));
}

/* --------------------------------------------------------------- nature */

function makeNature(scene) {
  const T = THEME;

  bake(scene, 'tree', 96, 120, (g) => {
    // shadow leans right (light from the top-left)
    g.fillStyle(T.shadow, T.shadowAlpha);
    g.fillEllipse(60, 113, 64, 11);
    part(g, 41, 70, 14, 46, 3, T.tree.trunk);
    blobs(g, [[48, 44, 36], [26, 62, 24], [70, 62, 24], [48, 72, 22]], T.tree.leaf);
    // shade on the lower right
    g.fillStyle(T.shadow, 0.22);
    g.fillCircle(72, 70, 12);
    g.fillCircle(58, 78, 9);
    // light on the upper left
    g.fillStyle(T.tree.leafLight, 1);
    g.fillCircle(40, 34, 17);
    g.fillCircle(62, 42, 11);
    g.fillCircle(24, 58, 9);
    g.fillStyle(T.tree.leafHi, 0.55);
    g.fillCircle(34, 28, 6);
  });

  bake(scene, 'palm', 80, 150, (g) => {
    g.fillStyle(T.shadow, T.shadowAlpha);
    g.fillEllipse(42, 146, 50, 9);

    const trunk = lighter(T.tree.trunk, 12);
    g.lineStyle(12, OUTLINE, 1);
    g.beginPath();
    g.moveTo(32, 146);
    g.lineTo(36, 106);
    g.lineTo(40, 64);
    g.strokePath();
    g.lineStyle(9, trunk, 1);
    g.beginPath();
    g.moveTo(32, 146);
    g.lineTo(36, 106);
    g.lineTo(40, 64);
    g.strokePath();
    g.lineStyle(2, darker(trunk, 25), 1);
    [130, 116, 102, 88, 76].forEach((y) => {
      const xc = 32 + (146 - y) * 0.1;
      g.lineBetween(xc - 4.5, y, xc + 4.5, y);
    });

    const cx = 40;
    const cy = 60;
    const len = 36;
    [-170, -145, -120, -95, -70, -45, -20, 5, 165].forEach((deg, i) => {
      const a = Phaser.Math.DegToRad(deg);
      const tipX = cx + Math.cos(a) * len;
      const tipY = cy + Math.sin(a) * len + 10;
      const midX = cx + Math.cos(a) * len * 0.5;
      const midY = cy + Math.sin(a) * len * 0.5 + 2;
      const px = -Math.sin(a) * 8;
      const py = Math.cos(a) * 8;
      // fronds facing the light are lighter
      const lit = Math.cos(a) < 0 && Math.sin(a) < 0.3;
      g.fillStyle(lit ? T.tree.leafLight : T.tree.leaf, 1);
      g.fillTriangle(cx, cy, midX + px, midY + py, tipX, tipY);
      g.fillTriangle(cx, cy, midX - px, midY - py, tipX, tipY);
      if (i % 2) {
        g.fillStyle(T.shadow, 0.1);
        g.fillTriangle(cx, cy, midX + px, midY + py, tipX, tipY);
      }
    });
    g.fillStyle(T.tree.trunk, 1);
    g.fillCircle(36, 66, 4);
    g.fillCircle(45, 67, 4);
  });

  bake(scene, 'bush', 48, 32, (g) => {
    g.fillStyle(T.shadow, 0.2);
    g.fillEllipse(27, 29, 44, 8);
    blobs(g, [[13, 20, 10], [24, 15, 12], [35, 20, 10]], T.tree.leaf);
    g.fillStyle(T.shadow, 0.2);
    g.fillCircle(36, 22, 7);
    g.fillStyle(T.tree.leafLight, 1);
    g.fillCircle(20, 11, 5);
    g.fillCircle(32, 17, 4);
    g.fillStyle(0xff7a5c, 1);
    [[14, 20], [28, 22], [36, 18], [22, 14]].forEach(([x, y]) => g.fillCircle(x, y, 1.8));
  });

  // Flowers echo Emmy's palette: gold, white and a light royal blue.
  const flower = (key, petal) =>
    bake(scene, key, 14, 14, (g) => {
      g.fillStyle(T.tree.leaf, 1);
      g.fillRect(6, 8, 2, 6);
      g.fillStyle(petal, 1);
      for (let k = 0; k < 5; k++) {
        const a = Phaser.Math.DegToRad(k * 72 - 90);
        g.fillCircle(7 + Math.cos(a) * 3, 6 + Math.sin(a) * 3, 2.2);
      }
      g.fillStyle(0xffd23f, 1);
      g.fillCircle(7, 6, 1.8);
    });
  flower('flower_a', 0xffc43d);
  flower('flower_b', 0xffffff);
  flower('flower_c', 0x6f95ff);
}

/* --------------------------------------------------------- street props */

function makeStreetProps(scene) {
  const T = THEME;

  bake(scene, 'lamp', 24, 96, (g) => {
    g.fillStyle(0xffe08a, 0.3);
    g.fillCircle(12, 16, 14);
    part(g, 10, 22, 4, 68, 1, 0x39406a);
    part(g, 7, 86, 10, 6, 2, 0x39406a);
    part(g, 5, 8, 14, 12, 4, 0xffd166);
  });

  bake(scene, 'bench', 56, 30, (g) => {
    g.fillStyle(T.shadow, 0.2);
    g.fillEllipse(31, 27, 52, 6);
    part(g, 6, 18, 5, 9, 1, 0x39406a);
    part(g, 45, 18, 5, 9, 1, 0x39406a);
    part(g, 3, 3, 50, 7, 2, 0x9a6a40);
    part(g, 3, 12, 50, 7, 2, 0xb98a5e);
  });

  bake(scene, 'fountain', 120, 100, (g) => {
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(60, 72, 117, 55);
    g.fillStyle(0xd2d9e8, 1);
    g.fillEllipse(60, 70, 112, 50);
    g.fillStyle(0x3d9bf0, 1);
    g.fillEllipse(60, 68, 92, 36);
    g.fillStyle(T.water.wave, 0.8);
    g.fillEllipse(48, 64, 24, 8);
    part(g, 52, 26, 16, 42, 3, 0xd2d9e8);
    g.fillStyle(OUTLINE, 1);
    g.fillEllipse(60, 28, 41, 15);
    g.fillStyle(0xe3e8f2, 1);
    g.fillEllipse(60, 27, 38, 12);
    g.fillStyle(T.water.wave, 1);
    [[60, 12, 3], [52, 16, 2.5], [68, 16, 2.5], [46, 22, 2], [74, 22, 2]].forEach(([x, y, r]) =>
      g.fillCircle(x, y, r)
    );
  });

  const stall = (key, c1, c2, goods) =>
    bake(scene, key, 96, 84, (g) => {
      g.fillStyle(T.shadow, 0.2);
      g.fillEllipse(52, 80, 84, 8);
      g.fillStyle(0x6b4a30, 1);
      g.fillRect(10, 26, 5, 52);
      g.fillRect(81, 26, 5, 52);
      part(g, 8, 56, 80, 22, 3, 0xb98a5e);
      for (let i = 0; i < 7; i++) {
        g.fillStyle(OUTLINE, 1);
        g.fillCircle(17 + i * 10.5, 53, 5.6);
        g.fillStyle(goods[i % goods.length], 1);
        g.fillCircle(17 + i * 10.5, 53, 4.4);
      }
      for (let i = 0; i < 8; i++) {
        g.fillStyle(i % 2 ? c2 : c1, 1);
        g.fillRect(i * 12, 6, 12, 24);
        g.fillCircle(i * 12 + 6, 30, 6);
      }
      g.fillStyle(T.shadow, 0.16); // the canopy's right side is in shade
      g.fillRect(72, 6, 24, 24);
      g.lineStyle(1.6, OUTLINE, 1);
      g.strokeRect(1, 6, 94, 24);
    });
  stall('stall_a', 0x2456c9, 0xffffff, [0xff8c42, 0xe63946]);
  stall('stall_b', 0xffc43d, 0x2a3c7a, [0x6bcb77, 0xffd166]);
  stall('stall_c', 0xc4604a, 0xfff4e0, [0xf4a261, 0x9b5de5]);
}

/* ------------------------------------------------------------- vehicles */

function makeVehicles(scene) {
  const T = THEME;

  const wheel = (g, x, y) => {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(x, y, 9);
    g.fillStyle(0x6c757d, 1);
    g.fillCircle(x, y, 4);
  };
  const bus = (key, body, stripe) =>
    bake(scene, key, 128, 64, (g) => {
      g.fillStyle(T.shadow, 0.28);
      g.fillEllipse(68, 60, 116, 10);
      g.fillStyle(OUTLINE, 1);
      g.fillRoundedRect(3, 10, 122, 44, 8);
      g.fillStyle(body, 1);
      g.fillRoundedRect(5, 12, 118, 40, 7);
      g.fillStyle(T.shadow, 0.14); // lower body in shade
      g.fillRect(5, 44, 118, 8);
      g.fillStyle(stripe, 1);
      g.fillRect(5, 36, 118, 6);
      for (let i = 0; i < 5; i++) {
        g.fillStyle(T.glass, 1);
        g.fillRoundedRect(12 + i * 21, 16, 17, 14, 3);
      }
      g.fillStyle(0xfff3b0, 1);
      g.fillCircle(120, 44, 3);
      g.fillStyle(0xff4d4d, 1);
      g.fillCircle(8, 44, 3);
      wheel(g, 30, 54);
      wheel(g, 98, 54);
    });
  bus('bus_a', 0xffc300, 0x1a1c2c);
  bus('bus_b', 0x2456c9, 0xffffff);
}

/* -------------------------------------------------------------- pickups */

function makePickups(scene) {
  bake(scene, 'coin', 22, 22, (g) => {
    g.fillStyle(OUTLINE, 1);
    g.fillCircle(11, 11, 11);
    g.fillStyle(0xffc43d, 1);
    g.fillCircle(11, 11, 9);
    g.lineStyle(1.5, 0xe09f00, 1);
    g.strokeCircle(11, 11, 7);
    g.lineStyle(2, 0xb97a00, 1);
    g.beginPath();
    g.moveTo(7, 15);
    g.lineTo(7, 7);
    g.lineTo(15, 15);
    g.lineTo(15, 7);
    g.strokePath();
    g.lineBetween(5, 10, 17, 10);
    g.lineBetween(5, 13, 17, 13);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(7, 6, 1.8);
  });
}

/* ------------------------------------------------------------ buildings */

function drawWindow(g, x, y) {
  g.fillStyle(OUTLINE, 1);
  g.fillRoundedRect(x - 2, y - 2, 34, 34, 4);
  g.fillStyle(THEME.glass, 1);
  g.fillRect(x, y, 30, 30);
  g.fillStyle(0xffffff, 0.5); // sky reflection from the top-left
  g.fillTriangle(x, y, x + 16, y, x, y + 16);
  g.fillStyle(0x2456c9, 0.14); // bluer toward the bottom-right
  g.fillTriangle(x + 30, y + 30, x + 30, y + 12, x + 12, y + 30);
  g.lineStyle(2.5, 0x3a3a5c, 1);
  g.lineBetween(x + 15, y, x + 15, y + 30);
  g.lineBetween(x, y + 15, x + 30, y + 15);
  g.fillStyle(0x3a3a5c, 1);
  g.fillRect(x - 3, y + 30, 36, 3.5);
}

function makeBuilding(scene, spec) {
  const {
    id, w, h, wall, roof,
    shop = false,
    accent = [0xc4604a, 0xfff4e0],
    door = 0x7b4a2d,
  } = spec;
  const roofH = BUILDING.roofHeight;
  const ow = THEME.outlineWidth;
  const shadeW = Math.round(w * 0.14);

  bake(scene, `bld_${id}`, w, h + BUILDING.shadowPad, (g) => {
    // contact shadow at the base
    g.fillStyle(THEME.shadow, 0.3);
    g.fillRoundedRect(4, h - 8, w - 4, 14, 6);

    // wall, lit from the top-left: bright left edge, shaded right side, darker base
    g.fillStyle(wall, 1);
    g.fillRect(0, roofH, w, h - roofH);
    g.fillStyle(0xffffff, 0.18);
    g.fillRect(0, roofH, 5, h - roofH);
    g.fillStyle(THEME.shadow, 0.16);
    g.fillRect(w - shadeW, roofH, shadeW, h - roofH);
    g.fillStyle(THEME.shadow, 0.1);
    g.fillRect(0, h - 12, w, 12);

    // corrugated roof
    g.fillStyle(roof, 1);
    g.fillRect(0, 0, w, roofH - 8);
    g.lineStyle(2, darker(roof, 18), 0.8);
    for (let x = 10; x < w; x += 12) g.lineBetween(x, 2, x, roofH - 10);
    g.fillStyle(lighter(roof, 18), 0.5);
    g.fillRect(0, 2, w, 4);
    g.fillStyle(THEME.shadow, 0.18);
    g.fillRect(w - shadeW, 0, shadeW, roofH - 8);
    g.fillStyle(darker(roof, 22), 1);
    g.fillRect(0, roofH - 8, w, 8);
    g.lineStyle(ow, OUTLINE, 1);
    g.lineBetween(0, roofH, w, roofH);

    // windows
    const winY = shop ? roofH + 56 : roofH + 18;
    const positions = w < 200 ? [0.22, 0.78] : [0.12, 0.3, 0.7, 0.88];
    positions.forEach((f) => drawWindow(g, Math.round(w * f - 15), winY));

    // door
    const dw = 34;
    const dh = 62;
    const dx = Math.round(w / 2 - dw / 2);
    const dy = h - dh;
    g.fillStyle(OUTLINE, 1);
    g.fillRoundedRect(dx - 2.5, dy - 2.5, dw + 5, dh + 2.5, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(door, 1);
    g.fillRoundedRect(dx, dy, dw, dh, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.fillStyle(lighter(door, 15), 0.6);
    g.fillRect(dx + 6, dy + 16, 9, 18);
    g.fillRect(dx + 19, dy + 16, 9, 18);
    g.fillStyle(THEME.shadow, 0.16); // right half of the door in shade
    g.fillRect(dx + dw - 8, dy + 4, 8, dh - 4);
    g.fillStyle(0xffd166, 1);
    g.fillCircle(dx + dw - 6, dy + dh / 2 + 6, 2.5);

    if (shop) {
      // sign plate (text is added by the World as a Phaser Text object)
      const sw = Math.round(w * 0.76);
      const sx = Math.round((w - sw) / 2);
      const sy = roofH + 5;
      g.fillStyle(OUTLINE, 1);
      g.fillRoundedRect(sx - 2, sy - 2, sw + 4, 26, 7);
      g.fillStyle(0xf4f7ff, 1);
      g.fillRoundedRect(sx, sy, sw, 22, 5);

      // striped awning, with the shadow it casts on the wall below
      const ay = roofH + 30;
      const ah = 16;
      g.fillStyle(THEME.shadow, 0.22);
      g.fillRect(0, ay + ah, w, 9);
      for (let i = 0; i < Math.ceil(w / 14); i++) {
        g.fillStyle(i % 2 ? accent[1] : accent[0], 1);
        g.fillRect(i * 14, ay, 14, ah);
        g.fillCircle(i * 14 + 7, ay + ah, 7);
      }
      g.fillStyle(THEME.shadow, 0.14);
      g.fillRect(0, ay + ah - 3, w, 3);
      g.lineStyle(ow, OUTLINE, 1);
      g.strokeRect(0, ay, w, ah);
    }

    // outer outline
    g.lineStyle(ow, OUTLINE, 1);
    g.strokeRect(ow / 2, ow / 2, w - ow, h - ow);
  });
}

// The shadow a building throws to its right (light comes from the top-left).
function makeBuildingShadow(scene, spec) {
  const { sw, hs, ss } = buildingShadowGeometry(spec);
  bake(scene, `bsh_${spec.id}`, sw + 2, hs + ss + 2, (g) => {
    g.fillStyle(THEME.shadow, THEME.shadowAlpha);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(sw, ss);
    g.lineTo(sw, ss + hs);
    g.lineTo(0, hs);
    g.closePath();
    g.fillPath();
  });
}