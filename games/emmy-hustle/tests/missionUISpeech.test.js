// Stage 4B-2: the speech bubble on the REAL MissionUI (only the browser's DOM is the stand-in in
// support/fakeDom.js), and the CSS facts the bubble depends on.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MissionUI from '../src/ui/MissionUI.js';
import { SPEECH_LAYOUT } from '../src/ui/speechPlacement.js';
import { installFakeDom } from './support/fakeDom.js';

let dom = null;
let toDestroy = [];

beforeEach(() => {
  mock.method(console, 'warn', () => {});
  dom = installFakeDom();
});
afterEach(() => {
  toDestroy.forEach((destroy) => destroy());
  toDestroy = [];
  dom.restore();
  mock.restoreAll();
});

function buildUI() {
  const onSpeechDismiss = mock.fn();
  const ui = new MissionUI({ hud: dom.hud, app: dom.app, onSpeechDismiss });
  toDestroy.push(() => ui.destroy());
  return { ui, onSpeechDismiss };
}

// The bubble's size is measured when a line is shown (the stand-in DOM has no layout, so give it one).
function showSized(ui, text = 'Hello', width = 200, height = 50) {
  ui.speech.offsetWidth = width;
  ui.speech.offsetHeight = height;
  ui.showSpeech(text);
}

const SPOT = { x: 400, anchorY: 300, feetY: 400, viewWidth: 800, viewHeight: 600 };

describe('the speech bubble element', () => {
  test('is a hidden plain div under #app: not a button, never focusable', () => {
    const { ui } = buildUI();
    assert.equal(ui.speech.parentNode, dom.app);
    assert.equal(ui.speech.tagName, 'DIV');
    assert.equal(ui.speech.className, 'mission-speech');
    assert.equal(ui.speech.hidden, true);
    assert.equal(ui.isSpeechVisible(), false);
    assert.equal(ui.speech.getAttribute('role'), 'status');
    assert.equal(ui.speech.getAttribute('tabindex'), null);
    assert.equal(ui.speech.type, ''); // not a button
    assert.equal(dom.app.querySelector('button.mission-speech'), null);
  });

  test('showing a line makes it visible with that text, and never takes keyboard focus', () => {
    const { ui } = buildUI();
    const before = dom.document.activeElement;
    ui.showSpeech('Over here!');
    assert.equal(ui.speech.hidden, false);
    assert.equal(ui.isSpeechVisible(), true);
    assert.equal(ui.speechText.textContent, 'Over here!');
    assert.equal(dom.document.activeElement, before);
  });

  test('there is one bubble: a new line replaces the old one', () => {
    const { ui } = buildUI();
    ui.showSpeech('First');
    ui.showSpeech('Second');
    assert.equal(ui.speechText.textContent, 'Second');
    assert.equal(dom.app.children.filter((c) => c.className === 'mission-speech').length, 1);
  });

  test('hiding it hides it', () => {
    const { ui } = buildUI();
    ui.showSpeech('Hi');
    ui.hideSpeech();
    assert.equal(ui.speech.hidden, true);
    assert.equal(ui.isSpeechVisible(), false);
  });
});

describe('tapping the bubble', () => {
  test('tells the game, once per tap', () => {
    const { ui, onSpeechDismiss } = buildUI();
    ui.showSpeech('Hi');
    ui.speech.click();
    assert.equal(onSpeechDismiss.mock.callCount(), 1);
    ui.speech.click();
    assert.equal(onSpeechDismiss.mock.callCount(), 2);
  });

  test('a tap on the text or the tail counts as a tap on the bubble', () => {
    const { ui, onSpeechDismiss } = buildUI();
    ui.showSpeech('Hi');
    ui.speechText.click();
    ui.speechTail.click();
    assert.equal(onSpeechDismiss.mock.callCount(), 2);
  });

  test('the tap does nothing else: it does not prevent the default, and moves no focus', () => {
    const { ui } = buildUI();
    ui.showSpeech('Hi');
    const event = ui.speech.click();
    assert.equal(event.defaultPrevented, false);
    assert.equal(dom.document.activeElement, null);
  });

  test('the bubble does not touch the keyboard: no key listener of its own', () => {
    const { ui } = buildUI();
    const before = dom.window.listenerCount('keydown');
    ui.showSpeech('Hi');
    assert.equal(dom.window.listenerCount('keydown'), before);
  });

  test('without a handler a tap is harmless', () => {
    const ui = new MissionUI({ hud: dom.hud, app: dom.app });
    toDestroy.push(() => ui.destroy());
    ui.showSpeech('Hi');
    assert.doesNotThrow(() => ui.speech.click());
  });
});

