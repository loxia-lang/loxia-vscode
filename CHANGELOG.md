# Changelog

All notable changes to the Loxia VS Code extension. The extension follows its own semver;
the grammar pin (`grammar.lock.json`) tracks the language release it was built for.

## [Unreleased]

### Added

- **Find references**, **document highlights**, **go to type definition**,
  **implementation** and the **type hierarchy** view, each with its own
  `loxia.features.*` toggle. They consume the new LSP capabilities from
  `loxia` [#46](https://github.com/loxia-lang/loxia/issues/46).
- **Fix all** (`source.fixAll`) is advertised alongside quick fixes; the server's safe
  fixes are applied in one edit.
- Renaming or moving a `.lx` file now sends `workspace/willRenameFiles`, so imports that
  reference the module are rewritten before the move.

### Changed

- `DiagnosticTag.Unnecessary` from the server now greys out unused locals and imports.
- Unsaved buffers of open modules are sent to the server, so importers recheck without a
  save.

## [1.1.0] — 2026-11-18

First release as its own repository, extracted from `loxia-lang/loxia` (ADR-0109).

### Added

- **Run button** (`editor/title/run`) with `loxia.run.mode`: `interpreted` (default),
  `compiled` (build with `--emit=exe` into `.loxia/bin/` and execute) or `ask` (QuickPick).
- **Run (Interpreted)**, **Run (Compiled)**, **Run with Arguments…**, **Build Native
  Binary**, **Check File** and **Open REPL** commands in the Run submenu, explorer context
  and command palette.
- **Per-feature settings** for diagnostics, hover, definition, completion (including
  inherited members), signature help, inlay hints, formatting, code actions, rename,
  document symbols and workspace symbols; `loxia.lsp.enabled` switches to grammar-only
  mode.
- **CLI autodetection** (`loxia`, `python3 -m loxia`, `python -m loxia`, `py -3 -m loxia`)
  with `loxia.cli.path`/`loxia.cli.args` overrides, plus variable substitution
  (`${workspaceFolder}`, `${userHome}`, `${env:…}`) in path settings.
- **Status bar** item with the language server lifecycle; **restart server** command and
  JSON-RPC tracing (`loxia.lsp.trace`).
- **Actionable compiled-mode errors** for missing `llvmlite`, Boehm GC, a C compiler or a
  backend gap.
- **Unit tests** (`node:test` via `tsx`) for the JSON-RPC framing, settings, path/argument
  handling, CLI argv and manifest/grammar wiring, plus a **VS Code integration smoke test**
  with a fake LSP server.
- **CI, release and grammar-sync workflows**, VSIX packaging, Marketplace/Open VSX
  runbook, icon and Marketplace metadata.
- **Grammar pinned by release asset**: `syntaxes/loxia.tmLanguage.json` is downloaded from
  the `loxia-lang/loxia` release and verified with `grammar.lock.json` (version + SHA-256).

### Fixed

- **Run output no longer disappears**: Run/Build/Check/REPL now execute through a normal
  terminal with `sendText` and shell-specific quoting instead of setting the process as the
  terminal's `shellPath`. When the program exits, the shell prompt returns and the output
  remains in the terminal.

### Changed

- The LSP client now lives in this repository; the language server remains in the main
  `loxia` repo and is consumed as the `loxia lsp` CLI (ADR-0090, ADR-0109).
- The extension starts the language server from the same resolved CLI command used by
  Run/Build, so a checkout only needs one `loxia.cli.*` configuration.
- Diagnostics are gated on `loxia.features.diagnostics`; disabling them clears the
  collection instead of leaving stale squiggles.
- Workspace trust is enforced for Run/Build/REPL; untrusted workspaces keep highlighting
  and the read-only language server.

[1.1.0]: https://github.com/loxia-lang/loxia-vscode/releases/tag/v1.1.0
