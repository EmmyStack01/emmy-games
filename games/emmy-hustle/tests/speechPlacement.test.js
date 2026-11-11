// Stage 4B-2: where the speech bubble goes. The pure rules (src/ui/speechPlacement.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SPEECH_LAYOUT, isAnchorInSafeArea, isShortLandscape, placeSpeechBubble } from '../src/ui/speechPlacement.js';

const VIEW = { viewWidth: 800, viewHeight: 600 };
const BUBBLE = { width: 200, height: 50 };

describe('the approved layout numbers', () => {
  test('100 px above the feet, 12 px side margins, the 120 px top margin', () => {
    assert.equal(SPEECH_LAYOUT.ANCHOR_HEIGHT, 100);
    assert.equal(SPEECH_LAYOUT.MARGIN_X, 12);
    assert.equal(SPEECH_LAYOUT.SAFE_TOP, 120);
    assert.ok(Object.isFrozen(SPEECH_LAYOUT));
  });
});

describe('isAnchorInSafeArea', () => {
  const at = (x, anchorY) => isAnchorInSafeArea({ x, anchorY, ...VIEW });

  test('inside: true', () => {
    assert.equal(at(400, 300), true);
  });
  test('the edges are inclusive: 12 px from the sides, 120 px from the top', () => {
    assert.equal(at(12, 300), true);
    assert.equal(at(788, 300), true);
    assert.equal(at(400, 120), true);
  });
  test('outside: false on every side', () => {
    assert.equal(at(11.9, 300), false);
    assert.equal(at(788.1, 300), false);
    assert.equal(at(400, 119.9), false); // under the HUD
    assert.equal(at(400, 588.1), false);
    assert.equal(at(-50, -50), false);
  });
});

describe('placeSpeechBubble: above the customer', () => {
  const place = (extra = {}) => placeSpeechBubble({ x: 400, anchorY: 300, feetY: 400, ...BUBBLE, ...VIEW, ...extra });

  test('centred on the customer, its tail reaching the anchor', () => {
    const spot = place();
    assert.equal(spot.left, 300); // 400 - 200 / 2
    assert.equal(spot.top, 241); // 300 - 9 (tail) - 50 (height)
    assert.equal(spot.flipped, false);
    assert.equal(spot.tailX, 100); // the middle of the bubble
  });

  test('follows the customer sideways', () => {
    assert.equal(place({ x: 500 }).left, 400);
  });
});

describe('placeSpeechBubble: horizontal clamping', () => {
  const place = (x, extra = {}) => placeSpeechBubble({ x, anchorY: 300, feetY: 400, ...BUBBLE, ...VIEW, ...extra });

  test('never closer than 12 px to the left edge, and the tail still points at the customer', () => {
    const spot = place(5);
    assert.equal(spot.left, 12);
    assert.equal(spot.tailX, 16); // as far left as the rounded corner allows
  });

  test('never closer than 12 px to the right edge', () => {
    const spot = place(795);
    assert.equal(spot.left, 800 - 12 - 200);
    assert.equal(spot.tailX, 184);
  });

  test('a tail position between the two ends follows the customer', () => {
    const spot = place(120); // wants left = 20: inside, so no clamping
    assert.equal(spot.left, 20);
    assert.equal(spot.tailX, 100);
    const clamped = place(60); // wants left = -40: clamped to 12, so the tail sits at 60 - 12
    assert.equal(clamped.left, 12);
    assert.equal(clamped.tailX, 48);
  });

  test('device safe-area insets are added to the margins', () => {
    const insets = { top: 0, right: 34, bottom: 21, left: 47 };
    assert.equal(place(5, { insets }).left, 12 + 47);
    assert.equal(place(795, { insets }).left, 800 - 12 - 34 - 200);
  });

  test('a bubble wider than the space is pinned to the left margin instead of going negative', () => {
    assert.equal(place(400, { width: 900 }).left, 12);
  });
});

