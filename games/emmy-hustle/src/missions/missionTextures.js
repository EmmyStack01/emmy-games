import { THEME } from '../theme.js';

// Drawn textures for the mission objects (floating markers, ground rings, the package and
// the customer). Same flat navy-outlined style as the rest of the game. Safe to call twice.

const OUT = THEME.outline;

function bake(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
}

function polygon(g, points) {
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.closePath();
  g.fillPath();
}

// ---------------------------------------------------------------------------
// Customers. Every customer is the same small waving figure (40 x 56), drawn from a "look":
// colours, an optional apron, a robe front band, a headwrap, a cap or a hair puff, an optional
// beard, optional glasses, which side the headwrap knot is on and which hand waves.
// Mrs. Folake's look reproduces her original drawing exactly (her texture key is still
// "customer"); every other customer gets the key "customer_<look>".
// ---------------------------------------------------------------------------
export const CUSTOMER_LOOKS = {
  // Mrs. Folake: coral dress, gold headwrap with the knot on the right, waving her right hand
  folake: {
    skin: 0x9a5a35,
    shoes: 0x1d2a5c,
    dress: 0xe8594a,
    pattern: 0xffc43d,
    apron: null,
    trim: null,
    headwear: 'wrap',
    beard: null,
    glasses: null,
    wrap: 0xffc43d,
    wrapStripe: 0x1f5bff,
    knotSide: 'right',
    waveSide: 'right',
  },
  // Mama Ngozi: green dress with a cream apron, purple headwrap with the knot on the left,
  // waving her left hand
  ngozi: {
    skin: 0xc08457,
    shoes: 0x6b3d1f,
    dress: 0x2ea36b,
    pattern: 0xbff0d4,
    apron: 0xfff1d6,
    trim: null,
    headwear: 'wrap',
    beard: null,
    glasses: null,
    wrap: 0x8e44ad,
    wrapStripe: 0xffd166,
    knotSide: 'left',
    waveSide: 'left',
  },
  // Mr. Okafor: an indigo kaftan with a cream front band and collar, a teal cap with a gold
  // band, a short beard, and the darkest skin tone; waving his right hand
  okafor: {
    skin: 0x5e3520,
    shoes: 0x23232b,
    dress: 0x2f4bb3,
    pattern: 0x6f8cf0,
    apron: null,
    trim: 0xf4efe0,
    headwear: 'cap',
    beard: 0x1b1520,
    glasses: null,
    wrap: 0x1aa6a6,
    wrapStripe: 0xffc43d,
    knotSide: 'right',
    waveSide: 'right',
  },
  // Aunty Kemi: a pink dress with pale yellow dots and white trainers, dark hair in a round puff
  // with a bun and a white headband, round glasses; waving her right hand. (For a hair puff,
  // "wrap" is the hair colour and "wrapStripe" is the headband.)
  kemi: {
    skin: 0x7a4a2c,
    shoes: 0xf2f2f2,
    dress: 0xd63384,
    pattern: 0xfff3c4,
    apron: null,
    trim: null,
    headwear: 'puff',
    beard: null,
    glasses: 0x1b1520,
    wrap: 0x241612,
    wrapStripe: 0xffffff,
    knotSide: 'right',
    waveSide: 'right',
  },
};

// The job marker above a shop. "new" is the original gold marker (its drawing is unchanged);
// "repeatable" is the same shape in grey-blue. (A tint can't do this: Phaser multiplies a tint
// into the picture, which turns gold olive rather than grey-blue.)
export const QUEST_MARKER_KEY = Object.freeze({ new: 'mk_quest', repeatable: 'mk_quest_repeat' });

const QUEST_MARKER_PALETTE = {
  new: { fill: 0xffc43d, shine: 0xffe9a8 },
  repeatable: { fill: 0x8fa3c4, shine: 0xdbe4f2 },
};

function drawQuestMarker(g, { fill, shine }) {
  g.fillStyle(OUT, 1);
  g.fillCircle(17, 17, 17);
  g.fillTriangle(5, 26, 29, 26, 17, 45);
  g.fillStyle(fill, 1);
  g.fillCircle(17, 17, 14.5);
  g.fillTriangle(8, 27, 26, 27, 17, 41);
  g.fillStyle(shine, 0.9);
  g.fillCircle(11.5, 11, 3.5);
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(14.5, 8, 5, 12, 2.5);
  g.fillCircle(17, 24.5, 2.8);
}

export const customerTextureKey = (look) => (look === 'folake' ? 'customer' : `customer_${look}`);

