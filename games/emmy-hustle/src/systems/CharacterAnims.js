import { CHARACTER } from '../config.js';

// Animation keys look like "emmy_sheet:walk:front".
export function animKey(action, view) {
  return `${CHARACTER.sheetKey}:${action}:${view}`;
}

// Registers one looping animation per action (idle, walk) and view (front, back, side)
// from the sprite sheet layout. Safe to call more than once.
export function createCharacterAnimations(scene) {
  if (!scene.textures.exists(CHARACTER.sheetKey)) return false;

  Object.entries(CHARACTER.rowOfView).forEach(([view, row]) => {
    Object.entries(CHARACTER.animations).forEach(([action, def]) => {
      const key = animKey(action, view);
      if (scene.anims.exists(key)) return;
      scene.anims.create({
        key,
        frames: def.frames.map((col) => ({
          key: CHARACTER.sheetKey,
          frame: row * CHARACTER.columns + col,
        })),
        frameRate: def.fps,
        repeat: -1,
      });
    });
  });

  return true;
}