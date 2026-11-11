import Phaser from 'phaser';
import { PLAYER, CHARACTER } from '../config.js';
import { animKey } from '../systems/CharacterAnims.js';

// Placeholder walk frames (used only if the sprite sheet is missing).
const WALK_FRAMES = ['emmy_walk_a', 'emmy_idle', 'emmy_walk_b', 'emmy_idle'];
const ZERO = new Phaser.Math.Vector2(0, 0);

const SHEET_SHADOW_SCALE = CHARACTER.shadowScale ?? 30 / 36;
const MOVING_SPEED = 25; // below this speed he counts as standing still

// Which row of the sheet to use for each facing, and whether to mirror it.
// The side row is drawn facing LEFT, so facing right mirrors it.
const FACING_VIEW = {
  down: { view: 'front', flip: false },
  up: { view: 'back', flip: false },
  left: { view: 'side', flip: false },
  right: { view: 'side', flip: true },
};

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y) {
    // Use the mascot sprite sheet if it loaded, otherwise the drawn placeholder.
    const useSheet = scene.textures.exists(CHARACTER.sheetKey);
    super(scene, x, y, useSheet ? CHARACTER.sheetKey : 'emmy_idle', useSheet ? 0 : undefined);
    this.useSheet = useSheet;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.shadow = scene.add.image(x, y, 'shadow');

    if (useSheet) {
      const { frameSize, feet, scale } = CHARACTER;

      // Origin on his feet, so `y` is the ground position (used for depth sorting).
      this.setOrigin(feet.x / frameSize, feet.y / frameSize);
      this.setScale(scale);
      this.shadow.setScale(SHEET_SHADOW_SCALE);

      // The collision box stays PLAYER.bodyWidth x PLAYER.bodyHeight WORLD pixels,
      // sitting on his feet. Body sizes are in frame pixels and get scaled by the sprite.
      const w = PLAYER.bodyWidth / scale;
      const h = PLAYER.bodyHeight / scale;
      this.body.setSize(w, h);
      this.body.setOffset(feet.x - w / 2, feet.y - h);
      this.body.updateFromGameObject();

      this.facing = 'down';
      this.setAnimation('idle', 'front');
    } else {
      // Small collision box at the placeholder's feet.
      this.setOrigin(0.5, 1);
      this.body.setSize(PLAYER.bodyWidth, PLAYER.bodyHeight);
      this.body.setOffset(
        (this.width - PLAYER.bodyWidth) / 2,
        this.height - PLAYER.bodyHeight
      );
    }

    this.setCollideWorldBounds(true);

    this.controller = null;
    this.inputLocked = false; // the mission offer card freezes Emmy while it is open
    this.walkTimer = 0;
    this.setDepth(y);
  }

  setController(controller) {
    this.controller = controller;
  }

  // Runs before the physics step each frame, so input has zero extra lag.
  preUpdate(time, delta) {
    super.preUpdate(time, delta);
    this.applyMovement(delta);
    this.setDepth(this.y);
    this.shadow
      .setPosition(this.x, this.y - (this.useSheet ? 1.5 : 2))
      .setDepth(this.y - 1);
  }

  applyMovement(delta) {
    const dt = Math.min(delta, 50) / 1000;
    const dir = this.controller && !this.inputLocked ? this.controller.read() : ZERO;

    // Frame-rate independent easing toward the target velocity.
    const k = 1 - Math.exp(-PLAYER.smoothing * dt);
    const current = this.body.velocity;
    let vx = current.x + (dir.x * PLAYER.speed - current.x) * k;
    let vy = current.y + (dir.y * PLAYER.speed - current.y) * k;

    if (dir.x === 0 && Math.abs(vx) < 6) vx = 0;
    if (dir.y === 0 && Math.abs(vy) < 6) vy = 0;
    this.body.setVelocity(vx, vy);

    if (this.useSheet) this.animateSheet(dir, vx, vy);
    else this.animatePlaceholder(vx, vy, dir, k, delta);
  }

  /* ------------------------------------------------------- mascot sprite */

  animateSheet(dir, vx, vy) {
    this.updateFacing(dir);
    const { view, flip } = FACING_VIEW[this.facing];
    this.setFlipX(flip);

    const moving = Math.hypot(vx, vy) > MOVING_SPEED;
    this.setAnimation(moving ? 'walk' : 'idle', view);
  }

  // Facing follows the input. With no input he keeps his last facing. On diagonals the
  // current axis wins until the other one is clearly stronger, so it doesn't flicker.
  updateFacing(dir) {
    if (dir.lengthSq() < 0.06) return;

    const ax = Math.abs(dir.x);
    const ay = Math.abs(dir.y);
    const horizontal = this.facing === 'left' || this.facing === 'right';
    const goHorizontal = horizontal ? ax > ay * 0.8 : ax > ay * 1.25;

    if (goHorizontal) this.facing = dir.x < 0 ? 'left' : 'right';
    else this.facing = dir.y < 0 ? 'up' : 'down';
  }

  // Plays an animation for this action and view. Switching between walk views keeps the
  // step in the same place in the cycle, so turning mid-stride doesn't hitch.
  setAnimation(action, view) {
    const key = animKey(action, view);
    const current = this.anims.currentAnim;
    if (current && current.key === key) return;

    let startFrame = 0;
    if (action === 'walk' && current && current.key.includes(':walk:') && this.anims.currentFrame) {
      startFrame = this.anims.currentFrame.index - 1; // index is 1-based
    }
    this.anims.play({ key, startFrame });
  }

  /* --------------------------------------------------------- placeholder */

  // Walk cycle + a little lean into the direction of travel (placeholder only).
  animatePlaceholder(vx, vy, dir, k, delta) {
    const speed = Math.hypot(vx, vy);
    if (speed > 25) {
      this.walkTimer += delta * (speed / PLAYER.speed);
      const frame = WALK_FRAMES[Math.floor(this.walkTimer / 110) % WALK_FRAMES.length];
      if (this.texture.key !== frame) this.setTexture(frame);
    } else {
      this.walkTimer = 0;
      if (this.texture.key !== 'emmy_idle') this.setTexture('emmy_idle');
    }
    this.angle += (dir.x * 6 - this.angle) * k;
  }

  destroy(fromScene) {
    if (this.shadow) this.shadow.destroy();
    super.destroy(fromScene);
  }
}