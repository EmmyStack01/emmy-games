import fs from 'node:fs/promises';
import path from 'node:path';
import { lstatOrNull } from './fsutil.mjs';

// Temporary directories created next to dist/ by the build. Only names that
// match this pattern are ever created or deleted by the tooling.
export const TEMP_NAME_RE = /^\.build-(staging|previous)-[A-Za-z0-9-]+$/;

export const defaultFsOps = { rename: fs.rename, rm: fs.rm };

export function makeBuildId() {
  return `${process.pid}-${Date.now().toString(36)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Windows reports EPERM/EBUSY/EACCES when antivirus, an indexer or an open
// preview server briefly holds a handle on a folder. Retrying normally clears it.
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

export async function renameWithRetry(fsOps, from, to, { retries = 6, delayMs = 150 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      await fsOps.rename(from, to);
      return;
    } catch (err) {
      if (!RETRYABLE.has(err.code) || attempt >= retries) throw err;
      attempt += 1;
      await sleep(delayMs * attempt);
    }
  }
}

/** Deletes one of OUR temp directories (pattern + location checked first). */
export async function removeTempDir(rootDir, dir, fsOps = defaultFsOps) {
  const abs = path.resolve(dir);
  if (path.dirname(abs) !== path.resolve(rootDir) || !TEMP_NAME_RE.test(path.basename(abs))) {
    throw new Error(`refusing to remove ${abs}: not a build temp directory`);
  }
  const st = await lstatOrNull(abs);
  if (!st) return;
  if (st.isSymbolicLink()) {
    await fs.unlink(abs); // remove the link itself, never what it points to
    return;
  }
  await fsOps.rm(abs, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Replaces finalDir with stagingDir.
 *
 *   1. finalDir  -> .build-previous-<id>     (old output kept safe)
 *   2. stagingDir -> finalDir                (new output goes live)
 *   3. delete .build-previous-<id>
 *
 * If step 2 fails the old output is renamed back and the error is rethrown.
 * Only renames are used, so it behaves the same on Windows and Linux, and the
 * old output is never deleted before the new one is in place.
 */
export async function replaceDirectory({ rootDir, stagingDir, finalDir, id, fsOps = defaultFsOps, retry }) {
  const previousDir = path.join(rootDir, `.build-previous-${id}`);
  const existing = await lstatOrNull(finalDir);
  if (existing && (existing.isSymbolicLink() || !existing.isDirectory())) {
    throw new Error(`${finalDir} exists but is not a regular directory; refusing to replace it.`);
  }

  let movedAside = false;
  if (existing) {
    await renameWithRetry(fsOps, finalDir, previousDir, retry);
    movedAside = true;
  }

  try {
    await renameWithRetry(fsOps, stagingDir, finalDir, retry);
  } catch (err) {
    if (movedAside) {
      try {
        await renameWithRetry(fsOps, previousDir, finalDir, retry);
      } catch (restoreErr) {
        throw new Error(
          `CRITICAL: the new output could not be installed (${err.message}) and the previous dist could not be restored (${restoreErr.message}). ` +
            `The previous output is safe at ${previousDir}. Rename that folder back to "dist" by hand.`
        );
      }
    }
    throw err;
  }

  const warnings = [];
  if (movedAside) {
    try {
      await removeTempDir(rootDir, previousDir, fsOps);
    } catch (err) {
      warnings.push(`Could not delete the old output at ${previousDir} (${err.message}). It is safe to delete by hand.`);
    }
  }
  return { warnings };
}

/**
 * Housekeeping at the start of a build:
 *  - if a crash left dist missing but a .build-previous-* folder exists, restore it
 *  - remove old leftovers from earlier runs (never anything recent: another build may be running)
 */
export async function recoverInterruptedSwap(
  rootDir,
  { finalName = 'dist', fsOps = defaultFsOps, staleMs = 60 * 60 * 1000, now = Date.now() } = {}
) {
  const messages = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  let temps = entries.filter((e) => e.isDirectory() && TEMP_NAME_RE.test(e.name)).map((e) => path.join(rootDir, e.name));
  const finalDir = path.join(rootDir, finalName);

  if (!(await lstatOrNull(finalDir))) {
    const previous = [];
    for (const t of temps.filter((t) => path.basename(t).startsWith('.build-previous-'))) {
      previous.push({ dir: t, mtime: (await fs.stat(t)).mtimeMs });
    }
    if (previous.length > 0) {
      previous.sort((a, b) => b.mtime - a.mtime);
      await renameWithRetry(fsOps, previous[0].dir, finalDir);
      messages.push(`Restored ${finalName}/ from an interrupted earlier build (${path.basename(previous[0].dir)}).`);
      temps = temps.filter((t) => t !== previous[0].dir);
    }
  }

  for (const t of temps) {
    const st = await lstatOrNull(t);
    if (!st) continue;
    if (now - st.mtimeMs >= staleMs) {
      await removeTempDir(rootDir, t, fsOps);
      messages.push(`Removed leftover temporary folder ${path.basename(t)}.`);
    } else {
      messages.push(`Left ${path.basename(t)} in place: it is recent and another build may still be running.`);
    }
  }
  return { messages };
}
