import fs from 'node:fs/promises';
import path from 'node:path';
import { escapeRegExp, isExcludedName, listTree, lstatOrNull, resolveExactCase } from './fsutil.mjs';
import { extractHtmlRefs, isExternalOrInline, refPath } from './refs.mjs';

/**
 * Validates one game's generated production output.
 *
 * Every path is derived from the game's slug. A game published at
 * https://game.emmystack01.com/<slug>/ must be built with Vite base "/<slug>/",
 * so in the generated files:
 *   - every local href/src in HTML starts with "/<slug>/" and points at a file that exists
 *   - nothing refers to a root-level path such as "/assets/..." (checked in HTML, JS and CSS)
 *   - index.html references at least one file under "/<slug>/"
 *   - every file listed in deploy.config.json for this game exists and is not empty
 *
 * @param {object} args
 * @param {string} args.distDir  directory holding the game's output (its index.html at the top)
 * @param {string} args.slug
 * @param {string[]} [args.requiredFiles] paths relative to the output, forward slashes
 */
export async function validateGameOutput({ distDir, slug, requiredFiles = [] }) {
  const errors = [];
  const warnings = [];
  const base = `/${slug}/`;

  const rootStat = await lstatOrNull(distDir);
  if (!rootStat || !rootStat.isDirectory()) {
    return { errors: [`output folder not found (expected a build output at ${distDir}).`], warnings };
  }
  if ((await resolveExactCase(distDir, 'index.html')) !== 'file') {
    return { errors: ['index.html is missing from the build output.'], warnings };
  }

  const tree = await listTree(distDir);
  for (const entry of tree) {
    if (entry.kind === 'symlink' || entry.kind === 'other') {
      errors.push(`${entry.rel} is a symbolic link or special file; not allowed.`);
    } else if (entry.rel.split('/').some(isExcludedName)) {
      warnings.push(`${entry.rel} is a hidden/system file and will be excluded from the public site.`);
    }
  }

  // Top-level names that must never be referenced from the site root.
  const topLevel = new Set(
    tree.filter((e) => !e.rel.includes('/') && e.rel !== 'index.html' && !isExcludedName(e.rel)).map((e) => e.rel)
  );
  topLevel.add('assets');
  const rootRef = new RegExp(
    `["'\`(]/(?:${[...topLevel].map(escapeRegExp).join('|')})(?=[/"'\`)?#])`,
    'g'
  );

  for (const entry of tree) {
    if (entry.kind !== 'file' || !/\.(?:html|js|mjs|css)$/i.test(entry.rel)) continue;
    if (entry.rel.split('/').some(isExcludedName)) continue;
    let text = await fs.readFile(entry.abs, 'utf8');
    if (/\.html$/i.test(entry.rel)) text = text.replace(/<!--[\s\S]*?-->/g, ''); // comments are never served as references

    const hits = [...text.matchAll(rootRef)].map((m) => m[0].slice(1));
    if (hits.length) {
      const sample = [...new Set(hits)].slice(0, 3).join(', ');
      errors.push(
        `${entry.rel}: root-level reference(s) ${sample} found. Expected paths under ${base} (check the Vite "base" setting).`
      );
    }

    if (/\.html$/i.test(entry.rel)) {
      let underBase = 0;
      for (const ref of extractHtmlRefs(text)) {
        if (isExternalOrInline(ref)) continue;
        if (!ref.startsWith('/')) {
          errors.push(`${entry.rel}: relative reference "${ref}"; expected an absolute path under ${base}.`);
          continue;
        }
        if (!ref.startsWith(base)) {
          errors.push(`${entry.rel}: reference "${ref}" is outside ${base}.`);
          continue;
        }
        underBase += 1;
        let rel;
        try {
          rel = refPath(ref.slice(base.length));
        } catch {
          errors.push(`${entry.rel}: malformed reference "${ref}".`);
          continue;
        }
        const target = rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel;
        if ((await resolveExactCase(distDir, target)) !== 'file') {
          errors.push(`${entry.rel}: "${ref}" points at a file that does not exist in the build output.`);
        }
      }
      if (entry.rel === 'index.html' && underBase === 0) {
        errors.push(`index.html contains no references under ${base}; the game was probably built with the wrong Vite base.`);
      }
    }
  }

  for (const rel of requiredFiles) {
    const kind = await resolveExactCase(distDir, rel);
    if (kind !== 'file') {
      errors.push(`required file ${rel} is missing from the build output (expected at ${base}${rel}).`);
      continue;
    }
    const st = await lstatOrNull(path.join(distDir, ...rel.split('/')));
    if (!st || st.size === 0) errors.push(`required file ${rel} is empty.`);
  }

  return { errors: [...new Set(errors)], warnings };
}
