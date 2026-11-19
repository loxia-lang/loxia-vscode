# Run and build

The extension offers two engines for the same source file.

## Interpreted

`loxia run <file>` starts the tree-walk interpreter in a terminal. It is the default
(`loxia.run.mode = "interpreted"`) and the reference implementation: Loxia's I1 contract
says interpreted and compiled programs produce the same stdout/exit code on the declared
corpus.

- `loxia.run.debug` adds `--debug` (overflow checks, fatal on overflow).
- Arguments are passed after `--`: `loxia run main.lx -- a -b`.
- The terminal is interactive, so `std.io.input`/`readLine` work.
- Each run opens a normal terminal; when the program exits, the shell prompt returns and
  the output stays in that terminal instead of disappearing with the process.

## Compiled

1. `loxia build <file> --emit=exe -o <output> --color=never`
2. On success, the binary is executed in a terminal.

Requirements:

- `llvmlite` (`uv tool install "loxia[llvm]"` or `pipx install "loxia[llvm]"`);
- Boehm GC headers/library (`libgc-dev` on Debian/Ubuntu, `brew install bdw-gc` on macOS);
- a C compiler/linker (`cc`, `gcc` or `clang`).

The build runs under a cancellable notification and streams to **Loxia Run**. Failures
are classified into an actionable message:

| Symptom                            | Hint                                         |
| ---------------------------------- | -------------------------------------------- |
| `No module named 'llvmlite'`       | install the `llvm` extra                     |
| `gc.h`/`libgc`                     | install the Boehm GC                         |
| `cc`/linker/undefined reference    | install a C toolchain                        |
| `not supported by the backend yet` | run interpreted; the backend gap is declared |

## Output layout

`loxia.run.compiled.outputDir` defaults to `.loxia/bin`. The source path is preserved:

```
project/
  .loxia/bin/src/main
  src/main.lx
```

This avoids collisions between two `main.lx` files and keeps artifacts in `.loxia/`,
which Loxia projects already ignore. The extension creates the directory before building;
`loxia build` does not clean it.

`loxia.run.compiled.maxHeap` maps to `--max-heap` (for example `512M` or `2G`). The
default is the CLI's 512 MiB hard cap.

## Command matrix

| Command                | What runs                    | Trust required |
| ---------------------- | ---------------------------- | -------------- |
| `loxia.run`            | mode from settings/QuickPick | yes            |
| `loxia.runInterpreted` | `loxia run`                  | yes            |
| `loxia.runCompiled`    | build + execute              | yes            |
| `loxia.runWithArgs`    | prompt, then mode            | yes            |
| `loxia.build`          | build only; offers **Run**   | yes            |
| `loxia.check`          | `loxia check` in a terminal  | no             |
| `loxia.repl`           | `loxia repl` in a terminal   | yes            |

In an untrusted workspace, Run/Build/REPL show a warning and stop; highlighting and the
read-only language server still work. The CLI path/args are machine-scoped so a repository
cannot redirect the executable.

## Troubleshooting

- **Binary not found after build**: check the **Loxia Run** output for the exact `-o`
  path; the extension prints the command before running it.
- **Changes not reflected**: `loxia.run.saveBeforeRun` may be `false` and the file dirty.
  Save and rerun, or enable the setting.
- **Different result interpreted vs compiled**: that is an I1 bug in the language, not in
  the extension; report it with both outputs.
- **Compiled build is slow the first time**: the native runtime units are compiled and
  cached by the CLI under `$TMPDIR/loxia-build-*` (or `LOX_BUILD_CACHE`).
