# Emmy Games

The Emmy Games portal and its games, built into one static website and hosted on
Cloudflare Pages at **https://game.emmystack01.com/**.

* The main Emmy STACK01 website (emmystack01.com) stays on **Vercel**. This repository does not touch it.
* **Namecheap** stays the DNS provider.
* Deployment, DNS, launch and rollback are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Repository structure

```
emmy-games/
├── portal/                    The website served at the site ROOT (https://game.emmystack01.com/)
│   ├── index.html, 404.html, games.css, games.js
│   ├── asset/                 Portal images
│   └── emmy-hustle/index.html Placeholder shown while the game is NOT published
├── games/
│   └── emmy-hustle/           The real game (Phaser 3 + Vite). Has its own package.json, tests and lockfile
│       └── vite.config.mjs    base: '/emmy-hustle/'  (must match the folder name / URL)
├── scripts/                   The root build (plain Node.js, no dependencies)
├── tests/                     Tests for the root build scripts
├── docs/DEPLOYMENT.md         Cloudflare Pages, DNS, launch, rollback, real-device testing
├── publish.json               The launch switch: which games are published
├── deploy.config.json         Production branch name + per-game output checks
├── package.json               Root scripts (build, test)
└── dist/                      Generated site (never committed; replaced only by a fully successful build)
```

Because the contents of `portal/` are deployed at the website root, portal pages refer to
`/games.css`, `/games.js`, `/asset/...` and `/emmy-hustle/` (never `/portal/...`).
The build checks this.

## Requirements

* **Node.js 22** (the build refuses to run on older versions). `.node-version` and `.nvmrc` say `22`.
* npm (ships with Node.js). The root project has **no dependencies**. Each game installs its own.

## Local development

Work on the game on its own, as before:

```bash
cd games/emmy-hustle
npm ci
npm run dev          # Vite dev server. Open the address it prints; the game lives under /emmy-hustle/
```

The game is built with Vite `base: '/emmy-hustle/'`, so the dev server also serves it under
`/emmy-hustle/` (for example `http://localhost:5173/emmy-hustle/`).

To look at the whole site as it will be deployed, run a root build (below) and serve `dist/`:

```bash
npm run build:all                         # see "Testing an unpublished game locally"
python -m http.server 8080 --directory dist     # Windows: py -m http.server 8080 --directory dist
# then open http://localhost:8080/ and http://localhost:8080/emmy-hustle/
```

A simple static server is not identical to Cloudflare Pages. Always do a preview deployment before launch.

## Running tests

| What | Command |
| --- | --- |
| The game's own tests (1,087 at the last check) | `cd games/emmy-hustle && npm test`   or, from the root, `npm run test:game:emmy-hustle` |
| The root build-script tests | `npm test` (from the repository root) |
| Both | `npm run test:all` |

`npm run build` runs **both** test suites before building (see below), so a broken test stops a deploy.

## The root build

```bash
npm run build
```

Everything is assembled in a temporary folder (`.build-staging-…`). The existing `dist/` is only
replaced at the very end, after every check has passed. Steps:

