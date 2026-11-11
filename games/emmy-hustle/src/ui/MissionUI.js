// DOM UI for missions: the job offer card, the "Replay mission" prompt, the objective line under
// the HUD, the big "PACKAGE COLLECTED!" banners, the arrow that points to an off-screen objective,
// and the customers' speech bubble.
// It only talks to the game through callbacks, so it knows nothing about Phaser or the
// mission rules.

import { placeSpeechBubble, isShortLandscape, SPEECH_LAYOUT } from './speechPlacement.js';

const PACKAGE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M12 2 3 6.5v11L12 22l9-4.5v-11L12 2zm0 2.2 5.9 2.9L12 10 6.1 7.1 12 4.2zM5 8.8l6 3v7.6l-6-3V8.8zm14 0v7.6l-6 3v-7.6l6-3z"/>' +
  '</svg>';

const ARROW_ICON =
  '<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false">' +
  '<path class="arrow-edge" d="M6 12 L38 22 L6 32 L14 22 Z" />' +
  '</svg>';

const noop = () => {};

// The keyboard shortcut for the "Replay mission" prompt: the E key, pressed once. Held keys
// (which repeat) and Ctrl / Alt / Meta combinations (browser shortcuts such as Ctrl+E) are ignored.
export function isReplayShortcut(e) {
  if (e.key !== 'e' && e.key !== 'E') return false;
  return !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && !e.isComposing && !e.defaultPrevented;
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export default class MissionUI {
  /**
   * @param {object} options
   * @param {HTMLElement} options.hud  the HUD column (the objective line goes in it)
   * @param {HTMLElement} options.app  the full-screen app root (card, banner and arrow go here)
   * @param {() => void} options.onAccept
   * @param {() => void} options.onDecline
   * @param {() => void} options.onReplay  the "Replay mission" prompt was tapped (or E was pressed)
   * @param {() => void} options.onSpeechDismiss  the speech bubble was tapped
   */
  constructor({ hud, app, onAccept, onDecline, onReplay, onSpeechDismiss } = {}) {
    this.hud = hud || document.body;
    this.app = app || document.body;
    this.onAccept = onAccept || noop;
    this.onDecline = onDecline || noop;
    this.onReplay = onReplay || noop;
    this.onSpeechDismiss = onSpeechDismiss || noop;
    this.toastTimer = 0;
    this.speechSize = { width: SPEECH_LAYOUT.FALLBACK_WIDTH, height: SPEECH_LAYOUT.FALLBACK_HEIGHT };
    this.speechInsets = undefined; // the device's safe-area insets, read each time a bubble is shown
    this.speechPlaced = ''; // where the bubble was last put, so an unchanged position is not written again
    this.speechSizes = new Map(); // measured bubble sizes by line, so a greeting can be checked before it is shown
    this.gateInsets = undefined; // safe-area insets for that check, read again only when the screen size changes
    this.gateInsetsKey = '';
    this.speechJoystick = null; // the joystick's touch circle (short landscape screens only), see joystickArea()
    this.speechJoystickKey = '';
    this.messageBottomKey = ''; // the HUD message's measured bottom edge, see hudMessageBottom()
    this.messageBottom = 0;

    this.build();
    this.bind();
  }

  /* -------------------------------------------------------------- build */

  build() {
    // Objective line, placed in the HUD column just above the welcome message
    this.objective = make('div', 'mission-objective');
    this.objective.hidden = true;
    this.objective.setAttribute('role', 'status');
    this.objectiveIcon = make('span', 'mission-objective-icon');
    this.objectiveIcon.innerHTML = PACKAGE_ICON;
    this.objectiveText = make('span', 'mission-objective-text');
    this.objective.append(this.objectiveIcon, this.objectiveText);
    const message = this.hud.querySelector('#hud-message');
    if (message && message.parentNode === this.hud) this.hud.insertBefore(this.objective, message);
    else this.hud.appendChild(this.objective);

    // Job offer card (modal)
    this.offer = make('section', 'mission-offer');
    this.offer.hidden = true;
    this.offer.setAttribute('role', 'dialog');
    this.offer.setAttribute('aria-modal', 'true');
    this.offer.setAttribute('aria-labelledby', 'mission-offer-title');

    const card = make('div', 'mission-offer-card');
    this.offerKicker = make('p', 'mission-offer-kicker');
    this.offerTitle = make('h2', 'mission-offer-title');
    this.offerTitle.id = 'mission-offer-title';
    this.offerBody = make('p', 'mission-offer-body');
    const rewardRow = make('p', 'mission-offer-reward');
    this.offerCoin = make('span', 'mission-coin', '\u20A6');
    this.offerReward = make('span', 'mission-offer-reward-text');
    rewardRow.append(this.offerCoin, this.offerReward);

    const buttons = make('div', 'mission-offer-buttons');
    this.acceptBtn = make('button', 'mission-btn mission-btn-primary');
    this.acceptBtn.type = 'button';
    this.acceptBtn.dataset.action = 'accept';
    this.declineBtn = make('button', 'mission-btn mission-btn-secondary');
    this.declineBtn.type = 'button';
    this.declineBtn.dataset.action = 'decline';
    buttons.append(this.acceptBtn, this.declineBtn);

    card.append(this.offerKicker, this.offerTitle, this.offerBody, rewardRow, buttons);
    this.offer.appendChild(card);
    this.app.appendChild(this.offer);

    // Big banner ("PACKAGE COLLECTED!", "DELIVERY COMPLETED!")
    this.toast = make('div', 'mission-toast');
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');
    this.toastTitle = make('p', 'mission-toast-title');
    this.toastBody = make('p', 'mission-toast-body');
    this.toast.append(this.toastTitle, this.toastBody);
    this.app.appendChild(this.toast);

    // Arrow that points at an objective that is off-screen
    this.arrow = make('div', 'mission-arrow');
    this.arrow.hidden = true;
    this.arrow.setAttribute('aria-hidden', 'true');
    this.arrow.innerHTML = ARROW_ICON;
    this.app.appendChild(this.arrow);

    // "Replay mission" prompt: a small button shown near a shop whose job can be replayed
    this.replay = make('button', 'mission-replay');
    this.replay.type = 'button';
    this.replay.hidden = true;
    this.replay.setAttribute('aria-keyshortcuts', 'E');
    const replayText = make('span', 'mission-replay-text');
    this.replayLabel = make('span', 'mission-replay-label', 'Replay mission');
    this.replayTitle = make('span', 'mission-replay-title');
    replayText.append(this.replayLabel, this.replayTitle);
    this.replayKey = make('span', 'mission-replay-key', 'E'); // only shown with a mouse and keyboard
    this.replayKey.setAttribute('aria-hidden', 'true');
    this.replay.append(replayText, this.replayKey);
    this.app.appendChild(this.replay);

    // Speech bubble: a customer's greeting or reply. A plain div (never a button), so it cannot take
    // keyboard focus; tapping it dismisses it. It sits UNDER the joystick and the HUD (see style.css).
    this.speech = make('div', 'mission-speech');
    this.speech.hidden = true;
    this.speech.setAttribute('role', 'status');
    this.speechText = make('span', 'mission-speech-text');
    this.speechTail = make('span', 'mission-speech-tail');
    this.speechTail.setAttribute('aria-hidden', 'true');
    this.speech.append(this.speechText, this.speechTail);
    this.app.appendChild(this.speech);

    // An invisible element whose padding is the device's safe-area insets: CSS knows them, script reads them here.
    this.speechProbe = make('div', 'mission-speech-probe');
    this.speechProbe.setAttribute('aria-hidden', 'true');
    this.app.appendChild(this.speechProbe);
  }

  bind() {
    this.handleClick = (e) => {
      const btn = e.target.closest ? e.target.closest('button[data-action]') : null;
      if (!btn || !this.offer.contains(btn)) return;
      if (btn.dataset.action === 'accept') this.onAccept();
      else this.onDecline();
    };
    this.handleKey = (e) => {
      if (e.key === 'Escape' && this.isOfferOpen()) {
        e.preventDefault();
        this.onDecline();
      } else if (isReplayShortcut(e) && this.isReplayPromptVisible() && !this.isOfferOpen() && !this.isSettingsOpen()) {
        e.preventDefault();
        this.onReplay();
      }
    };
    this.handleReplayClick = () => this.onReplay();
    this.handleSpeechClick = () => this.onSpeechDismiss();
    this.offer.addEventListener('click', this.handleClick);
    this.replay.addEventListener('click', this.handleReplayClick);
    this.speech.addEventListener('click', this.handleSpeechClick);
    window.addEventListener('keydown', this.handleKey);
  }

  /* -------------------------------------------------------------- offer */

  isOfferOpen() {
    return !this.offer.hidden;
  }

  showOffer(text) {
    this.offerKicker.textContent = text.offerKicker;
    this.offerTitle.textContent = text.offerTitle;
    this.offerBody.textContent = text.offerBody;
    this.offerReward.textContent = text.offerReward;
    this.acceptBtn.textContent = text.accept;
    this.declineBtn.textContent = text.decline;
    this.offer.hidden = false;
    this.acceptBtn.focus({ preventScroll: true });
  }

  hideOffer() {
    if (this.offer.hidden) return;
    // release keyboard focus first, so the movement keys never end up on a hidden button
    if (document.activeElement && this.offer.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this.offer.hidden = true;
  }

  /* ------------------------------------------------------ replay prompt */

  isReplayPromptVisible() {
    return !this.replay.hidden;
  }

  // The settings panel sits over the game; while it is open the E shortcut stays out of the way.
  isSettingsOpen() {
    const panel = this.app.querySelector('.settings-panel');
    return !!panel && !panel.hidden;
  }

  // title: the mission's title, shown as the small second line under "Replay mission"
  showReplayPrompt(title) {
    this.replayTitle.textContent = title;
    this.replay.setAttribute('aria-label', `Replay mission: ${title}`);
    // Sit on the side AWAY from the joystick, so the free thumb can reach it (see style.css).
    const zone = this.app.querySelector('.joystick-zone');
    this.replay.dataset.joystick = zone && zone.dataset.side === 'left' ? 'left' : 'right';
    this.replay.hidden = false;
  }

  hideReplayPrompt() {
    if (this.replay.hidden) return;
    // release keyboard focus first, so the movement keys never end up on a hidden button
    if (document.activeElement === this.replay) this.replay.blur();
    this.replay.hidden = true;
  }

  /* ---------------------------------------------------------- objective */

  // kind: 'pickup' | 'deliver'. Pass null to hide the line.
  setObjective(text, kind) {
    if (!text) {
      this.objective.hidden = true;
      return;
    }
    this.objectiveText.textContent = text;
    this.objective.dataset.kind = kind || '';
    this.objective.hidden = false;
  }

  /* -------------------------------------------------------------- toast */

  showToast(title, body, kind = 'info', durationMs = 2600) {
    this.toastTitle.textContent = title;
    this.toastBody.textContent = body;
    this.toast.dataset.kind = kind;
    this.toast.classList.remove('show');
    void this.toast.offsetWidth; // restart the pop animation
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), durationMs);
  }

  /* -------------------------------------------------------------- arrow */

  // x, y: screen position in CSS pixels; angle in radians (0 = pointing right)
  // The lower edge (screen px) of the HUD message while it is showing, or 0 when none is. The objective
  // arrow keeps clear of it. It is measured again only when the text or the screen size changes,
  // never every frame; the element's layout box is used, so the message's fade-in slide does not count.
  hudMessageBottom(viewWidth, viewHeight) {
    const message = this.hud.querySelector('#hud-message');
    if (!message || !message.classList.contains('visible')) return 0;
    const key = `${message.textContent}|${viewWidth}x${viewHeight}`;
    if (key !== this.messageBottomKey) {
      this.messageBottomKey = key;
      const bottom = (message.offsetTop || 0) + (message.offsetHeight || 0);
      this.messageBottom = bottom > 0 ? bottom : 0;
    }
    return this.messageBottom;
  }

  showArrow(x, y, angle, kind) {
    this.arrow.hidden = false;
    this.arrow.dataset.kind = kind || '';
    this.arrow.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(3)}rad)`;
  }

  hideArrow() {
    this.arrow.hidden = true;
  }

  /* ------------------------------------------------------ speech bubble */

  isSpeechVisible() {
    return !this.speech.hidden;
  }

  // Shows what a customer says. There is only one bubble: a new line replaces the one showing.
  // Its size and the device's safe-area insets are read here, once, so placing it each frame
  // only does arithmetic.
  showSpeech(text) {
    this.speechText.textContent = text;
    this.speech.hidden = false;
    this.speechInsets = this.readSafeInsets();
    this.speechSize = {
      width: this.speech.offsetWidth || SPEECH_LAYOUT.FALLBACK_WIDTH,
      height: this.speech.offsetHeight || SPEECH_LAYOUT.FALLBACK_HEIGHT,
    };
    this.speechPlaced = '';
  }

  // spot: where the customer is on the screen: x; anchorY (where the tail points); feetY; and the
  // screen size. The bubble goes above the customer, or below if there is no room above. On a
  // short landscape screen it also keeps clear of the joystick.
  placeSpeech({ x, anchorY, feetY, viewWidth, viewHeight }) {
    if (this.speech.hidden) return;
    const { width, height } = this.speechSize;
    const joystick = this.joystickArea(viewWidth, viewHeight);
    const spot = placeSpeechBubble({ x, anchorY, feetY, width, height, viewWidth, viewHeight, insets: this.speechInsets, joystick });
    const left = spot.left.toFixed(1);
    const top = spot.top.toFixed(1);
    const tail = spot.tailX.toFixed(1);
    const key = `${left},${top},${spot.flipped},${tail}`;
    if (key === this.speechPlaced) return;
    this.speechPlaced = key;
    this.speech.style.transform = `translate(${left}px, ${top}px)`;
    this.speech.dataset.flip = spot.flipped ? 'below' : 'above';
    this.speechTail.style.left = `${tail}px`;
  }

  hideSpeech() {
    this.speech.hidden = true;
  }

  // Can this line really be shown for this customer spot: a position above or below them, inside
  // the margins, and (on a short landscape screen) clear of the joystick? A greeting only starts
  // when it can. It changes nothing on the screen that anyone can see.
  canPlaceSpeech(text, { x, anchorY, feetY, viewWidth, viewHeight }) {
    const { width, height } = this.measureSpeech(text, viewWidth);
    const insets = this.gateSafeInsets(viewWidth, viewHeight);
    const joystick = this.joystickArea(viewWidth, viewHeight);
    return placeSpeechBubble({ x, anchorY, feetY, width, height, viewWidth, viewHeight, insets, joystick }).fits;
  }

  // The size this line's bubble will have. While a bubble is showing, its own size is the best
  // guess (measuring would disturb it); otherwise the line is measured in place, unseen, once.
  measureSpeech(text, viewWidth) {
    if (!this.speech.hidden) return this.speechSize;
    const key = `${viewWidth}|${text}`;
    const known = this.speechSizes.get(key);
    if (known) return known;
    const previous = this.speechText.textContent;
    this.speech.style.visibility = 'hidden';
    this.speechText.textContent = text;
    this.speech.hidden = false;
    const width = this.speech.offsetWidth;
    const height = this.speech.offsetHeight;
    this.speech.hidden = true;
    this.speech.style.visibility = '';
    this.speechText.textContent = previous;
    const size = { width: width || SPEECH_LAYOUT.FALLBACK_WIDTH, height: height || SPEECH_LAYOUT.FALLBACK_HEIGHT };
    if (width && height) this.speechSizes.set(key, size); // an unmeasurable size is never remembered
    return size;
  }

  gateSafeInsets(viewWidth, viewHeight) {
    const key = `${viewWidth}x${viewHeight}`;
    if (key !== this.gateInsetsKey) {
      this.gateInsetsKey = key;
      this.gateInsets = this.readSafeInsets();
    }
    return this.gateInsets;
  }

  // The joystick's touch circle { cx, cy, r } in screen px, or null when there is nothing to keep
  // clear of: not a short landscape screen (the only place the bubble avoids it), no joystick, or a
  // hidden one (mouse and keyboard). It is measured again only when the screen size, the
  // joystick's side or its visibility changes, never every frame.
  joystickArea(viewWidth, viewHeight) {
    if (!isShortLandscape(viewWidth, viewHeight)) return null;
    const zone = this.app.querySelector('.joystick-zone');
    const key = `${viewWidth}x${viewHeight}|${zone ? `${zone.dataset.side}|${zone.hidden}` : 'none'}`;
    if (key === this.speechJoystickKey) return this.speechJoystick;
    this.speechJoystickKey = key;
    this.speechJoystick = null;
    if (zone && !zone.hidden && typeof zone.getBoundingClientRect === 'function') {
      const box = zone.getBoundingClientRect();
      if (box.width > 0 && box.height > 0) {
        this.speechJoystick = { cx: box.left + box.width / 2, cy: box.top + box.height / 2, r: Math.min(box.width, box.height) / 2 };
      }
    }
    return this.speechJoystick;
  }

  readSafeInsets() {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return undefined;
    const style = window.getComputedStyle(this.speechProbe);
    const px = (value) => Number.parseFloat(value) || 0;
    return { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) };
  }

  /* ------------------------------------------------------------ cleanup */

  destroy() {
    clearTimeout(this.toastTimer);
    this.offer.removeEventListener('click', this.handleClick);
    this.replay.removeEventListener('click', this.handleReplayClick);
    this.speech?.removeEventListener('click', this.handleSpeechClick); // a missing bubble must not stop the rest of the cleanup
    window.removeEventListener('keydown', this.handleKey);
    [this.objective, this.offer, this.toast, this.arrow, this.replay, this.speech, this.speechProbe].forEach((n) => n?.remove());
  }
}