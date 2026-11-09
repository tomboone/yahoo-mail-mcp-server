# yahoo-mail-mcp-server

Yahoo Mail MCP server: full email management over IMAP, served as stdio or SSE. Plain JavaScript (ES modules), no compile step. Runs on Azure App Service from `ghcr.io/tomboone/yahoo-mail-mcp-server`.

## Linear

- linear_team: NEU
- linear_repo: yahoo-mail-mcp-server

## Docs

- specs_dir: docs

## Toolchain

- pnpm (version pinned by `packageManager`), Node 22 (`.node-version`).
- Before a PR: `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`. CI runs the same four scripts through `neuroticsasquat-ch/workflows`' `js.yml`.
- `typecheck` is `tsc` over the JS sources via `jsconfig.json`, non-strict: it checks types from JSDoc and the `@types/*` packages, with no compile step.
- `build` loads `server.js` (`await import`), which parses and links the whole shipped import graph without starting a listener. Nothing is compiled.
- CI (`.github/workflows/ci.yml`): `js`, `image` (image-check + `.github/ci/smoke.sh`), the `ci` gate, then on `main` `publish` to GHCR and `azure-deploy` to App Service. To redeploy without a commit, re-run the `azure-deploy` job of the latest `main` run.