1. Validate the portal (required files, links resolve with exact letter case, no `/portal/` paths, game links end in `/`).
2. Validate `publish.json`.
3. Validate game folder names (slugs) and detect collisions with portal files.
4. Install game dependencies (`npm ci`, on Cloudflare or when `node_modules` is missing) and run the tests: the build-script tests and every game's tests.
5. Build **every** game (each game's previous `games/<slug>/dist` is removed first).
6. Validate every game's output (see below).
7. Assemble the portal and the selected games in the staging folder (hidden files are left out).
8. Validate the complete staged site.
9. Replace `dist/` using renames only (old `dist/` → temporary name, staged → `dist/`, then delete the old one). If the second rename fails, the old `dist/` is renamed back.

If **anything** fails the command exits with a non-zero code, the staging folder is removed and the previous
`dist/` is left exactly as it was. If a crash ever interrupts step 9, the next build restores `dist/` automatically.
Do not run two builds at the same time in the same folder.

### What is validated for each game

Paths are derived from the game's folder name (its *slug*), so future games work the same way. For
`emmy-hustle` the base path is `/emmy-hustle/`:

* every local `href`/`src` in the generated HTML starts with `/emmy-hustle/` and points at a file that exists;
* nothing in the HTML, JavaScript or CSS refers to a root-level path such as `/assets/...`;
* `index.html` references files under `/emmy-hustle/`;
* the files listed for the game in `deploy.config.json` exist and are not empty. For Emmy's Hustle that is
  `assets/characters/emmy/emmy-sheet.png` (the path the game loads its character sprite from).

### Hidden files

Hidden files and folders (anything starting with `.`, such as `.DS_Store`) and Windows junk
(`Thumbs.db`, `desktop.ini`) are never copied into the public site, from the portal or from a game build.
The build prints what it excluded and checks that none leaked through.

## `publish.json`

The launch switch. The structure is exactly:

```json
{
  "published": []
}
```

* `[]` — no game is published. Every game URL shows its **placeholder** page from `portal/<slug>/index.html`.
* `["emmy-hustle"]` — Emmy's Hustle is published: `/emmy-hustle/` serves the real game instead of the placeholder.

Any other key (for example `"live": true`) is rejected, as are unknown or duplicated slugs.
Every game must have a placeholder page at `portal/<slug>/index.html`.

## Production and preview publishing rules

Cloudflare Pages sets `CF_PAGES=1` and `CF_PAGES_BRANCH` during its builds. The build script decides what kind of build it is:

| Build | How it is recognised | What is published |
| --- | --- | --- |
| **Production** | `CF_PAGES=1` and the branch equals `productionBranch` in `deploy.config.json` | **Only** games listed in `publish.json`. `PUBLISH_ALL` / `--publish-all` is **ignored** (with a warning). |
| **Preview** | `CF_PAGES=1` and any other branch | `publish.json` games; **all** games if `PUBLISH_ALL=1` |
| **Local** | No Cloudflare variables | `publish.json` games; **all** games with `PUBLISH_ALL=1` or `--publish-all` |
| **Anything else** | `CF_PAGES` set but not `1`; branch missing, empty or with spaces; branch variable without `CF_PAGES`; branch equal to the production branch except for letter case; `PUBLISH_ALL` other than `1`/`0`/unset | **The build fails.** Missing branch information is never assumed to be a preview. |

The production restriction is enforced by the build script itself, not only by Cloudflare settings.
**`productionBranch` in `deploy.config.json` must be the same branch as the *Production branch* in the
Cloudflare Pages project** (currently `main`). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Testing an unpublished game locally

Local builds are clearly labelled `LOCAL build` in the log. Use any of these:

```bash
npm run build:all                                  # all platforms: publishes every game
```

```powershell
# Windows PowerShell
$env:PUBLISH_ALL = "1"; npm run build; Remove-Item Env:PUBLISH_ALL
```

```bat
:: Windows cmd (no space before &&; or simply use: npm run build:all)
set PUBLISH_ALL=1&& npm run build
```

```bash
# macOS / Linux
PUBLISH_ALL=1 npm run build
```

For quick local iteration you can also skip the test steps (local builds only; refused on Cloudflare):

```bash
npm run build:fast          # same as: node scripts/build.mjs --skip-tests
```

**Never upload a local `dist/` to production.** Production is always built by Cloudflare from the Git branch.

## Adding another game

1. Create `games/<slug>/` (lowercase letters, digits and single hyphens; not `asset`, `assets`, `games`, `portal`, `dist`…).
2. Give it a `package.json` with `build` and `test` scripts and a lockfile.
3. Build it with Vite `base: '/<slug>/'` (output in the game's `dist/`).
4. Add a placeholder page `portal/<slug>/index.html` and a link to `/<slug>/` from the portal.
5. Optionally list files that must exist in its output in `deploy.config.json` under `games.<slug>.requiredOutputFiles`.
6. Add its slug to `publish.json` only when it is ready to launch.

All games share the browser origin `game.emmystack01.com`, so `localStorage` is shared. Give each game its own key prefix.

## Windows notes

* Folder renames can fail briefly if a program holds a folder open (antivirus, Explorer preview, a dev server serving `dist/`). The build retries automatically; if it still fails, close whatever is using `dist/` and run it again.
* If a build is killed, you may see folders called `.build-staging-…` or `.build-previous-…` next to `dist/`. They are ignored by Git and cleaned up by the next build.
