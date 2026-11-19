# Development

## Requirements

- Node.js 22+ (the dev tooling requires it; the extension host in VS Code 1.85 runs the
  bundled code on Node 18, so the bundle targets `node18`).
- VS Code 1.85+ for the Extension Development Host.
- The `loxia` CLI for manual testing of the language server and Run.

## Setup

```bash
npm ci
npm run verify
code .
```

Press `F5` (configuration **Rodar extensão (Loxia)**) to open the Extension Development
Host with this checkout. For a checkout of the language repo, configure:

```json
{
  "loxia.cli.path": "uv",
  "loxia.cli.args": ["run", "python", "-m", "loxia"],
  "loxia.server.cwd": "${workspaceFolder}"
}
```

## Scripts

| Script                                | What it does                                            |
| ------------------------------------- | ------------------------------------------------------- |
| `npm run compile`                     | esbuild → `dist/extension.js` (CJS, external `vscode`)  |
| `npm run watch`                       | esbuild watch                                           |
| `npm run typecheck`                   | `tsc --noEmit` (strict, Bundler resolution)             |
| `npm run lint`                        | ESLint 9 flat config with typescript-eslint             |
| `npm run format` / `format:check`     | Prettier                                                |
| `npm run test:unit`                   | `tsx --test test/unit/*.test.ts`                        |
| `npm run test:integration`            | `@vscode/test-electron` + fake LSP server               |
| `npm run grammar:check`               | hash + manifest invariants (offline)                    |
| `npm run grammar:sync -- --version X` | download a language release asset and update the lock   |
| `npm run package`                     | compile + `vsce package --no-dependencies`              |
| `npm run verify`                      | lint + format + typecheck + unit + grammar + compile    |
| `npm run release:check`               | tag/version/changelog gate used by the release workflow |

`npm run verify` does **not** run the integration test (it needs a display and downloads
VS Code). CI runs it in a separate job with `xvfb-run`.

## Integration test

The test workspace is `test/integration/fixtures/workspace` and its settings point
`loxia.cli.path` at `node` with a fake LSP server (`fake-lsp.js`). The suite:

1. finds the extension `loxia-lang.loxia` and activates it;
2. asserts the `.lx` document gets `languageId === "loxia"` and the commands exist;
3. waits for the fake server's `publishDiagnostics` and checks the source/code.

This covers activation, CLI probing (`--version`), JSON-RPC initialize, `didOpen` and the
diagnostic collection without needing the real CLI or a VS Code UI.

Run individually:

```bash
npm run compile
xvfb-run -a npm run test:integration   # Linux CI
```

The downloaded VS Code lives in `.vscode-test/` (ignored). If the download is blocked,
skip this job locally; the unit suite and `npm run verify` are the fast loop.

## Debugging the extension

- **Loxia Language Server** output: every spawn attempt, server stderr and (with
  `loxia.lsp.trace = "verbose"`) the JSON-RPC messages.
- **Loxia Run** output: the exact build command and the compiler log.
- Status bar: starting/ready/error/missing CLI.
- `Developer: Inspect Editor Tokens and Scopes` shows the TextMate scopes; a wrong scope
  is a grammar-generator bug in the main repo, not here.

## Code layout

See [architecture.md](architecture.md). The rule of thumb: keep `src/config.ts`,
`src/cli.ts`, `src/paths.ts` and `src/protocol.ts` free of `vscode` imports so they stay
unit-testable; put VS Code types in `src/lsp/*`, `src/run.ts` and `src/extension.ts`.
