import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BuildConfigError, BuildError } from './errors.mjs';
import { MODE, resolveBuildMode } from './buildMode.mjs';
import { checkCollisions, discoverGames, loadDeployConfig, loadPublishJson } from './config.mjs';
import { lstatOrNull } from './fsutil.mjs';
import { validatePortal } from './portal.mjs';
import { cleanGameDist } from './gameClean.mjs';
import { validateGameOutput } from './gameOutput.mjs';
import { assembleStaging, validateStaged } from './staging.mjs';
import { defaultFsOps, makeBuildId, recoverInterruptedSwap, removeTempDir, replaceDirectory } from './swap.mjs';

const TOTAL_STEPS = 9;

// Never passed on to the child processes (npm ci / npm test / npm run build).
const CHILD_ENV_BLOCKLIST = [
  'PUBLISH_ALL',
  'CF_PAGES',
  'CF_PAGES_BRANCH',
  'CF_PAGES_COMMIT_SHA',
  'CF_PAGES_URL',
  'NODE_TEST_CONTEXT',
];

function childEnv(env) {
  const copy = { ...env };
  for (const key of CHILD_ENV_BLOCKLIST) delete copy[key];
  return copy;
}

/**
 * Runs a shell command (the same string works in cmd.exe and sh).
 * stdio "inherit" streams output to the console; "capture" collects it.
 */
