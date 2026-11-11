import { SAVE_KEYS, createDefaultSave, parseSave, serializeSave, validateSave } from './saveSchema.js';

// Reads and writes the game save in localStorage, using the rules in saveSchema.js.
// It never throws once constructed: missing, corrupt or unwritable storage just means
// the game carries on (with a console warning) instead of crashing.
//
// It has no Phaser and no browser globals of its own (storage, clock and scheduler are
// handed in), so it can be tested in plain Node. The joystick settings live under a
// different key and are never read or written here.
//
// Loading order:   main save  ->  backup save  ->  brand-new game.
// Never lose progress by accident:
//   * Text that cannot be read as a save is copied into the "corrupt" slot (newest
//     first, last few kept) BEFORE anything can replace it. If that copy cannot be
//     made, saving is switched off for the session rather than overwrite it.
//   * A save written by a NEWER version of the game is never overwritten: saving is
//     switched off for the session.
// Saving writes the previous good main save into the backup key, then the new main.
//
// Missions: a mission (a MissionFlow) is BOUND with bindMission(id, source). From then on
// every save reads its live progress, in the same write as the money and the coins. A
// mission that is not bound is carried through exactly as it was loaded. If a bound
// source fails, or reports something the schema rejects, its last good snapshot is saved
// instead, so money and coins are never lost because of a mission.
//
// What "the same write" guarantees: a save is only ever requested (markDirty) and then
// carried out by a queued task, which runs once the code that made the changes has
// finished. Everything changed in that one stretch of code (mission counters, money,
// coins) is therefore read together into ONE snapshot and stored with ONE setItem. It is
// not a promise about the browser or device being stopped at an arbitrary moment: that
// can still leave the previous snapshot (or, if it happens during the browser's own
// storage write, whatever the browser leaves behind; the backup key exists for that).

const MAX_PRESERVED = 3;
const MAX_PRESERVED_CHARS = 100_000;

export default class SaveManager {
  // storage:  anything with getItem / setItem (localStorage), or null if there is none
  // context:  { coinIds, missionIds } for the schema
  // startMoney: money for a brand-new game
  // now / schedule / log are only replaced in tests. The defaults are wrapped in arrow
  // functions on purpose: browsers throw "Illegal invocation" if queueMicrotask is called
  // as a method of another object (this.schedule(...)), which Node does not.
  constructor({
    storage,
    context,
    startMoney,
    now = () => Date.now(),
    schedule = (task) => queueMicrotask(task),
    log = console,
  }) {
    this.storage = storage || null;
    this.context = context;
    this.startMoney = startMoney;
    this.now = now;
    this.schedule = schedule;
    this.log = log;

    // A bad context (for example two coins with the same id) or start amount is a
    // programming error: fail here, at start-up, so load() and flush() never throw.
    this.current = createDefaultSave(startMoney, context.missionIds);
    if (!validateSave(this.current, context).ok) throw new Error('SaveManager: a new game does not pass the save schema');

    this.source = 'new'; // where the loaded progress came from: 'main' | 'backup' | 'new'
    this.readOnly = false;
    this.readOnlyReason = null;
    this.warnings = [];
    this.preserved = [];

    this.gameState = null;
    this.pending = false;
    this.missionSources = new Map(); // mission id -> live source with toSave()
    this.onProgressChanged = () => this.markDirty();
  }

  /* ------------------------------------------------------------- loading */

