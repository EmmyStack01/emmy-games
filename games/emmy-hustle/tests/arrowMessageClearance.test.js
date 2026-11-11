// Stage 4E-2 (C5): the objective arrow used to reach up into the new-job notice (about 9 px at every
// landscape size). Now, only while a HUD message is showing, the arrow's top margin moves down to clear it.
// REAL MissionSystem, MissionFlow, Hud and GameState, and the real MissionUI measuring code; the page's
// DOM, the Phaser scene and the camera are stand-ins. The notice's measured bottom edges below come
// from headless Chromium running the project's real style.css (see the Stage 4E-2 report); this file
// is an automated check, not a real-device test.
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MissionSystem from '../src/missions/MissionSystem.js';
import MissionUI from '../src/ui/MissionUI.js';
import { MISSIONS, FIRST_DELIVERY } from '../src/missions/missionData.js';
import { getJobNotice, JOB_NOTICE_MS } from '../src/missions/jobNotices.js';
import { WORLD, CAMERA } from '../src/config.js';
import Hud from '../src/ui/Hud.js';
import { installFakeDom } from './support/fakeDom.js';
import { FAR, cust, pick, launch, accept, storageWith } from './support/missionGame.js';

const [M1, M2] = MISSIONS;
const DONE_FRAMES = Math.ceil(FIRST_DELIVERY.doneDelayMs / 100);

// The arrow reaches this far from its centre in any direction: 18.9 px measured, plus its 1.5 px half-stroke
const ARROW_REACH = 21;
// The notice's bottom edge (px), as Chromium lays it out (the objective line is hidden in this state)
const NOTICE_BOTTOM = { landscape: 111, desktop: 117, portrait: 103, wrapped: 121 };
const SCREENS = [
  // the three landscape sizes the gap was first seen at, and the other short-landscape sizes
  { name: '844x390 landscape', w: 844, h: 390, bottom: NOTICE_BOTTOM.landscape },
  { name: '740x360 landscape', w: 740, h: 360, bottom: NOTICE_BOTTOM.landscape },
  { name: '915x412 landscape', w: 915, h: 412, bottom: NOTICE_BOTTOM.landscape },
  { name: '667x375 landscape', w: 667, h: 375, bottom: NOTICE_BOTTOM.landscape },
  { name: '932x430 landscape', w: 932, h: 430, bottom: NOTICE_BOTTOM.landscape },
  { name: '800x480 landscape', w: 800, h: 480, bottom: NOTICE_BOTTOM.landscape },
  // portrait, tablet and desktop
  { name: '390x844 portrait', w: 390, h: 844, bottom: NOTICE_BOTTOM.portrait },
  { name: '375x667 portrait', w: 375, h: 667, bottom: NOTICE_BOTTOM.portrait },
  { name: '360x740 portrait, notice wraps to two lines', w: 360, h: 740, bottom: NOTICE_BOTTOM.wrapped },
  { name: '1024x768 tablet', w: 1024, h: 768, bottom: NOTICE_BOTTOM.desktop },
  { name: '1366x768 desktop', w: 1366, h: 768, bottom: NOTICE_BOTTOM.desktop },
];

let dom = null;
let hud = null;
let games = [];
beforeEach(() => {
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
  mock.timers.enable({ apis: ['setTimeout'] });
  dom = installFakeDom();
  hud = new Hud();
});
afterEach(() => {
  games.forEach((game) => game.close());
  games = [];
  hud.destroy();
  dom.restore();
  mock.timers.reset();
  mock.restoreAll();
});

const slot = () => dom.document.getElementById('hud-message');
const messageShown = () => slot().classList.contains('visible');

// the camera as GameScene sets it: zoom from the short side, centred on Emmy (a little above her), kept inside the world
function pointCamera(game, w, h, player) {
  const wanted = Math.min(Math.max(Math.min(w, h) / CAMERA.targetShortSide, CAMERA.minZoom), CAMERA.maxZoom);
  const zoom = Math.max(wanted, Math.max(w / WORLD.width, h / WORLD.height));
  const viewW = w / zoom;
  const viewH = h / zoom;
  const x = Math.min(Math.max(player.x - viewW / 2, 0), WORLD.width - viewW);
  const y = Math.min(Math.max(player.y - CAMERA.followOffsetY - viewH / 2, 0), WORLD.height - viewH);
  Object.assign(game.scene.camera, { width: w, height: h, zoom, worldView: { x, y } });
}

// A real game, with the UI stand-in told how to measure the real HUD message (as MissionUI does).
function launchGame(bottom) {
  const game = launch(storageWith({}));
  games.push(game);
  game.ui.hudMessageBottom = () => (messageShown() ? bottom : 0);
  return game;
}