describe('placing the bubble', () => {
  test('above the customer, centred, with the tail in the middle', () => {
    const { ui } = buildUI();
    showSized(ui);
    ui.placeSpeech(SPOT);
    assert.equal(ui.speech.style.transform, 'translate(300.0px, 241.0px)');
    assert.equal(ui.speech.dataset.flip, 'above');
    assert.equal(ui.speechTail.style.left, '100.0px');
  });

  test('flips below the customer, tail pointing up, when there is no room above', () => {
    const { ui } = buildUI();
    showSized(ui);
    ui.placeSpeech({ ...SPOT, anchorY: 130, feetY: 230 });
    assert.equal(ui.speech.dataset.flip, 'below');
    assert.equal(ui.speech.style.transform, 'translate(300.0px, 239.0px)');
  });

  test('stays inside the 12 px side margins, the tail still pointing at the customer', () => {
    const { ui } = buildUI();
    showSized(ui);
    ui.placeSpeech({ ...SPOT, x: 5 });
    assert.equal(ui.speech.style.transform, 'translate(12.0px, 241.0px)');
    assert.equal(ui.speechTail.style.left, '16.0px');
    ui.placeSpeech({ ...SPOT, x: 795 });
    assert.equal(ui.speech.style.transform, 'translate(588.0px, 241.0px)');
    assert.equal(ui.speechTail.style.left, '184.0px');
  });

  test('uses the device safe-area insets (read from the invisible probe)', () => {
    dom.window.getComputedStyle = (element) => {
      assert.equal(element, ui.speechProbe);
      return { paddingTop: '0px', paddingRight: '34px', paddingBottom: '21px', paddingLeft: '47px' };
    };
    const { ui } = buildUI();
    showSized(ui);
    ui.placeSpeech({ ...SPOT, x: 5 });
    assert.equal(ui.speech.style.transform, 'translate(59.0px, 241.0px)'); // 12 + 47
    ui.placeSpeech({ ...SPOT, x: 795 });
    assert.equal(ui.speech.style.transform, 'translate(554.0px, 241.0px)'); // 800 - 12 - 34 - 200
  });

  test('without getComputedStyle (no insets known) it still places the bubble', () => {
    const { ui } = buildUI();
    showSized(ui);
    assert.doesNotThrow(() => ui.placeSpeech(SPOT));
    assert.equal(ui.speech.style.transform, 'translate(300.0px, 241.0px)');
  });

  test('a size that cannot be measured falls back to a sensible one', () => {
    const { ui } = buildUI();
    ui.showSpeech('Hi'); // the stand-in DOM measures 0
    ui.placeSpeech(SPOT);
    assert.equal(ui.speech.style.transform, 'translate(290.0px, 243.0px)'); // 220 x 48
  });

  test('moves with the customer, and does not rewrite an unchanged position', () => {
    const { ui } = buildUI();
    showSized(ui);
    ui.placeSpeech(SPOT);
    ui.speech.style.transform = 'untouched';
    ui.placeSpeech({ ...SPOT }); // the same spot: nothing is written
    assert.equal(ui.speech.style.transform, 'untouched');
    ui.placeSpeech({ ...SPOT, x: 410 }); // the customer moved on screen
    assert.equal(ui.speech.style.transform, 'translate(310.0px, 241.0px)');
  });

  test('placing a hidden bubble does nothing', () => {
    const { ui } = buildUI();
    ui.placeSpeech(SPOT);
    assert.equal(ui.speech.style.transform, undefined);
  });

  test('showing a new line forgets the old position, so the new bubble is placed', () => {
    const { ui } = buildUI();
    showSized(ui, 'One');
    ui.placeSpeech(SPOT);
    ui.speech.style.transform = 'untouched';
    showSized(ui, 'Two');
    ui.placeSpeech(SPOT);
    assert.equal(ui.speech.style.transform, 'translate(300.0px, 241.0px)');
  });
});

