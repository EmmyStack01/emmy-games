import fs from 'node:fs/promises';
import path from 'node:path';
import { BuildConfigError } from './errors.mjs';
import { isExcludedName, lstatOrNull, resolveExactCase } from './fsutil.mjs';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 50;

// Names a game may not use because they already mean something on the site.
export const RESERVED_SLUGS = new Set([
  'asset', 'assets', 'games', 'game', 'portal', 'dist', 'api', 'admin', 'index', '404', 'static', 'public',
]);

// Folder names Windows cannot create.
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

async function readJson(file, label) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new BuildConfigError(`${label} is missing.`);
    throw err;
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new BuildConfigError(`${label} is not valid JSON: ${err.message}`);
  }
}

/** Problems with a slug as a URL segment / folder name (empty array = fine). */
export function validateSlug(slug) {
  const problems = [];
  if (typeof slug !== 'string' || slug === '') return ['slug must be a non-empty string'];
  if (slug.length > MAX_SLUG_LENGTH) problems.push(`slug is longer than ${MAX_SLUG_LENGTH} characters`);
  if (!SLUG_PATTERN.test(slug)) {
    problems.push('slug may only contain lowercase letters, digits and single hyphens (no spaces, capitals, dots or slashes)');
  }
  if (RESERVED_SLUGS.has(slug)) problems.push('slug is reserved by the site');
  if (WINDOWS_RESERVED.test(slug)) problems.push('slug is a reserved name on Windows');
  return problems;
}

/** deploy.config.json: production branch + optional per-game output checks. */
export async function loadDeployConfig(rootDir) {
  const raw = await readJson(path.join(rootDir, 'deploy.config.json'), 'deploy.config.json');
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BuildConfigError('deploy.config.json must be a JSON object.');
  }
  const allowedKeys = new Set(['productionBranch', 'games']);
  for (const key of Object.keys(raw)) {
    if (!allowedKeys.has(key)) throw new BuildConfigError(`deploy.config.json: unknown key "${key}".`);
  }
  if (typeof raw.productionBranch !== 'string' || raw.productionBranch.trim() === '') {
    throw new BuildConfigError('deploy.config.json: "productionBranch" is required.');
  }
  const games = {};
  const gamesRaw = raw.games ?? {};
  if (gamesRaw === null || typeof gamesRaw !== 'object' || Array.isArray(gamesRaw)) {
    throw new BuildConfigError('deploy.config.json: "games" must be an object keyed by game slug.');
  }
  for (const [slug, value] of Object.entries(gamesRaw)) {
    const problems = validateSlug(slug);
    if (problems.length) throw new BuildConfigError(`deploy.config.json: games."${slug}": ${problems.join('; ')}.`);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BuildConfigError(`deploy.config.json: games."${slug}" must be an object.`);
    }
    for (const key of Object.keys(value)) {
      if (key !== 'requiredOutputFiles') {
        throw new BuildConfigError(`deploy.config.json: games."${slug}": unknown key "${key}".`);
      }
    }
    const files = value.requiredOutputFiles ?? [];
    if (!Array.isArray(files)) {
      throw new BuildConfigError(`deploy.config.json: games."${slug}".requiredOutputFiles must be an array.`);
    }
    for (const file of files) {
      const ok =
        typeof file === 'string' &&
        file !== '' &&
        !file.startsWith('/') &&
        !file.includes('\\') &&
        !file.split('/').some((part) => part === '..' || part === '.' || part === '');
      if (!ok) {
        throw new BuildConfigError(
          `deploy.config.json: games."${slug}".requiredOutputFiles: ${JSON.stringify(file)} must be a relative path with forward slashes.`
        );
      }
    }
    games[slug] = { requiredOutputFiles: [...files] };
  }
  return { productionBranch: raw.productionBranch, games };
}

/**
 * publish.json must be exactly { "published": ["slug", ...] }.
 * Returns { published, errors } so every problem can be reported at once.
 */
