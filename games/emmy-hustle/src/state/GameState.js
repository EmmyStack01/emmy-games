import Phaser from 'phaser';
import { ECONOMY } from '../config.js';

// Single shared game state. Scenes and the DOM HUD talk to each other through
// its events, so nothing needs a direct reference to anything else.
//
// What gets saved (see saveSchema.js / SaveManager.js): money and which coins have
// been collected. GameState stays the one owner of both. It knows nothing about
// storage: it only announces 'progress-changed' whenever one of them changes, and
// can hand out / accept a plain snapshot.
// Later: add inventory, missions, upgrades here.
export class GameState extends Phaser.Events.EventEmitter {
  constructor() {
    super();
    this.money = ECONOMY.startMoney;
    this.collectedCoins = new Map(); // coin id -> time it was collected (ms since epoch)
  }

  addMoney(amount) {
    this.money += amount;
    this.emit('money-changed', this.money, amount);
    this.emit('progress-changed');
  }

  spendMoney(amount) {
    if (this.money < amount) return false;
    this.money -= amount;
    this.emit('money-changed', this.money, -amount);
    this.emit('progress-changed');
    return true;
  }

  hasCollectedCoin(id) {
    return this.collectedCoins.has(id);
  }

  // Collects a coin: marks it collected AND pays for it, as one step. Returns true
  // if the coin was paid, false if it had already been collected (or has no valid
  // id). Paying the same coin id twice is impossible, whoever asks and however often.
  collectCoin(id, value, now = Date.now()) {
    if (typeof id !== 'string' || id === '') return false;
    if (this.collectedCoins.has(id)) return false;
    this.collectedCoins.set(id, now);
    this.addMoney(value);
    return true;
  }

  // Loads saved progress. Called once at start-up, before the scene is built.
  // It does not emit 'progress-changed' (loading is not a change worth saving) and
  // does not pay anything.
  hydrate({ money, collectedCoins }) {
    this.money = money;
    this.collectedCoins = new Map(Object.entries(collectedCoins));
  }

  // The part of the state that is saved, as plain data.
  snapshotProgress() {
    return { money: this.money, collectedCoins: Object.fromEntries(this.collectedCoins) };
  }

  say(text, durationMs = 6000) {
    this.emit('message', text, durationMs);
  }

  // Takes a message off the HUD, but only if THAT text is still the one showing. A message that has
  // already been replaced (or has timed out) is left alone, so this can never clear a newer message.
  clearMessage(text) {
    this.emit('message-clear', text);
  }
}

export default new GameState();