describe('cleaning up', () => {
  test('destroy removes the bubble, the probe and the tap listener', () => {
    const ui = new MissionUI({ hud: dom.hud, app: dom.app });
    ui.showSpeech('Hi');
    const bubble = ui.speech;
    const probe = ui.speechProbe;
    ui.destroy();
    assert.equal(bubble.parentNode, null);
    assert.equal(probe.parentNode, null);
    assert.equal(bubble.listeners.get('click').size, 0);
    assert.equal(dom.app.querySelector('.mission-speech'), null);
    assert.equal(dom.app.querySelector('.mission-speech-probe'), null);
  });

  test('destroy removes every element the UI added (nothing is left behind)', () => {
    const childrenBefore = dom.app.children.length;
    const ui = new MissionUI({ hud: dom.hud, app: dom.app });
    ui.showSpeech('Hi');
    ui.destroy();
    assert.equal(dom.app.children.length, childrenBefore);
  });
});

describe('style.css: the bubble', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const block = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, `${selector} has a rule`);
    return css.slice(start, css.indexOf('}', start));
  };
  const zIndex = (selector) => Number(/z-index:\s*(\d+)/.exec(block(selector))?.[1]);

  test('z-index 8, between the vignette and the joystick', () => {
    assert.equal(zIndex('.mission-speech'), 8);
    assert.ok(zIndex('#vignette') < 8);
    assert.ok(zIndex('#touch-controls') > 8);
  });

  test('under the joystick, HUD, arrow, replay prompt, settings, toast and offer card', () => {
    ['#touch-controls', '#hud', '.mission-arrow', '.mission-replay', '.settings-panel', '.mission-toast', '.mission-offer'].forEach((selector) => {
      assert.ok(zIndex(selector) > zIndex('.mission-speech'), selector);
    });
  });

  test('a real tap target that does not fight the joystick: 44 px high, manipulation, pointer events on', () => {
    const rule = block('.mission-speech');
    assert.match(rule, /min-height:\s*44px/);
    assert.match(rule, /touch-action:\s*manipulation/);
    assert.match(rule, /pointer-events:\s*auto/);
    assert.match(rule, /position:\s*absolute/);
  });

  test('hidden means gone, and the flipped tail points up', () => {
    assert.match(css, /\.mission-speech\[hidden\]\s*\{\s*display:\s*none;/);
    assert.match(css, /\.mission-speech\[data-flip="below"\] \.mission-speech-tail/);
  });

  test('reduced motion: no animation on the bubble (its position is not an animation)', () => {
    const start = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    const reduced = css.slice(start, css.indexOf('\n}', start));
    assert.match(reduced, /\.mission-speech\s*\{\s*animation:\s*none;\s*\}/);
    assert.ok(!/animation:[^;]*transform|@keyframes mission-speech-in[^}]*transform/.test(css), 'the fade does not use transform, which places the bubble');
  });

  test('the probe is invisible and never takes a tap', () => {
    const rule = block('.mission-speech-probe');
    assert.match(rule, /visibility:\s*hidden/);
    assert.match(rule, /pointer-events:\s*none/);
  });
});

// ---------------------------------------------------------------------------------------------
// Stage 4E-1: the greeting check and joystick avoidance on the REAL MissionUI (the DOM is the
// stand-in in support/fakeDom.js, which has no layout engine), and the toast's CSS facts. The
// real layout is checked separately in a browser; see the Stage 4E-1 report.
// ---------------------------------------------------------------------------------------------

