import Phaser from 'phaser';

// Turns raw input into one movement vector (each axis -1..1, length <= 1).
// Touch controls later: call setVirtualVector(x, y) from a joystick.
export default class InputController {
  constructor(scene) {
    const keyboard = scene.input.keyboard;
    this.cursors = keyboard.createCursorKeys();
    this.keys = keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' });
    this.virtual = new Phaser.Math.Vector2(0, 0);
    this.vector = new Phaser.Math.Vector2(0, 0);
  }

  setVirtualVector(x, y) {
    this.virtual.set(x, y);
  }

  read() {
    const { cursors, keys, virtual, vector } = this;

    let x =
      (cursors.right.isDown || keys.right.isDown ? 1 : 0) -
      (cursors.left.isDown || keys.left.isDown ? 1 : 0);
    let y =
      (cursors.down.isDown || keys.down.isDown ? 1 : 0) -
      (cursors.up.isDown || keys.up.isDown ? 1 : 0);

    x += virtual.x;
    y += virtual.y;

    vector.set(x, y);
    const length = vector.length();
    if (length > 1) vector.scale(1 / length); // no faster diagonals
    return vector;
  }
}