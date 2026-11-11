// The HUD message shown when the game loads, chosen from the player's RESTORED mission progress.
// Text and rules only: no Phaser, no DOM, and nothing is saved.
//
// It looks at the same thing the objective arrow does (selectNextObjective), never at money, coins
// or where the save came from, and it must be asked AFTER MissionSystem has restored (and repaired)
// the saved progress: GameScene does that.
//
//   A  the first mission is the next job  -> the new-player welcome (it is still accurate: nothing delivered yet)
//   B  a job is in progress               -> "Welcome back" (pickup or delivery stage)
//   C  a LATER job is waiting             -> no message: the job's marker and arrow and the offer card say it
//   D  every job is delivered             -> "Welcome back", with what is left to do
//
// The message goes out through the HUD message (gameState.say), the same single slot the new-job notice
// uses: a later message simply replaces an earlier one, so nothing is queued.

import gameState from '../state/GameState.js';
import { OBJECTIVE, selectNextObjective } from './missionSequence.js';

export const WELCOME_MESSAGES = Object.freeze({
  firstMission: Object.freeze({
    text: 'Welcome to Orisun Close, Emmy! Collect coins, or follow the ! to Lagoon Mart for your first delivery.',
    ms: 8000,
  }),
  jobInProgress: Object.freeze({
    text: 'Welcome back, Emmy! Your delivery is still on.',
    ms: 4500,
  }),
  allJobsDone: Object.freeze({
    text: 'Welcome back, Emmy! Every job is done. Visit any shop to replay one.',
    ms: 6000,
  }),
});

// The welcome for this progress, as { text, ms }, or null when none should be shown.
// order: the mission ids in order. progress: id -> { state, runId, completed, lastPaidRunId } (MissionSystem.progressSnapshot()).
export function getWelcome(order, progress) {
  if (!Array.isArray(order) || order.length === 0) return null;
  const objective = selectNextObjective(order, progress);
  switch (objective.type) {
    case OBJECTIVE.ACTIVE:
      return WELCOME_MESSAGES.jobInProgress;
    case OBJECTIVE.NEW_JOB:
      return objective.missionId === order[0] ? WELCOME_MESSAGES.firstMission : null;
    default:
      return WELCOME_MESSAGES.allJobsDone;
  }
}

// Shows the welcome for a restored MissionSystem, once. Returns true if a message was sent.
// A failure here (reading the progress, or the HUD) is logged and never reaches the caller, so it can
// never interrupt starting the game. It is not retried and has no other way of reaching the player.
export function announceWelcome(missions, say = (text, ms) => gameState.say(text, ms)) {
  let welcome = null;
  try {
    welcome = getWelcome(missions.order, missions.progressSnapshot());
  } catch (error) {
    console.warn('[Welcome] Could not work out the welcome message; starting without one.', error);
    return false;
  }
  if (!welcome) return false;
  try {
    say(welcome.text, welcome.ms);
    return true;
  } catch (error) {
    console.warn('[Welcome] The welcome message failed; the game carries on.', error);
    return false;
  }
}
