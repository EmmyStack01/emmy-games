# Deployment guide: Emmy Games on Cloudflare Pages

This guide covers hosting **game.emmystack01.com** on Cloudflare Pages.

```
emmystack01.com         ──► Vercel         (main Emmy STACK01 website, unchanged)
game.emmystack01.com    ──► Cloudflare Pages (this repository)
DNS for both            ──► Namecheap      (stays the DNS provider)
```

> **Status of this document.** Cloudflare and Namecheap steps below follow Cloudflare's documentation
> (checked while writing this guide). **None of the Cloudflare or Namecheap behaviour has been tested
> from this repository**: no deployment has been made, no DNS record has been changed, and rollback has not been
> exercised. Dashboard wording changes over time, so follow the intent of each step if a label differs.
> Items marked **[unverified]** are expectations, not tested facts.

---

## 1. What the build guarantees, and what Cloudflare must match

The build (`npm run build`) enforces the publishing rules itself (see the README):

* **Production** builds publish only the games listed in `publish.json`. `PUBLISH_ALL=1` is ignored.
* **Preview** builds may publish everything when `PUBLISH_ALL=1`.
* A build with missing or inconsistent branch information fails; it never assumes "preview".
* Output is assembled in a staging folder and only then swapped into `dist/`; any failure keeps the previous `dist/`.

Cloudflare documents `CF_PAGES`, `CF_PAGES_BRANCH` and `CF_PAGES_COMMIT_SHA` as variables it injects, and says they
can be overridden. The build therefore **cannot read "which branch is production" from Cloudflare**; it compares
`CF_PAGES_BRANCH` with `productionBranch` in `deploy.config.json`. Two rules follow:

1. **Keep `productionBranch` in `deploy.config.json` identical to the Production branch in the Cloudflare project.**
   Currently `main`. If you ever change one, change the other in the same step. If they differ, a real production
   build would be treated as a preview build, and `PUBLISH_ALL=1` (if set) would then be honoured.
2. **Never create variables named `CF_PAGES`, `CF_PAGES_BRANCH`, `CF_PAGES_COMMIT_SHA` or `CF_PAGES_URL` in the Cloudflare dashboard.**
   Let Cloudflare inject them.

---

## 2. Cloudflare Pages project settings

Create the project by connecting the Git repository (Workers & Pages → Create → Pages → Connect to Git).

| Setting | Value |
| --- | --- |
| Production branch | `main` (must equal `productionBranch` in `deploy.config.json`) |
| Framework preset | None |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| Root directory | Leave empty (the repository root: the build needs both `portal/` and `games/`) |
| Node.js version | **22** |

**Node.js 22.** Set the environment variable `NODE_VERSION` = `22` for **both** the Production and the Preview
environment (Settings → Environment variables). Cloudflare also reads `.node-version` / `.nvmrc` from the repository,
and both contain `22`. The build itself stops with a clear message if it runs on Node older than 22.

**Environment variables.**

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `NODE_VERSION` | `22` | `22` | Required |
| `PUBLISH_ALL` | **do not set** | `1` (optional) | Lets preview branches show every game, including unpublished ones |

Even if `PUBLISH_ALL` were set on Production by mistake, the build ignores it and prints a warning. Remove it anyway.

**Preview deployments.** Make sure branch (preview) deployments are enabled for non-production branches.
Each branch gets its own `*.pages.dev` address.

> **Protect previews that show unpublished games.** With `PUBLISH_ALL=1`, a preview URL serves games that are not
> public yet. Anyone who learns that URL could open it. Cloudflare documents using Cloudflare Access over
> `*.{project}.pages.dev` to restrict previews. Enabling Access (or only enabling `PUBLISH_ALL` when you are about to test) is recommended.

**Build time.** Each Cloudflare build runs `npm ci` for the game, the root build-script tests (about 20 s), the game's
1,087 tests and the Vite build. **[unverified]** whether this fits comfortably within your Cloudflare plan's build time on first run; check the first build log.

