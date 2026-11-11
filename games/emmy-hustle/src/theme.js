// The environment's look. Everything here is chosen to sit next to Emmy's mascot:
// navy outlines like his, cool greens and blue-tinted grey, light from the top-left
// (matching his rim light), and navy-tinted shadows.
//
// Colours are 0xRRGGBB. Change them here to adjust the mood of the whole world.

export const THEME = {
  outline: 0x141830, // same navy as Emmy's outline
  outlineWidth: 2, // buildings
  propOutlineWidth: 1.6, // trees, lamps, stalls, vehicles...

  shadow: 0x0c1030, // navy-tinted shadows
  shadowAlpha: 0.26,

  grass: { base: 0x59ad6a, light: 0x6fc27c, dark: 0x479a5a },
  road: { base: 0x4b5268, light: 0x586079, dark: 0x40475b, dash: 0xf2c14e },
  sidewalk: { base: 0xe0e4ef, line: 0xbec6da },
  plaza: { a: 0xead3a8, b: 0xdfc392, line: 0xc7a672, border: 0xa88556 },
  water: { base: 0x2f8ee6, wave: 0xa6d3ff },
  plank: { base: 0xb88a5f, line: 0x876140, edge: 0x5a3f28 },

  tree: { trunk: 0x7a5030, leaf: 0x2f8f5f, leafLight: 0x4fb078, leafHi: 0x86d4a0 },
  glass: 0xbcd8ff, // window glass
};