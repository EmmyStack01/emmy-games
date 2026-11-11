import Phaser from 'phaser';
import './style.css';
import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#1d2640',
  scale: {
    // Canvas always fills the screen; GameScene adjusts camera zoom to suit.
    mode: Phaser.Scale.RESIZE,
    width: '100%',
    height: '100%',
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false },
  },
  render: {
    antialias: true,
    powerPreference: 'high-performance',
  },
  input: { activePointers: 3 },
  disableContextMenu: true,
  banner: false,
  scene: [BootScene, GameScene],
};

const game = new Phaser.Game(config);

// ---------------------------------------------------------------------------
// Keep the canvas matched to the real screen size.
// Mobile browsers often fire "resize" / "orientationchange" before the layout
// has finished updating, so Phaser can read stale dimensions after rotation.
// This compares the container's actual size with the canvas and fixes any gap.
// ---------------------------------------------------------------------------
const container = document.getElementById('game-container');

function syncCanvasSize() {
  if (!container) return;
  const width = Math.round(container.clientWidth);
  const height = Math.round(container.clientHeight);
  if (width <= 0 || height <= 0) return;
  if (width !== game.scale.width || height !== game.scale.height) {
    game.scale.resize(width, height);
  }
}

// Main fix: fires whenever the container's real size changes.
if (container && 'ResizeObserver' in window) {
  new ResizeObserver(syncCanvasSize).observe(container);
}

// Backups for older browsers, and for rotation timing quirks: re-check a few
// times while the browser finishes its layout.
const syncSoon = () => {
  [0, 100, 300, 600, 1000].forEach((ms) => setTimeout(syncCanvasSize, ms));
};
window.addEventListener('resize', syncCanvasSize);
window.addEventListener('orientationchange', syncSoon);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncSoon);
}

// Handy for poking around in the browser console during development.
if (import.meta.env.DEV) {
  window.__emmy = game;
}