  load() {
    this.current = createDefaultSave(this.startMoney, this.context.missionIds);
    this.source = 'new';
    this.readOnly = false;
    this.readOnlyReason = null;
    this.warnings = [];
    this.preserved = [];

    if (!this.storage) return this.lock('no-storage', 'localStorage is not available; progress will not be saved.');

    let mainRaw;
    let backupRaw;
    try {
      mainRaw = this.storage.getItem(SAVE_KEYS.main);
      backupRaw = this.storage.getItem(SAVE_KEYS.backup);
    } catch (error) {
      return this.lock('storage-unreadable', 'localStorage could not be read; progress will not be saved.', error);
    }

    const main = parseSave(mainRaw, this.context);
    const backup = parseSave(backupRaw, this.context);

    if (main.reason === 'newer-version' || backup.reason === 'newer-version') {
      this.lock('newer-version', 'A save from a newer version of the game was found. It will not be overwritten; progress will not be saved.');
    }

    // Keep a copy of anything unreadable before it can be replaced.
    const failed = { main: false, backup: false };
    [['main', mainRaw, main], ['backup', backupRaw, backup]].forEach(([name, raw, result]) => {
      if (result.ok || result.reason === 'missing' || result.reason === 'newer-version') return;
      this.log.warn(`[Save] The ${name} save could not be used (${result.reason}).`, result.problems);
      if (!this.preserve(name, raw, result.reason)) failed[name] = true;
    });

    if (main.ok) {
      this.current = main.save;
      this.source = 'main';
      this.noteWarnings('main', main.warnings);
    } else if (backup.ok) {
      this.current = backup.save;
      this.source = 'backup';
      this.noteWarnings('backup', backup.warnings);
      if (main.reason !== 'missing') this.log.warn('[Save] Restored progress from the backup save.');
    }

    if (failed.main || (failed.backup && this.source === 'new')) {
      this.lock('could-not-preserve', 'Unreadable save data could not be kept safe, so it will not be overwritten; progress will not be saved.');
    }

    // Heal: put the recovered progress back into the main key.
    if (this.source === 'backup' && !this.readOnly) this.writeSave(this.current);

    return this.getStatus();
  }

  getStatus() {
    return {
      source: this.source,
      readOnly: this.readOnly,
      readOnlyReason: this.readOnlyReason,
      warnings: [...this.warnings],
      preserved: [...this.preserved],
    };
  }

  /* ------------------------------------------------- connecting the game */

  // Hands the loaded progress to the game state and starts saving when it changes.
  attach(gameState) {
    this.detach();
    this.gameState = gameState;
    gameState.hydrate({ money: this.current.money, collectedCoins: this.current.coins.collected });
    gameState.on('progress-changed', this.onProgressChanged);
  }

  detach() {
    if (this.gameState) this.gameState.off('progress-changed', this.onProgressChanged);
    this.gameState = null;
  }

  // Asks for a save. Everything that changes in the same moment is written once,
  // right after, so money and coins always land in the same write.
  markDirty() {
    if (this.pending || this.readOnly || !this.gameState) return;
    this.pending = true;
    this.schedule(() => this.flush());
  }

  // Writes the current progress now. Returns true if it was written.
  flush() {
    this.pending = false;
    if (this.readOnly || !this.gameState) return false;
    const { money, collectedCoins } = this.gameState.snapshotProgress();
    return this.writeSave({
      ...this.current,
      savedAt: this.now(),
      money,
      coins: { collected: collectedCoins },
      missions: this.collectMissions(),
    });
  }

  /* ------------------------------------------------------------ missions */

  // The newest known progress of a mission, as a copy: from its live source if one is
  // bound and healthy, otherwise what was loaded or last written. Null for an unknown id.
  getMissionProgress(id) {
    if (!this.context.missionIds.includes(id)) return null;
    return { ...(this.readMissionSource(id) || this.current.missions[id]) };
  }

  // Makes a mission's live progress part of every save. `source` is anything with a
  // toSave() method (a MissionFlow). It replaces any source already bound to that id.
  // Returns false, and logs, if the id is unknown or the source has no toSave().
  bindMission(id, source) {
    if (!this.context.missionIds.includes(id)) {
      this.log.warn(`[Save] Cannot bind "${id}": it is not a known mission.`);
      return false;
    }
    if (!source || typeof source.toSave !== 'function') {
      this.log.warn(`[Save] Cannot bind "${id}": the source has no toSave().`);
      return false;
    }
    this.missionSources.set(id, source);
    return true;
  }