---

## 3. Custom domain and DNS (Namecheap)

Cloudflare documents that a **subdomain** can be served by Pages while its DNS stays at another provider, using a
CNAME record. (Apex domains would need Cloudflare nameservers; `game.emmystack01.com` is a subdomain, so Namecheap can stay.)

**Order matters. Add the domain in Cloudflare first, then the DNS record.** Cloudflare warns that a CNAME pointing at
`<project>.pages.dev` without the domain being added to the project in the dashboard will not resolve.

1. Cloudflare: Workers & Pages → your project → **Custom domains** → **Set up a custom domain** → enter `game.emmystack01.com`.
   Cloudflare shows the target to point at, which is `<your-project>.pages.dev`.
2. Namecheap: Domain List → `emmystack01.com` → **Manage** → **Advanced DNS** → **Add New Record**:

   | Type | Host | Value | TTL |
   | --- | --- | --- | --- |
   | CNAME Record | `game` | `<your-project>.pages.dev` | Automatic |

   Enter only `game` as the host (not the full domain), or the record name may be doubled.
   Use exactly the target Cloudflare displays for your project.
3. Do **not** edit, delete or move any existing records for `emmystack01.com` or `www` (they serve the Vercel site),
   and do not change nameservers.
4. If Namecheap already has a different record for the host `game` (for example a parking or URL-redirect record), remove that one record
   so the CNAME can take its place. **[unverified]** Namecheap's screen labels; check what you see.
5. Back in Cloudflare, wait for the domain to show as active and for HTTPS to be issued (this can take from minutes to longer).
   Then open `https://game.emmystack01.com/`.

After the custom domain works, the project stays reachable at `<project>.pages.dev` as well. Cloudflare documents an optional redirect from `pages.dev`
to the custom domain, if you want only one public address.

---

## 4. Safe launch procedure

Launch is controlled by `publish.json`. Until it lists `emmy-hustle`, the public site shows only the placeholder.

**A. Before anything is public**

1. On your PC: `npm run test:all`, then `npm run build:all`, then serve `dist/` and play through `/emmy-hustle/`.
2. Push a non-production branch (for example `launch-check`). With `PUBLISH_ALL=1` on Preview, Cloudflare builds a preview with the real game.
3. Run the **real-device checks** in section 6 on that preview URL.

**B. Go live with the portal only**

4. Merge to `main` with `publish.json` still `{ "published": [] }`.
5. Confirm `https://game.emmystack01.com/` loads, `/emmy-hustle/` shows the **placeholder** (not the game), and that unknown URLs show the portal's 404 page.

**C. Launch the game**

6. Open a pull request that changes `publish.json` to `{ "published": ["emmy-hustle"] }`. Nothing else.
7. Merge it. Cloudflare builds production; the build log should say `CLOUDFLARE PRODUCTION build` and `Game(s) published: emmy-hustle`.
8. Check `https://game.emmystack01.com/emmy-hustle/` on a real phone (section 6, quick version).

If any build fails, nothing partial is produced: the build exits non-zero and does not write a new `dist/`.
**[unverified]** I expect Cloudflare to keep serving the previous production deployment when a build fails, but this has not been verified. Check in the Cloudflare dashboard the first time a build fails.

---

## 5. Rollback procedure

Cloudflare's rollback behaviour below is taken from Cloudflare's documentation. **It has not been tried or verified locally.**

**Fastest: roll back in Cloudflare.**
Cloudflare documents that you can revert a Pages project to a previous *production* deployment: Project → **Deployments** → find an earlier successful production deployment → the actions menu (⋯) → **Rollback to this deployment**.
Per the docs, only successfully built production deployments are valid targets (preview deployments are not), and the change takes effect immediately.

After a rollback, **also fix the repository**, otherwise the next production build from `main` re-deploys the problem:
revert the offending commit on `main`.

