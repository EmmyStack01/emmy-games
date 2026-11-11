// The line shown when a NEW job opens up. Text only: no Phaser, no DOM, no mission rules.
//
// Kept apart from missionData.js on purpose (the same way customerDialogue.js is), so mission
// definitions and the tests that pin them are untouched. Keyed by the id of the mission that
// OPENS UP, the same permanent ids used by missionData.js and the save file.
//
// The first mission has no entry: it is open from the start, and the welcome message covers it.
// The line is shown through the HUD message (gameState.say) for JOB_NOTICE_MS.

export const JOB_NOTICE_MS = 4500;

export const JOB_NOTICES = Object.freeze({
  freshFromTheOven: 'New job at Bola Bakery! Follow the ! to find it.',
  suyaForTheHall: 'New job at Waterside Suya Spot! Follow the ! to find it.',
  acrossOrisunClose: 'New job at Ade Mobile Fix! Follow the ! to find it.',
});

// The notice for a mission that has just opened up, or null when there is none (the first mission,
// or an unknown id). It never throws, so a caller in the middle of a state change cannot be
// interrupted by a bad lookup.
export function getJobNotice(missionId) {
  if (typeof missionId !== 'string') return null;
  return Object.hasOwn(JOB_NOTICES, missionId) ? JOB_NOTICES[missionId] : null;
}
