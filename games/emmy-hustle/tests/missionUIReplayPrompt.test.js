// The "Replay mission" prompt on the REAL MissionUI (and, end to end, the real MissionSystem
// driving it): what it shows, the tap, the E key, and the protection against held keys and
// browser shortcuts. Only the browser's DOM is replaced, by a tiny stand-in (support/fakeDom.js).
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import MissionUI, { isReplayShortcut } from '../src/ui/MissionUI.js';
import MissionSystem from '../src/missions/MissionSystem.js';
import { startSaveSystem } from '../src/state/saveSystem.js';
import { MISSIONS } from '../src/missions/missionData.js';
import { makeMissionScene, makePlayer } from './support/fakeMissionScene.js';
import { installFakeDom } from './support/fakeDom.js';
import { FAR, done, storageWith, door } from './support/missionGame.js';

const [M1, M2, , M4] = MISSIONS;
let dom = null;
let toDestroy = [];

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  dom = installFakeDom();
});
afterEach(() => {
  toDestroy.forEach((destroy) => destroy());
  toDestroy = [];
  dom.restore();
  mock.restoreAll();
});

// The real MissionUI, with every handler recorded.
function buildUI() {
  const handlers = { onAccept: mock.fn(), onDecline: mock.fn(), onReplay: mock.fn() };
  const ui = new MissionUI({ hud: dom.hud, app: dom.app, ...handlers });
  toDestroy.push(() => ui.destroy());
  return { ui, ...handlers };
}

describe('isReplayShortcut: the E key, pressed once', () => {
  const press = (init) => ({ key: 'e', repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, defaultPrevented: false, ...init });

  test('e and E count, and nothing else does', () => {
    assert.equal(isReplayShortcut(press({ key: 'e' })), true);
    assert.equal(isReplayShortcut(press({ key: 'E' })), true);
    ['Enter', ' ', 'Escape', 'w', 'ArrowUp', 'r', 'Tab', 'Shift'].forEach((key) => {
      assert.equal(isReplayShortcut(press({ key })), false, key);
    });
  });

  test('a held key (repeat) does not count', () => {
    assert.equal(isReplayShortcut(press({ repeat: true })), false);
  });

  test('Ctrl, Alt or Meta combinations do not count (Ctrl+E is a browser shortcut)', () => {
    assert.equal(isReplayShortcut(press({ ctrlKey: true })), false);
    assert.equal(isReplayShortcut(press({ altKey: true })), false);
    assert.equal(isReplayShortcut(press({ metaKey: true })), false);
    assert.equal(isReplayShortcut(press({ ctrlKey: true, altKey: true })), false);
  });

  test('Shift+E (a capital E) does count', () => {
    assert.equal(isReplayShortcut(press({ key: 'E', shiftKey: true })), true);
  });

  test('typing in an input method, or an event something else already handled, does not count', () => {
    assert.equal(isReplayShortcut(press({ isComposing: true })), false);
    assert.equal(isReplayShortcut(press({ defaultPrevented: true })), false);
  });
});

describe('the prompt button', () => {
  test('exists, hidden, as a real button with a first line "Replay mission"', () => {
    const { ui } = buildUI();
    assert.equal(ui.replay.tagName, 'BUTTON');
    assert.equal(ui.replay.type, 'button');
    assert.equal(ui.replay.className, 'mission-replay');
    assert.equal(ui.replay.hidden, true);
    assert.equal(ui.isReplayPromptVisible(), false);
    assert.equal(ui.replayLabel.textContent, 'Replay mission');
    assert.ok(dom.app.contains(ui.replay));
  });

  test('showing it puts the mission title on a smaller second line, and names it for screen readers', () => {
    const { ui } = buildUI();
    ui.showReplayPrompt('Fresh From the Oven');
    assert.equal(ui.replay.hidden, false);
    assert.equal(ui.isReplayPromptVisible(), true);
    assert.equal(ui.replayTitle.textContent, 'Fresh From the Oven');
    assert.equal(ui.replayLabel.textContent, 'Replay mission');
    assert.equal(ui.replay.getAttribute('aria-label'), 'Replay mission: Fresh From the Oven');
    assert.equal(ui.replay.getAttribute('aria-keyshortcuts'), 'E');
    assert.ok(ui.replayLabel.className.includes('label'));
    assert.ok(ui.replayTitle.className.includes('title'));
  });

  test('the title changes when the prompt is shown for another mission', () => {
    const { ui } = buildUI();
    ui.showReplayPrompt('Suya for the Hall');
    ui.showReplayPrompt('Across Orisun Close');
    assert.equal(ui.replayTitle.textContent, 'Across Orisun Close');
  });

  test('the keyboard hint is the letter E, kept out of the screen-reader text', () => {
    const { ui } = buildUI();
    assert.equal(ui.replayKey.textContent, 'E');
    assert.equal(ui.replayKey.getAttribute('aria-hidden'), 'true');
  });

  test('it sits on the side AWAY from the joystick: left when the joystick is right (the default)', () => {
    const { ui } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    assert.equal(ui.replay.dataset.joystick, 'right');
  });

  test('and on the right when the joystick is on the left', () => {
    const zone = dom.document.createElement('div');
    zone.className = 'joystick-zone';
    zone.dataset.side = 'left';
    dom.app.appendChild(zone);
    const { ui } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    assert.equal(ui.replay.dataset.joystick, 'left');
  });

  test('hiding it hides it, and releases keyboard focus so keys never land on a hidden button', () => {
    const { ui } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ui.replay.focus();
    assert.equal(dom.document.activeElement, ui.replay);
    ui.hideReplayPrompt();
    assert.equal(ui.replay.hidden, true);
    assert.equal(dom.document.activeElement, null);
    assert.doesNotThrow(() => ui.hideReplayPrompt());
  });

  test('showing the prompt never steals keyboard focus', () => {
    const { ui } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    assert.equal(dom.document.activeElement, null);
  });
});

