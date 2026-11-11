// Layout of the fictional neighbourhood "Orisun Close".
// All coordinates are world pixels. Buildings use `x` = centre, `base` = bottom
// edge of the wall (where it meets the ground).

export const ROADS_H = [
  { y: 560, h: 140 },
  { y: 1180, h: 140 },
];

export const ROADS_V = [
  { x: 780, w: 140 },
  { x: 1480, w: 140 },
];

export const PLAZA = { x: 960, y: 740, w: 480, h: 400 };
export const FOUNTAIN = { x: 1200, base: 960 };

const shop = (id, name, x, base, w, h, wall, roof, accent, door) => ({
  id, name, x, base, w, h, wall, roof, accent, door, shop: true,
});
const house = (id, x, base, w, h, wall, roof, door) => ({
  id, x, base, w, h, wall, roof, door, shop: false,
});

export const BUILDINGS = [
  // North block: back row
  house('n1', 110, 250, 150, 150, 0xf4e6cc, 0xc4604a),
  house('n2', 330, 250, 150, 140, 0xdbe8f6, 0x2a3c7a),
  house('n3', 560, 250, 150, 155, 0xf2d6c8, 0x6a4f8f),
  house('n4', 1020, 250, 150, 150, 0xf6e9b8, 0x2a8f8f),
  house('n5', 1360, 250, 150, 145, 0xdbe8f6, 0xc4604a),
  house('n6', 1760, 250, 150, 150, 0xd3e8e0, 0x4a5470),
  house('n7', 2010, 250, 150, 155, 0xead7bb, 0x2456c9),
  house('n8', 2290, 250, 150, 145, 0xdfdcf2, 0xd9a22a),

  // North block: shops facing the first road
  shop('ngozi', 'Mama Ngozi Provisions', 150, 536, 200, 190, 0xf6e9b8, 0x2a8f8f, [0x2a8f8f, 0xffffff]),
  shop('tunde', 'Tunde Tailors', 380, 536, 180, 170, 0xdfdcf2, 0x6a4f8f, [0x6a4f8f, 0xffc43d]),
  house('n9', 620, 536, 170, 180, 0xd3e8e0, 0xc4604a),
  shop('bola', 'Bola Bakery', 1050, 536, 190, 180, 0xf2d6c8, 0xc4604a, [0xc4604a, 0xfff4e0]),
  shop('sunrise', 'Sunrise Pharmacy', 1330, 536, 200, 190, 0xe4f1fb, 0x2a8f8f, [0x2aa57a, 0xffffff]),
  shop('lagoon', 'Lagoon Mart', 1800, 536, 260, 200, 0xf6e9b8, 0x2456c9, [0x2456c9, 0xffc43d]),
  shop('ade', 'Ade Mobile Fix', 2080, 536, 180, 170, 0xdbe8f6, 0x2a3c7a, [0x2a3c7a, 0x6f95ff]),
  house('n10', 2300, 536, 150, 170, 0xf2d6c8, 0x4a5470),

  // Middle block: back row
  house('n11', 110, 880, 150, 150, 0xead7bb, 0x2a3c7a),
  house('n12', 340, 880, 150, 145, 0xf2d6c8, 0x2a8f8f),
  house('n13', 570, 880, 150, 150, 0xd3e8e0, 0x6a4f8f),
  house('n14', 1760, 880, 150, 150, 0xf6e9b8, 0xc4604a),
  house('n15', 2000, 880, 150, 145, 0xdbe8f6, 0x2456c9),
  house('n16', 2250, 880, 150, 150, 0xf4e6cc, 0x4a5470),

  // Middle block: front row facing the second road
  // Emmy's Corner Shop is the brand's royal blue and gold.
  shop('emmy', "Emmy's Corner Shop", 190, 1156, 240, 200, 0xe9f1ff, 0x1f5bff, [0x1f5bff, 0xffc43d]),
  house('n17', 440, 1156, 160, 180, 0xdbe8f6, 0x6a4f8f),
  shop('sade', 'Iya Sade Kitchen', 660, 1156, 160, 170, 0xf4e6cc, 0xd9a22a, [0xc4604a, 0xfff4e0]),
  shop('hall', 'Community Hall', 1830, 1156, 300, 210, 0xead7bb, 0x2a3c7a, [0x2a3c7a, 0xffc43d]),
  house('n18', 2120, 1156, 150, 170, 0xdfdcf2, 0xc4604a),
  shop('chidi', 'Chidi Electronics', 2310, 1156, 150, 160, 0xdbe8f6, 0x2456c9, [0x2456c9, 0xffffff]),

  // Waterfront
  shop('suya', 'Waterside Suya Spot', 420, 1646, 200, 170, 0xf2d6c8, 0x4a5470, [0xc4604a, 0xffc43d]),
  shop('kiosk', 'Harbour Kiosk', 1950, 1646, 160, 150, 0xd3e8e0, 0xd9a22a, [0x2a8f8f, 0xfff4e0]),
];

