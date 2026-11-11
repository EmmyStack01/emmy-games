// Default look + adjustable controls for the Emmy mascot.
// All numbers are "frame pixels" on a 128x128 canvas (feet at y=122, centre x=64).

export const DEFAULT_SPEC = {
  proportions: {
    headScale: 1,
    torsoWidth: 1,
    torsoHeight: 1,
    legLength: 1,
    armLength: 1,
    shoeScale: 1,
  },
  outline: { width: 2 },
  hair: { size: 1, width: 1, highlight: 1, curls: 1 },
  face: { width: 38, height: 31 },
  glasses: {
    lensWidth: 17.5,
    lensHeight: 13.5,
    rim: 1.5,
    spacing: 10.4,
    yOffset: 0,
    tint: 0.22,
    glint: 0.85,
  },
  hoodie: { drawstring: 16, rimLight: 0.5 },
  backpack: { visible: true, scale: 1, strap: 6 },
  back: { hoodSize: 1 },
  side: { torsoDepth: 1, bagDepth: 1, legGap: 4 },
  idle: { lift: 1 },
  walk: { bob: 2, strideFront: 3.5, strideSide: 9, footLift: 3.5, armSwing: 3.5 },
  colors: {
    outline: '#141830',
    skin: '#b96e42',
    skinShade: '#965430',
    blush: '#d9724a',
    sclera: '#ffffff',
    iris: '#5b3623',
    eye: '#1b1520',
    lip: '#cc8159',
    lipDark: '#6f3622',
    lens: '#e6f4ff',
    frame: '#d8ebff',
    hair: '#171219',
    hairLight: '#463a52',
    hoodie: '#1d2a5c',
    hoodieShade: '#141d44',
    hoodieRim: '#4f73e6',
    royal: '#1f5bff',
    aglet: '#aab3c4',
    zipPull: '#dfe7ff',
    tee: '#0f1634',
    trousers: '#191c2b',
    trousersShade: '#10121d',
    trousersLight: '#3a4161',
    trousersPocket: '#232842',
    pack: '#1c1e29',
    packLight: '#4a4f63',
    shoeWhite: '#f6f8ff',
    shoeShade: '#c3cbe6',
    shoeBlue: '#1f56e6',
  },
};

const range = (path, label, min, max, step) => ({ type: 'range', path, label, min, max, step });
const color = (key, label) => ({ type: 'color', path: `colors.${key}`, label });