  // Detaches a mission's live source but keeps its last valid snapshot, so later saves still
  // contain that progress (and nothing that happens to the detached source afterwards).
  // If the progress differs from what was last known, a save is requested. If the source
  // fails at this moment, the previous snapshot is kept. Returns true if one was bound.
  unbindMission(id) {
    if (!this.missionSources.has(id)) return false;
    const last = this.readMissionSource(id);
    this.missionSources.delete(id);
    if (!last) return true;

    const changed = JSON.stringify(last) !== JSON.stringify(this.current.missions[id]);
    this.current = { ...this.current, missions: { ...this.current.missions, [id]: last } };
    if (changed) this.markDirty();
    return true;
  }

  // Every mission's progress for the next save: live where a healthy source is bound,
  // otherwise the last known good snapshot.
  collectMissions() {
    const missions = { ...this.current.missions };
    this.missionSources.forEach((_source, id) => {
      const live = this.readMissionSource(id);
      if (live) missions[id] = live;
    });
    return missions;
  }

  // One mission's live progress, checked against the schema on its own. Returns null (and
  // logs) if there is no source, it throws, or what it reports is rejected, so the caller
  // can keep the last good snapshot and the rest of the save is unaffected. Something the
  // schema merely repairs (for example an already-paid run) is used in its repaired form.
  readMissionSource(id) {
    const source = this.missionSources.get(id);
    if (!source) return null;
    try {
      const candidate = { ...this.current, missions: { ...this.current.missions, [id]: source.toSave() } };
      const checked = validateSave(candidate, this.context);
      if (!checked.ok) {
        this.log.warn(`[Save] Mission "${id}" reported progress that was rejected; its last good progress is kept.`, checked.problems);
        return null;
      }
      checked.warnings.forEach((warning) => this.log.warn(`[Save] Mission "${id}": ${warning}`));
      return checked.save.missions[id];
    } catch (error) {
      this.log.warn(`[Save] Mission "${id}" could not be read; its last good progress is kept.`, error);
      return null;
    }
  }

  /* ------------------------------------------------------------- storage */

  writeSave(save) {
    let text;
    try {
      text = serializeSave(save, this.context);
    } catch (error) {
      this.log.warn('[Save] Progress could not be saved.', error);
      return false;
    }
    try {
      // The old main save becomes the backup, but only if it is itself a good save.
      const previous = this.storage.getItem(SAVE_KEYS.main);
      if (previous !== null && parseSave(previous, this.context).ok) this.storage.setItem(SAVE_KEYS.backup, previous);
      this.storage.setItem(SAVE_KEYS.main, text);
      this.current = JSON.parse(text);
      return true;
    } catch (error) {
      this.log.warn('[Save] Progress could not be saved.', error);
      return false;
    }
  }

  // Copies unreadable text into the corrupt slot. Returns true if it is safely kept.
  preserve(name, raw, reason) {
    try {
      const kept = raw.length > MAX_PRESERVED_CHARS ? raw.slice(0, MAX_PRESERVED_CHARS) : raw;
      const entries = this.readPreserved();
      if (!entries.some((entry) => entry.raw === kept)) {
        const entry = { at: this.now(), key: name, reason, raw: kept, truncated: kept.length !== raw.length };
        this.storage.setItem(SAVE_KEYS.corrupt, JSON.stringify({ entries: [entry, ...entries].slice(0, MAX_PRESERVED) }));
      }
      this.preserved.push({ key: name, reason });
      return true;
    } catch (error) {
      this.log.warn(`[Save] Could not keep a copy of the unreadable ${name} save.`, error);
      return false;
    }
  }

  readPreserved() {
    try {
      const data = JSON.parse(this.storage.getItem(SAVE_KEYS.corrupt));
      return data && Array.isArray(data.entries) ? data.entries.filter((entry) => entry && typeof entry.raw === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  /* ------------------------------------------------------------- helpers */

  lock(reason, message, error) {
    this.readOnly = true;
    this.readOnlyReason = reason;
    this.log.warn(`[Save] ${message}`, ...(error ? [error] : []));
    return this.getStatus();
  }

  noteWarnings(name, warnings) {
    warnings.forEach((warning) => {
      this.warnings.push(`${name}: ${warning}`);
      this.log.warn(`[Save] ${name} save: ${warning}`);
    });
  }
}
