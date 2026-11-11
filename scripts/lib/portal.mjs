import fs from 'node:fs/promises';
import path from 'node:path';
import { isExcludedName, listTree, lstatOrNull, resolveExactCase } from './fsutil.mjs';
import { extractCssRefs, extractHtmlRefs, isExternalOrInline, refPath } from './refs.mjs';

export const REQUIRED_PORTAL_FILES = ['index.html', '404.html', 'games.css', 'games.js'];
export const REQUIRED_PORTAL_DIRS = ['asset'];

/**
 * Validates portal/ (deployed at the site root).
 *  - required files exist
 *  - no symlinks
 *  - every root-absolute reference in HTML/CSS resolves, with exact letter case
 *  - nothing refers to the wrong "/portal/" prefix
 *  - links to a game use the trailing-slash form: /slug/
 */
export async function validatePortal({ rootDir, gameSlugs = [] }) {
  const errors = [];
  const warnings = [];
  const portalDir = path.join(rootDir, 'portal');

  const portalStat = await lstatOrNull(portalDir);
  if (!portalStat || !portalStat.isDirectory()) {
    return { errors: ['portal/ directory is missing.'], warnings };
  }

  for (const name of REQUIRED_PORTAL_FILES) {
    if ((await resolveExactCase(portalDir, name)) !== 'file') errors.push(`portal/${name} is missing.`);
  }
  for (const name of REQUIRED_PORTAL_DIRS) {
    if ((await resolveExactCase(portalDir, name)) !== 'dir') {
      errors.push(`portal/${name}/ is missing.`);
      continue;
    }
    const inner = (await listTree(path.join(portalDir, name), { skipExcluded: true })).filter((e) => e.kind === 'file');
    if (inner.length === 0) errors.push(`portal/${name}/ contains no files.`);
  }

  const tree = await listTree(portalDir);
  const excludedPrefixes = [];
  const textFiles = [];
  for (const entry of tree) {
    if (excludedPrefixes.some((p) => entry.rel.startsWith(p))) continue;
    const base = entry.rel.split('/').pop();
    if (isExcludedName(base)) {
      warnings.push(`portal/${entry.rel} is a hidden/system file and will be excluded from the public site.`);
      if (entry.kind === 'dir') excludedPrefixes.push(`${entry.rel}/`);
      continue;
    }
    if (entry.kind === 'symlink' || entry.kind === 'other') {
      errors.push(`portal/${entry.rel} is a symbolic link or special file; not allowed.`);
      continue;
    }
    if (entry.kind === 'file' && /\.(?:html|css|js)$/i.test(entry.rel)) textFiles.push(entry);
  }

  const slugs = new Set(gameSlugs);

  async function checkRef(ref, fileRel) {
    if (isExternalOrInline(ref)) return;
    if (!ref.startsWith('/')) {
      warnings.push(`portal/${fileRel}: relative reference "${ref}"; root-absolute paths such as /games.css are expected.`);
      return;
    }
    let p;
    try {
      p = refPath(ref);
    } catch {
      errors.push(`portal/${fileRel}: malformed reference "${ref}".`);
      return;
    }
    const segments = p.split('/').filter(Boolean);
    if (segments.some(isExcludedName)) {
      errors.push(`portal/${fileRel}: "${ref}" points at a hidden file, which is never published.`);
      return;
    }
    if (segments.length === 1 && slugs.has(segments[0]) && !p.endsWith('/')) {
      errors.push(`portal/${fileRel}: "${ref}" must be written with a trailing slash: /${segments[0]}/.`);
      return;
    }
    const rel = segments.join('/');
    const kind = rel === '' ? 'dir' : await resolveExactCase(portalDir, rel);
    if (kind === null) {
      errors.push(`portal/${fileRel}: broken reference "${ref}" (no such file in portal/, or letter case differs).`);
    } else if (kind === 'dir') {
      const index = rel === '' ? 'index.html' : `${rel}/index.html`;
      if ((await resolveExactCase(portalDir, index)) !== 'file') {
        errors.push(`portal/${fileRel}: "${ref}" points at a folder without index.html.`);
      }
    }
  }

  for (const file of textFiles) {
    const text = await fs.readFile(file.abs, 'utf8');
    if (text.includes('/portal/')) {
      errors.push(`portal/${file.rel}: contains "/portal/". The contents of portal/ are served at the site root, so use /games.css, /asset/..., not /portal/....`);
    }
    if (/\.html$/i.test(file.rel)) {
      for (const ref of extractHtmlRefs(text)) await checkRef(ref, file.rel);
    } else if (/\.css$/i.test(file.rel)) {
      for (const ref of extractCssRefs(text)) await checkRef(ref, file.rel);
    }
  }

  return { errors: [...new Set(errors)], warnings };
}
