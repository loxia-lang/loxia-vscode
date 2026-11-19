# Security

## Supported versions

The latest release on the Marketplace/Open VSX receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for a vulnerability. Use GitHub's private
vulnerability reporting on
<https://github.com/loxia-lang/loxia-vscode/security/advisories/new>. Only the maintainers
can see the report; there is no email-based channel. Include the extension version, the
VS Code version, the `loxia` version and a minimal reproducer.

## Trust model

The extension spawns the `loxia` CLI the user configured (or the one it finds on `PATH`)
and passes file paths and arguments as an array, never through a shell for the build.
`loxia.cli.path` and `loxia.cli.args` are **restricted in untrusted workspaces** and restricted in untrusted
workspaces; Run, Build and the REPL additionally check `vscode.workspace.isTrusted`
before executing code. The language server is read-only with respect to the workspace.
No telemetry is collected.