describe('placeSpeechBubble: flipping below the customer', () => {
  const place = (anchorY, feetY, extra = {}) => placeSpeechBubble({ x: 400, anchorY, feetY, ...BUBBLE, ...VIEW, ...extra });

  test('stays above while it fits under the 120 px top margin', () => {
    assert.equal(place(179, 279).flipped, false); // top = 179 - 9 - 50 = 120
    assert.equal(place(179, 279).top, 120);
  });

  test('flips below the feet, tail pointing up, when it would reach into the top margin', () => {
    const spot = place(178, 278); // top would be 119
    assert.equal(spot.flipped, true);
    assert.equal(spot.top, 287); // 278 (feet) + 9 (tail)
  });

  test('a flipped bubble is still kept out of the top margin', () => {
    assert.equal(place(10, 60).top, 120);
  });

  test('a bubble near the bottom is pulled back inside the bottom margin', () => {
    assert.equal(place(700, 800).top, 600 - 12 - 50);
    assert.equal(place(700, 800, { insets: { bottom: 21 } }).top, 600 - 12 - 21 - 50);
  });
});

// ---------------------------------------------------------------------------------------------
// Stage 4E-1. A greeting needs a bubble that genuinely FITS; and on a short landscape screen the
// bubble keeps clear of the joystick. (Automated arithmetic: no browser, no real device.)
// ---------------------------------------------------------------------------------------------

const MEASURED = { width: 240, height: 58 }; // a two-line bubble, as the browser measures it
const NOTCH = { top: 0, right: 47, bottom: 21, left: 47 };
// The joystick's touch circle on a short landscape screen: 132 px across, 4 px from the corner.
const joystickAt = (side, viewWidth, viewHeight, size = 132) => ({
  cx: side === 'right' ? viewWidth - 4 - size / 2 : 4 + size / 2,
  cy: viewHeight - 4 - size / 2,
  r: size / 2,
});
// the distance from the circle's centre to the bubble's rectangle
const distanceToJoystick = (spot, { width, height }, joystick) => {
  const nearestX = Math.min(Math.max(joystick.cx, spot.left), spot.left + width);
  const nearestY = Math.min(Math.max(joystick.cy, spot.top), spot.top + height);
  return Math.hypot(nearestX - joystick.cx, nearestY - joystick.cy);
};
const CLEAR = (joystick) => joystick.r + SPEECH_LAYOUT.JOYSTICK_CLEARANCE - 1e-6;

describe('4E-1: short landscape is the 480 px landscape-phone breakpoint', () => {
  test('wider than tall, and at most 480 px tall', () => {
    assert.equal(SPEECH_LAYOUT.SHORT_LANDSCAPE_MAX_HEIGHT, 480);
    assert.equal(isShortLandscape(740, 360), true);
    assert.equal(isShortLandscape(568, 320), true);
    assert.equal(isShortLandscape(800, 480), true); // 480 is included
    assert.equal(isShortLandscape(800, 481), false);
    assert.equal(isShortLandscape(1366, 768), false);
  });

  test('portrait and square screens are never short landscape, even when they are short', () => {
    assert.equal(isShortLandscape(390, 844), false);
    assert.equal(isShortLandscape(360, 480), false); // portrait, though only 480 tall
    assert.equal(isShortLandscape(400, 400), false); // CSS calls a square screen portrait
  });
});

