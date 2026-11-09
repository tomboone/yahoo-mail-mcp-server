# NEU-2247 — Adopt shared workflows: yahoo-mail-mcp-server

Ticket: [NEU-2247](https://linear.app/neuroticsasquatch/issue/NEU-2247) · Story: NEU-2215 · Milestone: M4 · Adoption
Project spec: ops `docs/specs/ops-shared-ci-workflows-project-spec.md` (Decisions 9, 11, 13, 16; *Repo contract*; *Caller templates*)
Reference adoptions: mlb-today PR #67 (image + publish caller), sunday-spin-frontend PR #137 (js caller, npm → pnpm)

## What and why

This repo's CI, image publishing and dependency automation become calls into
`neuroticsasquat-ch/workflows@v1`. Today `deploy.yml` pushes an image and deploys it to Azure on every
push to `main` whether or not the tests pass, there is no linter or type check, and the repo is on npm.
After this PR, nothing publishes or deploys unless `ci` passed on that commit, and the repo meets the JS
repo contract: pnpm, `.node-version`, and the four scripts `lint`, `typecheck`, `test`, `build`.

The project spec left open what `typecheck` and `build` mean for a plain-JS server with no compile step.
This spec decides that (Decisions 1–3).

## Decisions

1. **`typecheck` is `tsc --noEmit` over the JS sources, non-strict.** A `jsconfig.json` sets `allowJs`,
   `checkJs`, `noEmit`, `strict: false`, `module`/`moduleResolution: nodenext`, a target matching Node 22,
   `skipLibCheck`, `types: ["node"]`, and includes `server.js`, `lib/` and `test/`. The script is
   `tsc -p jsconfig.json`.
   Dev dependencies added: `typescript`, `@types/node` (22.x, matching the runtime), `@types/express`,
   `@types/cors`, `@types/imap`, `@types/mailparser`.
   Measured 2026-11-09 with TypeScript 7.0.2: 15 errors, all in `server.js`. Strict gives 170, mostly
   implicit `any`.
   Rejected: strict (turns a CI adoption into a typing project); checking only `lib/` and `test/` (the file
   with all the logic goes unchecked); `node --check` (checks no types).

2. **The 15 errors are fixed with real narrowing, not suppressed.** No `@ts-ignore`, `@ts-expect-error`
   or `any` casts.
   - **Tool arguments** (11 errors, `server.js:321–355`): `request.params.arguments` is
     `Record<string, unknown>`. Give it a JSDoc type describing the tool arguments (or type the handler
     methods' parameters) so the calls check. No behaviour change.
   - **OAuth `/authorize`** (4 errors, `server.js:1353`, `:1375`, `:1377`): a repeated query parameter
     arrives as an array. Before using them, require `redirect_uri` to be a single string and respond
     `400 Invalid redirect_uri` otherwise; narrow `state` (and any other query value passed to a
     string-typed API) the same way, ignoring or rejecting non-string forms. This is a deliberate small
     behaviour change: a request with a repeated `redirect_uri` now gets 400 instead of reaching `new URL`.
   - **Address field** (1 error, `server.js:953`): `parsed.to` may be `AddressObject[]`; handle the array
     form (join the `text` of each) instead of assuming one object.
   Rejected: JSDoc casts that assert what the runtime doesn't guarantee; suppress-and-follow-up.

3. **`build` loads the entry module**:
   `node --input-type=module -e "await import('./server.js')"`.
   Node parses and links the whole shipped import graph (`server.js`, `lib/`, every runtime dependency)
   and exits 0. `server.js` only starts a listener when it is the main module, so nothing binds. Verified
   on `main` 2026-11-09: exit 0. This is the plain-JS analogue of a link step, and catches a specifier
   that resolves for types but not at runtime.
   Rejected: `node --check` per file. `node --check a.js b.js` only checks the first file, the list has to
   be kept by hand, and tsc already reports syntax errors.

4. **`lint` is `oxlint --max-warnings 0` with default rules and no `.oxlintrc.json`.** `oxlint` is a dev
   dependency. The PR clears today's 10 warnings, all `no-unused-vars` in `server.js` (lines 545, 647, 678,
   691, 748, 829, 909, 931, 1422, 1578):
   - unused trailing callback params (`info`, `box`): drop them;
   - unused catch bindings: use `catch {`;
   - Express's error middleware at `:1578` must keep four parameters to be recognised: rename to `_next`;
   - the unused `redirect_uri` destructure in the token handler at `:1422`: remove it.
   Rejected: extra plugins (unmeasured findings); relaxing `no-unused-vars` for arguments.

5. **`test` stays `node --test`.**

6. **`azure-deploy` keeps deploying `:latest`.** image-publish moves `latest` only while the commit is the
   tip of `main`, so a late-finishing older commit re-sets App Service to the newer image and can't roll
   prod back.
   Rejected: deploying `sha-<7>` (an older commit whose CI finishes late would deploy over a newer one
   unless the caller duplicates image-publish's tip check).

7. **No manual trigger.** `ci.yml` has only the template's `pull_request` and `push: main` triggers. To
   redeploy without a commit, re-run the `azure-deploy` job of the latest `main` run
   (`gh run rerun <run-id> --job <job-id>`).
   Rejected: `workflow_dispatch` on `ci.yml` (deviates from Decision 16); a separate `redeploy.yml`
   (duplicates the deploy steps).

8. **Dockerfile: pnpm, and the dead stage goes.** The `dependencies` stage installs dev dependencies and
   nothing copies from it; delete it rather than convert it. The apk build tools
   (`python3 make g++`) stay untouched.
   Rejected: also removing the build tools (an image change beyond this ticket).

## Changes

### Package manager (npm → pnpm)

- `pnpm import` from `package-lock.json`, then delete `package-lock.json`. Commit `pnpm-lock.yaml`.
- `package.json`: add `packageManager: "pnpm@<current 12.x>"` (sunday-spin-frontend pins `pnpm@12.18.0`;
  use the then-current release). pnpm is not installed on the dev machine and Node 26 ships no Corepack:
  install it (`brew install pnpm`) or run it through `npx pnpm@<version>`.
- **Override:** the npm `overrides` block (`utf7` → `semver ^5.7.2`, from PR #20) must survive. Move it to
  pnpm's form (`overrides: { "utf7>semver": "^5.7.2" }` in `pnpm-workspace.yaml`), remove the npm
  `overrides` key, and confirm in `pnpm-lock.yaml` that `utf7`'s `semver` resolves to ≥ 5.7.2.
- **Install scripts:** pnpm fails the install on a dependency build script that isn't decided. The only
  package with one is the optional, macOS-only `fsevents` (via nodemon). If `pnpm install` asks, record the
  decision under `allowBuilds` in `pnpm-workspace.yaml` with a comment, as sunday-spin-frontend does.
  `pnpm install --frozen-lockfile` must pass on Linux (CI, Docker) and macOS.
- `.node-version`: `22` (matches `FROM node:22-alpine`).
- `.dockerignore`/`.gitignore`: no change needed for the lockfile; check that `pnpm-lock.yaml` and
  `pnpm-workspace.yaml` aren't excluded from the build context.

### `package.json` scripts

```json
"lint": "oxlint --max-warnings 0",
"typecheck": "tsc -p jsconfig.json",
"test": "node --test",
"build": "node --input-type=module -e \"await import('./server.js')\""
```

Existing scripts (`start*`, `dev`, `docker:*`, `test:health`, `test:sse`) stay.

### Dockerfile

- After `WORKDIR`, `RUN corepack enable`, with `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` (see
  sunday-spin-frontend's Dockerfile).
- Copy `package.json pnpm-lock.yaml pnpm-workspace.yaml`, then `pnpm install --frozen-lockfile --prod`.
- Delete the `dependencies` stage and the second `COPY package*.json`.
- Unchanged: the apk line, `LABEL`, `USER nodejs` (uid 1001, satisfies the non-root check), `EXPOSE`,
  `ENV`, `HEALTHCHECK`, `CMD`.

### `.github/ci/smoke.sh`

Today's `test.yml` docker job, as the convention file. It receives the image tag as `$1`:

- `docker run -d` the image with `-p 3000:3000 -e TRANSPORT_MODE=sse -e PORT=3000`;
- poll `http://localhost:3000/health` up to 30 times, 2 s apart, until it returns 200;
- always print the container logs, and remove the container on exit (`trap`);
- on anything but 200, emit `::error title=smoke::…` and exit 1.

`set -euo pipefail`; no Yahoo credentials are needed for `/health`.

### `.github/workflows/ci.yml`

The caller template, as shipped in mlb-today, with `js` in place of `python`:

- `js`: `neuroticsasquat-ch/workflows/.github/workflows/js.yml@v1`
- `image`: `…/image-check.yml@v1`
- `ci`: plain job, `if: always()`, `needs: [js, image]`, `actions/gate@v1`
- `publish`: `…/image-publish.yml@v1`, `image: ghcr.io/tomboone/yahoo-mail-mcp-server`, with the
  template's `if`, `needs: ci`, quoted `concurrency` group and `permissions`
- `azure-deploy`: a plain caller job carrying today's `deploy` steps unchanged (azure/login with the three
  `AZURE_*` secrets, azure/webapps-deploy with `app-name: yahoo-mail-mcp` and
  `images: ghcr.io/${{ github.repository }}:latest`, then the `/health` verify loop).
  - `needs: publish`
  - `if: ${{ !cancelled() && needs.publish.result == 'success' }}` (explicit, for the same reason the
    template's `publish` tests `needs.ci.result`)
  - `permissions: { contents: read, id-token: write }`
  - `concurrency: { group: "azure-deploy", cancel-in-progress: false }` so two deploys never overlap
  - It is **not** in `ci`'s `needs`: it runs after the gate, not as part of it.

Workflow-level triggers, `concurrency` and `permissions: contents: read` are the template's.

### Dependency automation

- `.github/workflows/dependencies.yml`: the template, `auto-promote: true`.
- `.github/dependabot.yml`: the standard, as in sunday-spin-frontend: `npm` (covers pnpm) and
  `github-actions`, the latter ignoring `neuroticsasquat-ch/workflows`; drop `include: scope`.

### Deleted

`.github/workflows/test.yml`, `deploy.yml`, `merge-main-into-dependencies.yml`, and `package-lock.json`.

### Docs

- `README.md`: `npm install` / `npm run …` become `pnpm install` / `pnpm run …`.
- `CLAUDE.md`: add a Toolchain section: pnpm; `pnpm run lint && pnpm run typecheck && pnpm run test &&
  pnpm run build` before a PR; one line each on what `typecheck` and `build` mean here (Decisions 1, 3).
- `CLAUDE.md` (with the `specs_dir: docs` pin) and the `.gitignore` change that un-ignores it were made
  during planning and ship in this PR.

## After merge (out of PR, manual)

1. From the workflows repo:
   `scripts/apply-rulesets.sh --repo tomboone/yahoo-mail-mcp-server --key-file <(op document get "ns-automation app key" --vault neuroticsasquat.ch)`.
   It updates the three existing rulesets by name (today they require no status check; verified
   2026-11-09), sets `AUTOMATION_APP_PRIVATE_KEY`, and turns on *Allow auto-merge*.
2. Turn on *Grouped security updates* by hand from the link the script prints.
3. `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` stay as repo secrets. Confirm the
   Azure federated credential's subject still matches: the deploy now runs from workflow `ci.yml`, job
   `azure-deploy`, on `refs/heads/main`. A subject scoped to the branch keeps working; one scoped to an
   environment or to the old workflow would not. The first `main` run shows which.

Order matters only in that `ci` must exist on `main` before the rulesets require it, which is why the
rulesets come after the merge.

## Acceptance criteria

- [ ] `pnpm install --frozen-lockfile` passes on a clean checkout; `package-lock.json` is gone;
      `pnpm-lock.yaml` resolves `utf7`'s `semver` to ≥ 5.7.2.
- [ ] `pnpm run lint`, `typecheck`, `test` and `build` each exit 0 locally, with no `@ts-ignore`,
      `@ts-expect-error` or oxlint disable comments added.
- [ ] `GET /authorize` with `redirect_uri` repeated in the query string returns 400; with a single valid
      `redirect_uri` it still redirects with `code` and `state`.
- [ ] The PR shows `js`, `image` and `ci`, with `ci` green; the `image` job reports a non-root uid and
      `smoke.sh` reaches `/health` 200.
- [ ] On the PR, `publish` and `azure-deploy` are skipped.
- [ ] After merge, the `main` run publishes `ghcr.io/tomboone/yahoo-mail-mcp-server:latest` and
      `:sha-<7>` only after `ci`, then `azure-deploy` runs and its `/health` check on
      `yahoo-mail-mcp.azurewebsites.net` returns 200.
- [ ] `.github/workflows/` contains only `ci.yml` and `dependencies.yml`.
- [ ] `gh api repos/tomboone/yahoo-mail-mcp-server/rulesets` shows the three shared rulesets, with `ci`
      required on `main`; the next Dependabot PR into `updates/dependencies` is auto-merged by the app.

## Out of scope

- Moving off Azure.
- Strict type checking, or typing `server.js` beyond what clears the 15 errors.
- The token endpoint not comparing `redirect_uri` with the one stored at `/authorize`
  (`server.js:1422`; the unused destructure is removed for lint, the missing check is a separate matter).
- Removing the Dockerfile's apk build tools.
- `render.yaml`, `docker-compose.yml`, `update_prompt.md`, `update_batch_operations.md`.
