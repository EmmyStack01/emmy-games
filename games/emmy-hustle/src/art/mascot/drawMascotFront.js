// Draws Emmy STACK01's mascot, standing/idle/walking, front view, on a 128x128 frame.
// Feet line at y=122, centre x=64. Everything is driven by `spec` (see spec.js).
//
// Draw order (back to front):
//   backpack (behind) > shoes > trousers > hoodie > straps > hoodie details >
//   arms > hood collar > head (see head.js)

import { drawArmsFrontal } from './parts.js';
import { drawHeadFront } from './head.js';

export const FRAME = 128;
export const CENTER_X = 64;
export const FEET_Y = 122;

const NO_OFFSET = { dx: 0, dy: 0 };

// pose (all optional):
//   lift   idle "breath": shoulders + head rise
//   bobDy  walk: the whole upper body moves down by this much
//   legL, legR, armL, armR   { dx, dy } offsets for the walk cycle
//   walking
export function computeLayout(spec, pose = {}) {
  const p = spec.proportions;
  const lift = pose.lift || 0;
  const bob = pose.bobDy || 0;
  const shoeH = 12 * p.shoeScale;
  const shoeTop = FEET_Y - shoeH;
  const ankleY = shoeTop + 0.5;
  const hipY = ankleY - 18.5 * p.legLength;
  const hemY = hipY + 2 - lift * 0.5 + bob;
  const shoulderY = hemY - 32 * p.torsoHeight - lift * 0.5;
  const chinY = shoulderY - 2;
  const bodyW = 44 * p.torsoWidth;
  const shoulderPtY = shoulderY + 6;
  return {
    cx: CENTER_X,
    shoeH,
    shoeTop,
    ankleY,
    hipY,
    hemY,
    shoulderY,
    chinY,
    bodyW,
    x0: CENTER_X - bodyW / 2,
    x1: CENTER_X + bodyW / 2,
    armW: 10.5,
    shoulderPtY,
    wristY: shoulderPtY + 26 * p.armLength + lift * 0.5,
    legL: pose.legL || NO_OFFSET,
    legR: pose.legR || NO_OFFSET,
    armL: pose.armL || NO_OFFSET,
    armR: pose.armR || NO_OFFSET,
    walking: !!pose.walking,
  };
}

export function drawMascotFront(pen, spec, pose = {}) {
  pen.setOutline(spec.colors.outline, spec.outline.width);
  const L = computeLayout(spec, pose);

  drawBackpackBack(pen, spec, L);
  drawShoes(pen, spec, L);
  drawTrousers(pen, spec, L);
  drawHoodie(pen, spec, L);
  drawStraps(pen, spec, L);
  drawHoodieDetails(pen, spec, L);
  drawArmsFrontal(pen, spec, L);
  drawHoodCollar(pen, spec, L);
  drawHeadFront(pen, spec, L);
}

/* ----------------------------------------------------------------- backpack */

function drawBackpackBack(pen, spec, L) {
  const b = spec.backpack;
  if (!b.visible) return;
  const c = spec.colors;
  const w = (L.bodyW + 10) * b.scale;
  const h = 31 * b.scale;
  const x = L.cx - w / 2;
  const y = L.shoulderY + 4;
  pen.outlined([{ t: 'r', x, y, w, h, r: 8 }], c.pack);
  pen.strokeRRect(x + 1.1, y + 1.1, w - 2.2, h - 2.2, 7, 1.1, c.packLight, 0.8); // lighter inner rim
  pen.rrect(x + 3, y + 3, w - 6, 3, 1.5, c.packLight, 0.7);
  pen.line(x + 4, y + h * 0.55, x + w - 4, y + h * 0.55, 1.2, c.packLight, 0.45);
}

