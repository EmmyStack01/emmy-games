import Phaser from 'phaser';

// Player preferences, persisted to localStorage.
// This is the single place that knows how settings are stored, so the storage
// mechanism can be swapped later without touching any UI or game code.

const STORAGE_KEY = 'emmys-hustle:settings:v1';

const DEFAULTS = {
  joystickSide: 'right',
};

const VALID = {
  joystickSide: ['left', 'right'],
};

class Settings extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.values = { ...DEFAULTS, ...this.load() };
  }

  get joystickSide() {
    return this.values.joystickSide;
  }

  setJoystickSide(side) {
    if (!VALID.joystickSide.includes(side)) return;
    if (side === this.values.joystickSide) return;
    this.values.joystickSide = side;
    this.save();
    this.emit('joystick-side-changed', side);
  }

  // Reads saved values, keeping only known keys with valid values.
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const clean = {};
      Object.keys(VALID).forEach((key) => {
        if (parsed && VALID[key].includes(parsed[key])) clean[key] = parsed[key];
      });
      return clean;
    } catch (_) {
      return {}; // storage unavailable or corrupt: use defaults
    }
  }

  save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch (_) {
      /* storage blocked or full: the setting still works for this session */
    }
  }
}

export default new Settings();