describe('4E-1: a bubble that fits, for customers level with or north of Emmy (740 x 360, zoom 0.8)', () => {
  // Emmy's feet are at about y = 202 there; a customer's anchor is 80 px (100 world px) above their feet.
  const SHORT = { viewWidth: 740, viewHeight: 360 };
  const at = (feetY, extra = {}) => placeSpeechBubble({ x: 370, anchorY: feetY - 80, feetY, ...MEASURED, ...SHORT, ...extra });

  test('level with Emmy: the anchor is at the top margin, there is no room above, so the bubble goes below', () => {
    const spot = at(202);
    assert.equal(spot.fits, true);
    assert.equal(spot.flipped, true);
    assert.equal(spot.top, 211); // feet + 9 (tail)
    assert.equal(spot.left, 250);
  });

  test('slightly north of Emmy: the old anchor check said no; a bubble below the customer fits', () => {
    [186, 160, 150, 120].forEach((feetY) => {
      assert.equal(isAnchorInSafeArea({ x: 370, anchorY: feetY - 80, ...SHORT }), false, `old rule rejects feet at ${feetY}`);
      const spot = at(feetY);
      assert.equal(spot.fits, true, `feet at ${feetY}`);
      assert.equal(spot.flipped, true);
      assert.equal(spot.top, feetY + 9);
    });
  });

  test('south of Emmy there is room above, so the bubble stays above', () => {
    const spot = at(300);
    assert.equal(spot.fits, true);
    assert.equal(spot.flipped, false);
    assert.equal(spot.top, 153); // anchor 220 - 9 - 58
  });

  test('a customer whose feet are under the HUD margin is not greeted: the bubble below would reach into it', () => {
    assert.equal(at(111).fits, true); // the bubble's top edge is exactly at the 120 px margin
    assert.equal(at(110.9).fits, false);
    assert.equal(at(100).fits, false);
    assert.equal(at(0).fits, false);
  });

  test('it is not just a feet check: with the anchor and feet both on screen there can still be no room for the bubble', () => {
    // 568 x 320: above would reach into the top margin, below would reach past the bottom margin
    const view = { viewWidth: 568, viewHeight: 320 };
    const spot = placeSpeechBubble({ x: 284, anchorY: 170, feetY: 250, ...MEASURED, ...view });
    assert.equal(isAnchorInSafeArea({ x: 284, anchorY: 170, ...view }), true); // the old rule would have greeted
    assert.equal(spot.fits, false);
  });

  test('the bottom safe-area inset counts: a bubble that fits without it can fail to fit with it', () => {
    // below the customer the bubble's top edge would be 271; the lowest it may go is 360 - 12 - 58 = 290
    assert.equal(at(262).fits, true);
    // with a 21 px bottom inset the lowest drops to 269, and above would reach into the top margin
    assert.equal(at(262, { insets: { bottom: 21 } }).fits, false);
  });

  test('a customer outside the side margins (plus the side insets) is not greeted', () => {
    assert.equal(placeSpeechBubble({ x: 11.9, anchorY: 200, feetY: 280, ...MEASURED, ...SHORT }).fits, false);
    assert.equal(placeSpeechBubble({ x: 728.1, anchorY: 200, feetY: 280, ...MEASURED, ...SHORT }).fits, false);
    assert.equal(placeSpeechBubble({ x: 12, anchorY: 200, feetY: 280, ...MEASURED, ...SHORT }).fits, true);
    // a left inset of 47 moves the margin to 59
    assert.equal(placeSpeechBubble({ x: 40, anchorY: 200, feetY: 280, ...MEASURED, ...SHORT, insets: NOTCH }).fits, false);
    assert.equal(placeSpeechBubble({ x: 59, anchorY: 200, feetY: 280, ...MEASURED, ...SHORT, insets: NOTCH }).fits, true);
  });

  test('portrait: the same rules, and customers well inside the screen all fit', () => {
    const portrait = { viewWidth: 390, viewHeight: 844 };
    [200, 300, 424, 600, 800].forEach((feetY) => {
      const spot = placeSpeechBubble({ x: 195, anchorY: feetY - 87, feetY, ...MEASURED, ...portrait });
      assert.equal(spot.fits, true, `feet at ${feetY}`);
    });
    assert.equal(placeSpeechBubble({ x: 195, anchorY: 13, feetY: 100, ...MEASURED, ...portrait }).fits, false); // under the HUD
  });
});

