# Paseo 0.9.0-beta.2 — collection v0.1.0-rc.4

Date: 2026-09-21. Tracking: [#121](https://github.com/NaruForge/Paseo-Plugin/issues/121). Target: exact **Paseo 0.9.0-beta.2**, collection **v0.1.0-rc.4 prerelease**. This record concerns the 0.9 source retarget; older verification documents retain their original scope.

## Upstream comparison and response

Compared the [0.9.0-beta.1 release](https://github.com/getpaseo/paseo/releases/tag/v0.9.0-beta.1), [0.9.0-beta.2](https://github.com/getpaseo/paseo/releases/tag/v0.9.0-beta.2), current [plugin reference](https://paseo.sh/docs/plugins/reference) and exact npm `@getpaseo/plugin@0.9.0-beta.2` declarations.

- **Version rejection:** `requirements.paseo: ^0.8.0` is rejected on 0.9. Manifests now declare `^0.9.0`. SDK/client/catalog/lockfile pin exact `0.9.0-beta.2`.
- **Agent directory:** 0.9 `agents.list({ subscribe: {} })` owns an independent observation. Provider Usage, Prompt Palette and Command Deck request that once, keep local `agents.subscribe` listeners, and `release` the observation on cleanup. Later pages and 30-second refreshes use a plain list.
- **Workspace panel locations:** Command Deck registers `locations: ["workspace", "explorer"]`.
- **Additive APIs unused:** `useHosts`, `getPaseoClient`, `openExternalUrl`, `ExternalLink`, `navigation.openBrowser`, npm plugin sources, and timeline transformer accumulation changes are documented but not adopted.
- **Unchanged contracts:** separate runtime entries, Composer `button` / `update` / `remove`, Settings schema, usage SDK, Terminal SDK, read-only Git allowlist.
- **Compiler:** private entry remains `dist/server/server/plugins/compiler.js` → `compilePlugin({ client, server })`.

## Local verification

Environment: Windows, PowerShell, Node.js 22+ workspace, npm 11.14.1. Tracking branch `paseo-0.9.0-beta.2`.

- Workspace typechecks passed against exact 0.9.0-beta.2 declarations.
- Tests: Branch Garden 27, Command Deck 32, Prompt Palette 19, Provider Usage 39, plus 8 script tests.
- Staged compiler: `node scripts/check-plugin-compiler.mjs plugins/<id> <exact-0.9.0-beta.2-server-package-directory>` for each of the four plugins. Bundles compiled without `node_modules` in the staged source.

| Plugin | clientBytes | serverBytes |
| --- | --- | --- |
| branch-garden | 44806 | 29806 |
| provider-usage | 39430 | 6864 |
| prompt-palette | 32991 | 2234 |
| command-deck | 47298 | 15239 |

## Live directory install

Local daemon **0.9.0-beta.2** (desktop-managed, `pluginsEnabled: true`). Installed each plugin from its workspace directory. `paseo plugin ls --json` reported all four as `running` with no `error`. Logs: `[paseo] Loading plugin` then `[paseo] Plugin ready` for each ID. Descriptions from `paseo-plugin.json` appear in `plugin ls`. This is directory install/reload evidence, not Git add/update/recovery or native mobile certification.

## Publication boundaries

This source retarget does not move `v0.1.0-rc.2` or `v0.1.0-rc.3`. Native 0.9 app/mobile interaction and live Git add/update/recovery are not certified here. Prior [0.8 runtime](paseo-0.8-runtime.md) and [0.8 Git](paseo-0.8-git-source.md) reports remain historical. Therefore rc.4 remains a prerelease; follow [Releasing](../RELEASING.md).