export const CONTROLS = [
  {
    title: 'Proportions',
    open: true,
    items: [
      range('proportions.headScale', 'Head size', 0.8, 1.2, 0.01),
      range('proportions.torsoWidth', 'Body width', 0.85, 1.2, 0.01),
      range('proportions.torsoHeight', 'Body height', 0.85, 1.2, 0.01),
      range('proportions.legLength', 'Leg length', 0.7, 1.4, 0.01),
      range('proportions.armLength', 'Arm length', 0.8, 1.2, 0.01),
      range('proportions.shoeScale', 'Shoe size', 0.8, 1.3, 0.01),
      range('outline.width', 'Outline', 1, 8, 0.25),
    ],
  },
  {
    title: 'Hair',
    open: false,
    items: [
      range('hair.size', 'Hair size', 0.8, 1.25, 0.01),
      range('hair.width', 'Hair width', 0.7, 1.25, 0.01),
      range('hair.highlight', 'Curl shine', 0, 1, 0.05),
      range('hair.curls', 'Curl marks', 0, 1, 0.05),
    ],
  },
  {
    title: 'Face & glasses',
    open: false,
    items: [
      range('face.width', 'Face width', 32, 44, 0.5),
      range('face.height', 'Face height', 26, 36, 0.5),
      range('glasses.lensWidth', 'Lens width', 13, 22, 0.25),
      range('glasses.lensHeight', 'Lens height', 10, 17, 0.25),
      range('glasses.rim', 'Rim thickness', 1, 4.5, 0.1),
      range('glasses.spacing', 'Lens spacing', 9, 12.5, 0.1),
      range('glasses.yOffset', 'Glasses up/down', -3, 3, 0.1),
      range('glasses.tint', 'Lens tint', 0, 0.6, 0.02),
      range('glasses.glint', 'Lens glint', 0, 1, 0.05),
    ],
  },
  {
    title: 'Hoodie & backpack',
    open: false,
    items: [
      range('hoodie.drawstring', 'String length', 8, 24, 0.5),
      range('hoodie.rimLight', 'Blue rim light', 0, 1, 0.05),
      { type: 'checkbox', path: 'backpack.visible', label: 'Backpack' },
      range('backpack.scale', 'Backpack size', 0.7, 1.3, 0.01),
      range('backpack.strap', 'Strap width', 4, 9, 0.25),
    ],
  },
  {
    title: 'Back & side views',
    open: false,
    items: [
      range('back.hoodSize', 'Hood size (back)', 0.8, 1.3, 0.01),
      range('side.torsoDepth', 'Body depth (side)', 0.8, 1.3, 0.01),
      range('side.bagDepth', 'Backpack depth (side)', 0.7, 1.5, 0.01),
      range('side.legGap', 'Leg gap (side)', 0, 8, 0.25),
    ],
  },
  {
    title: 'Idle animation',
    open: true,
    items: [range('idle.lift', 'Breath lift', 0, 6, 0.25)],
  },
  {
    title: 'Walk cycle',
    open: true,
    items: [
      range('walk.bob', 'Body bob', 0, 4, 0.25),
      range('walk.strideFront', 'Stride (front/back)', 0, 7, 0.25),
      range('walk.strideSide', 'Stride (side)', 0, 14, 0.25),
      range('walk.footLift', 'Foot lift', 0, 7, 0.25),
      range('walk.armSwing', 'Arm swing', 0, 7, 0.25),
    ],
  },
  {
    title: 'Colours: skin, hair, face',
    open: false,
    items: [
      color('skin', 'Skin'),
      color('skinShade', 'Skin shade'),
      color('blush', 'Cheeks'),
      color('hair', 'Hair'),
      color('hairLight', 'Hair shine'),
      color('iris', 'Eye colour'),
      color('eye', 'Pupils'),
      color('lip', 'Lips'),
      color('lipDark', 'Smile line'),
      color('lens', 'Lens tint'),
      color('frame', 'Glasses frame'),
    ],
  },
  {
    title: 'Colours: hoodie',
    open: false,
    items: [
      color('hoodie', 'Hoodie'),
      color('hoodieShade', 'Hoodie shade'),
      color('hoodieRim', 'Rim light'),
      color('royal', 'Royal blue'),
      color('aglet', 'Metal eyelets/tips'),
      color('zipPull', 'Zip pull'),
      color('tee', 'T-shirt'),
      color('outline', 'Outline'),
    ],
  },
  {
    title: 'Colours: trousers, shoes, bag',
    open: false,
    items: [
      color('trousers', 'Trousers'),
      color('trousersShade', 'Trouser shade'),
      color('trousersLight', 'Trouser light'),
      color('trousersPocket', 'Pockets'),
      color('shoeWhite', 'Shoe white'),
      color('shoeShade', 'Shoe shade'),
      color('shoeBlue', 'Shoe blue'),
      color('pack', 'Backpack'),
      color('packLight', 'Backpack light'),
    ],
  },
];

export function cloneSpec(spec) {
  return JSON.parse(JSON.stringify(spec));
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

// Copies known keys from `patch` onto `base` (ignores unknown keys / wrong types).
export function mergeSpec(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  Object.keys(base).forEach((key) => {
    if (!(key in patch)) return;
    const b = base[key];
    const p = patch[key];
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      mergeSpec(b, p);
    } else if (typeof p === typeof b) {
      base[key] = p;
    }
  });
  return base;
}