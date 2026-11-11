// Heads for the three views. Local coordinates: chin at (0, 0), up = negative y.
// Front/back are symmetric around x = 0. The side view faces LEFT (front of face = -x).
//
// Hair design (from the reference): a tall dome of tight curls, wider than the face at
// the crown, with only a short fade at the temples, sides and nape.

const makeShape = (h, ay) => ([dx, dy, r]) => ({
  t: 'c',
  x: dx * h.size * h.width,
  y: ay + dy * h.size,
  r: r * h.size,
});

// [dx, dy, radius] relative to the top of the face.
const DOME = [
  [-13, -9.5, 8.5], [0, -12, 9], [13, -9.5, 8.5],
  [-23, -3.5, 8], [-11.5, -6, 9], [0, -7.5, 9.5], [11.5, -6, 9], [23, -3.5, 8],
  [-26, 3, 5.5], [26, 3, 5.5],
];
const FRINGE = [
  [-17, -5, 6.5], [-9, -8.5, 7.5], [-1, -9.5, 8], [7, -8.5, 7.5], [15, -6, 7],
];
// Back of the head tapers down into a short fade at the nape.
const BACK_LOWER = [
  [-24, 5, 8], [-12, 7, 9], [0, 8, 9.5], [12, 7, 9], [24, 5, 8],
  [-14, 14.5, 7], [-5, 16, 7.5], [5, 16, 7.5], [14, 14.5, 7],
];
const SIDE_DOME = [
  [-6, -11, 8.5], [3, -12.5, 9], [11, -10, 8.5],
  [-14, -4.5, 8], [-5, -7.5, 9], [4, -8, 9.5], [12, -6.5, 9], [18, -1.5, 7.5],
  [19, 5, 6], [16, 12, 5.5],
];
const SIDE_FRINGE = [
  [-17, -3.5, 6], [-12, -6.8, 7.5], [-5, -8.8, 8], [3, -9, 8.5], [10, -7, 8],
];

export function hairTexture(pen, shapes, c, h, startIndex = 0) {
  shapes.forEach((s, i) => {
    if (i < startIndex) return;
    pen.ellipse(s.x - s.r * 0.28, s.y - s.r * 0.34, s.r * 0.8, s.r * 0.5, c.hairLight, h.highlight);
    const a0 = (((i * 67) % 360) * Math.PI) / 180;
    pen.arc(s.x + s.r * 0.1, s.y + s.r * 0.12, s.r * 0.5, a0, a0 + 3.4, 1.1, c.hairLight, h.curls);
    pen.arc(s.x - s.r * 0.25, s.y + s.r * 0.3, s.r * 0.26, a0 + 2, a0 + 5, 0.9, c.hairLight, h.curls * 0.9);
  });
}

/* ------------------------------------------------------------------ front */