export async function loadPublishJson(rootDir) {
  const errors = [];
  let raw;
  try {
    raw = await readJson(path.join(rootDir, 'publish.json'), 'publish.json');
  } catch (err) {
    if (err instanceof BuildConfigError) return { published: [], errors: [err.message] };
    throw err;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { published: [], errors: ['publish.json must be a JSON object like { "published": [] }.'] };
  }
  for (const key of Object.keys(raw)) {
    if (key !== 'published') {
      errors.push(
        `publish.json: unknown key "${key}". The only supported structure is { "published": ["slug", ...] }.`
      );
    }
  }
  if (!Array.isArray(raw.published)) {
    errors.push('publish.json: "published" must be an array of game slugs (use [] to publish nothing).');
    return { published: [], errors };
  }
  const seen = new Set();
  const published = [];
  for (const slug of raw.published) {
    if (typeof slug !== 'string') {
      errors.push(`publish.json: ${JSON.stringify(slug)} is not a string.`);
      continue;
    }
    const problems = validateSlug(slug);
    if (problems.length) errors.push(`publish.json: "${slug}": ${problems.join('; ')}.`);
    if (seen.has(slug)) errors.push(`publish.json: "${slug}" is listed more than once.`);
    seen.add(slug);
    published.push(slug);
  }
  return { published, errors };
}

/** Finds games/<slug>/ folders. Each needs package.json with "build" and "test" scripts. */
export async function discoverGames(rootDir) {
  const errors = [];
  const warnings = [];
  const games = [];
  const gamesDir = path.join(rootDir, 'games');
  let entries;
  try {
    entries = await fs.readdir(gamesDir, { withFileTypes: true });
  } catch {
    return { games, errors: ['games/ directory is missing.'], warnings };
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (isExcludedName(entry.name)) continue;
    if (entry.isSymbolicLink()) {
      errors.push(`games/${entry.name} is a symbolic link; symbolic links are not allowed.`);
      continue;
    }
    if (!entry.isDirectory()) {
      warnings.push(`games/${entry.name} is a file, not a game folder; ignored.`);
      continue;
    }
    const slugProblems = validateSlug(entry.name);
    if (slugProblems.length) {
      errors.push(`games/${entry.name}: invalid game folder name: ${slugProblems.join('; ')}.`);
      continue;
    }
    const dir = path.join(gamesDir, entry.name);
    let pkg;
    try {
      pkg = JSON.parse((await fs.readFile(path.join(dir, 'package.json'), 'utf8')).replace(/^\uFEFF/, ''));
    } catch (err) {
      errors.push(`games/${entry.name}/package.json is missing or not valid JSON (${err.code ?? err.message}).`);
      continue;
    }
    const scripts = pkg && typeof pkg === 'object' ? pkg.scripts : null;
    for (const name of ['build', 'test']) {
      if (!scripts || typeof scripts[name] !== 'string' || scripts[name].trim() === '') {
        errors.push(`games/${entry.name}/package.json needs a "${name}" script.`);
      }
    }
    games.push({ slug: entry.name, dir, distDir: path.join(dir, 'dist') });
  }
  return { games, errors, warnings };
}

/**
 * Slug collisions with the portal's own files and folders.
 * A portal folder with the same name as a game is the game's PLACEHOLDER and is
 * required (and allowed) as long as it contains index.html.
 */
export async function checkCollisions({ rootDir, games }) {
  const errors = [];
  const portalDir = path.join(rootDir, 'portal');
  let entries = [];
  try {
    entries = await fs.readdir(portalDir, { withFileTypes: true });
  } catch {
    return errors; // a missing portal is reported by the portal validator
  }
  const visible = entries.filter((e) => !isExcludedName(e.name));
  for (const { slug } of games) {
    for (const entry of visible) {
      const lower = entry.name.toLowerCase();
      if (lower === slug) {
        if (entry.name !== slug) {
          errors.push(`portal/${entry.name} differs from game slug "${slug}" only by letter case; Cloudflare is case-sensitive.`);
        } else if (!entry.isDirectory()) {
          errors.push(`portal/${entry.name} is a file but game "${slug}" needs the folder portal/${slug}/ for its placeholder.`);
        } else if ((await resolveExactCase(portalDir, `${slug}/index.html`)) !== 'file') {
          errors.push(
            `Game slug "${slug}" collides with portal/${entry.name}/, which is not a placeholder (it has no index.html).`
          );
        }
      } else if (lower === `${slug}.html`) {
        errors.push(`portal/${entry.name} would collide with the URL /${slug}/ of game "${slug}".`);
      }
    }
    const placeholder = await lstatOrNull(path.join(portalDir, slug, 'index.html'));
    if (!placeholder || !placeholder.isFile()) {
      errors.push(
        `Game "${slug}" has no placeholder page. Create portal/${slug}/index.html so the URL works while the game is unpublished.`
      );
    }
  }
  return [...new Set(errors)];
}
