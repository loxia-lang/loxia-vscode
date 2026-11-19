# Architecture

The extension is a thin VS Code adapter around the `loxia` CLI. It owns the editor
surface, not the language: parsing, checking, formatting and the language server live in
[`loxia-lang/loxia`](https://github.com/loxia-lang/loxia).

## Modules

| File                   | Responsibility                                                             |
| ---------------------- | -------------------------------------------------------------------------- |
| `src/extension.ts`     | Activation, CLI resolution, commands, VS Code event wiring                 |
| `src/config.ts`        | Settings defaults/validation, feature flags, server options                |
| `src/cli.ts`           | CLI candidates, probing, argv for server/run/build/check/repl, build hints |
| `src/paths.ts`         | `${variable}` substitution, compiled output path, argument splitting       |
| `src/protocol.ts`      | LSP framing (`Content-Length`) with an incremental reader                  |
| `src/lsp/client.ts`    | JSON-RPC client, lifecycle, timeouts, diagnostics, capabilities            |
| `src/lsp/manager.ts`   | Server state, diagnostics collection, document sync, config updates        |
| `src/lsp/providers.ts` | VS Code providers, one per LSP feature, gated by settings                  |
| `src/lsp/convert.ts`   | LSP → VS Code conversions (ranges, edits, symbols, hints)                  |
| `src/run.ts`           | Interpreted/compiled run, build progress, terminal, trust checks           |
| `src/status.ts`        | Status bar item for the language server                                    |

Pure modules (`config`, `cli`, `paths`, `protocol`) do not import `vscode`; they are the
unit-test surface. The LSP layer imports `vscode` and is covered by the integration smoke
test and the fake server.

## Activation

1. Create the **Loxia Language Server** and **Loxia Run** output channels, the diagnostic
   collection and the status bar.
2. Read settings with variables resolved against the active document/workspace.
3. Register providers. Each provider checks its `loxia.features.*` toggle on every call,
   so toggling a feature does not require reloading the window.
4. Register commands. File commands accept an optional `Uri` (explorer context) and fall
   back to the active/visible `.lx` document.
5. Start the language server unless `loxia.lsp.enabled` is `false`.

`loxia.cli.path`/`loxia.cli.args` are **restricted in untrusted workspaces** and restricted in untrusted
workspaces. The CLI is probed once with `--version` and cached; **Restart Language
Server** and changes to `loxia.cli.*`/`loxia.server.*` invalidate the cache.

## Language server lifecycle

`LspManager` owns one `LspClient` per window. It resolves the CLI, builds
`<cli> <cli.args> <server.args>` (default `lsp`), starts the process in
`loxia.server.cwd` and initializes it with `initializationOptions` derived from the
feature settings. Open documents are sent after `initialize`; changes use full sync.

- Request timeout: 10 s (15 s for `initialize`).
- Unexpected exit → status bar error + output log; **Restart Language Server** recovers.
- `shutdown`/`exit` are best effort on deactivation; the process is killed after 300 ms.
- Server requests (the server does not use them today) are answered with `null` so a
  future server cannot wedge.
- Diagnostics are stored twice: the raw LSP array for code actions and the VS Code
  `DiagnosticCollection` for squiggles. Disabling `loxia.features.diagnostics` clears the
  collection without losing the raw data.

## Run

`RunService` resolves the engine from `loxia.run.mode` (or a QuickPick for `ask`), saves
the document when configured, and:

- **interpreted**: opens a terminal with `loxia run <file> [-- args]`;
- **compiled**: builds with `loxia build <file> --emit=exe -o .loxia/bin/...` in a
  cancellable progress notification (the build log streams to **Loxia Run**), then opens
  a terminal for the binary.

The terminal is created with `shellPath`/`shellArgs` rather than `sendText`, so paths and
arguments are not re-parsed by a shell. The compiled output path mirrors the source tree
under `loxia.run.compiled.outputDir` (default `.loxia/bin`), which avoids collisions and
stays inside the `.loxia/` directory projects already ignore.

Run/Build/REPL require a trusted workspace and touch only `file:` documents. Check is
read-only and works in untrusted workspaces.

## Grammar

`syntaxes/loxia.tmLanguage.json` is a **release asset** from the language repo, pinned by
`grammar.lock.json` (language version + SHA-256). `npm run grammar:check` validates the
hash and the manifest wiring; `npm run grammar:sync` downloads a release and updates both
files. No runtime download, no hand editing. See
[grammar-sync.md](grammar-sync.md).

## Tests

- `test/unit/*.test.ts` — `node:test` via `tsx`; no VS Code, no network.
- `test/integration/` — `@vscode/test-electron` opens a fixture workspace, loads the
  extension, asserts `.lx` language registration, commands and a diagnostic published by
  a fake LSP server.
- `scripts/check-grammar.mjs` — grammar pin + manifest invariants.
- `npm run verify` runs lint, format check, typecheck, unit tests, grammar check and the
  esbuild bundle; CI adds the VSIX package and the integration job.
