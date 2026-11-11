import gameState from '../state/GameState.js';

// Thin wrapper around the DOM HUD in index.html. DOM text stays crisp on any
// screen and is styled by CSS, so the canvas never needs to redraw it.
export default class Hud {
  constructor() {
    this.moneyBox = document.getElementById('hud-money');
    this.moneyValue = document.getElementById('hud-money-value');
    this.message = document.getElementById('hud-message');
    this.hideTimer = null;

    this.onMoney = (total) => this.setMoney(total);
    this.onMessage = (text, duration) => this.showMessage(text, duration);
    gameState.on('money-changed', this.onMoney);
    gameState.on('message', this.onMessage);
  }

  setMoney(total, animate = true) {
    if (!this.moneyValue) return;
    this.moneyValue.textContent = Number(total).toLocaleString('en-NG');
    if (animate && this.moneyBox) {
      this.moneyBox.classList.remove('bump');
      void this.moneyBox.offsetWidth; // restart the CSS animation
      this.moneyBox.classList.add('bump');
    }
  }

  showMessage(text, duration = 6000) {
    if (!this.message) return;
    this.message.textContent = text;
    this.message.classList.add('visible');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.message.classList.remove('visible'), duration);
  }

  destroy() {
    clearTimeout(this.hideTimer);
    gameState.off('money-changed', this.onMoney);
    gameState.off('message', this.onMessage);
  }
}