**Unpublish only the game: revert `publish.json`.**
Set it back to `{ "published": [] }` (or revert the launch commit) and merge. The next production build serves the placeholder again.
This depends on a new successful build, so it is slower than a Cloudflare rollback.

**What a rollback does not touch.** Players' saves live in each player's browser (`localStorage`) and are not changed by deployments.
If a future release changes the save format, test that older saves still load before launching, and test rolling back too.

---

## 6. Real-device testing requirements

**No browser or real-device testing has been performed as part of this work.** The automated tests and build checks
prove file layout, paths and publishing rules only. Before launch, test the **preview URL over HTTPS** (not only `localhost`):

*Devices*

* At least one **physical Android phone** with Chrome (the main target for a mobile-first game).
* An **iPhone with Safari**, if any of your players use one. Safari differs from Chrome for audio, full-screen and storage.
* Windows with Chrome or Edge.
* Test on mobile data as well as Wi-Fi: the game's JavaScript bundle is about 1.3 MB (about 350 KB compressed), and the first load matters for players in Nigeria.

*What to check*

* Portal home page, the link to Emmy's Hustle, the `/emmy-hustle/` page, and an unknown URL (404 page).
* The game starts, the character sprite is visible, and the browser's network panel shows **no failed (404) requests**, especially for `/emmy-hustle/assets/...`.
* Touch controls work and the layout fits in portrait and landscape, including phones with notches and the browser's address bar showing/hiding.
* Missions, dialogue and progression work for several minutes of real play.
* **Save system:** play, reload the page, close the tab and reopen it, and confirm progress persists. Clear the site data and confirm a fresh start works.
  Saves from `localhost` do **not** carry over to `game.emmystack01.com` (different browser origin); that is expected.
* Performance feels smooth on a mid-range phone; no overheating or crashes after 10+ minutes.
* Sound (if any) starts after the first tap, as mobile browsers require.

Quick version after launch: open the live URL on one real phone, start the game, confirm the sprite, play a minute, reload and confirm the save.

---

## 7. Troubleshooting

| You see | Meaning and fix |
| --- | --- |
| `CF_PAGES=1 but CF_PAGES_BRANCH is missing or empty` | Cloudflare variables are incomplete or overridden. Remove any manual `CF_PAGES*` variables. The build refuses to guess. |
| `Ambiguous branch … differs only by letter case` | The branch name and `productionBranch` match ignoring case but not exactly. Fix `deploy.config.json` or the branch name. |
| `PUBLISH_ALL must be "1", "0" or unset` | Use `1`. Values such as `true` are rejected on purpose. |
| Warning: `PUBLISH_ALL … IGNORED` | It was set on a production build. Remove it from Production environment variables. |
| `Node.js 22 or newer is required` | Set `NODE_VERSION=22` in Cloudflare (Production and Preview). |
| `game output is invalid … outside /emmy-hustle/` | The game was built with the wrong Vite `base`. It must be `'/emmy-hustle/'` in `games/emmy-hustle/vite.config.mjs`. |
| `required file … is missing` | A file listed in `deploy.config.json` is absent from the game build. |
| `portal validation failed … broken reference` | A portal page links to a file that does not exist, or uses the wrong letter case. Cloudflare is case-sensitive. |
| `publish.json is invalid` | The file must be exactly `{ "published": [ … ] }` with existing game slugs. |
| Custom domain shows an error (for example 522) | Check that the domain was added to the Pages project **and** that the Namecheap CNAME points to the project's `pages.dev` address. A CNAME alone, without the domain added in Pages, will not work. |
| `CRITICAL: … previous output is safe at .build-previous-…` | Extremely rare: the final folder swap failed and could not be undone. Rename that folder to `dist` by hand. |
| `.build-staging-…` folders next to `dist/` | Left by an interrupted build. Safe to delete; the next build cleans them. |
