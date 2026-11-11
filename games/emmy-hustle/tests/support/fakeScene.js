// TEST-ONLY. Just enough of a Phaser scene for the real Coins.js to run in Node.
// `scene.sprites` holds every coin sprite created, `scene.popups` every "+N" popup,
// and `scene.touch(sprite)` plays the player walking over a coin.
function makeSprite(x, y, key) {
  return {
    x,
    y,
    key,
    depth: 0,
    active: true,
    visible: true,
    body: { enable: true },
    data: {},
    setData(name, value) {
      this.data[name] = value;
      return this;
    },
    getData(name) {
      return this.data[name];
    },
    setDepth(depth) {
      this.depth = depth;
      return this;
    },
    setActive(active) {
      this.active = active;
      return this;
    },
    setVisible(visible) {
      this.visible = visible;
      return this;
    },
  };
}

export function makeFakeScene() {
  const scene = {
    sprites: [],
    popups: [],
    killedTweens: 0,
    touch: null,
    physics: {
      add: {
        staticGroup: () => ({
          create: (x, y, key) => {
            const sprite = makeSprite(x, y, key);
            scene.sprites.push(sprite);
            return sprite;
          },
        }),
        overlap: (player, _group, callback, _process, context) => {
          scene.touch = (sprite) => callback.call(context, player, sprite);
        },
      },
    },
    tweens: {
      add: () => ({}),
      killTweensOf: () => {
        scene.killedTweens += 1;
      },
    },
    add: {
      text: (x, y, text) => {
        const popup = {
          x,
          y,
          text,
          destroyed: false,
          setOrigin() {
            return this;
          },
          setDepth() {
            return this;
          },
          destroy() {
            this.destroyed = true;
          },
        };
        scene.popups.push(popup);
        return popup;
      },
    },
  };
  return scene;
}