describe('4E-1: keeping clear of the joystick (short landscape)', () => {
  const SHORT = { viewWidth: 740, viewHeight: 360 };

  test('right joystick: a bubble that would sit over it slides left, its tail still on the customer', () => {
    const joystick = joystickAt('right', 740, 360);
    const args = { x: 520, anchorY: 260, feetY: 340, ...MEASURED, ...SHORT };
    const without = placeSpeechBubble(args);
    assert.ok(distanceToJoystick(without, MEASURED, joystick) < CLEAR(joystick), 'without avoidance it overlaps (this is the bug)');
    const spot = placeSpeechBubble({ ...args, joystick });
    assert.equal(spot.fits, true);
    assert.ok(distanceToJoystick(spot, MEASURED, joystick) >= CLEAR(joystick), 'with avoidance it is clear');
    assert.ok(spot.left < without.left);
    assert.equal(spot.top, without.top); // above stays above: only sideways
    assert.equal(spot.flipped, false);
    assert.ok(Math.abs(spot.left + spot.tailX - 520) < 1e-9, 'the tail still points at the customer');
    assert.ok(spot.tailX >= SPEECH_LAYOUT.TAIL_INSET && spot.tailX <= MEASURED.width - SPEECH_LAYOUT.TAIL_INSET);
  });

  test('left joystick: the mirror image, sliding right', () => {
    const joystick = joystickAt('left', 740, 360);
    const args = { x: 220, anchorY: 260, feetY: 340, ...MEASURED, ...SHORT };
    const without = placeSpeechBubble(args);
    assert.ok(distanceToJoystick(without, MEASURED, joystick) < CLEAR(joystick));
    const spot = placeSpeechBubble({ ...args, joystick });
    assert.equal(spot.fits, true);
    assert.ok(distanceToJoystick(spot, MEASURED, joystick) >= CLEAR(joystick));
    assert.ok(spot.left > without.left);
    assert.ok(Math.abs(spot.left + spot.tailX - 220) < 1e-9);
  });

  test('left and right are exact mirror images of each other', () => {
    for (let x = 20; x <= 720; x += 20) {
      for (let feetY = 100; feetY <= 440; feetY += 20) {
        const right = placeSpeechBubble({ x, anchorY: feetY - 80, feetY, ...MEASURED, ...SHORT, joystick: joystickAt('right', 740, 360) });
        const left = placeSpeechBubble({ x: 740 - x, anchorY: feetY - 80, feetY, ...MEASURED, ...SHORT, joystick: joystickAt('left', 740, 360) });
        assert.equal(left.fits, right.fits, `fits at x=${x}, feet=${feetY}`);
        assert.equal(left.top, right.top);
        assert.equal(left.flipped, right.flipped);
        assert.ok(Math.abs(left.left - (740 - right.left - MEASURED.width)) < 1e-9, `left edge at x=${x}, feet=${feetY}`);
      }
    }
  });

  test('a bubble that does not reach the joystick is left exactly where it was', () => {
    const joystick = joystickAt('right', 740, 360);
    const args = { x: 370, anchorY: 120, feetY: 200, ...MEASURED, ...SHORT };
    assert.deepEqual(placeSpeechBubble({ ...args, joystick }), placeSpeechBubble(args));
  });

  test('the clearance is kept: 6 px between the bubble and the joystick circle', () => {
    const joystick = joystickAt('right', 740, 360);
    const spot = placeSpeechBubble({ x: 520, anchorY: 260, feetY: 340, ...MEASURED, ...SHORT, joystick });
    assert.ok(distanceToJoystick(spot, MEASURED, joystick) >= joystick.r + 6 - 1e-6);
  });

  test('when the joystick leaves no room beside the customer, nothing fits (so no greeting starts)', () => {
    // 568 x 320, right joystick: below the customer the bubble would sit on the joystick, and sliding
    // far enough left would leave the tail away from the customer
    const view = { viewWidth: 568, viewHeight: 320 };
    const joystick = joystickAt('right', 568, 320);
    const args = { x: 412, anchorY: 122, feetY: 202, ...MEASURED, ...view };
    assert.equal(placeSpeechBubble(args).fits, true); // fine without the joystick
    const spot = placeSpeechBubble({ ...args, joystick });
    assert.equal(spot.fits, false);
    // ... and a bubble that must be shown anyway (a reply) is moved clear of the joystick, on screen
    assert.ok(distanceToJoystick(spot, MEASURED, joystick) >= CLEAR(joystick));
    assert.ok(spot.left >= 12 && spot.left + MEASURED.width <= 568 - 12);
  });

  test('when no sideways position is clear at all, the bubble stays on screen and nothing fits', () => {
    const view = { viewWidth: 360, viewHeight: 300 };
    const joystick = joystickAt('right', 360, 300);
    const args = { x: 180, anchorY: 120, feetY: 200, ...MEASURED, ...view };
    assert.equal(placeSpeechBubble(args).fits, true);
    const spot = placeSpeechBubble({ ...args, joystick });
    assert.equal(spot.fits, false);
    assert.deepEqual({ left: spot.left, top: spot.top }, { left: placeSpeechBubble(args).left, top: placeSpeechBubble(args).top });
    assert.ok(spot.left >= 12 && spot.left + MEASURED.width <= 360 - 12);
  });

  test('safe-area insets and the joystick together: inside both margins and clear of the circle', () => {
    for (const side of ['left', 'right']) {
      const joystick = joystickAt(side, 740, 360);
      for (let x = 60; x <= 680; x += 10) {
        for (let feetY = 100; feetY <= 400; feetY += 10) {
          const spot = placeSpeechBubble({ x, anchorY: feetY - 80, feetY, ...MEASURED, ...SHORT, insets: NOTCH, joystick });
          if (!spot.fits) continue;
          assert.ok(spot.left >= 12 + NOTCH.left, `left margin, ${side} x=${x} feet=${feetY}`);
          assert.ok(spot.left + MEASURED.width <= 740 - 12 - NOTCH.right, `right margin, ${side} x=${x} feet=${feetY}`);
          assert.ok(spot.top + MEASURED.height <= 360 - 12 - NOTCH.bottom, `bottom margin, ${side} x=${x} feet=${feetY}`);
          assert.ok(spot.top >= SPEECH_LAYOUT.SAFE_TOP);
          assert.ok(distanceToJoystick(spot, MEASURED, joystick) >= CLEAR(joystick), `joystick, ${side} x=${x} feet=${feetY}`);
        }
      }
    }
  });

  test('the avoidance applies at 480 px tall and not at 481 px (the CSS breakpoint)', () => {
    const args = (height) => ({ x: 700, anchorY: 390, feetY: 470, ...MEASURED, viewWidth: 800, viewHeight: height });
    const joystick = (height) => joystickAt('right', 800, height);
    const short = placeSpeechBubble({ ...args(480), joystick: joystick(480) });
    assert.ok(distanceToJoystick(placeSpeechBubble(args(480)), MEASURED, joystick(480)) < CLEAR(joystick(480)), 'it would overlap');
    assert.ok(distanceToJoystick(short, MEASURED, joystick(480)) >= CLEAR(joystick(480)));
    const tall = placeSpeechBubble({ ...args(481), joystick: joystick(481) });
    assert.deepEqual(tall, placeSpeechBubble(args(481))); // 481 px: the joystick is ignored, as before
  });

  test('portrait and square screens ignore the joystick completely (behaviour unchanged)', () => {
    [[390, 844], [360, 740], [400, 400]].forEach(([viewWidth, viewHeight]) => {
      const joystick = joystickAt('right', viewWidth, viewHeight);
      for (let x = 20; x < viewWidth; x += 40) {
        for (let feetY = 100; feetY < viewHeight + 60; feetY += 40) {
          const args = { x, anchorY: feetY - 87, feetY, ...MEASURED, viewWidth, viewHeight };
          assert.deepEqual(placeSpeechBubble({ ...args, joystick }), placeSpeechBubble(args), `${viewWidth}x${viewHeight} x=${x} feet=${feetY}`);
        }
      }
    });
  });
});

