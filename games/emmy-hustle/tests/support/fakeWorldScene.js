// TEST-ONLY. A scene that only RECORDS what World.js asks it to create, so tests can see
// exactly which colliders (zones) and pictures the real World.js builds. Nothing is drawn.

function chain(target) {
  // every setter returns the same object, like Phaser's game objects
  const handler = {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      return (...args) => {
        if (prop === 'setDepth') obj.depth = args[0];
        if (prop === 'setScale') obj.scale = args[0];
        return proxy;
      };
    },
  };
  const proxy = new Proxy(target, handler);
  return proxy;
}

export function makeWorldScene() {
  const scene = {
    zones: [], // { x, y, w, h } as TOP-LEFT rectangles, in creation order
    images: [], // { key, x, y }
    texts: [],
    groupMembers: [],
    physics: {
      add: {
        staticGroup: () => ({ add: (zone) => scene.groupMembers.push(zone) }),
        existing: () => {},
      },
    },
    tweens: { add: () => ({}) },
    add: {
      zone: (cx, cy, w, h) => {
        const zone = { x: cx - w / 2, y: cy - h / 2, w, h };
        scene.zones.push(zone);
        return zone;
      },
      tileSprite: () => chain({}),
      rectangle: () => chain({}),
      image: (x, y, key) => {
        scene.images.push({ key, x, y });
        return chain({});
      },
      text: (x, y, text) => {
        scene.texts.push({ x, y, text });
        return chain({ width: 50 });
      },
    },
  };
  return scene;
}

// Runs the REAL World.build(), so anything it adds anywhere in the build is seen. Only the
// scatter of random flowers is replaced, because it needs Phaser's random generator, which the
// test stand-in does not have. `onFlowers` is called with the number of solids that exist at
// that moment (flowers must be placed after the solids, or they land inside buildings).
export function buildWholeWorld(world, onFlowers = () => {}) {
  world.scatterFlowers = () => onFlowers(world.solidRects.length);
  world.build();
}
