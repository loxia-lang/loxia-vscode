# Settings reference

All settings live under `loxia.*`. The same table is in the Marketplace README; this page
adds examples and precedence.

## CLI and server

| Setting             | Scope    | Default   | Notes                                                                                              |
| ------------------- | -------- | --------- | -------------------------------------------------------------------------------------------------- |
| `loxia.lsp.enabled` | window   | `true`    | `false` = grammar-only highlighting.                                                               |
| `loxia.cli.path`    | resource | `""`      | Empty = autodetect. Restricted in untrusted workspaces so a repository cannot redirect the binary. |
| `loxia.cli.args`    | resource | `[]`      | Arguments before the subcommand. Restricted in untrusted workspaces.                               |
| `loxia.server.args` | resource | `["lsp"]` | Appended to the CLI.                                                                               |
| `loxia.server.cwd`  | resource | `""`      | `${workspaceFolder}`, `${userHome}`, `${file}` and `${env:VAR}` are expanded.                      |
| `loxia.lsp.trace`   | window   | `"off"`   | `messages` logs method/id; `verbose` logs the full JSON-RPC payload.                               |

### Autodetection order

1. `loxia.cli.path` (plus `loxia.cli.args`), when non-empty.
2. `loxia` on `PATH`.
3. `python3 -m loxia`.
4. `python -m loxia`.
5. On Windows, `py -3 -m loxia`.

Each candidate is probed with `<command> <args> --version`; the first exit 0 wins. The
probe has a 4 s timeout.

### Checkout / development

```json
{
  "loxia.cli.path": "uv",
  "loxia.cli.args": ["run", "python", "-m", "loxia"],
  "loxia.server.cwd": "${workspaceFolder}"
}
```

`uv run` needs the workspace at the `loxia` checkout root. A globally installed CLI only
needs the default (empty path).

## Feature toggles

| Setting                                     | Default |
| ------------------------------------------- | ------- |
| `loxia.features.diagnostics`                | `true`  |
| `loxia.features.hover`                      | `true`  |
| `loxia.features.definition`                 | `true`  |
| `loxia.features.references`                 | `true`  |
| `loxia.features.documentHighlights`         | `true`  |
| `loxia.features.typeDefinition`             | `true`  |
| `loxia.features.implementation`             | `true`  |
| `loxia.features.typeHierarchy`              | `true`  |
| `loxia.features.completion`                 | `true`  |
| `loxia.features.completionInheritedMembers` | `true`  |
| `loxia.features.signatureHelp`              | `true`  |
| `loxia.features.inlayHints`                 | `true`  |
| `loxia.features.formatting`                 | `true`  |
| `loxia.features.codeActions`                | `true`  |
| `loxia.features.rename`                     | `true`  |
| `loxia.features.documentSymbols`            | `true`  |
| `loxia.features.workspaceSymbols`           | `true`  |

Turning a feature off makes the provider return nothing; it does not unregister it, so the
change is immediate. `diagnostics` clears the collection when turned off and rechecks the
open documents when turned on. `completionInheritedMembers` and `inlayHints` are also sent
to the server through `initializationOptions`/`workspace/didChangeConfiguration`;
`inlayHints` still respects the editor's own `editor.inlayHints.enabled`.

To disable everything semantic and keep only highlighting:

```json
{
  "loxia.lsp.enabled": false
}
```

## Run and build

| Setting                        | Scope    | Default         |
| ------------------------------ | -------- | --------------- |
| `loxia.run.mode`               | resource | `"interpreted"` |
| `loxia.run.args`               | resource | `[]`            |
| `loxia.run.cwd`                | resource | `""`            |
| `loxia.run.debug`              | resource | `false`         |
| `loxia.run.saveBeforeRun`      | resource | `true`          |
| `loxia.run.compiled.outputDir` | resource | `".loxia/bin"`  |
| `loxia.run.compiled.maxHeap`   | resource | `""`            |

- `run.mode`: `interpreted`, `compiled` or `ask`; `ask` shows a QuickPick per run.
- `run.args`: passed after `--`, so `-x` is a program argument, not a CLI flag.
- `run.cwd`: empty = the file's workspace folder (or its directory when the file is
  outside a folder).
- `run.saveBeforeRun`: when `false`, a dirty file is rejected instead of silently running
  stale content.
- `compiled.outputDir`: relative to the workspace, or absolute. The source tree is
  preserved below it.
- `compiled.maxHeap`: passed to `loxia build --max-heap`; empty = CLI default (512 MiB).

```json
{
  "loxia.run.mode": "compiled",
  "loxia.run.args": ["--verbose", "input.txt"],
  "loxia.run.compiled.maxHeap": "1G"
}
```

`loxia.run.debug` only affects interpreted runs; compiled builds use release wrapping.

## Status bar

`loxia.statusBar.enabled` (default `true`) shows the language server state. The item's
command is **Loxia: Restart Language Server**.