export function drawHeadFront(pen, spec, L) {
  const c = spec.colors;
  const f = spec.face;
  const g = spec.glasses;
  const h = spec.hair;

  pen.push(L.cx, L.chinY, spec.proportions.headScale);

  const shape = makeShape(h, -f.height);
  const dome = DOME.map(shape);
  const fringe = FRINGE.map(shape);

  // hair mass behind the face
  pen.outlined(dome, c.hair);
  hairTexture(pen, dome, c, h, 0);

  // ears
  [-1, 1].forEach((sg) => {
    pen.outlined([{ t: 'e', x: sg * (f.width / 2 + 0.4), y: -14.5, w: 7.2, h: 11 }], c.skin);
    const a0 = sg < 0 ? Math.PI * 0.4 : -Math.PI * 0.6;
    pen.arc(sg * (f.width / 2 + 1.2), -14.5, 2.2, a0, a0 + Math.PI * 1.2, 1.1, c.skinShade, 0.9);
  });

  // face (egg shape: wide cheeks, narrower chin)
  pen.outlined(
    [
      { t: 'e', x: 0, y: -f.height * 0.56, w: f.width, h: f.height * 0.84 },
      { t: 'e', x: 0, y: -f.height * 0.33, w: f.width * 0.76, h: f.height * 0.66 },
    ],
    c.skin
  );

  // short fade at the temples
  [-1, 1].forEach((sg) => {
    pen.ellipse(sg * (f.width / 2 - 1.8), -f.height * 0.78, 8.5, 15, c.hair, 0.4);
    pen.ellipse(sg * (f.width / 2 - 2.2), -f.height * 0.8, 6, 12.5, c.hair, 0.9);
  });

  // cheeks, nose
  pen.ellipse(-12.5, -7, 6, 3.4, c.blush, 0.22);
  pen.ellipse(12.5, -7, 6, 3.4, c.blush, 0.22);
  pen.ellipse(0, -9.4, 5.6, 3.8, c.skinShade, 0.5);
  pen.ellipse(0, -10.3, 3, 1.8, '#e0a070', 0.55);
  pen.ellipse(-1.7, -8, 1.3, 1, c.skinShade, 0.95);
  pen.ellipse(1.7, -8, 1.3, 1, c.skinShade, 0.95);

  // mouth: lower lip + small smile
  pen.ellipse(0, -3.2, 4.6, 1.8, c.lip);
  pen.arc(0, -8.6, 4.4, Math.PI * 0.22, Math.PI * 0.78, 1.3, c.lipDark);

  // eyes + brows
  const eyeY = -f.height * 0.47 + g.yOffset;
  [-1, 1].forEach((sg) => {
    const ex = sg * g.spacing;
    pen.ellipse(ex, eyeY, 7.6, 7, c.sclera);
    pen.circle(ex, eyeY + 0.3, 3, c.iris);
    pen.circle(ex, eyeY + 0.3, 1.45, c.eye);
    pen.circle(ex + 1, eyeY - 0.9, 1, c.sclera);
    pen.circle(ex - 1, eyeY + 1.3, 0.5, c.sclera, 0.6);
    pen.arc(ex, eyeY + 0.4, 3.9, Math.PI * 1.08, Math.PI * 1.92, 1.5, c.hair);
    pen.line(ex + sg * 3.6, eyeY - 1, ex + sg * 5, eyeY - 1.9, 1.1, c.hair, 1, true);

    const yb = eyeY - 8.6;
    const outerX = sg * (g.spacing + 5.4);
    const midX = sg * (g.spacing - 0.6);
    const innerX = sg * (g.spacing - 4.2);
    pen.line(outerX, yb + 0.8, midX, yb - 0.9, 2.9, c.hair, 1, true);
    pen.line(midX, yb - 0.9, innerX, yb + 0.3, 2.9, c.hair, 1, true);
  });

  // lens tint (over the eyes)
  const lw = g.lensWidth;
  const lh = g.lensHeight;
  const rim = g.rim;
  [-1, 1].forEach((sg) => {
    pen.rrect(sg * g.spacing - lw / 2 + rim, eyeY - lh / 2 + rim, lw - 2 * rim, lh - 2 * rim, 2.2, c.lens, g.tint);
  });

  // fringe over the forehead
  pen.outlined(fringe, c.hair);
  hairTexture(pen, fringe, c, h, 0);

  // glasses: clear frames, blue hinges and arms (like the reference)
  [-1, 1].forEach((sg) => {
    const x = sg * g.spacing - lw / 2 + rim / 2;
    const y = eyeY - lh / 2 + rim / 2;
    pen.strokeRRect(x, y, lw - rim, lh - rim, 3, rim + 1.4, c.outline, 0.9);
  });
  pen.rrect(-2.4, eyeY - 4, 4.8, 2.6, 1, c.outline);
  [-1, 1].forEach((sg) => {
    const x = sg * g.spacing - lw / 2 + rim / 2;
    const y = eyeY - lh / 2 + rim / 2;
    pen.strokeRRect(x, y, lw - rim, lh - rim, 2.6, rim, c.frame);
  });
  pen.rrect(-1.8, eyeY - 3.5, 3.6, 1.4, 0.6, c.frame);

  [-1, 1].forEach((sg) => {
    const hx = sg * (g.spacing + lw / 2 - 0.4);
    const hy = eyeY - lh / 2 + 1.8;
    pen.line(hx, hy, hx + sg * 3.6, hy + 0.9, 3.2, c.outline, 1, true); // arm edge
    pen.line(hx, hy, hx + sg * 3.6, hy + 0.9, 1.8, c.royal, 1, true); // arm
    pen.rrect(hx - 1.4, hy - 2.3, 2.8, 4.6, 1, c.outline); // hinge edge
    pen.rrect(hx - 0.9, hy - 1.8, 1.8, 3.6, 0.8, c.royal); // hinge

    const gx = sg * g.spacing - lw / 2 + rim + 1.6;
    const gy = eyeY - lh / 2 + rim + 3.4;
    pen.line(gx, gy, gx + 2.6, gy - 2.2, 1.2, '#ffffff', g.glint, true);
    pen.line(gx + 3.2, gy + 0.2, gx + 4.6, gy - 1.5, 1, '#ffffff', g.glint * 0.7, true);
  });

  pen.pop();
}

/* ------------------------------------------------------------------- back */

export function drawHeadBack(pen, spec, L) {
  const c = spec.colors;
  const f = spec.face;
  const h = spec.hair;

  pen.push(L.cx, L.chinY, spec.proportions.headScale);

  const shape = makeShape(h, -f.height);
  const cloud = [...DOME, ...BACK_LOWER].map(shape);

  // ears peek out beside the short hair
  [-1, 1].forEach((sg) => {
    pen.outlined([{ t: 'e', x: sg * (f.width / 2 + 0.4), y: -14.5, w: 7.2, h: 11 }], c.skin);
  });

  // nape, then the hair
  pen.outlined([{ t: 'e', x: 0, y: -2.5, w: 11, h: 7 }], c.skin, 1.4);
  pen.outlined(cloud, c.hair);
  hairTexture(pen, cloud, c, h, 0);

  // the glasses arms, seen from behind, over the ears
  [-1, 1].forEach((sg) => {
    const x1 = sg * (f.width / 2 - 1.5);
    const x2 = sg * (f.width / 2 + 3.4);
    pen.line(x1, -19.6, x2, -17.4, 3.4, c.outline, 1, true);
    pen.line(x1, -19.6, x2, -17.4, 1.9, c.royal, 1, true);
  });

  pen.pop();
}

