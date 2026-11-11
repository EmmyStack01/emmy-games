// TEST-ONLY. A scene whose Graphics only RECORDS the drawing calls, so tests can see exactly
// what makeMissionTextures draws for each texture, without a browser or canvas.
export function makeTextureScene() {
  const textures = {}; // key -> { w, h, calls: [[method, ...args], ...] }
  const scene = {
    textures: { exists: (key) => key in textures },
    make: {
      graphics: () => {
        const calls = [];
        const g = new Proxy(
          {},
          {
            get: (_target, name) => {
              if (name === 'generateTexture') return (key, w, h) => { textures[key] = { w, h, calls: calls.slice() }; };
              if (name === 'destroy') return () => {};
              return (...args) => {
                calls.push([name, ...args]);
                return g;
              };
            },
          },
        );
        return g;
      },
    },
  };
  return { scene, textures };
}

// The colours a texture uses (every fillStyle / lineStyle colour), as a Set of numbers.
export function coloursOf(texture) {
  const colours = new Set();
  texture.calls.forEach(([name, ...args]) => {
    if (name === 'fillStyle') colours.add(args[0]);
    if (name === 'lineStyle') colours.add(args[1]);
  });
  return colours;
}