// Delivers the first job with Emmy ending on the customer; returns once the new-job notice and arrow are up
function toNewJob(game, screen) {
  accept(game, M1);
  game.at(pick(M1));
  const at = cust(M1);
  pointCamera(game, screen.w, screen.h, at);
  game.at(at);
  for (let i = 0; i < DONE_FRAMES; i += 1) {
    pointCamera(game, screen.w, screen.h, at);
    game.at(at, 100);
  }
  return at;
}

describe('arrowTopMargin: the margin is 120 px, as before, unless a HUD message needs clearing', () => {
  const margin = (ui, w, h, m = { t: 120, b: 170 }) => MissionSystem.prototype.arrowTopMargin.call({ ui }, m, w, h);

  test('no message, no measuring method, or a message that cannot be measured: exactly 120', () => {
    assert.equal(margin({ hudMessageBottom: () => 0 }, 740, 360), 120);
    assert.equal(margin({}, 740, 360), 120);
    assert.equal(margin({ hudMessageBottom: () => NaN }, 740, 360), 120);
    assert.equal(margin({ hudMessageBottom: () => undefined }, 740, 360), 120);
    assert.equal(margin({ hudMessageBottom: () => -5 }, 740, 360), 120);
  });

  test('a message showing: its bottom edge + 8 px gap + the arrow\'s 21 px reach', () => {
    assert.equal(margin({ hudMessageBottom: () => 111 }, 740, 360), 140);
    assert.equal(margin({ hudMessageBottom: () => 117 }, 1366, 768), 146);
    assert.equal(margin({ hudMessageBottom: () => 103 }, 390, 844), 132);
    assert.equal(margin({ hudMessageBottom: () => 121 }, 360, 740), 150);
  });

  test('a message that ends above the old margin never makes the margin smaller', () => {
    assert.equal(margin({ hudMessageBottom: () => 60 }, 740, 360), 120); // 60 + 29 = 89 < 120
    assert.equal(margin({ hudMessageBottom: () => 91 }, 740, 360), 120); // exactly 120
    assert.equal(margin({ hudMessageBottom: () => 92 }, 740, 360), 121);
  });

  test('it asks about the real screen size', () => {
    const asked = [];
    margin({ hudMessageBottom: (w, h) => (asked.push([w, h]), 111) }, 844, 390);
    assert.deepEqual(asked, [[844, 390]]);
  });

  test('a short screen keeps a usable window above the 170 px bottom margin (and never goes below 120)', () => {
    assert.equal(margin({ hudMessageBottom: () => 150 }, 740, 330), 152); // 330 - 170 - 8
    assert.equal(margin({ hudMessageBottom: () => 111 }, 568, 320), 140); // fits: 320 - 170 - 8 = 142
    assert.equal(margin({ hudMessageBottom: () => 150 }, 568, 320), 142); // capped
    assert.equal(margin({ hudMessageBottom: () => 150 }, 740, 290), 120); // no room: the old margin
    assert.equal(margin({ hudMessageBottom: () => 150 }, 740, 250), 120); // never below the old margin
  });

  test('it takes the bottom margin it is given (the 170 px stays the arrow\'s own)', () => {
    assert.equal(margin({ hudMessageBottom: () => 190 }, 740, 400, { t: 120, b: 200 }), 192); // wanted 219, capped at 400 - 200 - 8
    assert.equal(margin({ hudMessageBottom: () => 150 }, 740, 400, { t: 120, b: 200 }), 179); // wanted 179, under the cap
  });

  test('if measuring throws: the old margin, one warning, no error', () => {
    const ui = {
      hudMessageBottom: () => {
        throw new Error('measure boom');
      },
    };
    const self = { ui };
    for (let i = 0; i < 5; i += 1) assert.equal(MissionSystem.prototype.arrowTopMargin.call(self, { t: 120, b: 170 }, 740, 360), 120);
    const warnings = console.warn.mock.calls.filter(({ arguments: args }) => String(args[0]).includes('could not be kept clear'));
    assert.equal(warnings.length, 1, 'said once, not every frame');
  });
});

