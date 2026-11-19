# Publishing runbook

This is the maintainer path from a green `main` to a published extension. It assumes the
publisher/namespace already exists (see **One-time setup**).

## One-time setup

### Marketplace

1. Create a publisher at <https://marketplace.visualstudio.com/manage> with the ID
   **`loxia-lang`** (must match `package.json.publisher`).
2. Create a Personal Access Token in Azure DevOps with **Marketplace → Manage** scope and
   all accessible organizations.
3. Add it to the GitHub repository as the secret **`VSCE_PAT`**
   (`Settings → Secrets and variables → Actions`).

### Open VSX

1. Create/sign in to <https://open-vsx.org> with GitHub.
2. Claim the namespace **`loxia-lang`** (or create it if the account owns it); the
   extension ID must be `loxia-lang.loxia`.
3. Create an access token in the Open VSX user settings and add it as **`OVSX_PAT`**.

### Repository

- Default branch `main`, protected by a ruleset requiring `CI` and a PR.
- `release` environment is optional; if used, restrict who can run the release job.

## Normal release

1. Bump `package.json.version` and add a `## [X.Y.Z]` section to `CHANGELOG.md`.
2. If the language had a release with a new grammar, run
   `npm run grammar:sync -- --version <language version>` and commit both files.
3. Merge to `main` through a PR; wait for CI **and** the integration job.
4. Create and push a tag from `main`:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

   The tag must be `v` + `package.json.version`; `scripts/verify-release.mjs` enforces it.

5. The **Release** workflow runs `npm run verify`, `npm run release:check`, packages
   `dist/loxia-X.Y.Z.vsix`, publishes to the Marketplace and Open VSX, and creates the
   GitHub Release with the VSIX attached.
6. Verify the listing shows the new version on both registries and install it in a clean
   VS Code profile.

### Dry run / manual packaging

```bash
npm ci
npm run verify
npm run package
npx vsce ls --tree          # inspect the VSIX allowlist
```

`npm run package` writes `dist/loxia-<version>.vsix`. To create a GitHub-only release
without publishing, upload that VSIX manually; the workflow's `workflow_dispatch` path
also supports a dry run.

### Pre-release

`vsce publish --pre-release` publishes an insiders build; Open VSX has no separate
pre-release channel. Create a tag such as `v1.2.0-rc.1` only if you also teach
`verify-release.mjs` to accept the suffix (currently it requires `MAJOR.MINOR.PATCH`).

## Grammar sync workflow

`.github/workflows/sync-grammar.yml` is manual (`workflow_dispatch`): give it a language
version, it runs `npm run grammar:sync`, verifies the hash, commits to a
`chore/grammar-<version>` branch and opens a PR. It never runs on a schedule and never
publishes the extension.

## Rollback

- **Marketplace**: unpublish or publish a fixed patch. A version is immutable; you cannot
  re-publish `X.Y.Z` with different bytes.
- **Open VSX**: same rule; publish a patch.
- **GitHub Release**: delete the release/tag only if the VSIX was never downloaded; prefer
  a patch.
- The grammar pin can be reverted independently (`grammar.lock.json` + asset) without
  changing the extension version, but a re-published extension must use a new version.

## Security notes

- The release workflow uses the repository `GITHUB_TOKEN` for the GitHub Release and the
  two PATs for the registries; keep them in secrets, never in logs.
- `vsce` runs from the pinned devDependency (`package-lock.json`); the workflow uses
  `npm ci`.
- The extension has no runtime npm dependencies, so the VSIX contains `dist/extension.js`,
  the grammar, the icon, the language configuration and the docs listed in
  `.vscodeignore`. Inspect with `npx vsce ls --tree` before the first publish.
- Do not add a `postinstall`/`vscode:prepublish` script that downloads code; the build is
  `npm run compile` and nothing else.
