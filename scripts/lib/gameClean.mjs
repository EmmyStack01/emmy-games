import fs from 'node:fs/promises';
import path from 'node:path';
import { isInside, lstatOrNull } from './fsutil.mjs';

// If a "dist" folder holds any of these it is almost certainly not build output.
const SOURCE_MARKERS = ['package.json', 'src', 'node_modules', '.git', 'vite.config.mjs', 'vite.config.js', 'tests'];

/**
 * Removes games/<slug>/dist before that game is built.
 *
 * Deliberately paranoid. It refuses unless ALL of these hold:
 *  - the game folder is a direct child of <root>/games (after resolving links)
 *  - the target is exactly <game>/dist and is a real directory (not a symlink)
 *  - the target does not equal, contain or sit inside any protected directory
 *    (the staging directory and the root dist)
 *  - the target holds none of the markers of a source tree (package.json, src, ...)
 *
 * Nothing else is ever deleted, so source files cannot be removed by this step.
 */
export async function cleanGameDist({ rootDir, gameDir, protectedDirs = [] }) {
  const root = await fs.realpath(rootDir);
  const game = await fs.realpath(gameDir);
  if (path.dirname(game) !== path.join(root, 'games')) {
    throw new Error(`refusing to clean: ${gameDir} is not a direct child of ${path.join(root, 'games')}`);
  }
  const target = path.join(game, 'dist');
  if (path.basename(target) !== 'dist' || path.dirname(target) !== game) {
    throw new Error('refusing to clean: target is not <game>/dist');
  }

  const st = await lstatOrNull(target);
  if (!st) return { removed: false };
  if (st.isSymbolicLink()) throw new Error(`refusing to clean: ${target} is a symbolic link`);
  if (!st.isDirectory()) throw new Error(`refusing to clean: ${target} is not a directory`);

  for (const protectedDir of protectedDirs) {
    const p = path.resolve(protectedDir);
    if (target === p || isInside(p, target) || isInside(target, p)) {
      throw new Error(`refusing to clean: ${target} overlaps the protected directory ${p}`);
    }
  }

  const names = await fs.readdir(target);
  const marker = SOURCE_MARKERS.find((m) => names.includes(m));
  if (marker) {
    throw new Error(`refusing to clean: ${target} contains "${marker}", which looks like source rather than build output`);
  }

  await fs.rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  return { removed: true };
}
