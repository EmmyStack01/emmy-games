import Phaser from 'phaser';
import { WORLD, CAMERA } from '../config.js';
import { COINS } from '../data/neighbourhood.js';
import World from '../systems/World.js';
import Coins from '../systems/Coins.js';
import Player from '../entities/Player.js';
import InputController from '../input/InputController.js';
import VirtualJoystick from '../ui/VirtualJoystick.js';
import SettingsPanel from '../ui/SettingsPanel.js';
import Hud from '../ui/Hud.js';
import MissionSystem from '../missions/MissionSystem.js';
import { announceWelcome } from '../missions/welcomeMessages.js';
import gameState from '../state/GameState.js';
import settings from '../state/Settings.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);

    this.world = new World(this).build();

    this.player = new Player(this, WORLD.spawn.x, WORLD.spawn.y);
    this.inputController = new InputController(this);
    this.player.setController(this.inputController);
    this.physics.add.collider(this.player, this.world.solids);

    this.coins = new Coins(this, this.player, COINS);

    this.setupCamera();

    this.hud = new Hud();
    this.hud.setMoney(gameState.money, false);

    // Delivery missions: floating markers, offer card, objectives. Pays through gameState.
    this.missions = new MissionSystem(this, this.player);

    // The welcome depends on the restored mission progress, so it is chosen after the missions exist.
    announceWelcome(this.missions);

    // Touch joystick: feeds the same virtual vector the keyboard path already
    // merges with, so desktop controls keep working alongside it.
    this.joystick = new VirtualJoystick({
      parent: document.getElementById('touch-controls'),
      side: settings.joystickSide,
      onChange: (x, y) => this.inputController.setVirtualVector(x, y),
    });

    // Settings UI (gear button + panel) and live joystick-side switching.
    this.settingsPanel = new SettingsPanel({
      buttonHost: document.getElementById('settings-root'),
      panelHost: document.getElementById('app'),
    });
    this.onJoystickSide = (side) => {
      this.joystick.setSide(side); // releases any active touch first
      this.inputController.setVirtualVector(0, 0); // belt and braces: no stale input
    };
    settings.on('joystick-side-changed', this.onJoystickSide);

    // Add ?debug to the URL to see collision boxes.
    if (new URLSearchParams(window.location.search).has('debug')) {
      this.physics.world.createDebugGraphic();
    }

    // Handy for testing in the browser console (development only).
    if (import.meta.env.DEV) window.__mission = this.missions;

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  update(time, delta) {
    this.world.update(time, delta);
    this.missions.update(time, delta);
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD.width, WORLD.height);
    cam.centerOn(this.player.x, this.player.y - CAMERA.followOffsetY);
    cam.startFollow(this.player, true, CAMERA.lerp, CAMERA.lerp, 0, CAMERA.followOffsetY);
    this.applyZoom();
  }

  // Keeps roughly the same amount of world visible on a phone, tablet or desktop.
  applyZoom() {
    const { width, height } = this.scale;
    const wanted = Phaser.Math.Clamp(
      Math.min(width, height) / CAMERA.targetShortSide,
      CAMERA.minZoom,
      CAMERA.maxZoom
    );
    // Never zoom out so far that the view is larger than the world.
    const mustFit = Math.max(width / WORLD.width, height / WORLD.height);
    this.cameras.main.setZoom(Math.max(wanted, mustFit));
  }

  onShutdown() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    settings.off('joystick-side-changed', this.onJoystickSide);
    if (this.missions) this.missions.destroy();
    if (this.settingsPanel) this.settingsPanel.destroy();
    if (this.joystick) this.joystick.destroy();
    if (this.inputController) this.inputController.setVirtualVector(0, 0);
    if (this.hud) this.hud.destroy();
  }
}