// A stand-in joystick zone: a div the size of the browser would report. Returns it and a count of measurements.
function addJoystickZone({ side = 'right', viewWidth, viewHeight, size = 132, hidden = false }) {
  const zone = dom.document.createElement('div');
  zone.className = 'joystick-zone';
  zone.dataset.side = side;
  zone.hidden = hidden;
  const box = () => {
    const left = side === 'right' ? viewWidth - 4 - size : 4;
    const top = viewHeight - 4 - size;
    return { left, top, right: left + size, bottom: top + size, width: size, height: size };
  };
  const counter = { measured: 0 };
  zone.getBoundingClientRect = () => {
    counter.measured += 1;
    return box();
  };
  zone.setSide = (next) => {
    side = next;
    zone.dataset.side = next;
  };
  dom.app.append(zone);
  return { zone, counter };
}
const SHORT_VIEW = { viewWidth: 740, viewHeight: 360 };
const WRITE_PRECISION = 0.1; // the UI writes the bubble's position to a tenth of a pixel (the 6 px clearance absorbs this)
const centreOf = (zone) => ({ cx: zone.getBoundingClientRect().left + 66, cy: zone.getBoundingClientRect().top + 66, r: 66 });
// where the placed bubble sits, read back from the transform the UI wrote
const placedAt = (ui) => {
  const [, left, top] = /translate\(([\d.-]+)px, ([\d.-]+)px\)/.exec(ui.speech.style.transform);
  return { left: Number(left), top: Number(top) };
};
const gapToCircle = ({ left, top }, { width, height }, { cx, cy }) =>
  Math.hypot(Math.min(Math.max(cx, left), left + width) - cx, Math.min(Math.max(cy, top), top + height) - cy);

describe('4E-1: canPlaceSpeech (the greeting check)', () => {
  const sized = (ui, width = 240, height = 58) => {
    ui.speech.offsetWidth = width;
    ui.speech.offsetHeight = height;
  };

  test('is true when the bubble fits above, or below, the customer; false when it fits neither', () => {
    const { ui } = buildUI();
    sized(ui);
    assert.equal(ui.canPlaceSpeech('Hi', { x: 400, anchorY: 300, feetY: 400, viewWidth: 800, viewHeight: 600 }), true); // above
    assert.equal(ui.canPlaceSpeech('Hi', { x: 370, anchorY: 122, feetY: 202, ...SHORT_VIEW }), true); // below
    assert.equal(ui.canPlaceSpeech('Hi', { x: 370, anchorY: 0, feetY: 100, ...SHORT_VIEW }), false); // under the HUD
    assert.equal(ui.canPlaceSpeech('Hi', { x: 284, anchorY: 170, feetY: 250, viewWidth: 568, viewHeight: 320 }), false); // no room
  });

  test('uses the real size of the line: the same spot fits a one-line bubble and not a three-line one', () => {
    const { ui } = buildUI();
    const spot = { x: 370, anchorY: 170, feetY: 250, viewWidth: 740, viewHeight: 340 };
    sized(ui, 200, 44);
    assert.equal(ui.canPlaceSpeech('One line', spot), true); // below: 259 + 44 = 303 <= 328
    sized(ui, 240, 90);
    assert.equal(ui.canPlaceSpeech('A much longer line', spot), false); // below: 259 + 90 = 349 > 340 - 12
  });

  test('measures a line once, unseen, and the bubble stays hidden with its old text', () => {
    const { ui } = buildUI();
    sized(ui);
    ui.speechText.textContent = 'old';
    ui.canPlaceSpeech('Hi', { x: 400, anchorY: 300, feetY: 400, viewWidth: 800, viewHeight: 600 });
    assert.equal(ui.speech.hidden, true);
    assert.equal(ui.speech.style.visibility, '');
    assert.equal(ui.speechText.textContent, 'old');
    assert.equal(ui.isSpeechVisible(), false);
    // remembered: changing the element's size does not change the answer for the same line and screen width
    sized(ui, 10, 10);
    assert.deepEqual(ui.measureSpeech('Hi', 800), { width: 240, height: 58 });
  });

  test('an unmeasurable size (no layout) falls back to 220 x 48 and is never remembered', () => {
    const { ui } = buildUI();
    assert.deepEqual(ui.measureSpeech('Hi', 800), { width: 220, height: 48 });
    sized(ui, 240, 58);
    assert.deepEqual(ui.measureSpeech('Hi', 800), { width: 240, height: 58 });
  });

  test('while a bubble is showing, the check leaves it alone and uses its size', () => {
    const { ui } = buildUI();
    showSized(ui, 'Showing', 200, 50);
    ui.canPlaceSpeech('Another line', { x: 400, anchorY: 300, feetY: 400, viewWidth: 800, viewHeight: 600 });
    assert.equal(ui.speechText.textContent, 'Showing');
    assert.equal(ui.speech.hidden, false);
    assert.deepEqual(ui.measureSpeech('Another line', 800), { width: 200, height: 50 });
  });

  test('safe-area insets count, and are read again only when the screen size changes', () => {
    let reads = 0;
    dom.window.getComputedStyle = () => {
      reads += 1;
      return { paddingTop: '0px', paddingRight: '47px', paddingBottom: '21px', paddingLeft: '47px' };
    };
    const { ui } = buildUI();
    sized(ui);
    const spot = { x: 40, anchorY: 200, feetY: 280, ...SHORT_VIEW };
    assert.equal(ui.canPlaceSpeech('Hi', spot), false); // 40 is inside 12 + 47
    assert.equal(ui.canPlaceSpeech('Hi', { ...spot, x: 80 }), true);
    ui.canPlaceSpeech('Hi', spot);
    assert.equal(reads, 1);
    ui.canPlaceSpeech('Hi', { ...spot, viewWidth: 741 });
    assert.equal(reads, 2);
  });

  test('changes nothing on the page: no toast, no new element, no listener', () => {
    const { ui } = buildUI();
    sized(ui);
    const children = dom.app.children.length;
    ui.canPlaceSpeech('Hi', { x: 400, anchorY: 300, feetY: 400, viewWidth: 800, viewHeight: 600 });
    assert.equal(dom.app.children.length, children);
    assert.equal(ui.toast.classList.contains('show'), false);
  });
});

