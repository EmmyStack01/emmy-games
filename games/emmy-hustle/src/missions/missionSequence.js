// The rules for the ORDER of missions, as pure functions: no Phaser, no storage, no DOM,
// and nothing here ever changes anything. Everything is worked out from
//   order:    the mission ids in unlock order (MISSION_IDS in missionData.js), and
//   progress: saved progress, { [missionId]: { state, runId, completed, lastPaidRunId } },
//             the same shape as `missions` in the save file.
//
// Nothing about unlocking is saved. A mission is unlocked once the one before it has been
// delivered at least once, and `completed` only goes up inside MissionFlow.complete(),
// after the duplicate-reward check. Unlocking a mission never accepts it: the player still
// has to walk to the shop and press Accept.

export const STATUS = Object.freeze({
  LOCKED: 'locked', // the mission before it has not been delivered yet
  NEW: 'new', // unlocked and never delivered: this is the "next job"
  ACTIVE: 'active', // accepted and not delivered yet (pickup or deliver)
  REPEATABLE: 'repeatable', // delivered at least once, and can be played again
});

export const OBJECTIVE = Object.freeze({
  ACTIVE: 'active', // a job is in progress: follow its pickup / deliver stage
  NEW_JOB: 'new-job', // no job in progress: go to the shop of the next new mission
  NONE: 'none', // every mission has been delivered and none is in progress
});

const IN_PROGRESS = ['pickup', 'deliver'];
const whole = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);

function checkOrder(order) {
  if (!Array.isArray(order)) throw new TypeError('order must be an array of mission ids');
  order.forEach((id) => {
    if (typeof id !== 'string' || id === '') throw new TypeError('order must contain only non-empty strings');
  });
  if (new Set(order).size !== order.length) throw new TypeError('order contains a duplicate mission id');
  return order;
}

// The saved entry for a mission, or null. Only the progress object's own keys count.
function entryOf(progress, id) {
  if (progress === null || typeof progress !== 'object') return null;
  if (!Object.prototype.hasOwnProperty.call(progress, id)) return null;
  const entry = progress[id];
  return entry !== null && typeof entry === 'object' ? entry : null;
}

const completedOf = (progress, id) => whole(entryOf(progress, id)?.completed);

// A job counts as in progress only if it is in pickup/deliver for a run that has not been
// paid yet. This is the same rule MissionFlow.restore() applies, so the two never disagree.
function isInProgress(progress, id) {
  const entry = entryOf(progress, id);
  if (!entry || !IN_PROGRESS.includes(entry.state)) return false;
  return whole(entry.runId) > whole(entry.lastPaidRunId);
}

// The first mission is always open; every other one opens when the one before it has been
// delivered at least once. An id that is not in `order` is never unlocked.
export function isUnlocked(order, progress, id) {
  checkOrder(order);
  const index = order.indexOf(id);
  if (index < 0) return false;
  if (index === 0) return true;
  return completedOf(progress, order[index - 1]) >= 1;
}

// locked | new | active | repeatable, or null for an id that is not in `order`.
// A locked mission is reported as locked even if a damaged save says it is in progress.
export function missionStatus(order, progress, id) {
  checkOrder(order);
  if (!order.includes(id)) return null;
  if (!isUnlocked(order, progress, id)) return STATUS.LOCKED;
  if (isInProgress(progress, id)) return STATUS.ACTIVE;
  return completedOf(progress, id) >= 1 ? STATUS.REPEATABLE : STATUS.NEW;
}

// Every unlocked mission that is in progress, in order. At most ONE should ever be: a longer
// list means a damaged save, and the caller keeps the first and resets the rest.
export function getActiveMissionIds(order, progress) {
  checkOrder(order);
  return order.filter((id) => missionStatus(order, progress, id) === STATUS.ACTIVE);
}

export function findActiveMission(order, progress) {
  return getActiveMissionIds(order, progress)[0] ?? null;
}

// What the player should be pointed at right now:
//   1. a job in progress  -> { type: 'active', missionId, stage: 'pickup' | 'deliver' }
//   2. otherwise the first mission, in order, that is unlocked and never delivered
//                         -> { type: 'new-job', missionId }
//   3. otherwise          -> { type: 'none', missionId: null }
// Replays are never "the next job": a job being replayed is just a job in progress.
export function selectNextObjective(order, progress) {
  const activeId = findActiveMission(order, progress);
  if (activeId !== null) {
    return { type: OBJECTIVE.ACTIVE, missionId: activeId, stage: entryOf(progress, activeId).state };
  }
  const newId = order.find((id) => missionStatus(order, progress, id) === STATUS.NEW);
  if (newId !== undefined) return { type: OBJECTIVE.NEW_JOB, missionId: newId };
  return { type: OBJECTIVE.NONE, missionId: null };
}