describe('tapping the prompt', () => {
  test('a tap calls the replay handler once', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ui.replay.click();
    assert.equal(onReplay.mock.callCount(), 1);
  });

  test('a tap does not touch Accept or Not Now', () => {
    const { ui, onAccept, onDecline } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ui.replay.click();
    assert.equal(onAccept.mock.callCount(), 0);
    assert.equal(onDecline.mock.callCount(), 0);
  });
});

describe('pressing E', () => {
  test('e and E call the replay handler once each', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    dom.keydown({ key: 'e' });
    dom.keydown({ key: 'E' });
    assert.equal(onReplay.mock.callCount(), 2);
  });

  test('the key press is handled: the browser does nothing else with it', () => {
    const { ui } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    assert.equal(dom.keydown({ key: 'e' }).defaultPrevented, true);
  });

  test('a held E (repeating keydown events) opens it once, not repeatedly', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    dom.keydown({ key: 'e' });
    dom.keydown({ key: 'e', repeat: true });
    dom.keydown({ key: 'e', repeat: true });
    assert.equal(onReplay.mock.callCount(), 1);
  });

  test('Ctrl+E, Alt+E and Meta+E do nothing, and are left to the browser', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ['ctrlKey', 'altKey', 'metaKey'].forEach((modifier) => {
      const event = dom.keydown({ key: 'e', [modifier]: true });
      assert.equal(event.defaultPrevented, false, modifier);
    });
    assert.equal(onReplay.mock.callCount(), 0);
  });

  test('other keys do nothing: not Enter, not Space, not the movement keys', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ['Enter', ' ', 'w', 'a', 's', 'd', 'ArrowUp', 'ArrowLeft', 'r'].forEach((key) => dom.keydown({ key }));
    assert.equal(onReplay.mock.callCount(), 0);
  });

  test('E does nothing while the prompt is not showing', () => {
    const { ui, onReplay } = buildUI();
    dom.keydown({ key: 'e' });
    ui.showReplayPrompt('The First Delivery');
    ui.hideReplayPrompt();
    dom.keydown({ key: 'e' });
    assert.equal(onReplay.mock.callCount(), 0);
  });

  test('E does nothing while the offer card is open', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ui.showOffer(M1.text);
    dom.keydown({ key: 'e' });
    assert.equal(onReplay.mock.callCount(), 0);
  });

  test('E does nothing while the settings panel is open, and works again when it closes', () => {
    const panel = dom.document.createElement('section');
    panel.className = 'settings-panel';
    panel.hidden = true; // closed
    dom.app.appendChild(panel);
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    dom.keydown({ key: 'e' });
    assert.equal(onReplay.mock.callCount(), 1, 'a closed settings panel does not get in the way');
    panel.hidden = false; // open
    dom.keydown({ key: 'e' });
    assert.equal(onReplay.mock.callCount(), 1, 'an open one does');
    panel.hidden = true; // closed again
    dom.keydown({ key: 'e' });
    assert.equal(onReplay.mock.callCount(), 2);
  });
});

describe('the offer card and its buttons are exactly as before', () => {
  test('Accept and Not Now call their handlers, and Escape declines', () => {
    const { ui, onAccept, onDecline, onReplay } = buildUI();
    ui.showOffer(M1.text);
    ui.acceptBtn.click();
    assert.equal(onAccept.mock.callCount(), 1);
    ui.declineBtn.click();
    assert.equal(onDecline.mock.callCount(), 1);
    dom.keydown({ key: 'Escape' });
    assert.equal(onDecline.mock.callCount(), 2);
    assert.equal(onReplay.mock.callCount(), 0);
  });

  test('Escape does nothing when no card is open', () => {
    const { onDecline } = buildUI();
    dom.keydown({ key: 'Escape' });
    assert.equal(onDecline.mock.callCount(), 0);
  });

  test('the offer card still shows the mission\'s own text', () => {
    const { ui } = buildUI();
    ui.showOffer(M2.text);
    assert.equal(ui.offer.hidden, false);
    assert.equal(ui.offerTitle.textContent, 'BOLA BAKERY');
    assert.equal(ui.offerBody.textContent, M2.text.offerBody);
  });
});

