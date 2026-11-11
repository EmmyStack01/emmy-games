// Emmy STACK01 mascot, BACK view (128x128 frame, feet at y=122).
// Draw order (back to front):
//   shoes > trousers > hoodie > backpack > straps > hood > arms > head (see head.js)

import { computeLayout, FEET_Y } from './drawMascotFront.js';
import { drawArmsFrontal } from './parts.js';
import { drawHeadBack } from './head.js';

export function drawMascotBack(pen, spec, pose = {}) {
  pen.setOutline(spec.colors.outline, spec.outline.width);
  const L = computeLayout(spec, pose);

  drawShoes(pen, spec, L);
  drawTrousers(pen, spec, L);
  drawHoodie(pen, spec, L);
  drawBag(pen, spec, L);
  drawStraps(pen, spec, L);
  drawHood(pen, spec, L);
  drawArmsFrontal(pen, spec, L);
  drawHeadBack(pen, spec, L);
}

/* ------------------------------------------------------------------- feet */

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
    pen.rrect(cx - 1.6, top + 0.2, 3.2, 3.6 * s, 1.2, c.shoeWhite); // pull tab
    pen.rrect(cx - 6.6 * s, feet - 9 * s, 13.2 * s, 5.6 * s, 2.6 * s, c.shoeBlue); // heel counter
    pen.rrect(x - 0.4, feet - 3.4 * s, W + 0.8, 3.4 * s, 1.7, c.shoeShade);
    pen.rrect(x - 0.4, feet - 3.4 * s, W + 0.8, 2.2 * s, 1.1, c.shoeWhite);
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

  legs.forEach(({ cx, dy }) => {
    pen.rrect(cx - legW / 2 - 0.6, L.ankleY - 4.2 + dy, legW + 1.2, 5.4, 2, c.trousersShade);
    pen.line(cx - legW / 2 + 1.5, L.ankleY - 4 + dy, cx + legW / 2 - 1.5, L.ankleY - 4 + dy, 0.9, c.trousersLight, 0.6);
  });

  // centre seam
  pen.line(L.cx, L.hipY + 8, L.cx, Math.max(L.hipY + 9, L.ankleY - 5 + Math.min(legs[0].dy, legs[1].dy)), 1.1, c.trousersShade, 0.9);

  // cargo pockets show only as slivers on the outer edges, from behind
  const py = L.hipY + 6.5;
  [
    [L.cx - 19 + 0.4, legs[0].dy],
    [L.cx + 19 - 0.4 - 3.4, legs[1].dy],
  ].forEach(([px, dy]) => {
    const ph = Math.max(4, Math.min(9.5, L.ankleY + dy - 4.7 - py));
    pen.rrect(px, py, 3.4, ph, 1.2, c.trousersPocket);
    pen.line(px + 0.4, py + 3.2, px + 3, py + 3.2, 0.9, c.trousersLight, 0.9);
  });

  // back pockets, just peeking below the hoodie hem
  [-1, 1].forEach((sg) => {
    const px = L.cx + sg * 8.2 - 3.4;
    pen.rrect(px - 0.6, L.hemY + 3.4, 7.8, 6, 1.6, c.trousersLight, 0.7);
    pen.rrect(px, L.hemY + 4, 6.6, 4.8, 1.3, c.trousersPocket);
  });
}

/* ----------------------------------------------------------------- hoodie */

function drawHoodie(pen, spec, L) {
  const c = spec.colors;
  const h = L.hemY - L.shoulderY;
  pen.outlined(
    [{ t: 'r', x: L.x0, y: L.shoulderY, w: L.bodyW, h, r: { tl: 11, tr: 11, bl: 5, br: 5 } }],
    c.hoodie
  );
  pen.rrect(L.x1 - 8, L.shoulderY + 10, 8, h - 10, { tl: 0, tr: 0, bl: 0, br: 5 }, c.hoodieShade);
  pen.rrect(L.x0, L.hemY - 4.2, L.bodyW, 4.2, { tl: 0, tr: 0, bl: 5, br: 5 }, c.hoodieShade);
  for (let x = L.x0 + 3; x < L.x1 - 2; x += 4) {
    pen.line(x, L.hemY - 3.8, x, L.hemY - 0.6, 0.8, c.outline, 0.35);
  }
  pen.line(L.x0 + 1.8, L.shoulderY + 12, L.x0 + 1.8, L.hemY - 8, 1.3, c.hoodieRim, spec.hoodie.rimLight);
}

