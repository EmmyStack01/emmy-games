import Phaser from 'phaser';
import { generateAllTextures } from '../systems/TextureFactory.js';
import { createCharacterAnimations } from '../systems/CharacterAnims.js';
import { CHARACTER } from '../config.js';
import { startSaveSystem } from '../state/saveSystem.js';

// Loads Emmy's sprite sheet and generates all the drawn textures, then starts the game.
// If the sprite sheet file is missing, the game still starts and keeps using the
// drawn placeholder character.
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file) => {
      console.warn(`[Emmy] Could not load ${file.src}. Using the placeholder character.`);
    });

    this.load.spritesheet(
      CHARACTER.sheetKey,
      `${import.meta.env.BASE_URL}${CHARACTER.sheetPath}`,
      { frameWidth: CHARACTER.frameSize, frameHeight: CHARACTER.frameSize }
    );
  }

  create() {
    generateAllTextures(this);

    if (this.textures.exists(CHARACTER.sheetKey)) {
      createCharacterAnimations(this);
      // frameTotal includes Phaser's internal base frame, so subtract it
      const frames = this.textures.get(CHARACTER.sheetKey).frameTotal - 1;
      console.info(`[Emmy] Sprite sheet loaded (${frames} frames, expected ${CHARACTER.columns * CHARACTER.rows}).`);
    }

    // Load saved progress (money, collected coins) before the world is built.
    startSaveSystem();

    this.scene.start('GameScene');
  }
}