describe('after a delivery the arrow no longer touches the new-job notice', () => {
  SCREENS.forEach((screen) => {
    test(`${screen.name}: the notice and the arrow come up together, and the arrow's visible shape clears the notice by at least 8 px`, () => {
      const game = launchGame(screen.bottom);
      toNewJob(game, screen);
      assert.equal(slot().textContent, getJobNotice(M2.id));
      assert.equal(messageShown(), true);
      assert.ok(game.ui.arrow, 'the arrow is showing');
      assert.equal(game.ui.arrow.kind, 'offer');
      // the arrow's topmost point is its centre minus its reach; the notice ends at screen.bottom
      const gap = game.ui.arrow.y - ARROW_REACH - screen.bottom;
      assert.ok(gap >= 8 - 1e-9, `gap ${gap.toFixed(1)} px`);
    });

    test(`${screen.name}: it used to overlap (the old 120 px margin put the arrow's top at 99)`, () => {
      // documents the bug the margin fixes: with the old margin the arrow's top (centre - reach) is above the notice's bottom
      assert.ok(120 - ARROW_REACH < screen.bottom + 8);
    });
  });

  test('the arrow stays inside the screen on every size, left and right margins untouched', () => {
    SCREENS.forEach((screen) => {
      const game = launchGame(screen.bottom);
      toNewJob(game, screen);
      const { x, y } = game.ui.arrow;
      assert.ok(x >= 36 - 1e-9 && x <= screen.w - 36 + 1e-9, `${screen.name} x ${x}`);
      assert.ok(y >= 120 - 1e-9 && y <= screen.h - 170 + 1e-9, `${screen.name} y ${y}`);
    });
  });
});

describe('the arrow\'s direction, target and behaviour are unchanged', () => {
  test('with the notice up and after it has gone, the arrow points the same way at the same target', () => {
    SCREENS.forEach((screen) => {
      const game = launchGame(screen.bottom);
      const at = toNewJob(game, screen);
      const withNotice = { ...game.ui.arrow };
      mock.timers.tick(JOB_NOTICE_MS);
      assert.equal(messageShown(), false);
      pointCamera(game, screen.w, screen.h, at);
      game.at(at, 16);
      const without = { ...game.ui.arrow };
      assert.equal(withNotice.kind, without.kind, screen.name);
      assert.equal(withNotice.angle, without.angle, `${screen.name}: the angle is the same to the last bit`);
    });
  });

  test('with no message, the arrow is exactly where it was before this stage (margin 120)', () => {
    const screen = SCREENS[1];
    const game = launchGame(screen.bottom);
    const at = toNewJob(game, screen);
    mock.timers.tick(JOB_NOTICE_MS);
    pointCamera(game, screen.w, screen.h, at);
    game.at(at, 16);
    const arrow = game.ui.arrow;
    assert.ok(arrow.y >= 120 - 1e-9, 'the old top margin still holds');
    // with the message gone the arrow can sit up on its old 120 px line
    const before = launchGame(screen.bottom);
    before.ui.hudMessageBottom = undefined; // the way it was before: no measuring
    toNewJob(before, screen);
    pointCamera(before, screen.w, screen.h, cust(M1));
    before.at(cust(M1), 16);
    assert.deepEqual(before.ui.arrow, arrow);
  });

  test('the notice\'s wording and 4.5 second duration are unchanged', () => {
    const game = launchGame(NOTICE_BOTTOM.landscape);
    toNewJob(game, SCREENS[1]);
    assert.equal(slot().textContent, 'New job at Bola Bakery! Follow the ! to find it.');
    assert.equal(JOB_NOTICE_MS, 4500);
    mock.timers.tick(4499);
    assert.equal(messageShown(), true);
    mock.timers.tick(1);
    assert.equal(messageShown(), false);
  });

  test('the objective arrow for the other states (pickup, deliver) is unaffected when no message is up', () => {
    const game = launchGame(NOTICE_BOTTOM.landscape);
    accept(game, M1);
    pointCamera(game, 740, 360, FAR);
    game.at(FAR, 16);
    assert.equal(game.ui.arrow?.kind, 'pickup');
    game.at(pick(M1));
    pointCamera(game, 740, 360, FAR);
    game.at(FAR, 16);
    assert.equal(game.ui.arrow?.kind, 'deliver');
  });

  test('the arrow moves down only while a message is showing, and it is up on its old line the moment the message goes', () => {
    const screen = SCREENS[1];
    const game = launchGame(screen.bottom);
    const at = toNewJob(game, screen);
    const yWith = game.ui.arrow.y;
    mock.timers.tick(JOB_NOTICE_MS);
    pointCamera(game, screen.w, screen.h, at);
    game.at(at, 16);
    assert.ok(game.ui.arrow.y <= yWith, 'it never goes lower without the message');
  });

  test('a message appearing and going again never leaves the arrow in a different place', () => {
    const screen = SCREENS[1];
    const game = launchGame(screen.bottom);
    const at = toNewJob(game, screen);
    mock.timers.tick(JOB_NOTICE_MS);
    pointCamera(game, screen.w, screen.h, at);
    game.at(at, 16);
    const quiet = { ...game.ui.arrow };
    hud.showMessage('Something', 1000);
    pointCamera(game, screen.w, screen.h, at);
    game.at(at, 16);
    mock.timers.tick(1000);
    pointCamera(game, screen.w, screen.h, at);
    game.at(at, 16);
    assert.deepEqual(game.ui.arrow, quiet);
  });
});

