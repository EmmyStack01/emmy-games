import { drawMascotFront } from './drawMascotFront.js';
import { drawMascotBack } from './drawMascotBack.js';
import { drawMascotSide } from './drawMascotSide.js';

// 'side' faces left. The right-facing view is that frame flipped horizontally.
export const VIEW_DRAWERS = {
  front: drawMascotFront,
  back: drawMascotBack,
  side: drawMascotSide,
};

// pose: { lift } where lift > 0 is the idle "breath" frame.
export function drawMascot(pen, spec, view = 'front', pose = {}) {
  (VIEW_DRAWERS[view] || drawMascotFront)(pen, spec, pose);
}