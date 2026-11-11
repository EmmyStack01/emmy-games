// The rules for Emmy's Hustle save data. Nothing else.
//
// This file is pure: no Phaser, no browser APIs, no storage, no imports. It only
// answers "what does a valid save look like?", "how do I read an old one?" and
// "is this text a usable save?". Reading and writing localStorage belongs to the
// SaveManager (a later step), so these rules can be tested in plain Node.
//
// The save is completely separate from the joystick settings, which keep their own
// storage key and their own code (src/state/Settings.js).
//
// Save payload, version 1:
//
//   {
//     v: 1,                       // save format version
//     savedAt: 1791720000000,     // ms since epoch, written by the SaveManager (0 = never saved)
//     money: 500,                 // whole naira, 0..MAX_MONEY
//     coins: { collected: { "<coinId>": <ms collected at>, ... } },
//     missions: {
//       "<missionId>": {
//         state: "available" | "pickup" | "deliver",
//         runId: 0,               // accepted jobs so far
//         completed: 0,           // delivered (paid) jobs so far
//         lastPaidRunId: 0,       // the newest run whose reward has been paid
//       }
//     }
//   }
//
// Emmy's position and the "offer" and "done" mission states are never saved.
// In-game money here is the game's own money. It is not real money and not a
// Lagos Life platform currency, and purchases never live in this save.
//
// Reason codes returned when text cannot be used as a save:
//   missing           nothing is stored (not an error; there is nothing to preserve)
//   not-json          the text is not valid JSON
//   not-object        valid JSON, but not a save-shaped object
//   bad-version       the version field is missing or not a whole number >= 1
//   newer-version     written by a newer game: do NOT overwrite it
//   migration-failed  an old save could not be upgraded
//   invalid           right version, but a value breaks the rules
// Everything except "missing" is data worth preserving before it is replaced.

export const SAVE_VERSION = 1;

// All save keys. They deliberately differ from "emmys-hustle:settings:v1".
export const SAVE_KEYS = Object.freeze({
  main: 'emmys-hustle:save',
  backup: 'emmys-hustle:save:backup',
  corrupt: 'emmys-hustle:save:corrupt',
});

export const MAX_MONEY = 1_000_000_000;

// Mission states that may be stored. "offer" and "done" are short-lived screens.
export const MISSION_STATES = Object.freeze(['available', 'pickup', 'deliver']);
const TRANSIENT_STATES = Object.freeze(['offer', 'done']); // read as "available"

// Upgrade steps, keyed by the version they upgrade FROM. Each one is a pure
// function that receives a copy of the save at that version and returns the
// save at version + 1. Example for the day SAVE_VERSION becomes 2:
//   MIGRATIONS = { 1: (old) => ({ ...old, v: 2, upgrades: {} }) }
export const MIGRATIONS = Object.freeze({});

/* ----------------------------------------------------------------- helpers */

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isWholeNumber = (value) => Number.isSafeInteger(value) && value >= 0;
const isTimestamp = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isMoney = (value) => isWholeNumber(value) && value <= MAX_MONEY;
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const fail = (reason, problems = []) => ({ ok: false, reason, problems });

const idList = (name, ids) => {
  const list = Array.isArray(ids) ? ids : ids instanceof Set ? [...ids] : null;
  if (!list) throw new TypeError(`${name} must be an array or a Set of ids`);
  list.forEach((id) => {
    if (typeof id !== 'string' || id === '') throw new TypeError(`${name} must contain only non-empty strings`);
  });
  if (new Set(list).size !== list.length) throw new TypeError(`${name} contains a duplicate id`);
  return list;
};

// The context tells the schema which coins and missions exist right now. It is
// game data, so a mistake in it is a programming error and throws.
function readContext(context) {
  if (!isPlainObject(context)) throw new TypeError('context must be { coinIds, missionIds }');
  return {
    coinIds: new Set(idList('coinIds', context.coinIds)),
    missionIds: idList('missionIds', context.missionIds),
  };
}

const newMissionProgress = () => ({ state: 'available', runId: 0, completed: 0, lastPaidRunId: 0 });

/* ---------------------------------------------------------------- defaults */

// A brand-new game. The caller supplies the starting money (ECONOMY.startMoney)
// so that number stays defined in exactly one place.
export function createDefaultSave(startMoney, missionIds) {
  if (!isMoney(startMoney)) throw new TypeError(`startMoney must be a whole number from 0 to ${MAX_MONEY}`);
  const missions = {};
  idList('missionIds', missionIds).forEach((id) => {
    missions[id] = newMissionProgress();
  });
  return { v: SAVE_VERSION, savedAt: 0, money: startMoney, coins: { collected: {} }, missions };
}

/* -------------------------------------------------------------- validation */