describe('cleaning up', () => {
  test('destroying the UI removes the prompt and its key handler', () => {
    const { ui, onReplay } = buildUI();
    ui.showReplayPrompt('The First Delivery');
    ui.destroy();
    assert.equal(ui.replay.parentNode, null);
    assert.equal(dom.window.listenerCount('keydown'), 0);
    dom.keydown({ key: 'e' });
    ui.replay.click();
    assert.equal(onReplay.mock.callCount(), 0);
  });
});

describe('end to end: the real MissionSystem driving the real MissionUI', () => {
  function launchReal(progress, money) {
    startSaveSystem({ storage: storageWith(progress, money === undefined ? undefined : { money }) });
    const scene = makeMissionScene();
    const player = makePlayer(FAR.x, FAR.y);
    const system = new MissionSystem(scene, player); // exactly as GameScene builds it: the real MissionUI
    toDestroy.push(() => system.destroy());
    let time = 0;
    return {
      system,
      ui: system.ui,
      player,
      at(point) {
        player.x = point.x;
        player.y = point.y;
        time += 16;
        system.update(time, 16);
      },
    };
  }
  const ALL_DONE = { firstDelivery: done(1), freshFromTheOven: done(1), suyaForTheHall: done(1), acrossOrisunClose: done(1) };

  test('near a replay shop the real prompt shows with the real title, and no card opens by itself', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M2));
    assert.equal(game.ui.replay.hidden, false);
    assert.equal(game.ui.replayLabel.textContent, 'Replay mission');
    assert.equal(game.ui.replayTitle.textContent, 'Fresh From the Oven');
    assert.equal(game.ui.offer.hidden, true);
    assert.equal(game.player.inputLocked, false);
  });

  test('tapping it opens the real offer card with the mission\'s text, and hides the prompt', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M2));
    game.ui.replay.click();
    assert.equal(game.ui.offer.hidden, false);
    assert.equal(game.ui.offerTitle.textContent, 'BOLA BAKERY');
    assert.equal(game.ui.offerBody.textContent, M2.text.offerBody);
    assert.equal(game.ui.replay.hidden, true);
    assert.equal(game.player.inputLocked, true);
    assert.equal(game.system.getFlow(M2.id).state, 'offer');
  });

  test('pressing E does the same, and then Accept starts the run', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M4));
    dom.keydown({ key: 'e' });
    assert.equal(game.system.getFlow(M4.id).state, 'offer');
    assert.equal(game.ui.offer.hidden, false);
    game.ui.acceptBtn.click();
    assert.equal(game.system.getFlow(M4.id).state, 'pickup');
    assert.equal(game.ui.offer.hidden, true);
    assert.equal(game.player.inputLocked, false);
    assert.equal(game.system.getFlow(M4.id).runId, 2);
  });

  test('a held E, and Ctrl+E, do not open anything', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M2));
    dom.keydown({ key: 'e', repeat: true });
    dom.keydown({ key: 'e', ctrlKey: true });
    assert.equal(game.system.getFlow(M2.id).state, 'available');
    assert.equal(game.ui.offer.hidden, true);
    dom.keydown({ key: 'e' }); // a real press does
    assert.equal(game.system.getFlow(M2.id).state, 'offer');
  });

  test('Not Now (Escape) closes the card and the prompt returns while Emmy is still there', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M1));
    game.ui.replay.click();
    dom.keydown({ key: 'Escape' });
    assert.equal(game.system.getFlow(M1.id).state, 'available');
    assert.equal(game.ui.offer.hidden, true);
    game.at(door(M1));
    assert.equal(game.ui.replay.hidden, false);
    assert.equal(game.ui.replayTitle.textContent, 'The First Delivery');
  });

  test('walking away hides the prompt in the real UI', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M1));
    assert.equal(game.ui.replay.hidden, false);
    game.at(FAR);
    assert.equal(game.ui.replay.hidden, true);
  });

  test('a NEW job still opens its real card by itself, with no prompt', () => {
    const game = launchReal({ firstDelivery: done(1) }); // mission 2 is the new job
    game.at(door(M2));
    assert.equal(game.ui.offer.hidden, false);
    assert.equal(game.ui.replay.hidden, true);
    assert.equal(game.system.getFlow(M2.id).state, 'offer');
  });

  test('no prompt for a locked shop, and none while a job is in progress', () => {
    const game = launchReal({});
    game.at(door(M2));
    assert.equal(game.ui.replay.hidden, true);
    const busy = launchReal(ALL_DONE);
    busy.at(door(M1));
    busy.ui.replay.click();
    busy.ui.acceptBtn.click();
    busy.at(door(M2));
    assert.equal(busy.ui.replay.hidden, true);
  });

  test('destroying the system leaves no prompt and no key handler behind', () => {
    const game = launchReal(ALL_DONE);
    game.at(door(M1));
    const { replay } = game.ui;
    game.system.destroy();
    assert.equal(replay.parentNode, null);
    assert.equal(dom.window.listenerCount('keydown'), 0);
  });
});
