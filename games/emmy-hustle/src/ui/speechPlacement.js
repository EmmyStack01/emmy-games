// Where a customer's speech bubble goes on the screen. Pure arithmetic: no DOM, no Phaser, so it
// can be tested on its own. All values are screen (CSS) pixels unless a name says "world".
//
// The bubble sits above the customer, its tail pointing at a spot ANCHOR_HEIGHT world pixels above
// the customer's feet. It stays inside the screen margins. If there is no room above (it would
// reach into the HUD at the top), it flips BELOW the customer, with the tail pointing up.
//
// Stage 4E-1: placeSpeechBubble also says whether the bubble genuinely FITS (`fits`): it has a real
// position above or below the customer, inside the margins, with its tail on the customer, and (on
// a short landscape screen) clear of the virtual joystick. A greeting only starts when it fits.

export const SPEECH_LAYOUT = Object.freeze({
  ANCHOR_HEIGHT: 100, // world px above the customer's feet (scaled by the camera zoom on screen)
  MARGIN_X: 12, // clear space at the left and right edges (plus the device's safe-area inset)
  SAFE_TOP: 120, // the same top margin the objective arrow keeps clear of the HUD
  MARGIN_BOTTOM: 12,
  TAIL: 9, // how far the tail reaches past the bubble's edge
  TAIL_INSET: 16, // the tail stays this far from the bubble's rounded corners
  FALLBACK_WIDTH: 220, // used only when the bubble's real size cannot be measured
  FALLBACK_HEIGHT: 48,
  // A "short landscape" screen: wider than tall and at most this tall. It is the same landscape-phone
  // breakpoint style.css uses (`@media (orientation: landscape) and (max-height: 480px)`); a test
  // keeps the two in step. Only there does the bubble keep clear of the joystick.
  SHORT_LANDSCAPE_MAX_HEIGHT: 480,
  JOYSTICK_CLEARANCE: 6, // empty space kept between the bubble and the joystick's touch circle
});

const NO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Is this a short landscape screen? (Landscape means wider than tall, as in CSS.)
export function isShortLandscape(viewWidth, viewHeight) {
  return viewWidth > viewHeight && viewHeight <= SPEECH_LAYOUT.SHORT_LANDSCAPE_MAX_HEIGHT;
}

// Is the bubble's anchor inside the visible, safe part of the screen?
// (Stage 4E-1: a greeting no longer uses this on its own; see placeSpeechBubble's `fits`.)
export function isAnchorInSafeArea({ x, anchorY, viewWidth, viewHeight }) {
  const { MARGIN_X, SAFE_TOP, MARGIN_BOTTOM } = SPEECH_LAYOUT;
  return x >= MARGIN_X && x <= viewWidth - MARGIN_X && anchorY >= SAFE_TOP && anchorY <= viewHeight - MARGIN_BOTTOM;
}

// The left edge, within [low, high], nearest to `preferred`, at which a bubble of this size (its top
// edge at `top`) stays clear of the joystick circle { cx, cy, r }. Null when no such left edge exists.
// The bubble overlaps the circle when its distance to the centre is under r + clearance, which
// makes the forbidden left edges one open interval, so the answer is the preferred edge or an end of it.
function leftClearOfJoystick({ low, high, preferred, top, width, height, joystick }) {
  if (low > high) return null;
  const reach = joystick.r + SPEECH_LAYOUT.JOYSTICK_CLEARANCE;
  const gap = joystick.cy < top ? top - joystick.cy : joystick.cy > top + height ? joystick.cy - (top + height) : 0;
  if (gap >= reach) return preferred; // the bubble is above or below the circle entirely
  const half = Math.sqrt(reach * reach - gap * gap); // half the circle's width at the bubble's nearest edge
  const blockedFrom = joystick.cx - half - width; // a left edge strictly between these two overlaps it
  const blockedTo = joystick.cx + half;
  if (preferred <= blockedFrom || preferred >= blockedTo) return preferred;
  const options = [];
  if (blockedFrom >= low) options.push(blockedFrom);
  if (blockedTo <= high) options.push(blockedTo);
  if (options.length === 0) return null;
  return options.reduce((best, option) => (Math.abs(option - preferred) < Math.abs(best - preferred) ? option : best));
}

// x: screen x of the customer. anchorY / feetY: screen y of the anchor and of the customer's feet.
// width / height: the bubble's size. joystick: { cx, cy, r } (the joystick's touch circle, screen px) or
// null/undefined. Returns where its top-left corner goes, whether it flipped below the customer,
// where its tail sits along its own width, and `fits` (see the top of this file).
//
// Order of preference: above the customer, then below, each as close to centred on the customer as
// the margins (and, on a short landscape screen, the joystick) allow. When neither fits, the
// result is the long-standing placement (above, or flipped below and pulled back inside the
// margins), moved sideways off the joystick if that is possible, and `fits` is false.
export function placeSpeechBubble({ x, anchorY, feetY, width, height, viewWidth, viewHeight, insets = NO_INSETS, joystick = null }) {
  const { MARGIN_X, SAFE_TOP, MARGIN_BOTTOM, TAIL, TAIL_INSET } = SPEECH_LAYOUT;
  const edge = { ...NO_INSETS, ...insets };

  const minLeft = MARGIN_X + edge.left;
  const maxLeft = Math.max(minLeft, viewWidth - MARGIN_X - edge.right - width);
  const centred = clamp(x - width / 2, minLeft, maxLeft);
  const lowestTop = viewHeight - MARGIN_BOTTOM - edge.bottom - height;
  const tailAt = (left) => clamp(x - left, TAIL_INSET, Math.max(TAIL_INSET, width - TAIL_INSET));

  const avoid = joystick && isShortLandscape(viewWidth, viewHeight) ? joystick : null;
  const customerVisible = x >= minLeft && x <= viewWidth - MARGIN_X - edge.right;

  // A real position: above, then below. Both must sit under the top margin and above the bottom one.
  if (customerVisible) {
    const options = [
      { top: anchorY - TAIL - height, flipped: false },
      { top: feetY + TAIL, flipped: true },
    ];
    // Sideways, the tail must still land on the customer (as far as the rounded corners allow).
    const low = Math.max(minLeft, Math.min(centred, x - width + TAIL_INSET));
    const high = Math.min(maxLeft, Math.max(centred, x - TAIL_INSET));
    for (const option of options) {
      if (option.top < SAFE_TOP || option.top > lowestTop) continue;
      const left = avoid ? leftClearOfJoystick({ low, high, preferred: centred, top: option.top, width, height, joystick: avoid }) : centred;
      if (left === null) continue;
      return { left, top: option.top, flipped: option.flipped, tailX: tailAt(left), fits: true };
    }
  }

  // No real position: the long-standing placement, off the joystick if there is a way.
  let top = anchorY - TAIL - height;
  const flipped = top < SAFE_TOP;
  if (flipped) top = Math.max(feetY + TAIL, SAFE_TOP);
  top = Math.min(top, lowestTop);
  let left = centred;
  if (avoid) {
    const clear = leftClearOfJoystick({ low: minLeft, high: maxLeft, preferred: centred, top, width, height, joystick: avoid });
    if (clear !== null) left = clear;
  }
  return { left, top, flipped, tailX: tailAt(left), fits: false };
}
