// Parts shared by the front and back views.

// Arms hanging at the sides, seen from the front or back.
// L.armL / L.armR move the hands during the walk cycle.
export function drawArmsFrontal(pen, spec, L) {
  const c = spec.colors;
  [-1, 1].forEach((sg) => {
    const off = sg < 0 ? L.armL : L.armR;
    const sx = L.cx + sg * (L.bodyW / 2 - 2.4);
    const sy = L.shoulderPtY;
    const wx = L.cx + sg * (L.bodyW / 2 + 3.4) + off.dx;
    const wy = L.wristY + off.dy;

    pen.outlined([{ t: 'cap', x1: sx, y1: sy, x2: wx, y2: wy, w: L.armW }], c.hoodie);

    const o = L.armW / 2 - 1.9;
    if (sg > 0) {
      pen.line(sx + o, sy + 2, wx + o, wy - 4, 2.4, c.hoodieShade, 1, true);
    } else {
      pen.line(sx - o, sy + 2, wx - o, wy - 4, 1.4, c.hoodieRim, spec.hoodie.rimLight, true);
    }

    const t = 0.84;
    pen.capsule(sx + (wx - sx) * t, sy + (wy - sy) * t, wx, wy, L.armW + 0.6, c.hoodieShade);
    pen.outlined([{ t: 'c', x: wx + sg * 0.2, y: wy + 4.4, r: 4.6 }], c.skin);
  });
}