# Contributing

English and Korean contributions are welcome. Start with an [issue](https://github.com/NaruForge/Paseo-Plugin/issues/new/choose) describing the user problem and an observable result. For large changes, agree on scope before implementation. The maintainer manages Project fields; contributors do not need access to the private GitHub Project.

## Local development

Use Node.js 22, npm, and Git. Clone your fork, create a branch, and run:

```sh
npm ci
npm run check
```

Each `plugins/*` directory is independently installed. Read its manifest to identify the default runtime ID. All four sources target **0.9.0-beta.2**: start with `index.client.tsx` and `index.server.ts`, then `client/`, `server/` and `shared/`. Do not share runtime code between plugins. Paseo supplies runtime modules; local npm dependencies are for development. Never add an ambient declaration to invent a Paseo API.

For **0.9.0-beta.2** work, follow the [migration guide](docs/MIGRATION_0.9.md) and [tracking issue #121](https://github.com/NaruForge/Paseo-Plugin/issues/121). Use `index.client.ts[x]`, `index.server.ts[x]`, and `client/`, `server/`, `shared/`. Import client hooks/types from `/client`, server contexts from `/server`, shared helpers from the SDK root, and host UI from `/client/react-native` or `/client/ui`. Match the target CLI's fresh scaffold and exact SDK declarations, including type-only runtime boundaries. The updated [capability reference](docs/plugin-capabilities/README.md) describes 0.9 APIs; it is not proof that current source runs in the app.

For one plugin:

```sh
npm run typecheck --workspace branch-garden
npm test --workspace branch-garden
```

All plugin test suites run on Windows, macOS and Linux. Automated tests do not establish native client or daemon runtime support.

## Runtime and UI review

Use a daemon you control. Check `paseo plugin ls` before every lifecycle operation. Install a development directory under a distinct runtime ID, then reload that ID after edits. Do not restart the daemon. Do not enable its global plugin switch without the owner's permission.

```sh
paseo plugin install /absolute/path/to/Paseo-Plugin/plugins/branch-garden --id branch-garden-dev
paseo plugin reload branch-garden-dev
paseo plugin ls
paseo plugin logs branch-garden-dev
```

Use [configuration guidance](docs/CONFIGURATION.md) for prerequisites. The commands above use source compatible with the target daemon; all four plugin sources target 0.9.0-beta.2. Match each test daemon and app to the selected plugin/ref. For a remote daemon, use the global form `paseo --host <target> plugin ls`. Verify both daemon and app versions. Remove temporary installations after verification; built-in settings are deleted when their installation is removed.

Follow [Design rules](docs/DESIGN.md). Report the impact grade, tested layouts/themes/states, and why other environments were omitted. Use actual UI screenshots; redact private project names, local paths, account details and tokens before attaching them. Label fixture renders as fixtures.

## Pull requests

Use the PR template and `Closes #<issue>`. Explain the user-visible result and validation. Update relevant plugin guides, both root READMEs and the catalog when behavior or requirements change. Documentation-only work needs link/contract checks, not unrelated tests.

Keep read-only command and HTTP allowlists, credential boundaries and cleanup behavior intact. Test changed behavior and failure paths. Never include credentials or private logs. See [SECURITY.md](SECURITY.md) for sensitive reports.

Contributions are provided under this repository's [MIT license](LICENSE). Credit upstream code and preserve applicable notices. Be respectful, discuss the work, and avoid personal attacks or harassment; maintainers may moderate disruptive participation.

Repository-specific agent instructions are in [AGENTS.md](AGENTS.md); release responsibilities are in [RELEASING.md](docs/RELEASING.md).