export function createCommandRunner({ stdio = 'inherit' } = {}) {
  return async function run(command, { cwd, env, quiet = false }) {
    const capture = quiet || stdio !== 'inherit';
    const result = spawnSync(command, {
      cwd,
      env,
      shell: true,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const output = capture ? `${result.stdout ?? ''}${result.stderr ?? ''}` : '';
    return { code: typeof result.status === 'number' ? result.status : 1, output };
  };
}

/**
 * The root build. Everything is assembled in a temporary staging folder and
 * only swapped into dist/ at the very end, so a failure at any point leaves
 * the previous dist/ exactly as it was.
 *
 * @param {object}  options
 * @param {string}  options.rootDir
 * @param {object}  [options.env]
 * @param {boolean} [options.cliPublishAll]
 * @param {boolean} [options.skipTests]            local builds only
 * @param {'auto'|'always'|'never'} [options.installDependencies]
 * @param {Function} [options.runCommand]
 * @param {Function} [options.log]
 * @param {object}  [options.fsOps]                injectable rename/rm (tests)
 * @param {object}  [options.retry]                rename retry tuning (tests)
 * @param {object}  [options.testHooks]            { afterStaging(stagingDir) } (tests)
 */
export async function runBuild(options = {}) {
  const {
    rootDir,
    env = process.env,
    cliPublishAll = false,
    skipTests = false,
    installDependencies = 'auto',
    runCommand = createCommandRunner(),
    log = console.log,
    fsOps = defaultFsOps,
    retry,
    testHooks = {},
  } = options;

  const result = { ok: false, exitCode: 1, mode: null, selected: [], placeholders: [], warnings: [] };
  const say = (line = '') => log(line);
  const warn = (line) => {
    result.warnings.push(line);
    say(`  [warn] ${line}`);
  };
  const step = (n, title) => say(`\n[${n}/${TOTAL_STEPS}] ${title}`);
  const fail = (stepName, problems) => {
    if (problems.length > 0) throw new BuildError(stepName, problems);
  };

  let root = null;
  let stagingDir = null;
  let finalDir = null;
  let swapStarted = false;

  try {
    root = await fs.realpath(path.resolve(rootDir));
    finalDir = path.join(root, 'dist');
    const id = makeBuildId();
    stagingDir = path.join(root, `.build-staging-${id}`);

    // ---- Environment and mode (before anything is touched) ----------------
    const deploy = await loadDeployConfig(root);
    const modeInfo = resolveBuildMode({ env, productionBranch: deploy.productionBranch, cliPublishAll });
    result.mode = modeInfo.mode;
    if (skipTests && modeInfo.mode !== MODE.LOCAL) {
      throw new BuildConfigError('Tests can only be skipped in a local build, never in a Cloudflare production or preview build.');
    }

    say('== Emmy Games build ==');
    if (modeInfo.mode === MODE.LOCAL) {
      say('Environment : LOCAL build (no Cloudflare variables). For testing on this machine only; do not upload dist/ to production.');
    } else if (modeInfo.mode === MODE.PRODUCTION) {
      say(`Environment : CLOUDFLARE PRODUCTION build (branch "${modeInfo.branch}")`);
    } else {
      say(`Environment : CLOUDFLARE PREVIEW build (branch "${modeInfo.branch}")`);
    }
    say(
      modeInfo.publishAll
        ? 'Publishing   : ALL games (publish-all requested; allowed in local and preview builds only)'
        : 'Publishing   : only the games listed in publish.json'
    );
    for (const w of modeInfo.warnings) warn(w);

    const recovery = await recoverInterruptedSwap(root, { fsOps });
    for (const message of recovery.messages) say(`  ${message}`);

    const existingDist = await lstatOrNull(finalDir);
    if (existingDist && (existingDist.isSymbolicLink() || !existingDist.isDirectory())) {
      throw new BuildConfigError('dist exists but is not a regular directory; refusing to continue.');
    }

    const discovered = await discoverGames(root);
    const gameSlugs = discovered.games.map((g) => g.slug);
    discovered.warnings.forEach(warn);

    // ---- 1. portal ---------------------------------------------------------
    step(1, 'Validating the portal');
    const portal = await validatePortal({ rootDir: root, gameSlugs });
    portal.warnings.forEach(warn);
    fail('portal validation failed', portal.errors);
    say('  ok');

    // ---- 2. publish.json ---------------------------------------------------
    step(2, 'Validating publish.json');
    const publish = await loadPublishJson(root);
    fail('publish.json is invalid', publish.errors);
    say(`  ok (${publish.published.length} game(s) listed: ${publish.published.join(', ') || 'none'})`);

    // ---- 3. slugs and collisions ------------------------------------------
    step(3, 'Validating game slugs and collisions');
    const problems = [...discovered.errors];
    for (const slug of publish.published) {
      if (!gameSlugs.includes(slug)) problems.push(`publish.json lists "${slug}" but there is no games/${slug}/ folder.`);
    }
    problems.push(...(await checkCollisions({ rootDir: root, games: discovered.games })));
    fail('game configuration is invalid', problems);
    say(`  ok (games found: ${gameSlugs.join(', ') || 'none'})`);

    const selected = new Set(modeInfo.publishAll ? gameSlugs : publish.published);
    result.selected = gameSlugs.filter((s) => selected.has(s));
    result.placeholders = gameSlugs.filter((s) => !selected.has(s));
    const games = discovered.games;

    // ---- 4. dependencies and tests ----------------------------------------
    step(4, skipTests ? 'Installing dependencies (tests SKIPPED: local build)' : 'Installing dependencies and running tests');
    const cenv = childEnv(env);
    // quiet: output is captured; a short summary is printed on success, everything on failure.
    const exec = async (command, cwd, label, { quiet = false } = {}) => {
      say(`  > ${label}`);
      const res = await runCommand(command, { cwd, env: cenv, quiet });
      if (res.code !== 0) {
        if (res.output) say(res.output);
        throw new BuildError(label, [`exited with code ${res.code}`]);
      }
      if (quiet && res.output) {
        for (const line of res.output.split(/\r?\n/)) {
          if (/^# (tests|pass|fail|skipped) /.test(line)) say(`    ${line.slice(2)}`);
        }
      }
    };
    for (const game of games) {
      const hasModules = await lstatOrNull(path.join(game.dir, 'node_modules'));
      const needInstall =
        installDependencies === 'always' ||
        (installDependencies === 'auto' && (modeInfo.mode !== MODE.LOCAL || !hasModules));
      if (needInstall) await exec('npm ci', game.dir, `npm ci (games/${game.slug})`);
    }
    if (!skipTests) {
      let rootHasTests = false;
      try {
        const rootPkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
        rootHasTests = typeof rootPkg?.scripts?.test === 'string';
      } catch {
        rootHasTests = false;
      }
      if (rootHasTests) await exec('npm test', root, 'npm test (build-script tests)', { quiet: true });
      for (const game of games) await exec('npm test', game.dir, `npm test (games/${game.slug})`, { quiet: true });
    }

    // ---- 5. build every game ----------------------------------------------
    step(5, 'Building every game');
    for (const game of games) {
      const cleaned = await cleanGameDist({ rootDir: root, gameDir: game.dir, protectedDirs: [stagingDir, finalDir] });
      if (cleaned.removed) say(`  removed previous games/${game.slug}/dist`);
      await exec('npm run build', game.dir, `npm run build (games/${game.slug})`);
    }

    // ---- 6. validate every game output ------------------------------------
    step(6, 'Validating every game output (nested base path, assets)');
    const outputProblems = [];
    for (const game of games) {
      const required = deploy.games[game.slug]?.requiredOutputFiles ?? [];
      const res = await validateGameOutput({ distDir: game.distDir, slug: game.slug, requiredFiles: required });
      res.warnings.forEach((w) => warn(`${game.slug}: ${w}`));
      outputProblems.push(...res.errors.map((e) => `${game.slug}: ${e}`));
      if (res.errors.length === 0) say(`  ok  /${game.slug}/`);
    }
    fail('game output is invalid', outputProblems);

    // ---- 7. assemble in staging -------------------------------------------
    step(7, 'Assembling the site in a temporary staging folder');
    const assembled = await assembleStaging({ rootDir: root, stagingDir, games, selected });
    for (const rel of assembled.excluded) say(`  excluded hidden/system file: ${rel}`);
    if (testHooks.afterStaging) await testHooks.afterStaging(stagingDir);

    // ---- 8. validate the staged site --------------------------------------
    step(8, 'Validating the complete staged output');
    const stagedProblems = await validateStaged({ rootDir: root, stagingDir, games, selected, deploy });
    fail('staged output is invalid', stagedProblems);
    say('  ok');

    // ---- 9. replace dist/ --------------------------------------------------
    step(9, 'Replacing dist/ with the new output');
    swapStarted = true;
    const swap = await replaceDirectory({ rootDir: root, stagingDir, finalDir, id, fsOps, retry });
    swap.warnings.forEach(warn);

    say('\n[ OK ] Build succeeded.');
    say(`  Environment : ${modeInfo.mode}`);
    say(`  Game(s) published   : ${result.selected.join(', ') || 'none'}`);
    say(`  Placeholder(s) only : ${result.placeholders.join(', ') || 'none'}`);
    say('  Output      : dist/');
    if (modeInfo.mode === MODE.LOCAL) say('  (local build: for testing on this machine, do not deploy)');
    result.ok = true;
    result.exitCode = 0;
  } catch (err) {
    result.ok = false;
    result.exitCode = 1;
    say('\n[FAIL] Build failed.');
    if (err instanceof BuildError) {
      say(`  ${err.step}`);
      for (const p of err.problems) say(`   - ${p}`);
    } else {
      say(`  ${err.message}`);
    }
    if (err?.message?.startsWith('CRITICAL')) {
      say('  The previous dist/ could not be restored automatically; see the message above.');
    } else {
      say(
        swapStarted
          ? '  The previous dist/ was restored and is unchanged.'
          : '  dist/ was not touched: the previous successful output is unchanged.'
      );
    }
  } finally {
    if (root && stagingDir) {
      try {
        await removeTempDir(root, stagingDir, fsOps);
      } catch (err) {
        say(`  [warn] could not remove temporary folder ${path.basename(stagingDir)}: ${err.message}`);
      }
    }
  }
  return result;
}