/* ------------------------------------------------------------------- side */

// Side view, facing left. S.cs is the body's spine x.
export function drawHeadSide(pen, spec, L, S) {
  const c = spec.colors;
  const f = spec.face;
  const g = spec.glasses;
  const h = spec.hair;

  pen.push(S.cs - 1, L.chinY, spec.proportions.headScale);

  const shape = makeShape(h, -f.height);
  const dome = SIDE_DOME.map(shape);
  const fringe = SIDE_FRINGE.map(shape);

  // neck, then the hair mass
  pen.outlined([{ t: 'e', x: 1.5, y: -3, w: 12, h: 9 }], c.skin, 1.2);
  pen.outlined(dome, c.hair);
  hairTexture(pen, dome, c, h, 0);

  // face in profile (with nose and a small chin)
  const fw = f.width * 0.8;
  pen.outlined(
    [
      { t: 'e', x: -4, y: -f.height * 0.56, w: fw, h: f.height * 0.84 },
      { t: 'e', x: -5.5, y: -f.height * 0.33, w: fw * 0.76, h: f.height * 0.66 },
      { t: 'e', x: -4 - fw / 2 - 0.4, y: -f.height * 0.36, w: 6, h: 5.2 },
    ],
    c.skin
  );

  // short hair on the side of the head: above and behind the ear
  pen.ellipse(8, -21.5, 22, 15, c.hair, 0.95);
  pen.ellipse(12.5, -12, 11, 17, c.hair, 0.95);

  // ear: a plain ear with a thin edge (no heavy ring)
  pen.outlined([{ t: 'e', x: 3, y: -13.5, w: 7.5, h: 11 }], c.skin, 1.1);
  pen.arc(3.3, -13.5, 2.2, -Math.PI * 0.6, Math.PI * 0.6, 1.1, c.skinShade, 0.9);

  // cheek, mouth
  pen.ellipse(-9, -7, 5, 3, c.blush, 0.22);
  pen.ellipse(-13.2, -3.4, 4, 1.7, c.lip);
  pen.arc(-12.5, -8.2, 4, Math.PI * 0.2, Math.PI * 0.74, 1.2, c.lipDark);

  // eye + brow
  const eyeY = -f.height * 0.47 + g.yOffset;
  const gx = -14.5;
  const lw = g.lensWidth * 0.6;
  const lh = g.lensHeight;
  const rim = g.rim;
  const eyeX = gx + 1;
  pen.ellipse(eyeX, eyeY, 5.2, 6.8, c.sclera);
  pen.circle(eyeX - 0.9, eyeY + 0.3, 2.9, c.iris);
  pen.circle(eyeX - 1, eyeY + 0.3, 1.4, c.eye);
  pen.circle(eyeX - 0.1, eyeY - 0.9, 0.95, c.sclera);
  pen.arc(eyeX - 0.3, eyeY + 0.3, 3.6, Math.PI * 1.1, Math.PI * 1.9, 1.4, c.hair);
  const yb = eyeY - 8.6;
  pen.line(gx - 5.2, yb + 0.6, gx + 5, yb - 0.8, 2.8, c.hair, 1, true);

  // lens tint
  pen.rrect(gx - lw / 2 + rim, eyeY - lh / 2 + rim, lw - 2 * rim, lh - 2 * rim, 2.2, c.lens, g.tint);

  // fringe
  pen.outlined(fringe, c.hair);
  hairTexture(pen, fringe, c, h, 0);

  // glasses: clear frame, blue hinge, blue arm running back to the ear
  const lx = gx - lw / 2 + rim / 2;
  const ly = eyeY - lh / 2 + rim / 2;
  pen.strokeRRect(lx, ly, lw - rim, lh - rim, 3, rim + 1.4, c.outline, 0.9);
  pen.strokeRRect(lx, ly, lw - rim, lh - rim, 2.6, rim, c.frame);

  const hx = gx + lw / 2 - 0.4;
  const hy = eyeY - lh / 2 + 1.8;
  pen.line(hx, hy, 2.8, -16.5, 3.4, c.outline, 1, true);
  pen.line(hx, hy, 2.8, -16.5, 1.9, c.royal, 1, true);
  pen.rrect(hx - 1.4, hy - 2.3, 2.8, 4.6, 1, c.outline);
  pen.rrect(hx - 0.9, hy - 1.8, 1.8, 3.6, 0.8, c.royal);
  pen.line(lx + rim + 1.2, eyeY - lh / 2 + rim + 3.2, lx + rim + 3.4, eyeY - lh / 2 + rim + 1.2, 1.2, '#ffffff', g.glint, true);

  pen.pop();
}