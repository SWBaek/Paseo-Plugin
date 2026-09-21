# Compatibility

Published `v0.1.0-rc.2` contracts: Paseo daemon/client/CLI and exact `@getpaseo/plugin` **0.7.2**. Published `v0.1.0-rc.3` contracts: exact final **0.8.0**. The v0.1.0-rc.4 collection and all four current sources target exact **0.9.0-beta.2**. Development checks use Node.js 22 in CI. The root package and catalog describe the collection release; they do not change Paseo's plugin API version.

## Published 0.7 release: daemon and client support

| Plugin | Daemon scope | Client limitations |
| --- | --- | --- |
| Branch Garden | Windows primary; macOS/Linux automated checks | Native navigation depends on the target Paseo client |
| Provider Usage | Windows primary; macOS/Linux automated checks | Experimental endpoints; availability depends on host authentication |

"Automated checks" means type checking and test execution, not a live Paseo daemon certification. Both plugin test suites run on all three CI operating systems. Native iOS/Android apps and macOS/Linux daemon execution must not be described as runtime-verified based on these checks.

## Evidence

See the [two-plugin removal verification](verification/0.1.0-rc.2.md), subsequent [Branch Garden English UI and screenshot verification](verification/branch-garden-english.md), and [GitHub Actions](https://github.com/NaruForge/Paseo-Plugin/actions/workflows/validate.yml). Records distinguish source checks, runtime activation, RPC actions, UI layouts/themes and untested environments. Historic `0.7.0-beta.1` Git-update evidence in [Git installation](GIT_INSTALLATION.md) is not evidence for a new release.

## Final Paseo 0.8.0 collection

All four sources have separate runtime entries and exact 0.8.0 SDK dependencies. The three Composer integrations use the final `button` / `update` / `remove` contract. Install v0.1.0-rc.3 with final 0.8.0 daemon, app and CLI; beta.1 is incompatible with this pill API even if Paseo’s prerelease matcher accepts the manifest range `^0.8.0`.

| Plugin | Daemon scope | Final-version evidence |
| --- | --- | --- |
| Branch Garden | Windows, macOS, Linux; Git required | Exact SDK types, read-only regression tests, staged compiler |
| Provider Usage | Windows, macOS, Linux; enabled Provider connection | Usage/settings/registration tests, staged compiler, simulated pill UI |
| Prompt Palette | Windows, macOS, Linux; Agent with Workspace | Settings/send/registration tests, staged compiler, simulated pill/Modal UI |
| Command Deck | Windows + PowerShell 7 | Settings/runner/registration tests, staged compiler, simulated pill action |

See the [0.8.0 release verification](verification/paseo-0.8.0-release.md) for actual commands, CI and UI scope. Collection v0.1.0-rc.3 remains a prerelease. Native app/mobile and live final-version Git activation/update are not certified by these source checks.

The earlier [user runtime report](verification/paseo-0.8-runtime.md), [Git verification](verification/paseo-0.8-git-source.md) and per-plugin beta source records retain their original scope. The 0.8.0 release does not retroactively change those results. Follow the [0.8 migration guide](MIGRATION_0.8.md) and [#112](https://github.com/NaruForge/Paseo-Plugin/issues/112) for those changes.

## Paseo 0.9.0-beta.2 collection

All four sources keep separate runtime entries and the 0.8 Composer `button` / `update` / `remove` contract. They pin exact 0.9.0-beta.2 SDKs and declare `requirements.paseo: ^0.9.0`. Install v0.1.0-rc.4 with 0.9.0-beta.2 daemon, app and CLI. A `^0.8.0` manifest is rejected on 0.9.

| Plugin | Daemon scope | 0.9 evidence |
| --- | --- | --- |
| Branch Garden | Windows, macOS, Linux; Git required | Exact 0.9 SDK types, read-only regression tests, staged compiler |
| Provider Usage | Windows, macOS, Linux; enabled Provider connection | Usage/settings/registration tests, owned Agent directory observation, staged compiler |
| Prompt Palette | Windows, macOS, Linux; Agent with Workspace | Settings/send/registration tests, owned Agent directory observation, staged compiler |
| Command Deck | Windows + PowerShell 7 | Settings/runner/registration tests, Explorer panel locations, staged compiler |

See the [0.9.0-beta.2 verification record](verification/paseo-0.9.0-beta.2.md) for commands, compiler bytes, live directory install and remaining limits. Collection v0.1.0-rc.4 remains a prerelease. Native app/mobile and live Git activation/update are not certified by these source checks. Follow the [0.9 migration guide](MIGRATION_0.9.md) and [#121](https://github.com/NaruForge/Paseo-Plugin/issues/121). Daemon and app compatibility are checked separately.
