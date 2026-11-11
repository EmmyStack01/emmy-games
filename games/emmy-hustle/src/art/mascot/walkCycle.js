// Walk cycle for the Emmy mascot: 6 frames per view.
//
// Each leg follows a simple gait over a 6-frame loop:
//   stance (foot on the ground, sliding back at a constant speed) for 3.6 frames,
//   then swing (foot lifts and travels forward) for 2.4 frames.
// The two legs are half a cycle apart. The body bobs (low at foot contact, high when
// the legs pass), and each arm swings opposite to the leg on its side.
//
// walkPose(k, view, walk) returns offsets in frame pixels, used by computeLayout():
//   bobDy         the whole upper body moves down by this much
//   legL / legR   { dx, dy } foot offsets (L = screen-left leg; the near leg in the side view)
//   armL / armR   { dx, dy } hand offsets
//   walking       true (the side view then drops its idle "far leg forward" stance)

export const WALK_FRAME_COUNT = 6;
const STANCE = 3.6;

// How far a planted foot travels per frame, in stride units (for the preview's "match feet").
export const STANCE_SPEED = 2 / STANCE;

// Body height per frame: 1 = lowest (foot contact), 0 = highest (legs passing).
const BOB = [1, 0.35, 0, 1, 0.35, 0];

// u = position in the loop (0..6). s: -1 (behind) .. +1 (ahead). h: foot lift 0..1.
function leg(u) {
  if (u < STANCE) return { s: 1 - (2 * u) / STANCE, h: 0 };
  const t = (u - STANCE) / (WALK_FRAME_COUNT - STANCE);
  return { s: -1 + 2 * t, h: Math.sin(Math.PI * t) };
}

export function walkPose(k, view, walk) {
  const i = ((k % WALK_FRAME_COUNT) + WALK_FRAME_COUNT) % WALK_FRAME_COUNT;
  const a = leg(i);
  const b = leg((i + WALK_FRAME_COUNT / 2) % WALK_FRAME_COUNT);
  const bobDy = BOB[i] * walk.bob;

  if (view === 'side') {
    // facing left: ahead = -x
    return {
      walking: true,
      bobDy,
      legL: { dx: -a.s * walk.strideSide, dy: -a.h * walk.footLift },
      legR: { dx: -b.s * walk.strideSide, dy: -b.h * walk.footLift },
      armL: { dx: a.s * walk.armSwing * 2, dy: 0 },
      armR: { dx: b.s * walk.armSwing * 2, dy: 0 },
    };
  }

  // front: walking toward the camera (ahead = down the screen); back: away (ahead = up)
  const dir = view === 'back' ? -1 : 1;
  return {
    walking: true,
    bobDy,
    legL: { dx: 0, dy: dir * a.s * walk.strideFront - a.h * walk.footLift },
    legR: { dx: 0, dy: dir * b.s * walk.strideFront - b.h * walk.footLift },
    armL: { dx: 0, dy: -dir * a.s * walk.armSwing },
    armR: { dx: 0, dy: -dir * b.s * walk.armSwing },
  };
}