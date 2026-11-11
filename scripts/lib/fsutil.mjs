import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Hidden and operating-system junk files must never reach the public site.
const JUNK_NAMES = new Set(['thumbs.db', 'desktop.ini']);

/** True for dotfiles / dot-folders (.DS_Store, .git, ...) and Windows junk. */
export function isExcludedName(name) {
  return name.startsWith('.') || JUNK_NAMES.has(name.toLowerCase());
}

export async function lstatOrNull(p) {
  try {
    return await fs.lstat(p);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

/** True when `child` is strictly inside `parent` (never when they are equal). */
export function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function sha256File(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

/**
 * Recursive listing with forward-slash relative paths, sorted by name.
 * Does not follow symlinks (they are reported with kind "symlink").
 */
export async function listTree(dir, { skipExcluded = false } = {}) {
  const out = [];
  async function walk(abs, rel) {
    const entries = await fs.readdir(abs, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (skipExcluded && isExcludedName(entry.name)) continue;
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const kind = entry.isSymbolicLink()
        ? 'symlink'
        : entry.isDirectory()
          ? 'dir'
          : entry.isFile()
            ? 'file'
            : 'other';
      out.push({ rel: childRel, abs: childAbs, kind });
      if (kind === 'dir') await walk(childAbs, childRel);
    }
  }
  await walk(dir, '');
  return out;
}

/**
 * Copies a directory tree. Hidden/junk files are skipped (and reported),
 * symlinks and special files are refused.
 */
export async function copyTree(src, dest) {
  const excluded = [];
  let files = 0;
  async function walk(s, d, rel) {
    await fs.mkdir(d, { recursive: true });
    const entries = await fs.readdir(s, { withFileTypes: true });
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (isExcludedName(entry.name)) {
        excluded.push(childRel);
        continue;
      }
      const sp = path.join(s, entry.name);
      const dp = path.join(d, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`refusing to copy symbolic link: ${childRel}`);
      if (entry.isDirectory()) await walk(sp, dp, childRel);
      else if (entry.isFile()) {
        await fs.copyFile(sp, dp);
        files += 1;
      } else throw new Error(`refusing to copy non-regular file: ${childRel}`);
    }
  }
  await walk(src, dest, '');
  return { files, excluded };
}

/** Content hash of a whole tree (names + file bytes). Used to prove "unchanged". */
export async function treeHash(dir, { skipExcluded = false } = {}) {
  const hash = crypto.createHash('sha256');
  for (const entry of await listTree(dir, { skipExcluded })) {
    hash.update(`${entry.kind}\0${entry.rel}\0`);
    if (entry.kind === 'file') hash.update(await sha256File(entry.abs));
    hash.update('\n');
  }
  return hash.digest('hex');
}

/**
 * Resolves a relative path with EXACT letter case (Windows and macOS file
 * systems ignore case, Cloudflare does not). Returns 'file' | 'dir' | 'other' | null.
 */
export async function resolveExactCase(baseDir, relPath) {
  const segments = relPath.split('/').filter((s) => s !== '' && s !== '.');
  let current = baseDir;
  for (const segment of segments) {
    if (segment === '..') return null;
    let names;
    try {
      names = await fs.readdir(current);
    } catch {
      return null;
    }
    if (!names.includes(segment)) return null;
    current = path.join(current, segment);
  }
  const st = await lstatOrNull(current);
  if (!st) return null;
  return st.isDirectory() ? 'dir' : st.isFile() ? 'file' : 'other';
}
