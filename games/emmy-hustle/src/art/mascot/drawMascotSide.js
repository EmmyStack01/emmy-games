// Emmy STACK01 mascot, SIDE view facing LEFT (128x128 frame, feet at y=122).
// The right-facing view is this same frame flipped horizontally.
// Draw order: far shoe/leg > hips > near shoe/leg > backpack > hoodie > far arm >
//             strap > near arm > hood > head (see head.js)
//
// In the walk cycle the "near" leg/arm use L.legL / L.armL and the "far" ones use
// L.legR / L.armR. Legs are drawn as sheared trouser shapes so they can swing.

import { computeLayout, FEET_Y } from './drawMascotFront.js';
import { drawHeadSide } from './head.js';

export function drawMascotSide(pen, spec, pose = {}) {
  pen.setOutline(spec.colors.outline, spec.outline.width);
  const L = computeLayout(spec, pose);
  const S = sideLayout(spec, L);

  drawShoe(pen, spec, L, S.farCx + L.legR.dx, L.legR.dy, true);
  drawLeg(pen, spec, L, S.farCx, L.legR, true);
  drawHips(pen, spec, L, S);
  drawShoe(pen, spec, L, S.nearCx + L.legL.dx, L.legL.dy, false);
  drawLeg(pen, spec, L, S.nearCx, L.legL, false);
  drawBag(pen, spec, L, S);
  drawTorso(pen, spec, L, S);
  drawArm(pen, spec, L, S, true);
  drawStrap(pen, spec, L, S);
  drawArm(pen, spec, L, S, false);
  drawHood(pen, spec, L, S);
  drawHeadSide(pen, spec, L, S);
}

function sideLayout(spec, L) {
  const cs = 62; // spine x
  const depth = 27 * spec.side.torsoDepth;
  const walking = L.walking;
  return {
    cs,
    depth,
    x0: cs - depth / 2, // front of the body
    x1: cs + depth / 2, // back of the body
    nearCx: cs - 1,
    // standing: the far leg sits a little ahead. walking: both legs start under the hip.
    farCx: walking ? cs - 1 : cs - 1 - spec.side.legGap,
    armNearX: walking ? cs - 0.6 : cs - 1.8,
    armFarX: walking ? cs - 0.6 : cs - 6,
    bagDepth: 17 * spec.side.bagDepth * spec.backpack.scale,
  };
}

/* ------------------------------------------------------------ legs & feet */

// ax = ankle x, dy = foot lift/offset
function drawShoe(pen, spec, L, ax, dy, far) {
  const c = spec.colors;
  const s = spec.proportions.shoeScale;
  const len = 25 * s;
  const heelX = ax + 7.5;
  const toeX = heelX - len;
  const shaftW = 13.5;
  const shaftX = heelX - shaftW;
  const top = L.shoeTop + dy;
  const feet = FEET_Y + dy;

  const foot = {
    t: 'r',
    x: toeX,
    y: feet - 8.6 * s,
    w: len,
    h: 8.6 * s,
    r: { tl: 7 * s, tr: 3, bl: 3, br: 3 },
  };
  const shaft = {
    t: 'r',
    x: shaftX,
    y: top,
    w: shaftW,
    h: L.shoeH - 3,
    r: { tl: 4, tr: 4, bl: 0, br: 0 },
  };
  pen.outlined([foot, shaft], c.shoeWhite);

  pen.rrect(shaftX + 0.8, top + 0.6, shaftW - 1.6, 3.2 * s, 1.5, c.shoeBlue); // collar
  pen.rrect(toeX + 0.4, feet - 8.2 * s, 9 * s, 4.9 * s, 3 * s, c.shoeBlue); // toe cap
  pen.rrect(heelX - 8, feet - 11 * s, 8, 7.6 * s, { tl: 2, tr: 3, bl: 1, br: 3 }, c.shoeBlue); // heel counter
  pen.line(toeX + 13, feet - 8.6 * s + 1, toeX + 15.5, feet - 8.6 * s - 1.4, 0.9, c.shoeShade, 0.9);
  pen.rrect(toeX - 0.4, feet - 3.4 * s, len + 0.8, 3.4 * s, 1.7, c.shoeShade); // sole shade
  pen.rrect(toeX - 0.4, feet - 3.4 * s, len + 0.8, 2.2 * s, 1.1, c.shoeWhite); // sole

  if (far) [foot, shaft].forEach((sh) => pen.drawShape(sh, '#000000', 0, 0.2));
}