function drawCustomer(g, look) {
  const { skin: SKIN } = look;
  // the waving side only changes where the two arms and the headwrap knot are drawn
  const arm = look.waveSide === 'left' ? (x) => 40 - x : (x) => x;
  const knotX = look.knotSide === 'left' ? 11 : 29;

  // legs + shoes
  g.fillStyle(OUT, 1);
  g.fillRoundedRect(13, 44, 6, 10, 2);
  g.fillRoundedRect(21, 44, 6, 10, 2);
  g.fillStyle(SKIN, 1);
  g.fillRect(14.5, 45, 3, 6);
  g.fillRect(22.5, 45, 3, 6);
  g.fillStyle(look.shoes, 1);
  g.fillRoundedRect(12, 51, 8, 4, 2);
  g.fillRoundedRect(20, 51, 8, 4, 2);

  // arm hanging down
  g.lineStyle(7, OUT, 1);
  g.lineBetween(arm(10.5), 29, arm(8), 42);
  g.lineStyle(4, SKIN, 1);
  g.lineBetween(arm(10.5), 29, arm(8), 42);
  g.fillStyle(SKIN, 1);
  g.fillCircle(arm(8), 43, 2.6);

  // dress
  g.fillStyle(OUT, 1);
  polygon(g, [[9, 24.5], [31, 24.5], [35, 48.5], [5, 48.5]]);
  g.fillStyle(look.dress, 1);
  polygon(g, [[11, 26.5], [29, 26.5], [32.5, 46.5], [7.5, 46.5]]);
  g.fillStyle(0x000000, 0.12);
  polygon(g, [[24, 26.5], [29, 26.5], [32.5, 46.5], [26, 46.5]]);
  g.fillStyle(look.pattern, 1);
  [[15, 32], [25, 32], [20, 38], [13, 43], [27, 43]].forEach(([x, y]) => g.fillCircle(x, y, 1.8));

  // apron (only some customers wear one)
  if (look.apron !== null) {
    g.fillStyle(OUT, 1);
    polygon(g, [[13, 30], [27, 30], [29.5, 48], [10.5, 48]]);
    g.fillStyle(look.apron, 1);
    polygon(g, [[14.5, 31.5], [25.5, 31.5], [27.5, 46.5], [12.5, 46.5]]);
    g.fillStyle(OUT, 0.35);
    g.fillRect(16.5, 38, 7, 1.5);
  }

  // robe front band, collar and buttons (only some customers wear a robe)
  if (look.trim !== null) {
    g.fillStyle(look.trim, 1);
    g.fillRect(18.5, 26.5, 3, 20);
    g.fillTriangle(14.5, 25.5, 25.5, 25.5, 20, 33);
    g.fillStyle(OUT, 1);
    [[20, 37], [20, 41.5]].forEach(([x, y]) => g.fillCircle(x, y, 1));
  }

  // waving arm
  g.lineStyle(7, OUT, 1);
  g.lineBetween(arm(29.5), 28, arm(35.5), 17);
  g.lineStyle(4, SKIN, 1);
  g.lineBetween(arm(29.5), 28, arm(35.5), 17);
  g.fillStyle(OUT, 1);
  g.fillCircle(arm(36), 15.5, 4.6);
  g.fillStyle(SKIN, 1);
  g.fillCircle(arm(36), 15.5, 3);

  // head
  g.fillStyle(OUT, 1);
  g.fillCircle(20, 17, 11.5);
  g.fillStyle(SKIN, 1);
  g.fillCircle(20, 17.5, 10);

  // short beard (only some customers have one)
  if (look.beard !== null) {
    g.fillStyle(look.beard, 1);
    g.fillEllipse(20, 26.5, 12, 5);
  }

  if (look.headwear === 'cap') {
    // a flat cap with a band
    g.fillStyle(OUT, 1);
    g.fillRoundedRect(9, 2, 22, 12, 5);
    g.fillStyle(look.wrap, 1);
    g.fillRoundedRect(10.5, 3.5, 19, 9, 4);
    g.fillStyle(look.wrapStripe, 1);
    g.fillRect(10.5, 9.5, 19, 2.5);
  } else if (look.headwear === 'puff') {
    // hair in a round puff with a bun on top, and a headband
    g.fillStyle(OUT, 1);
    g.fillEllipse(20, 9.5, 27, 14);
    g.fillCircle(20, 5.2, 5.6);
    g.fillStyle(look.wrap, 1);
    g.fillEllipse(20, 9.5, 24, 11);
    g.fillCircle(20, 5.2, 4.1);
    g.fillStyle(look.wrapStripe, 1);
    g.fillRoundedRect(9.5, 11, 21, 2.6, 1.3);
  } else {
    // headwrap with a knot
    g.fillStyle(OUT, 1);
    g.fillEllipse(20, 10.5, 25, 13);
    g.fillCircle(knotX, 6.5, 5.5);
    g.fillStyle(look.wrap, 1);
    g.fillEllipse(20, 10.5, 22, 10);
    g.fillCircle(knotX, 6.5, 4);
    g.lineStyle(2, look.wrapStripe, 1);
    g.lineBetween(12, 9, 14.5, 14);
    g.lineBetween(18, 6.5, 20, 15);
    g.lineBetween(24, 7, 26, 14);
  }

  // face
  g.fillStyle(0x1b1520, 1);
  g.fillEllipse(16.5, 18, 2.6, 3.6);
  g.fillEllipse(23.5, 18, 2.6, 3.6);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(17, 17, 0.7);
  g.fillCircle(24, 17, 0.7);
  g.lineStyle(1.6, 0x5a2a18, 1);
  g.beginPath();
  g.arc(20, 21, 3.4, 0.25, Math.PI - 0.25, false);
  g.strokePath();
  g.fillStyle(0xe8855e, 0.3);
  g.fillCircle(13.5, 21, 2);
  g.fillCircle(26.5, 21, 2);

  // round glasses (only some customers wear them)
  if (look.glasses !== null) {
    g.lineStyle(1.5, look.glasses, 1);
    g.strokeCircle(16.5, 18, 3.7);
    g.strokeCircle(23.5, 18, 3.7);
  }
}

