// Central place for tunable numbers. Change values here, not in the systems.

import { SHEET } from './art/mascot/sheetLayout.js';

export const WORLD = {
  width: 2400,
  height: 1800,
  shoreY: 1664, // where the boardwalk starts
  waterY: 1696, // where the (solid) water starts
  spawn: { x: 850, y: 640 },
};

export const SIDEWALK_WIDTH = 16;

export const PLAYER = {
  speed: 230,
  smoothing: 14, // higher = snappier acceleration
  bodyWidth: 22, // collision box sits at Emmy's feet
  bodyHeight: 14,
};

// Emmy's sprite sheet. The frame layout comes from the same file the artwork
// preview uses (src/art/mascot/sheetLayout.js), so the two can never disagree.
export const CHARACTER = {
  sheetKey: 'emmy_sheet',
  sheetPath: 'assets/characters/emmy/emmy-sheet.png',
  frameSize: SHEET.frameSize,
  columns: SHEET.columns,
  rows: SHEET.rows,
  feet: SHEET.feet, // where his feet are inside a frame (frame pixels)
  rowOfView: SHEET.rowOfView, // front / back / side rows
  animations: SHEET.animations, // idle + walk frame columns and speeds
  scale: 0.5, // a 128px frame is shown at 64 world pixels
  shadowScale: 30 / 36, // the 36px-wide shadow ellipse is shown 30px wide
};

export const CAMERA = {
  targetShortSide: 460, // world units visible along the screen's shorter side
  minZoom: 0.8,
  maxZoom: 1.4,
  lerp: 0.12,
  followOffsetY: 28, // aim at Emmy's torso rather than her feet
};

export const BUILDING = {
  roofHeight: 34,
  shadowPad: 8,
  signCenterY: 50,
};

export const ECONOMY = {
  startMoney: 500,
  coinValue: 50,
};

export const FONT_FAMILY = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';