# Contributing

Thanks for helping with the Loxia VS Code extension.

## Setup

```bash
npm ci
npm run verify
```

`npm run verify` is the CI gate: ESLint, Prettier, `tsc --noEmit`, unit tests, the grammar
pin check and an esbuild compile. The integration smoke test needs a display:

```bash
xvfb-run -a npm run test:integration   # Linux
npm run test:integration               # macOS/Windows with a desktop session
```

Press `F5` (or run the **Rodar extensão (Loxia)** launch configuration) to open the
Extension Development Host with this checkout loaded.

## Rules

- **Do not edit `syntaxes/loxia.tmLanguage.json`.** It is generated in
  [`loxia-lang/loxia`](https://github.com/loxia-lang/loxia) and synced from a release; use
  `npm run grammar:sync -- --version X.Y.Z` and commit `grammar.lock.json` with it.
- Keep the runtime dependency-free: `vscode` is the only external module at runtime, and
  the bundle is built by esbuild.
- Every behavior change needs a unit test when it is testable without VS Code, and a
  changelog entry under `## [Unreleased]`.
- Settings must be added to `package.json`, `SETTING_KEYS` in `src/config.ts` and the
  table in `README.md`/`docs/settings.md`; `test/unit/manifest.test.ts` polices the first
  two.
- Use Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), small PRs, and
  explain user-visible changes in the PR description.
- Do not add telemetry or network calls at activation. Grammar sync is an explicit
  maintainer command, never a runtime download.

## Reporting bugs

Include the extension version, VS Code version, `loxia --version`, the OS and the **Loxia
Language Server** / **Loxia Run** output. A minimal `.lx` file is worth more than a
screenshot.