// Checks a save that is already at the current version. Returns
//   { ok: true, save, warnings }   a clean copy (the input is never modified)
//   { ok: false, reason, problems } when it must not be used
//
// Rule of thumb: REPAIR only what is provably harmless (content that no longer
// exists, a run that was already paid, a missing entry for a newly added mission).
// REJECT everything else, so the SaveManager can fall back to the backup instead
// of guessing at what a damaged value should have been.
export function validateSave(data, context) {
  const { coinIds, missionIds } = readContext(context);
  if (!isPlainObject(data)) return fail('not-object', ['the save is not an object']);

  const problems = [];
  const warnings = [];

  if (data.v !== SAVE_VERSION) problems.push(`v must be ${SAVE_VERSION}`);
  if (!isTimestamp(data.savedAt)) problems.push('savedAt must be a number of milliseconds, 0 or more');
  if (!isMoney(data.money)) problems.push(`money must be a whole number from 0 to ${MAX_MONEY}`);

  // coins
  const collected = {};
  if (!isPlainObject(data.coins) || !isPlainObject(data.coins.collected)) {
    problems.push('coins.collected must be an object');
  } else {
    Object.keys(data.coins.collected).forEach((id) => {
      if (!coinIds.has(id)) {
        warnings.push(`unknown coin "${id}" was dropped`);
        return;
      }
      const when = data.coins.collected[id];
      if (isTimestamp(when)) collected[id] = when;
      else problems.push(`coins.collected["${id}"] must be a number of milliseconds, 0 or more`);
    });
  }

  // missions
  const missions = {};
  if (!isPlainObject(data.missions)) {
    problems.push('missions must be an object');
  } else {
    Object.keys(data.missions).forEach((id) => {
      if (!missionIds.includes(id)) warnings.push(`unknown mission "${id}" was dropped`);
    });

    missionIds.forEach((id) => {
      if (!has(data.missions, id)) {
        missions[id] = newMissionProgress(); // a mission added after this save was made
        return;
      }
      const entry = data.missions[id];
      if (!isPlainObject(entry)) {
        problems.push(`missions["${id}"] must be an object`);
        return;
      }

      let ok = true;
      const bad = (message) => {
        problems.push(`missions["${id}"].${message}`);
        ok = false;
      };
      if (typeof entry.state !== 'string' || ![...MISSION_STATES, ...TRANSIENT_STATES].includes(entry.state)) {
        bad('state is not a known mission state');
      }
      if (!isWholeNumber(entry.runId)) bad('runId must be a whole number, 0 or more');
      if (!isWholeNumber(entry.completed)) bad('completed must be a whole number, 0 or more');
      if (!isWholeNumber(entry.lastPaidRunId)) bad('lastPaidRunId must be a whole number, 0 or more');
      if (!ok) return;

      let { state, runId } = entry;
      const { completed, lastPaidRunId } = entry;

      if (TRANSIENT_STATES.includes(state)) {
        warnings.push(`missions["${id}"] had the transient state "${state}"; read as "available"`);
        state = 'available';
      }
      // A paid run can never be newer than the run counter. Raise the counter so a
      // run id is never reused.
      if (lastPaidRunId > runId) {
        warnings.push(`missions["${id}"].runId was behind lastPaidRunId and was raised to match`);
        runId = lastPaidRunId;
      }
      // The reward-safety rule: a run whose reward was already paid can never be
      // resumed, so it can never be paid again.
      if ((state === 'pickup' || state === 'deliver') && runId <= lastPaidRunId) {
        warnings.push(`missions["${id}"] was "${state}" for a run that is already paid; reset to "available"`);
        state = 'available';
      }
      missions[id] = { state, runId, completed, lastPaidRunId };
    });
  }

  Object.keys(data).forEach((key) => {
    if (!['v', 'savedAt', 'money', 'coins', 'missions'].includes(key)) warnings.push(`unknown field "${key}" was dropped`);
  });

  if (problems.length > 0) return fail('invalid', problems);

  return {
    ok: true,
    save: { v: SAVE_VERSION, savedAt: data.savedAt, money: data.money, coins: { collected }, missions },
    warnings,
  };
}

/* -------------------------------------------------------------- migrations */

// Upgrades an older save to `target`, one version at a time. Works on a copy.
// `migrations` and `target` can be replaced in tests; the game uses the defaults.
export function migrateSave(data, migrations = MIGRATIONS, target = SAVE_VERSION) {
  if (!isPlainObject(data)) return fail('not-object', ['the save is not an object']);

  const from = data.v;
  if (!Number.isSafeInteger(from) || from < 1) return fail('bad-version', ['v must be a whole number, 1 or more']);
  if (from > target) return fail('newer-version', [`save version ${from} is newer than this game (${target})`]);

  let current = JSON.parse(JSON.stringify(data));
  for (let v = from; v < target; v += 1) {
    const step = migrations[v];
    if (typeof step !== 'function') return fail('migration-failed', [`no migration from version ${v}`]);

    let next;
    try {
      next = step(current);
    } catch (error) {
      return fail('migration-failed', [`migration from version ${v} threw: ${error && error.message}`]);
    }
    if (!isPlainObject(next) || next.v !== v + 1) {
      return fail('migration-failed', [`migration from version ${v} did not return a version ${v + 1} save`]);
    }
    current = next;
  }
  return { ok: true, data: current, migratedFrom: from < target ? from : null };
}

/* ----------------------------------------------------------- parse / write */

// Turns stored text into a usable save, or says why it cannot be used.
//   { ok: true, save, warnings, migratedFrom }   migratedFrom is null if no upgrade was needed
//   { ok: false, reason, problems }              see the reason codes at the top
export function parseSave(raw, context) {
  if (raw === null || raw === undefined) return fail('missing');
  if (typeof raw !== 'string') return fail('not-json', ['the stored value is not text']);

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return fail('not-json', ['the stored text is not valid JSON']);
  }

  const migrated = migrateSave(data);
  if (!migrated.ok) return migrated;

  const checked = validateSave(migrated.data, context);
  if (!checked.ok) return checked;
  return { ok: true, save: checked.save, warnings: checked.warnings, migratedFrom: migrated.migratedFrom };
}

// Turns a save into text for storage. It validates first and throws rather than
// write something it could not read back (JSON.stringify would turn NaN into null).
export function serializeSave(save, context) {
  const checked = validateSave(save, context);
  if (!checked.ok) throw new Error(`Refusing to write an invalid save: ${checked.problems.join('; ')}`);
  return JSON.stringify(checked.save);
}