// A trouser leg as a sheared quad: the top is fixed at the hip, the bottom follows the ankle.
// P(u, t): u 0..1 across the leg, t 0..1 from hip to ankle.
function legGeometry(L, hipX, leg) {
  const w = 15;
  const y0 = L.hipY + 2;
  const y1 = Math.max(y0 + 8, L.ankleY + 1.2 + leg.dy);
  const ax = hipX + leg.dx;
  const TL = [hipX - w / 2, y0];
  const TR = [hipX + w / 2, y0];
  const BL = [ax - w / 2, y1];
  const BR = [ax + w / 2, y1];
  const P = (u, t) => {
    const lx = TL[0] + (BL[0] - TL[0]) * t;
    const ly = TL[1] + (BL[1] - TL[1]) * t;
    const rx = TR[0] + (BR[0] - TR[0]) * t;
    const ry = TR[1] + (BR[1] - TR[1]) * t;
    return [lx + (rx - lx) * u, ly + (ry - ly) * u];
  };
  return { TL, TR, BL, BR, P, len: y1 - y0 };
}

function drawLeg(pen, spec, L, hipX, leg, far) {
  const c = spec.colors;
  const g = legGeometry(L, hipX, leg);
  pen.outlined([{ t: 'p', points: [g.TL, g.TR, g.BR, g.BL] }], far ? c.trousersShade : c.trousers);

  // cuff
  const tc = 1 - 5.4 / g.len;
  pen.poly([g.P(-0.04, tc), g.P(1.04, tc), g.P(1.04, 1), g.P(-0.04, 1)], c.trousersShade);

  if (!far) {
    // cargo pocket that follows the leg
    const t0 = 4.5 / g.len;
    const ph = Math.max(4, Math.min(9.5, g.len - 5.4 - 4.5 - 0.5));
    const t1 = t0 + ph / g.len;
    const u0 = 0.19;
    const u1 = 0.81;
    pen.poly(
      [g.P(u0 - 0.05, t0 - 0.04), g.P(u1 + 0.05, t0 - 0.04), g.P(u1 + 0.05, t1 + 0.04), g.P(u0 - 0.05, t1 + 0.04)],
      c.trousersLight,
      0.8
    );
    pen.poly([g.P(u0, t0), g.P(u1, t0), g.P(u1, t1), g.P(u0, t1)], c.trousersPocket);
    const tm = t0 + 3.2 / g.len;
    const a = g.P(u0 + 0.04, tm);
    const b = g.P(u1 - 0.04, tm);
    const m = g.P(0.5, tm);
    pen.line(a[0], a[1], b[0], b[1], 1, c.trousersLight, 0.9);
    pen.circle(m[0], m[1], 0.9, c.trousersLight);
  }
}

function drawHips(pen, spec, L, S) {
  pen.outlined([{ t: 'r', x: S.cs - 12.5, y: L.hipY - 4, w: 25, h: 14, r: 6 }], spec.colors.trousers);
}

/* ------------------------------------------------------------ backpack */

function drawBag(pen, spec, L, S) {
  const b = spec.backpack;
  if (!b.visible) return;
  const c = spec.colors;
  const x = S.x1 - 4;
  const w = S.bagDepth + 4;
  const y = L.shoulderY + 3;
  const h = 34 * b.scale;

  pen.outlined([{ t: 'r', x, y, w, h, r: { tl: 7, tr: 9, bl: 5, br: 9 } }], c.pack);
  pen.strokeRRect(x + 1.1, y + 1.1, w - 2.2, h - 2.2, 6, 1.1, c.packLight, 0.85); // lighter inner rim
  pen.rrect(x + 3, y + 3, w - 6, 2.6, 1.3, c.packLight, 0.6); // top shine
  pen.line(x + w - 4, y + 6, x + w - 4, y + h - 6, 1.1, c.packLight, 0.55); // zip seam
  pen.rrect(x + w - 10, y + h * 0.5, 6.6, h * 0.32, 3, c.packLight, 0.4); // side bottle pocket
}

/* --------------------------------------------------------------- hoodie */