// [type, x, baseY]
export const TREES = [
  ['tree', 45, 325], ['tree', 215, 320], ['tree', 450, 325], ['tree', 700, 325],
  ['tree', 1190, 325], ['tree', 1660, 325], ['tree', 1900, 325], ['tree', 2150, 325], ['tree', 2370, 325],

  ['tree', 30, 940], ['tree', 210, 935], ['tree', 470, 940], ['tree', 700, 940],
  ['tree', 1700, 935], ['tree', 1950, 935], ['tree', 2120, 935], ['tree', 2330, 935],

  ['tree', 100, 1400], ['tree', 470, 1400], ['tree', 1000, 1400], ['tree', 1300, 1400],
  ['tree', 1740, 1400], ['tree', 2060, 1400], ['tree', 2330, 1400],

  ['palm', 985, 790], ['palm', 1415, 790], ['tree', 990, 1125], ['tree', 1410, 1125],

  ['palm', 80, 1655], ['palm', 620, 1655], ['palm', 980, 1655], ['palm', 1380, 1655],
  ['palm', 1720, 1655], ['palm', 2150, 1655], ['palm', 2330, 1655],
];

export const BUSHES = [
  [28, 532], [728, 532], [1452, 532], [1960, 532],
  [335, 1152], [550, 1152], [1655, 1152], [2215, 1152],
];

export const LAMPS = [
  [270, 556], [500, 556], [1188, 556], [2197, 556], [2012, 1176],
  [1090, 790], [1310, 790],
  [250, 1660], [1050, 1660], [1840, 1660], [2250, 1660],
];

export const BENCHES = [
  [1100, 1040], [1300, 1040], [700, 1660], [1300, 1660], [2050, 1660],
];

// [x, baseY, variant]
export const STALLS = [
  [1040, 1085, 'a'], [1370, 1085, 'b'],
  [240, 1450, 'a'], [620, 1450, 'b'], [1040, 1450, 'c'],
  [1330, 1450, 'a'], [1760, 1450, 'b'], [2150, 1450, 'c'],
];

export const VEHICLES = [
  { key: 'bus_a', x: 520, base: 1314 },
  { key: 'bus_b', x: 2050, base: 694 },
];

// [x, y] collectible coins
// Every coin has an explicit, permanent id. The id is what the save file remembers,
// so never rename, reuse or renumber one: a changed id makes that coin collectable
// again for everyone who already picked it up. To add a coin, give it a new id.
// To retire one, delete it (old saves simply forget it). Moving a coin is safe.
export const COINS = [
  { id: 'orisun-01', x: 400, y: 630 },
  { id: 'orisun-02', x: 1050, y: 630 },
  { id: 'orisun-03', x: 1700, y: 630 },
  { id: 'orisun-04', x: 2200, y: 630 },
  { id: 'orisun-05', x: 850, y: 330 },
  { id: 'orisun-06', x: 850, y: 950 },
  { id: 'orisun-07', x: 850, y: 1500 },
  { id: 'orisun-08', x: 1550, y: 330 },
  { id: 'orisun-09', x: 1550, y: 900 },
  { id: 'orisun-10', x: 1550, y: 1500 },
  { id: 'orisun-11', x: 400, y: 1250 },
  { id: 'orisun-12', x: 1200, y: 1250 },
  { id: 'orisun-13', x: 2000, y: 1250 },
  { id: 'orisun-14', x: 1100, y: 1000 },
  { id: 'orisun-15', x: 1300, y: 1000 },
  { id: 'orisun-16', x: 190, y: 1172 },
  { id: 'orisun-17', x: 500, y: 1680 },
  { id: 'orisun-18', x: 1700, y: 1680 },
];