describe('4E-1: the joystick on a short landscape screen', () => {
  const sized = (ui) => {
    ui.speech.offsetWidth = 240;
    ui.speech.offsetHeight = 58;
  };
  const SPOT_NEAR_JOYSTICK = { x: 520, anchorY: 260, feetY: 340, ...SHORT_VIEW };

  ['right', 'left'].forEach((side) => {
    test(`${side}: a placed bubble keeps clear of the joystick's touch circle, which was not so before`, () => {
      const { ui } = buildUI();
      const { zone } = addJoystickZone({ side, ...SHORT_VIEW });
      const spot = side === 'right' ? SPOT_NEAR_JOYSTICK : { ...SPOT_NEAR_JOYSTICK, x: 740 - 520 };
      showSized(ui, 'Hello', 240, 58);
      ui.placeSpeech(spot);
      assert.ok(gapToCircle(placedAt(ui), { width: 240, height: 58 }, centreOf(zone)) >= 66 + 6 - WRITE_PRECISION);
      // the same bubble without the joystick would have overlapped it
      zone.hidden = true;
      ui.speechPlaced = '';
      ui.placeSpeech(spot);
      assert.ok(gapToCircle(placedAt(ui), { width: 240, height: 58 }, centreOf(zone)) < 66);
    });
  });

  test('above stays above, and below stays below: only the sideways position changes', () => {
    const { ui } = buildUI();
    addJoystickZone({ side: 'right', ...SHORT_VIEW });
    showSized(ui, 'Hello', 240, 58);
    ui.placeSpeech(SPOT_NEAR_JOYSTICK);
    assert.equal(ui.speech.dataset.flip, 'above');
    assert.equal(placedAt(ui).top, 193); // anchor 260 - 9 - 58
  });

  test('the tail still points at the customer after the bubble slides', () => {
    const { ui } = buildUI();
    addJoystickZone({ side: 'right', ...SHORT_VIEW });
    showSized(ui, 'Hello', 240, 58);
    ui.placeSpeech(SPOT_NEAR_JOYSTICK);
    assert.ok(Math.abs(placedAt(ui).left + parseFloat(ui.speechTail.style.left) - 520) < 0.06);
  });

  test('a hidden joystick (mouse and keyboard) is ignored: the bubble is where it always was', () => {
    const { ui } = buildUI();
    addJoystickZone({ side: 'right', hidden: true, ...SHORT_VIEW });
    showSized(ui, 'Hello', 240, 58);
    ui.placeSpeech(SPOT_NEAR_JOYSTICK);
    assert.equal(placedAt(ui).left, 400); // centred on the customer at x = 520, as before
  });

  test('no joystick element at all is fine', () => {
    const { ui } = buildUI();
    showSized(ui, 'Hello', 240, 58);
    assert.doesNotThrow(() => ui.placeSpeech(SPOT_NEAR_JOYSTICK));
    assert.equal(ui.joystickArea(740, 360), null);
  });

  test('portrait and tall screens never look at the joystick (it is not even measured)', () => {
    const { ui } = buildUI();
    const { counter } = addJoystickZone({ side: 'right', viewWidth: 390, viewHeight: 844 });
    showSized(ui, 'Hello', 240, 58);
    ui.placeSpeech({ x: 300, anchorY: 780, feetY: 840, viewWidth: 390, viewHeight: 844 });
    ui.placeSpeech({ x: 700, anchorY: 390, feetY: 470, viewWidth: 800, viewHeight: 481 });
    assert.equal(counter.measured, 0);
    assert.equal(ui.joystickArea(390, 844), null);
    assert.equal(ui.joystickArea(800, 481), null);
  });

  test('the joystick is measured once, not every frame, and again when the side, size or visibility changes', () => {
    const { ui } = buildUI();
    const { zone, counter } = addJoystickZone({ side: 'right', ...SHORT_VIEW });
    showSized(ui, 'Hello', 240, 58);
    for (let frame = 0; frame < 30; frame += 1) ui.placeSpeech({ ...SPOT_NEAR_JOYSTICK, x: 520 + frame * 0.01 });
    assert.equal(counter.measured, 1);
    zone.setSide('left');
    ui.placeSpeech(SPOT_NEAR_JOYSTICK);
    assert.equal(counter.measured, 2);
    ui.placeSpeech({ ...SPOT_NEAR_JOYSTICK, viewWidth: 741 });
    assert.equal(counter.measured, 3);
    zone.hidden = true;
    ui.placeSpeech({ ...SPOT_NEAR_JOYSTICK, viewWidth: 741 });
    assert.equal(ui.joystickArea(741, 360), null);
    assert.equal(counter.measured, 3); // hidden: nothing to measure
    zone.hidden = false;
    assert.notEqual(ui.joystickArea(741, 360), null);
    assert.equal(counter.measured, 4);
  });

  test('swapping the joystick side while a bubble is up moves it clear of the new side', () => {
    const { ui } = buildUI();
    const { zone } = addJoystickZone({ side: 'right', ...SHORT_VIEW });
    showSized(ui, 'Hello', 240, 58);
    const spot = { x: 220, anchorY: 260, feetY: 340, ...SHORT_VIEW };
    ui.placeSpeech(spot);
    const before = placedAt(ui);
    zone.setSide('left');
    ui.placeSpeech(spot);
    const after = placedAt(ui);
    assert.ok(after.left > before.left, 'it slid right, off the left joystick');
    assert.ok(gapToCircle(after, { width: 240, height: 58 }, { cx: 70, cy: 290 }) >= 72 - WRITE_PRECISION);
  });

  test('the check refuses a customer the joystick leaves no room for', () => {
    const { ui } = buildUI();
    addJoystickZone({ side: 'right', ...SHORT_VIEW });
    sized(ui);
    assert.equal(ui.canPlaceSpeech('Hi', { x: 600, anchorY: 260, feetY: 340, ...SHORT_VIEW }), false);
    assert.equal(ui.canPlaceSpeech('Hi', { x: 520, anchorY: 260, feetY: 340, ...SHORT_VIEW }), true);
  });

  test('a bubble that cannot get clear is still placed on screen (a reply is never lost)', () => {
    const { ui } = buildUI();
    const view = { viewWidth: 360, viewHeight: 300 };
    addJoystickZone({ side: 'right', ...view });
    showSized(ui, 'Hello', 240, 58);
    ui.placeSpeech({ x: 180, anchorY: 120, feetY: 200, ...view });
    const { left, top } = placedAt(ui);
    assert.ok(left >= 12 && left + 240 <= 360 - 12 && top + 58 <= 300 - 12);
  });

  test('destroy leaves nothing behind (the check adds no element and no listener)', () => {
    const { ui } = buildUI();
    sized(ui);
    ui.canPlaceSpeech('Hi', { x: 400, anchorY: 300, feetY: 400, viewWidth: 800, viewHeight: 600 });
    const countBefore = dom.app.children.length;
    ui.destroy();
    assert.ok(dom.app.children.length < countBefore);
  });
});