describe('4E-1: without a joystick the placement is exactly what it was before', () => {
  // A frozen copy of the placement rules as they were in Stage 4B-2 (before 4E-1).
  function before4E1({ x, anchorY, feetY, width, height, viewWidth, viewHeight, insets = {} }) {
    const { MARGIN_X, SAFE_TOP, MARGIN_BOTTOM, TAIL, TAIL_INSET } = SPEECH_LAYOUT;
    const edge = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const minLeft = MARGIN_X + edge.left;
    const maxLeft = Math.max(minLeft, viewWidth - MARGIN_X - edge.right - width);
    const left = clamp(x - width / 2, minLeft, maxLeft);
    let top = anchorY - TAIL - height;
    const flipped = top < SAFE_TOP;
    if (flipped) top = Math.max(feetY + TAIL, SAFE_TOP);
    top = Math.min(top, viewHeight - MARGIN_BOTTOM - edge.bottom - height);
    const tailX = clamp(x - left, TAIL_INSET, Math.max(TAIL_INSET, width - TAIL_INSET));
    return { left, top, flipped, tailX };
  }

  test('a sweep over screens, sizes, insets and customer positions gives identical left, top, flip and tail', () => {
    let compared = 0;
    const views = [[800, 600], [390, 844], [360, 740], [1024, 768], [1366, 768], [740, 360], [568, 320], [800, 480], [800, 481]];
    for (const [viewWidth, viewHeight] of views) {
      for (const insets of [undefined, NOTCH, { top: 0, right: 0, bottom: 34, left: 0 }]) {
        for (const size of [{ width: 120, height: 44 }, MEASURED, { width: 900, height: 58 }]) {
          for (let x = -20; x <= viewWidth + 20; x += 37) {
            for (let feetY = -40; feetY <= viewHeight + 120; feetY += 29) {
              for (const rise of [60, 87, 100, 140]) {
                const args = { x, anchorY: feetY - rise, feetY, ...size, viewWidth, viewHeight, insets };
                // `fits` is new; every number that was there before is exactly the same, whether or not it fits
                const { fits, ...now } = placeSpeechBubble(args);
                assert.equal(typeof fits, 'boolean');
                assert.deepEqual(now, before4E1(args), JSON.stringify(args));
                compared += 1;
              }
            }
          }
        }
      }
    }
    assert.ok(compared > 20000, `compared ${compared}`);
  });

  test('every placement that fits is inside the margins, under the top margin, and has its tail inside the bubble', () => {
    for (const [viewWidth, viewHeight] of [[800, 600], [390, 844], [740, 360], [568, 320]]) {
      for (let x = 0; x <= viewWidth; x += 13) {
        for (let feetY = 0; feetY <= viewHeight + 100; feetY += 11) {
          const spot = placeSpeechBubble({ x, anchorY: feetY - 80, feetY, ...MEASURED, viewWidth, viewHeight, insets: NOTCH });
          if (!spot.fits) continue;
          assert.ok(spot.left >= 12 + NOTCH.left && spot.left + MEASURED.width <= viewWidth - 12 - NOTCH.right, 'sides');
          assert.ok(spot.top >= SPEECH_LAYOUT.SAFE_TOP && spot.top + MEASURED.height <= viewHeight - 12 - NOTCH.bottom, 'top and bottom');
          assert.ok(spot.tailX >= 16 && spot.tailX <= MEASURED.width - 16, 'tail');
          // above: the bubble ends 9 px over the anchor; below: it starts 9 px under the feet
          if (spot.flipped) assert.equal(spot.top, feetY + 9);
          else assert.equal(spot.top + MEASURED.height + 9, feetY - 80);
        }
      }
    }
  });
});