describe('MissionUI.hudMessageBottom (the real measuring code)', () => {
  function build() {
    const local = installFakeDom();
    const built = new MissionUI({ hud: local.hud, app: local.app });
    return { local, built, message: local.hud.querySelector('#hud-message') };
  }
  const lay = (message, top, height) => {
    message.offsetTop = top;
    message.offsetHeight = height;
  };

  test('0 while the message is not showing; its layout bottom (top + height) while it is', () => {
    const { local, built, message } = build();
    local.restore();
    dom = installFakeDom(); // for afterEach
    lay(message, 64, 47);
    assert.equal(built.hudMessageBottom(740, 360), 0);
    message.classList.add('visible');
    message.textContent = 'New job';
    assert.equal(built.hudMessageBottom(740, 360), 111);
    message.classList.remove('visible');
    assert.equal(built.hudMessageBottom(740, 360), 0);
    built.destroy();
  });

  test('no layout (nothing measurable) is 0, never NaN', () => {
    const { local, built, message } = build();
    local.restore();
    dom = installFakeDom();
    message.classList.add('visible');
    message.textContent = 'x';
    assert.equal(built.hudMessageBottom(740, 360), 0);
    built.destroy();
  });

  test('a page with no message element is fine', () => {
    const { local, built, message } = build();
    local.restore();
    dom = installFakeDom();
    message.parentNode.children.length = 0;
    assert.equal(built.hudMessageBottom(740, 360), 0);
    built.destroy();
  });

  test('it is measured once, not every frame, and again when the text or the screen size changes', () => {
    const { local, built, message } = build();
    local.restore();
    dom = installFakeDom();
    let reads = 0;
    let top = 64;
    Object.defineProperty(message, 'offsetTop', { get: () => ((reads += 1), top) });
    message.offsetHeight = 47;
    message.classList.add('visible');
    message.textContent = 'New job at Bola Bakery! Follow the ! to find it.';
    for (let frame = 0; frame < 60; frame += 1) assert.equal(built.hudMessageBottom(740, 360), 111);
    assert.equal(reads, 1);
    message.textContent = 'A different message';
    top = 70;
    assert.equal(built.hudMessageBottom(740, 360), 117);
    assert.equal(reads, 2);
    top = 80;
    assert.equal(built.hudMessageBottom(741, 360), 127); // the screen changed (rotated, resized)
    assert.equal(reads, 3);
    built.destroy();
  });

  test('a top safe-area inset moves the HUD down, and the margin with it', () => {
    const { local, built, message } = build();
    local.restore();
    dom = installFakeDom();
    message.classList.add('visible');
    message.textContent = 'inset';
    lay(message, 64 + 24, 47); // the HUD's top padding grew by 24 px
    const bottom = built.hudMessageBottom(740, 360);
    assert.equal(bottom, 135);
    assert.equal(MissionSystem.prototype.arrowTopMargin.call({ ui: built }, { t: 120, b: 170 }, 740, 360), 164);
    built.destroy();
  });
});

describe('style.css: the arrow and the message are styled exactly as before', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const rule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, selector);
    return css.slice(start, css.indexOf('}', start));
  };

  test('.mission-arrow keeps its position, size, layer and touch behaviour', () => {
    const arrow = rule('.mission-arrow');
    assert.match(arrow, /position: absolute;/);
    assert.match(arrow, /z-index: 11;/);
    assert.match(arrow, /width: 44px;/);
    assert.match(arrow, /height: 44px;/);
    assert.match(arrow, /pointer-events: none;/);
  });

  test('.hud-message keeps its look and fade, and the HUD keeps its 8 px spacing (the gap the arrow keeps)', () => {
    const message = rule('.hud-message');
    assert.match(message, /padding: 0\.6em 1em;/);
    assert.match(message, /border: 2px solid var\(--royal-light\);/);
    assert.match(message, /transition: opacity 0\.4s ease, transform 0\.4s ease;/);
    assert.match(rule('.hud-message.visible'), /transform: none;/);
    assert.match(rule('#hud'), /gap: 8px;/);
    assert.match(rule('#hud'), /pointer-events: none;/);
  });
});
