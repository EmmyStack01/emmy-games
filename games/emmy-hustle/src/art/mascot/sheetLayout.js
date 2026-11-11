// Sprite-sheet layout for the Emmy mascot. Used by the preview/export now, and
// by the game's character config later (the game never needs to know how the
// frames were made, only where they are).
//
//   128x128 frames, 8 columns x 4 rows = 1024x512 sheet
//   row 0 = front (facing down)   row 1 = back (facing up)
//   row 2 = side, facing LEFT (right-facing = the same frame flipped at runtime)
//   row 3 = reserved for later (e.g. carrying a package)
//   columns 0-1 = idle, columns 2-7 = walk

export const SHEET = {
  frameSize: 128,
  columns: 8,
  rows: 4,
  feet: { x: 64, y: 122 },
  rowOfView: { front: 0, back: 1, side: 2 },
  animations: {
    idle: { frames: [0, 1], fps: 2 },
    walk: { frames: [2, 3, 4, 5, 6, 7], fps: 10 },
  },
};