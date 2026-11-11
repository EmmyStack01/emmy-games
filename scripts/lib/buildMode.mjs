import { BuildConfigError } from './errors.mjs';

/**
 * Decides what kind of build this is, and whether "publish everything"
 * (PUBLISH_ALL=1 / --publish-all) is allowed to take effect.
 *
 *   local       No Cloudflare variables at all. A developer machine.
 *               PUBLISH_ALL is honoured (that is how unpublished games are tested).
 *   preview     Cloudflare Pages build (CF_PAGES=1) on a branch that is NOT the
 *               production branch. PUBLISH_ALL is honoured.
 *   production  Cloudflare Pages build on the production branch recorded in
 *               deploy.config.json. PUBLISH_ALL is IGNORED, always.
 *
 * Anything missing or inconsistent throws. Missing branch information is never
 * treated as "preview".
 *
 * Cloudflare documents CF_PAGES and CF_PAGES_BRANCH as variables it injects
 * (and which can be overridden in the dashboard), so the production branch is
 * kept in the repository (deploy.config.json), not read from the environment.
 */
export const MODE = Object.freeze({
  LOCAL: 'local',
  PREVIEW: 'preview',
  PRODUCTION: 'production',
});

function parsePublishAll(raw) {
  if (raw === undefined) return false;
  // Whitespace is tolerated: in Windows cmd, `set PUBLISH_ALL=1 && ...` stores "1 " with a trailing space.
  const value = raw.trim();
  if (value === '') return false;
  if (value === '1') return true;
  if (value === '0') return false;
  throw new BuildConfigError(
    `PUBLISH_ALL must be "1", "0" or unset, but it is ${JSON.stringify(raw)}. ` +
      'Other values such as "true" or "yes" are rejected on purpose so a typo cannot silently change what is published.'
  );
}

function checkProductionBranch(value) {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim() || /\s/.test(value)) {
    throw new BuildConfigError(
      'deploy.config.json: "productionBranch" must be a non-empty branch name without spaces.'
    );
  }
}

/**
 * @param {object}  args
 * @param {Record<string, string|undefined>} args.env  environment variables
 * @param {string}  args.productionBranch  from deploy.config.json
 * @param {boolean} [args.cliPublishAll]   true when --publish-all was passed
 */
export function resolveBuildMode({ env, productionBranch, cliPublishAll = false }) {
  checkProductionBranch(productionBranch);

  const envPublishAll = parsePublishAll(env.PUBLISH_ALL);
  const publishAllRequested = envPublishAll || cliPublishAll === true;
  const warnings = [];

  const cfPages = env.CF_PAGES;
  const cfBranch = env.CF_PAGES_BRANCH;

  // ---- Not Cloudflare: local build -------------------------------------
  if (cfPages === undefined) {
    if (cfBranch !== undefined) {
      throw new BuildConfigError(
        'Inconsistent environment: CF_PAGES_BRANCH is set but CF_PAGES is not. ' +
          'Refusing to guess whether this is a local, preview or production build. ' +
          'Unset CF_PAGES_BRANCH for local builds.'
      );
    }
    return {
      mode: MODE.LOCAL,
      branch: null,
      publishAllRequested,
      publishAll: publishAllRequested,
      warnings,
    };
  }

  // ---- Cloudflare Pages build ------------------------------------------
  if (cfPages !== '1') {
    throw new BuildConfigError(
      `Inconsistent environment: CF_PAGES is ${JSON.stringify(cfPages)} but Cloudflare Pages sets it to "1". ` +
        'Refusing to continue.'
    );
  }
  if (typeof cfBranch !== 'string' || cfBranch.trim() === '') {
    throw new BuildConfigError(
      'CF_PAGES=1 but CF_PAGES_BRANCH is missing or empty. ' +
        'The branch is required to tell a production build from a preview build, ' +
        'and a missing branch is never assumed to be a preview. Refusing to continue.'
    );
  }
  if (cfBranch !== cfBranch.trim()) {
    throw new BuildConfigError(
      `CF_PAGES_BRANCH has leading or trailing whitespace (${JSON.stringify(cfBranch)}). Refusing to continue.`
    );
  }

  if (cfBranch === productionBranch) {
    if (publishAllRequested) {
      warnings.push(
        `PUBLISH_ALL / --publish-all was requested on the production branch "${productionBranch}" and has been IGNORED. ` +
          'Production publishes only the games listed in publish.json. ' +
          'Remove PUBLISH_ALL from the Production environment variables in Cloudflare.'
      );
    }
    return {
      mode: MODE.PRODUCTION,
      branch: cfBranch,
      publishAllRequested,
      publishAll: false,
      warnings,
    };
  }

  if (cfBranch.toLowerCase() === productionBranch.toLowerCase()) {
    throw new BuildConfigError(
      `Ambiguous branch: CF_PAGES_BRANCH is "${cfBranch}" but the production branch in deploy.config.json is "${productionBranch}" ` +
        '(same name, different capitalisation). Refusing to treat this as a preview build.'
    );
  }

  return {
    mode: MODE.PREVIEW,
    branch: cfBranch,
    publishAllRequested,
    publishAll: publishAllRequested,
    warnings,
  };
}