export function makeMissionTextures(scene) {
  // "Job available": a gold bubble with an exclamation mark
  // The job marker above a shop: a bright gold "!" for a job that is new, and the same drawing
  // in grey-blue for a job that has been delivered before and can be replayed.
  Object.entries(QUEST_MARKER_PALETTE).forEach(([style, colours]) => {
    bake(scene, QUEST_MARKER_KEY[style], 34, 46, (g) => drawQuestMarker(g, colours));
  });

  // Objective arrows: royal blue (pick-up) and gold (customer)
  const arrow = (key, color, light) =>
    bake(scene, key, 34, 40, (g) => {
      g.fillStyle(OUT, 1);
      g.fillRect(9, 0, 16, 16);
      g.fillTriangle(0, 14, 34, 14, 17, 40);
      g.fillStyle(color, 1);
      g.fillRect(11, 2, 12, 14);
      g.fillTriangle(4, 15, 30, 15, 17, 34);
      g.fillStyle(light, 0.9);
      g.fillRect(12, 3, 4, 11);
    });
  arrow('mk_arrow_blue', 0x1f5bff, 0x8fb0ff);
  arrow('mk_arrow_gold', 0xffc43d, 0xffe9a8);

  // Rings on the ground under an objective
  const ring = (key, color) =>
    bake(scene, key, 80, 40, (g) => {
      g.fillStyle(color, 0.2);
      g.fillEllipse(40, 20, 74, 34);
      g.lineStyle(3, color, 0.95);
      g.strokeEllipse(40, 20, 72, 32);
      g.lineStyle(1.5, 0xffffff, 0.7);
      g.strokeEllipse(40, 20, 62, 25);
    });
  ring('mk_ring_blue', 0x1f5bff);
  ring('mk_ring_gold', 0xffc43d);

  // The package Emmy carries
  bake(scene, 'pkg', 30, 28, (g) => {
    g.fillStyle(OUT, 1);
    g.fillRoundedRect(1, 5, 28, 22, 3);
    g.fillStyle(0xc9954f, 1);
    g.fillRoundedRect(3, 7, 24, 18, 2);
    g.fillStyle(0xdeb06a, 1);
    g.fillRect(3, 7, 24, 5);
    g.fillStyle(OUT, 0.55);
    g.fillRect(3, 12, 24, 1.5);
    g.fillStyle(0xf3dca0, 1);
    g.fillRect(12, 7, 6, 18);
    g.fillStyle(0x1f5bff, 1);
    g.fillRoundedRect(19, 16, 6, 6, 1);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(4, 8, 3, 15);
  });

  // The customers (one look each, see CUSTOMER_LOOKS)
  Object.entries(CUSTOMER_LOOKS).forEach(([look, spec]) => {
    bake(scene, customerTextureKey(look), 40, 56, (g) => drawCustomer(g, spec));
  });
}