/* --------------------------------------------------------------- backpack */

function drawBag(pen, spec, L) {
  const b = spec.backpack;
  if (!b.visible) return;
  const c = spec.colors;
  const w = (L.bodyW + 10) * b.scale;
  const h = 34 * b.scale;
  const x = L.cx - w / 2;
  const y = L.shoulderY + 6;

  // main bag + two side pockets as one silhouette
  const bag = { t: 'r', x, y, w, h, r: 9 };
  const pocketL = { t: 'r', x: x - 3.4, y: y + h * 0.5, w: 7.6, h: h * 0.4, r: 3.6 };
  const pocketR = { t: 'r', x: x + w - 4.2, y: y + h * 0.5, w: 7.6, h: h * 0.4, r: 3.6 };
  pen.outlined([bag, pocketL, pocketR], c.pack);

  // lighter inner rim so the bag reads clearly against the navy hoodie
  pen.strokeRRect(x + 1.1, y + 1.1, w - 2.2, h - 2.2, 8, 1.1, c.packLight, 0.85);
  pen.strokeRRect(pocketL.x + 0.9, pocketL.y + 0.9, pocketL.w - 1.8, pocketL.h - 1.8, 2.8, 1, c.packLight, 0.6);
  pen.strokeRRect(pocketR.x + 0.9, pocketR.y + 0.9, pocketR.w - 1.8, pocketR.h - 1.8, 2.8, 1, c.packLight, 0.6);

  pen.line(x + 5, y + 9, x + w - 5, y + 9, 1.2, c.packLight, 0.7); // main zip seam

  // big front pocket with zip + pull
  const px = x + w * 0.15;
  const pw = w * 0.7;
  const py = y + 13;
  const ph = h - 13 - 5;
  pen.rrect(px - 0.8, py - 0.8, pw + 1.6, ph + 1.6, 5, c.packLight, 0.75);
  pen.rrect(px, py, pw, ph, 4.4, c.pack);
  pen.line(px + 3, py + 3.4, px + pw - 3, py + 3.4, 1, c.packLight, 0.7);
  pen.rrect(L.cx - 1.4, py + 1.6, 2.8, 4.2, 1, c.zipPull, 0.9);
}

function drawStraps(pen, spec, L) {
  const b = spec.backpack;
  if (!b.visible) return;
  const c = spec.colors;
  const bagTop = L.shoulderY + 6;
  [-1, 1].forEach((sg) => {
    const x1 = L.cx + sg * 19.5;
    const x2 = L.cx + sg * 20.5;
    pen.outlined(
      [{ t: 'cap', x1, y1: L.shoulderY + 4, x2, y2: bagTop + 14, w: b.strap - 0.5 }],
      c.pack,
      1.6
    );
    pen.line(x1 - sg * 1.4, L.shoulderY + 6, x2 - sg * 1.4, bagTop + 12, 0.9, c.packLight, 0.85);
  });
}

// The hood hangs down the upper back like a rounded bib, with the bright lining
// showing as a collar on each side of the neck.
function drawHood(pen, spec, L) {
  const c = spec.colors;
  const k = spec.back.hoodSize;
  const y = L.shoulderY;
  const w = L.bodyW * 0.8 * k;
  const h = 20 * k;
  const x = L.cx - w / 2;
  const top = y + 1.5;

  // lining collar
  pen.outlined([{ t: 'e', x: L.cx, y: y + 1.5, w: w + 4, h: 9 }], c.royal, 1.6);

  // the hood itself
  pen.outlined(
    [{ t: 'r', x, y: top, w, h, r: { tl: 9, tr: 9, bl: 11, br: 11 } }],
    c.hoodie
  );
  pen.rrect(x + 1.5, top + h * 0.55, w - 3, h * 0.42, { tl: 0, tr: 0, bl: 9, br: 9 }, c.hoodieShade, 0.75); // shade
  pen.line(L.cx, top + 4, L.cx, top + h - 3, 1.1, c.hoodieShade, 1, true); // centre seam
  pen.line(x + 2.5, top + 7, x + 2.5, top + h - 6, 1.2, c.hoodieRim, spec.hoodie.rimLight); // rim light
  pen.arc(L.cx, top + 3, w / 2 - 2, Math.PI * 1.05, Math.PI * 1.95, 1.4, c.hoodieRim, 0.8); // hood opening lip
}