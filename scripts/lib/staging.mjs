import fs from 'node:fs/promises';
import path from 'node:path';
import {
  copyTree,
  isExcludedName,
  isInside,
  listTree,
  resolveExactCase,
  sha256File,
  treeHash,
} from './fsutil.mjs';
import { validateGameOutput } from './gameOutput.mjs';
import { REQUIRED_PORTAL_DIRS, REQUIRED_PORTAL_FILES } from './portal.mjs';

/**
 * Assembles the public site in stagingDir:
 *   portal/  (hidden files excluded)  ->  stagingDir/
 *   for each selected game: stagingDir/<slug>/ is replaced by the game's build output.
 * Unselected games keep their placeholder page from portal/<slug>/.
 */
export async function assembleStaging({ rootDir, stagingDir, games, selected }) {
  const portalDir = path.join(rootDir, 'portal');
  await fs.mkdir(stagingDir);
  const portalCopy = await copyTree(portalDir, stagingDir);
  const excluded = portalCopy.excluded.map((rel) => `portal/${rel}`);

  for (const game of games) {
    if (!selected.has(game.slug)) continue;
    const slugDir = path.join(stagingDir, game.slug);
    if (!isInside(stagingDir, slugDir)) throw new Error(`unsafe game path for ${game.slug}`);
    await fs.rm(slugDir, { recursive: true, force: true }); // the placeholder is replaced by the game
    const gameCopy = await copyTree(game.distDir, slugDir);
    excluded.push(...gameCopy.excluded.map((rel) => `games/${game.slug}/dist/${rel}`));
  }
  return { excluded };
}

/**
 * Validates the complete staged site before it is allowed to replace dist/.
 * Returns an array of problems (empty = safe to publish).
 */
export async function validateStaged({ rootDir, stagingDir, games, selected, deploy }) {
  const errors = [];
  const portalDir = path.join(rootDir, 'portal');

  for (const name of REQUIRED_PORTAL_FILES) {
    if ((await resolveExactCase(stagingDir, name)) !== 'file') errors.push(`staged output is missing ${name}.`);
  }
  for (const name of REQUIRED_PORTAL_DIRS) {
    if ((await resolveExactCase(stagingDir, name)) !== 'dir') errors.push(`staged output is missing the ${name}/ folder.`);
  }

  const stagedTree = await listTree(stagingDir);
  for (const entry of stagedTree) {
    if (entry.rel.split('/').some(isExcludedName)) errors.push(`hidden/system file leaked into the output: ${entry.rel}`);
    if (entry.kind === 'symlink' || entry.kind === 'other') errors.push(`${entry.rel} is a symbolic link or special file.`);
  }

  // Every top-level entry must come from the portal (game folders replace placeholders of the same name).
  const portalTop = new Set((await fs.readdir(portalDir)).filter((n) => !isExcludedName(n)));
  for (const entry of stagedTree.filter((e) => !e.rel.includes('/'))) {
    if (!portalTop.has(entry.rel)) errors.push(`unexpected top-level entry in the output: ${entry.rel}`);
  }

  // Every portal file (outside folders taken over by a published game) must be present and byte-identical.
  for (const entry of await listTree(portalDir, { skipExcluded: true })) {
    if (entry.kind !== 'file') continue;
    if ([...selected].some((slug) => entry.rel.startsWith(`${slug}/`))) continue;
    const staged = path.join(stagingDir, ...entry.rel.split('/'));
    try {
      if ((await sha256File(staged)) !== (await sha256File(entry.abs))) {
        errors.push(`portal file differs in the output: ${entry.rel}`);
      }
    } catch {
      errors.push(`portal file is missing from the output: ${entry.rel}`);
    }
  }

  for (const game of games) {
    const slugDir = path.join(stagingDir, game.slug);
    if ((await resolveExactCase(stagingDir, `${game.slug}/index.html`)) !== 'file') {
      errors.push(`/${game.slug}/ has no index.html in the output (neither game nor placeholder).`);
      continue;
    }
    if (selected.has(game.slug)) {
      const requiredFiles = deploy.games[game.slug]?.requiredOutputFiles ?? [];
      const result = await validateGameOutput({ distDir: slugDir, slug: game.slug, requiredFiles });
      errors.push(...result.errors.map((e) => `staged /${game.slug}/: ${e}`));
      if ((await treeHash(slugDir)) !== (await treeHash(game.distDir, { skipExcluded: true }))) {
        errors.push(`staged /${game.slug}/ does not match the game's build output.`);
      }
    } else if ((await treeHash(slugDir)) !== (await treeHash(path.join(portalDir, game.slug), { skipExcluded: true }))) {
      errors.push(`placeholder for unpublished game "${game.slug}" was altered or replaced.`);
    }
  }
  return errors;
}