function drawStraps(pen, spec, L) {
  const b = spec.backpack;
  if (!b.visible) return;
  const c = spec.colors;
  [-1, 1].forEach((sg) => {
    const xTop = L.cx + sg * 13.5;
    const xBot = L.cx + sg * 17;
    const yTop = L.shoulderY + 0.5;
    const yBot = L.shoulderY + 25;
    pen.outlined([{ t: 'cap', x1: xTop, y1: yTop, x2: xBot, y2: yBot, w: b.strap }], c.pack, 1.6);
    pen.line(xTop - sg * 1.6, yTop + 3, xBot - sg * 1.6, yBot - 3, 0.9, c.packLight, 0.9);
    pen.rrect(xBot - 2.2, yBot - 9, 4.4, 3.4, 1, c.packLight);
  });
}

/* ------------------------------------------------------------- legs & feet */

function drawShoes(pen, spec, L) {
  const c = spec.colors;
  const s = spec.proportions.shoeScale;
  const W = 19.5 * s;
  [-1, 1].forEach((sg) => {
    const dy = (sg < 0 ? L.legL : L.legR).dy; // walk: this foot's offset
    const cx = L.cx + sg * 11;
    const x = cx - W / 2;
    const top = L.shoeTop + dy;
    const feet = FEET_Y + dy;
    pen.outlined(
      [{ t: 'r', x, y: top, w: W, h: L.shoeH, r: { tl: 5, tr: 5, bl: 6, br: 6 } }],
      c.shoeWhite
    );
    pen.rrect(x + 1.4, top + 0.6, W - 2.8, 3.2 * s, 1.5, c.shoeBlue); // collar
    pen.rrect(cx - 6.4 * s, feet - 8.2 * s, 12.8 * s, 4.8 * s, 2.4 * s, c.shoeBlue); // toe cap
    pen.rrect(x - 0.4, feet - 3.4 * s, W + 0.8, 3.4 * s, 1.7, c.shoeShade); // sole shade
    pen.rrect(x - 0.4, feet - 3.4 * s, W + 0.8, 2.2 * s, 1.1, c.shoeWhite); // sole
  });
}

function drawTrousers(pen, spec, L) {
  const c = spec.colors;
  const legW = 17;
  const top = L.hipY + 2;
  const legs = [
    { cx: L.cx - 10.5, dy: L.legL.dy },
    { cx: L.cx + 10.5, dy: L.legR.dy },
  ];
  const shapes = [
    { t: 'r', x: L.cx - 19, y: L.hipY - 4, w: 38, h: 14, r: 6 },
    ...legs.map(({ cx, dy }) => ({
      t: 'r',
      x: cx - legW / 2,
      y: top,
      w: legW,
      h: Math.max(6, L.ankleY + 1.2 + dy - top),
      r: { tl: 3, tr: 3, bl: 4, br: 4 },
    })),
  ];
  pen.outlined(shapes, c.trousers);

  // gathered cuffs
  legs.forEach(({ cx, dy }) => {
    pen.rrect(cx - legW / 2 - 0.6, L.ankleY - 4.2 + dy, legW + 1.2, 5.4, 2, c.trousersShade);
    pen.line(cx - legW / 2 + 1.5, L.ankleY - 4 + dy, cx + legW / 2 - 1.5, L.ankleY - 4 + dy, 0.9, c.trousersLight, 0.6);
  });

  // cargo pockets (flap + button)
  const py = L.hipY + 6.5;
  [
    [L.cx - 19 + 1.6, legs[0].dy],
    [L.cx + 19 - 1.6 - 7, legs[1].dy],
  ].forEach(([px, dy]) => {
    const ph = Math.max(4, Math.min(9.5, L.ankleY + dy - 4.7 - py));
    pen.rrect(px - 0.7, py - 0.7, 8.4, ph + 1.4, 2.2, c.trousersLight, 0.8);
    pen.rrect(px, py, 7, ph, 1.5, c.trousersPocket);
    pen.line(px + 0.6, py + 3.2, px + 6.4, py + 3.2, 1, c.trousersLight, 0.9);
    pen.circle(px + 3.5, py + 3.2, 0.9, c.trousersLight);
  });

  // soft rim light on the left leg
  pen.line(L.cx - 18.2, L.hipY + 8, L.cx - 18.2, Math.max(L.hipY + 9, L.ankleY - 6 + legs[0].dy), 1.2, c.trousersLight, 0.75);
}

