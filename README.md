# Loxia for VS Code

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/loxia-lang.loxia)](https://marketplace.visualstudio.com/items?itemName=loxia-lang.loxia)
[![Open VSX](https://img.shields.io/open-vsx/v/loxia-lang/loxia)](https://open-vsx.org/extension/loxia-lang/loxia)
[![CI](https://github.com/loxia-lang/loxia-vscode/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/loxia-lang/loxia-vscode/actions/workflows/ci.yml)
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)

Syntax highlighting, a full LSP client and a **Run** button for
[Loxia](https://github.com/loxia-lang/loxia), the small statically checked language
descended from Lox. The extension is a thin client: the compiler, checker, formatter and
language server stay in the `loxia` CLI.

## Features

- **Syntax highlighting** from the generated TextMate grammar (`.lx`).
- **Diagnostics** with the same codes, spans, labels and trace as `loxia check`.
- **Hover**, **go to definition**, **completion** (scope, imports, modules, members and
  inherited members), **signature help**, **inlay hints** of inferred types.
- **Formatting** with the canonical formatter, **quick fixes**, semantic **rename**
  (including cross-file top-level symbols), **document symbols** and **workspace symbols**.
- **Run** interpreted with the tree-walk interpreter or **compile** a native binary with
  the optional LLVM backend, from the editor title play button, the Run menu or the
  command palette.
- **Check** and **REPL** commands, and a status bar item for the language server.
- No telemetry. No npm runtime dependencies.

## Install

1. Install the extension from the
   [Marketplace](https://marketplace.visualstudio.com/items?itemName=loxia-lang.loxia) or
   [Open VSX](https://open-vsx.org/extension/loxia-lang/loxia).
2. Install the `loxia` CLI on `PATH` (the extension autodetects it):

   ```bash
   uv tool install loxia     # or: pipx install loxia

   # native backend (compiled mode): LLVM extra + Boehm GC + a C compiler
   uv tool install "loxia[llvm]"
   sudo apt install libgc-dev   # Debian/Ubuntu; brew install bdw-gc on macOS
   ```

Without the CLI, syntax highlighting works and the extension tells you what is missing;
the language server and Run stay disabled.

## Run and build

The play button in the editor title uses `loxia.run.mode`:

| Mode                    | What it does                                                             | Requirements                         |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `interpreted` (default) | `loxia run <file>` in a terminal                                         | `loxia` CLI                          |
| `compiled`              | `loxia build <file> --emit=exe` into `.loxia/bin/`, then runs the binary | `loxia[llvm]`, `libgc`, a C compiler |
| `ask`                   | Shows a QuickPick every time                                             | —                                    |

Other entry points:

- **Loxia: Run (Interpreted)** / **Loxia: Run (Compiled)** in the Run submenu.
- **Loxia: Run with Arguments…** prompts for the arguments passed after `--`.
- **Loxia: Build Native Binary** builds without running.
- **Loxia: Check File** runs `loxia check` in a terminal (useful when diagnostics are off).
- **Loxia: Open REPL** opens an interactive `loxia repl` in the workspace.

Compiled artifacts keep the source layout under `.loxia/bin/` (for example
`src/main.lx` → `.loxia/bin/src/main`), so two `main.lx` files do not collide. The
`.loxia/` directory is already the project cache convention and is ignored by the
language's own `.gitignore` template.

`loxia.run.args` supplies default program arguments; **Run with Arguments…** overrides
them for one run. `loxia.run.debug` passes `--debug` to the interpreter (overflow checks);
compiled builds use release wrapping.

### Compiled mode troubleshooting

The build log goes to the **Loxia Run** output channel. The extension turns the common
failures into an actionable message:

| Message                            | Fix                                                               |
| ---------------------------------- | ----------------------------------------------------------------- |
| `No module named 'llvmlite'`       | `uv tool install "loxia[llvm]"` (or `pipx install "loxia[llvm]"`) |
| `gc.h: No such file` / libgc       | install `libgc-dev` / `bdw-gc`                                    |
| `cc: not found` / linker           | install a C compiler (`build-essential`, Xcode CLT…)              |
| `not supported by the backend yet` | run that file interpreted; the backend gap is declared            |

## Language server

The extension starts `loxia lsp` (JSON-RPC over stdio). Command resolution:

1. `loxia.cli.path` + `loxia.cli.args`, when set (for a checkout, use
   `"loxia.cli.path": "uv"` and `"loxia.cli.args": ["run", "python", "-m", "loxia"]`).
2. Otherwise it probes `loxia`, `python3 -m loxia`, `python -m loxia` and, on Windows,
   `py -3 -m loxia`.
3. `loxia.server.args` is appended (default `["lsp"]`); `loxia.server.cwd` changes the
   working directory.

The client implements diagnostics, hover, definition, completion, signature help, inlay
hints, formatting, code actions, rename, document and workspace symbols. The server is
synchronous and uses full document sync; imported modules are read from disk.

## Settings

| Setting                                     | Default         | Description                                                        |
| ------------------------------------------- | --------------- | ------------------------------------------------------------------ |
| `loxia.lsp.enabled`                         | `true`          | Start the language server. Turn off for grammar-only highlighting. |
| `loxia.cli.path`                            | `""`            | CLI executable (`""` = autodetect).                                |
| `loxia.cli.args`                            | `[]`            | Arguments before the subcommand (e.g. `["-m","loxia"]`).           |
| `loxia.server.args`                         | `["lsp"]`       | Arguments appended for the server.                                 |
| `loxia.server.cwd`                          | `""`            | Server working directory (`${workspaceFolder}` supported).         |
| `loxia.lsp.trace`                           | `"off"`         | Log JSON-RPC (`messages` or `verbose`) in the LSP output channel.  |
| `loxia.features.diagnostics`                | `true`          | Publish diagnostics.                                               |
| `loxia.features.hover`                      | `true`          | Hover.                                                             |
| `loxia.features.definition`                 | `true`          | Go to definition.                                                  |
| `loxia.features.completion`                 | `true`          | Completion.                                                        |
| `loxia.features.completionInheritedMembers` | `true`          | Inherited members in completion.                                   |
| `loxia.features.signatureHelp`              | `true`          | Signature help.                                                    |
| `loxia.features.inlayHints`                 | `true`          | Inferred-type hints.                                               |
| `loxia.features.formatting`                 | `true`          | Formatter.                                                         |
| `loxia.features.codeActions`                | `true`          | Quick fixes.                                                       |
| `loxia.features.rename`                     | `true`          | Rename.                                                            |
| `loxia.features.documentSymbols`            | `true`          | Outline.                                                           |
| `loxia.features.workspaceSymbols`           | `true`          | Workspace symbols.                                                 |
| `loxia.run.mode`                            | `"interpreted"` | `interpreted`, `compiled` or `ask`.                                |
| `loxia.run.args`                            | `[]`            | Default program arguments.                                         |
| `loxia.run.cwd`                             | `""`            | Run/build working directory.                                       |
| `loxia.run.debug`                           | `false`         | `--debug` for interpreted runs.                                    |
| `loxia.run.saveBeforeRun`                   | `true`          | Save the active file before running.                               |
| `loxia.run.compiled.outputDir`              | `".loxia/bin"`  | Build directory.                                                   |
| `loxia.run.compiled.maxHeap`                | `""`            | Optional `--max-heap` value.                                       |
| `loxia.statusBar.enabled`                   | `true`          | Show the language server status.                                   |

Feature toggles are applied immediately. Changing `loxia.lsp.*`, `loxia.cli.*` or
`loxia.server.*` restarts the server. The `[loxia]` language defaults set 2-space
indentation.

## Grammar

`syntaxes/loxia.tmLanguage.json` is **generated** in the
[loxia repo](https://github.com/loxia-lang/loxia) from the language sources and attached
to every language release (`loxia.tmLanguage.json`, `loxia.mjs`, `loxia.ts`,
`SHA256SUMS`). This repo pins the version and the SHA-256 in `grammar.lock.json`:

```bash
npm run grammar:check
npm run grammar:sync -- --version 1.1.0
```

Do not edit the JSON by hand. The grammar is also used by the docs site and the DeepSeek
Harness viewer through the generated Shiki/TS wrappers.

## Troubleshooting

- **No colors**: check the language mode in the status bar; it must say **Loxia**. If it
  says Plain Text, the extension is not active for this file.
- **"loxia CLI was not found"**: install it on `PATH` or set `loxia.cli.path`; the
  extension's status bar item and the **Loxia Language Server** output channel show the
  attempts.
- **No diagnostics but the file is valid**: check `loxia.features.diagnostics` and
  `loxia.lsp.enabled`; run **Loxia: Check File** to see the CLI output.
- **`//` is not a comment**: in Loxia `//` is integer division; comments are `#` and
  `/* */` (ADR-0012).
- **Compiled mode fails**: see the table above and the **Loxia Run** output channel.

## Development

```bash
npm ci
npm run verify                 # lint + format + typecheck + unit tests + grammar + compile
npm run test:integration       # VS Code smoke test (needs a display; use xvfb-run on Linux)
npm run package                # dist/loxia-<version>.vsix
npm run grammar:sync -- --version 1.1.0
```

`npm run verify` is the same gate as CI. `F5` in VS Code opens the Extension Development
Host with the checkout loaded. The architecture, settings and publishing runbooks are in
[`docs/`](docs/).

## Publishing

Maintainers: see [`docs/publishing.md`](docs/publishing.md) for the Marketplace and Open
VSX setup (`VSCE_PAT` / `OVSX_PAT`), the tag flow and the grammar sync workflow. The
publisher is `loxia-lang` and the extension ID is `loxia-lang.loxia`.

## License

MIT OR Apache-2.0. See [`LICENSE`](LICENSE), [`LICENSE-MIT`](LICENSE-MIT) and
[`LICENSE-APACHE`](LICENSE-APACHE).