describe('4E-1 style.css: the delivery toast on short landscape screens', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const QUERY = '@media (orientation: landscape) and (max-height: 480px) {';
  const start = css.indexOf(QUERY);
  const landscapeBlock = css.slice(start, css.indexOf('\n}\n', start));
  const base = css.slice(css.indexOf('\n.mission-toast {'), css.indexOf('}', css.indexOf('\n.mission-toast {')));

  test('the short-landscape query exists once and is the same breakpoint the speech code uses', () => {
    assert.ok(start >= 0);
    assert.equal(css.split(QUERY).length, 2);
    assert.match(QUERY, new RegExp(`max-height: ${SPEECH_LAYOUT.SHORT_LANDSCAPE_MAX_HEIGHT}px`));
  });

  test('the banner sits below the HUD: its top edge is the 120 px top margin plus the safe-area top', () => {
    assert.match(landscapeBlock, /\.mission-toast \{[^}]*top: calc\(var\(--safe-top\) \+ 120px\);/);
    assert.equal(SPEECH_LAYOUT.SAFE_TOP, 120);
    // it is anchored by its top edge there (not centred on `top`, which would put half of it over the HUD)
    assert.match(landscapeBlock, /\.mission-toast \{[^}]*transform: translate\(-50%, 0\) scale\(0\.85\);/);
    assert.match(landscapeBlock, /\.mission-toast\.show \{\s*transform: translate\(-50%, 0\) scale\(1\);/);
  });

  test('it only changes position and size there: no colour, border, shadow, animation or duration', () => {
    ['background', 'border', 'box-shadow', 'color', 'transition', 'opacity', 'z-index', 'pointer-events', 'max-width'].forEach((property) => {
      assert.equal(new RegExp(`\\b${property}\\s*:`).test(landscapeBlock), false, property);
    });
    assert.match(landscapeBlock, /\.mission-toast-title \{ font-size: 1\.4rem; \}/);
    assert.match(landscapeBlock, /\.mission-toast-body \{ font-size: 1\.1rem; \}/);
  });

  test('every other screen keeps the base banner: centred on 26%, scale-in, above the HUD, pointer-events none', () => {
    assert.match(base, /top: 26%;/);
    assert.match(base, /z-index: 25;/);
    assert.match(base, /transform: translate\(-50%, -50%\) scale\(0\.85\);/);
    assert.match(base, /pointer-events: none;/);
    assert.match(base, /max-width: min\(92vw, 460px\);/);
    assert.match(css, /@media \(max-height: 480px\) \{[^@]*\.mission-toast \{ top: 22%; \}/); // the older rule is untouched
  });

  test('the banner still arrives after that older rule, so it wins on short landscape screens only', () => {
    assert.ok(start > css.indexOf('.mission-toast { top: 22%; }'));
  });

  test('the toast duration is unchanged: 2.6 s by default', () => {
    const { ui } = buildUI();
    const timers = [];
    mock.method(globalThis, 'setTimeout', (fn, ms) => {
      timers.push(ms);
      return 1;
    });
    ui.showToast('A', 'B', 'done');
    assert.ok(timers.includes(2600));
  });
});
