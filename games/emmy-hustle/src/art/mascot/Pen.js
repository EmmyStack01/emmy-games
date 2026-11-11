// A thin helper on top of Phaser Graphics for drawing the mascot.
//  - Coordinates are "frame pixels" (128x128 frame). `scale` lets the same drawing
//    be baked at 128, 256 or 512 px.
//  - push()/pop() give a local coordinate system (used to scale the head).
//  - outlined() draws a group of shapes with ONE shared cartoon outline.

const toNum = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));

export default class Pen {
  constructor(graphics, scale = 1) {
    this.g = graphics;
    this.S = scale;
    this.ox = 0;
    this.oy = 0;
    this.k = 1;
    this.stack = [];
    this.outlineColor = 0x000000;
    this.outlineWidth = 4;
  }

  setOutline(color, width) {
    this.outlineColor = toNum(color);
    this.outlineWidth = width;
  }

  // New local origin at current-local (tx, ty), scaled by k.
  push(tx, ty, k = 1) {
    this.stack.push([this.ox, this.oy, this.k]);
    this.ox += tx * this.k;
    this.oy += ty * this.k;
    this.k *= k;
  }

  pop() {
    const prev = this.stack.pop();
    if (!prev) return;
    this.ox = prev[0];
    this.oy = prev[1];
    this.k = prev[2];
  }

  X(x) { return (this.ox + x * this.k) * this.S; }
  Y(y) { return (this.oy + y * this.k) * this.S; }
  L(l) { return l * this.k * this.S; }

  rad(r, w, h) {
    const lim = Math.max(0, Math.min(w, h) / 2);
    if (typeof r === 'number') return this.L(Math.max(0, Math.min(r, lim)));
    const f = (v) => this.L(Math.max(0, Math.min(v || 0, lim)));
    return { tl: f(r.tl), tr: f(r.tr), bl: f(r.bl), br: f(r.br) };
  }

  fill(color, alpha = 1) {
    this.g.fillStyle(toNum(color), alpha);
  }

  /* ----------------------------------------------------------- primitives */

  circle(x, y, r, color, alpha = 1) {
    this.fill(color, alpha);
    this.g.fillCircle(this.X(x), this.Y(y), this.L(r));
  }

  ellipse(x, y, w, h, color, alpha = 1) {
    this.fill(color, alpha);
    this.g.fillEllipse(this.X(x), this.Y(y), this.L(w), this.L(h));
  }

  rrect(x, y, w, h, r, color, alpha = 1) {
    this.fill(color, alpha);
    this.g.fillRoundedRect(this.X(x), this.Y(y), this.L(w), this.L(h), this.rad(r, w, h));
  }

  poly(points, color, alpha = 1) {
    this.fill(color, alpha);
    const g = this.g;
    g.beginPath();
    g.moveTo(this.X(points[0][0]), this.Y(points[0][1]));
    for (let i = 1; i < points.length; i++) {
      g.lineTo(this.X(points[i][0]), this.Y(points[i][1]));
    }
    g.closePath();
    g.fillPath();
  }

  strokePoly(points, width, color, alpha = 1) {
    const g = this.g;
    g.lineStyle(this.L(width), toNum(color), alpha);
    g.beginPath();
    g.moveTo(this.X(points[0][0]), this.Y(points[0][1]));
    for (let i = 1; i < points.length; i++) {
      g.lineTo(this.X(points[i][0]), this.Y(points[i][1]));
    }
    g.closePath();
    g.strokePath();
  }

  line(x1, y1, x2, y2, w, color, alpha = 1, round = false) {
    this.g.lineStyle(this.L(w), toNum(color), alpha);
    this.g.lineBetween(this.X(x1), this.Y(y1), this.X(x2), this.Y(y2));
    if (round) {
      this.circle(x1, y1, w / 2, color, alpha);
      this.circle(x2, y2, w / 2, color, alpha);
    }
  }

  arc(x, y, r, a0, a1, w, color, alpha = 1) {
    const g = this.g;
    g.lineStyle(this.L(w), toNum(color), alpha);
    g.beginPath();
    g.arc(this.X(x), this.Y(y), this.L(r), a0, a1, false);
    g.strokePath();
  }

  strokeRRect(x, y, w, h, r, width, color, alpha = 1) {
    this.g.lineStyle(this.L(width), toNum(color), alpha);
    this.g.strokeRoundedRect(this.X(x), this.Y(y), this.L(w), this.L(h), this.rad(r, w, h));
  }

  capsule(x1, y1, x2, y2, w, color, alpha = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (w / 2);
    const ny = (dx / len) * (w / 2);
    this.poly(
      [
        [x1 + nx, y1 + ny],
        [x2 + nx, y2 + ny],
        [x2 - nx, y2 - ny],
        [x1 - nx, y1 - ny],
      ],
      color,
      alpha
    );
    this.circle(x1, y1, w / 2, color, alpha);
    this.circle(x2, y2, w / 2, color, alpha);
  }

  /* ------------------------------------------------------- shape groups */

  // shape: {t:'c',x,y,r} | {t:'e',x,y,w,h} | {t:'r',x,y,w,h,r} |
  //        {t:'cap',x1,y1,x2,y2,w} | {t:'p',points:[[x,y],...]}
  drawShape(s, color, grow = 0, alpha = 1) {
    switch (s.t) {
      case 'c':
        this.circle(s.x, s.y, s.r + grow, color, alpha);
        break;
      case 'e':
        this.ellipse(s.x, s.y, s.w + 2 * grow, s.h + 2 * grow, color, alpha);
        break;
      case 'r': {
        const r =
          typeof s.r === 'number'
            ? s.r + grow
            : {
                tl: (s.r.tl || 0) + grow,
                tr: (s.r.tr || 0) + grow,
                bl: (s.r.bl || 0) + grow,
                br: (s.r.br || 0) + grow,
              };
        this.rrect(s.x - grow, s.y - grow, s.w + 2 * grow, s.h + 2 * grow, r, color, alpha);
        break;
      }
      case 'cap':
        this.capsule(s.x1, s.y1, s.x2, s.y2, s.w + 2 * grow, color, alpha);
        break;
      case 'p':
        if (grow > 0) this.strokePoly(s.points, grow * 2, color, alpha);
        this.poly(s.points, color, alpha);
        break;
      default:
        break;
    }
  }

  // Outline pass first (all shapes), then fill pass: one clean shared silhouette.
  outlined(shapes, fill, outlineWidth = this.outlineWidth) {
    const grow = outlineWidth / this.k;
    shapes.forEach((s) => this.drawShape(s, this.outlineColor, grow));
    shapes.forEach((s) => this.drawShape(s, fill, 0));
  }
}