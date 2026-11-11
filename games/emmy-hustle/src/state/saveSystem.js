import gameState from './GameState.js';
import SaveManager from './SaveManager.js';
import { COINS } from '../data/neighbourhood.js';
import { MISSION_IDS } from '../missions/missionData.js';
import { ECONOMY } from '../config.js';

// Connects the save file to the running game: loads the saved progress into GameState
// and keeps the save up to date from then on. Called once, from BootScene, before the
// world is built.
//
// If anything goes wrong here the game still starts, just without saving.

function defaultStorage() {
  try {
    return globalThis.localStorage || null; // merely reading it can throw when storage is blocked
  } catch (_) {
    return null;
  }
}

// The running save manager, or null if saving is unavailable (no storage, or start-up
// failed). Other systems (missions) use it as getSaveManager()?.something(), so the game
// plays the same whether or not saving works.
let activeManager = null;

export function getSaveManager() {
  return activeManager;
}

export function startSaveSystem({ storage = defaultStorage(), target = gameState } = {}) {
  if (activeManager) activeManager.detach(); // a manager that is replaced stops saving
  activeManager = null;
  try {
    const manager = new SaveManager({
      storage,
      context: { coinIds: COINS.map((coin) => coin.id), missionIds: [...MISSION_IDS] },
      startMoney: ECONOMY.startMoney,
    });
    manager.load();
    manager.attach(target);
    activeManager = manager;
    return manager;
  } catch (error) {
    console.error('[Save] The save system could not start. The game will run without saving.', error);
    return null;
  }
}
