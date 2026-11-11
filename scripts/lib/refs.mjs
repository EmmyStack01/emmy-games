// Small reference extractors shared by the portal and game-output validators.

/** href / src / poster values from HTML (comments are ignored). */
export function extractHtmlRefs(html) {
  const text = html.replace(/<!--[\s\S]*?-->/g, '');
  const refs = [];
  const re = /\b(?:href|src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = re.exec(text)) !== null) refs.push((m[1] ?? m[2] ?? '').trim());
  return refs.filter((r) => r !== '');
}

/** url(...) values from CSS. */
export function extractCssRefs(css) {
  const refs = [];
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s'"]+))\s*\)/gi;
  let m;
  while ((m = re.exec(css)) !== null) refs.push((m[1] ?? m[2] ?? m[3] ?? '').trim());
  return refs.filter((r) => r !== '');
}

/** Absolute URLs, protocol-relative URLs, data:, mailto:, tel:, javascript: and #anchors. */
export function isExternalOrInline(ref) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);
}

/** Path part of a reference, without ?query and #hash, percent-decoded. */
export function refPath(ref) {
  const raw = ref.split('#')[0].split('?')[0];
  return decodeURIComponent(raw);
}