function drawTorso(pen, spec, L, S) {
  const c = spec.colors;
  const h = L.hemY - L.shoulderY;
  pen.outlined(
    [{ t: 'r', x: S.x0, y: L.shoulderY, w: S.depth, h, r: { tl: 11, tr: 9, bl: 5, br: 5 } }],
    c.hoodie
  );
  pen.rrect(S.x1 - 7, L.shoulderY + 10, 7, h - 10, { tl: 0, tr: 0, bl: 0, br: 5 }, c.hoodieShade);

  // ribbed hem
  pen.rrect(S.x0, L.hemY - 4.2, S.depth, 4.2, { tl: 0, tr: 0, bl: 5, br: 5 }, c.hoodieShade);
  for (let x = S.x0 + 3; x < S.x1 - 2; x += 4) {
    pen.line(x, L.hemY - 3.8, x, L.hemY - 0.6, 0.8, c.outline, 0.35);
  }

  // royal-blue zip along the front edge + pull
  pen.rrect(S.x0 + 1.4, L.shoulderY + 8, 2.2, L.hemY - L.shoulderY - 9, 0.8, c.royal);
  pen.rrect(S.x0 + 0.9, L.shoulderY + 9.5, 3.2, 5, 1.2, c.zipPull);

  // drawstring on the near side of the chest, with metal eyelet + tip
  const sx = S.x0 + 7;
  const y0 = L.shoulderY + 5.5;
  const len = spec.hoodie.drawstring;
  pen.line(sx, y0, sx - 0.6, y0 + len * 0.5, 2.3, c.royal, 1, true);
  pen.line(sx - 0.6, y0 + len * 0.5, sx - 0.2, y0 + len, 2.3, c.royal, 1, true);
  pen.circle(sx, y0 - 0.2, 1.7, c.outline);
  pen.circle(sx, y0 - 0.2, 1.1, c.aglet);
  pen.rrect(sx - 1.4, y0 + len - 0.5, 2.8, 5, 1, c.aglet);

  pen.ellipse(S.x0 + 9, L.shoulderY + 3.2, 11, 3.6, c.hoodieRim, spec.hoodie.rimLight * 0.8);
}

function drawStrap(pen, spec, L, S) {
  const b = spec.backpack;
  if (!b.visible) return;
  const c = spec.colors;
  pen.outlined(
    [{ t: 'cap', x1: S.cs + 4, y1: L.shoulderY + 0.5, x2: S.cs - 6, y2: L.shoulderY + 19, w: b.strap - 0.5 }],
    c.pack,
    1.6
  );
  pen.line(S.cs + 2.4, L.shoulderY + 3, S.cs - 7.4, L.shoulderY + 17, 0.9, c.packLight, 0.9);
}

function drawArm(pen, spec, L, S, far) {
  const c = spec.colors;
  const w = 9.5;
  const off = far ? L.armR : L.armL;
  const sx = S.cs + (far ? -1 : 0.8);
  const sy = L.shoulderPtY + (far ? 1 : 0);
  const wx = (far ? S.armFarX : S.armNearX) + off.dx;
  const wy = L.wristY - (far ? 1 : 0) + off.dy;
  const arm = { t: 'cap', x1: sx, y1: sy, x2: wx, y2: wy, w };

  pen.outlined([arm], c.hoodie);
  if (far) pen.drawShape(arm, '#000000', 0, 0.25);
  else pen.line(sx - 3.2, sy + 3, wx - 3.2, wy - 4, 1.3, c.hoodieRim, spec.hoodie.rimLight, true);

  const t = 0.84;
  pen.capsule(sx + (wx - sx) * t, sy + (wy - sy) * t, wx, wy, w + 0.6, c.hoodieShade); // cuff
  pen.outlined([{ t: 'c', x: wx, y: wy + 4.2, r: 4.4 }], far ? c.skinShade : c.skin); // hand
}

function drawHood(pen, spec, L, S) {
  const c = spec.colors;
  const y = L.shoulderY;
  pen.outlined([{ t: 'e', x: S.cs + 5, y: y + 3, w: 20, h: 14 }], c.hoodie, 1.8); // hood bunched at the back
  pen.ellipse(S.cs - 1, y + 1.5, 17, 9, c.royal); // lining at the neck
  pen.ellipse(S.cs - 3.5, y + 5.5, 8, 5, c.tee);
}