/* ------------------------------------------------------------------ hoodie */

function drawHoodie(pen, spec, L) {
  const c = spec.colors;
  const h = L.hemY - L.shoulderY;
  pen.outlined(
    [{ t: 'r', x: L.x0, y: L.shoulderY, w: L.bodyW, h, r: { tl: 11, tr: 11, bl: 5, br: 5 } }],
    c.hoodie
  );

  // flat shade on the right side
  pen.rrect(L.x1 - 8, L.shoulderY + 10, 8, h - 10, { tl: 0, tr: 0, bl: 0, br: 5 }, c.hoodieShade);

  // ribbed hem
  pen.rrect(L.x0, L.hemY - 4.2, L.bodyW, 4.2, { tl: 0, tr: 0, bl: 5, br: 5 }, c.hoodieShade);
  for (let x = L.x0 + 3; x < L.x1 - 2; x += 4) {
    pen.line(x, L.hemY - 3.8, x, L.hemY - 0.6, 0.8, c.outline, 0.35);
  }

  // blue-tinted rim light from the top-left
  pen.line(L.x0 + 1.8, L.shoulderY + 12, L.x0 + 1.8, L.hemY - 8, 1.3, c.hoodieRim, spec.hoodie.rimLight);
  pen.ellipse(L.x0 + 9, L.shoulderY + 3.2, 11, 3.6, c.hoodieRim, spec.hoodie.rimLight * 0.8);
}

function drawHoodieDetails(pen, spec, L) {
  const c = spec.colors;

  // zip tape + pull
  pen.rrect(L.cx - 1.2, L.shoulderY + 6, 2.4, L.hemY - L.shoulderY - 6.5, 0.8, c.royal);
  pen.rrect(L.cx - 1.9, L.shoulderY + 7.5, 3.8, 5.2, 1.4, c.zipPull);

  // side pocket slits
  [-1, 1].forEach((sg) => {
    pen.line(L.cx + sg * 14.5, L.hemY - 13, L.cx + sg * 10.2, L.hemY - 6.2, 1.5, c.outline, 0.75, true);
  });

  // drawstrings with metal eyelets and tips
  const len = spec.hoodie.drawstring;
  [-1, 1].forEach((sg) => {
    const x = L.cx + sg * 7.6;
    const y0 = L.shoulderY + 5.5;
    const midX = x + sg * 0.9;
    const midY = y0 + len * 0.5;
    const endX = x + sg * 0.4;
    const endY = y0 + len;
    pen.line(x, y0, midX, midY, 2.3, c.royal, 1, true);
    pen.line(midX, midY, endX, endY, 2.3, c.royal, 1, true);
    pen.circle(x, y0 - 0.2, 1.7, c.outline);
    pen.circle(x, y0 - 0.2, 1.1, c.aglet);
    pen.rrect(endX - 1.4, endY - 0.5, 2.8, 5, 1, c.aglet);
  });
}

function drawHoodCollar(pen, spec, L) {
  const c = spec.colors;
  const y = L.shoulderY;
  pen.outlined([{ t: 'e', x: L.cx, y: y + 2.5, w: L.bodyW * 0.98, h: 17 }], c.hoodie);
  pen.ellipse(L.cx, y + 2, L.bodyW * 0.7, 11.5, c.royal); // bright hood lining
  pen.ellipse(L.cx, y + 6, 11, 6.2, c.tee); // T-shirt under the zip
  pen.ellipse(L.cx - 12, y - 2.5, 8, 3, c.hoodieRim, spec.hoodie.rimLight * 0.7);
}