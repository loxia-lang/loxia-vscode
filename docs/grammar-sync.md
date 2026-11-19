# Grammar sync

The grammar is not authored here. It is generated in
[`loxia-lang/loxia`](https://github.com/loxia-lang/loxia) from the language sources:

| Source                              | What it contributes                    |
| ----------------------------------- | -------------------------------------- |
| `loxia_core/frontend/keywords.py`   | keywords, grouped by scope             |
| `loxia_core/frontend/token_type.py` | operators and punctuation              |
| `loxia_core/execution/prelude.py`   | built-in names (`Int`, `len`, `math`…) |

Every language release attaches four assets:

- `loxia.tmLanguage.json` — the TextMate grammar used by this extension;
- `loxia.mjs` — the same grammar as a Shiki `LanguageRegistration`;
- `loxia.ts` — a self-contained Shiki module for the DeepSeek Harness viewer;
- `SHA256SUMS` — SHA-256 of the three files.

## The pin

`grammar.lock.json` records the exact language release and the SHA-256 of the JSON:

```json
{
  "languageVersion": "1.1.0",
  "source": "https://github.com/loxia-lang/loxia/releases/download/v1.1.0/loxia.tmLanguage.json",
  "sha256": "3abee954…"
}
```

`npm run grammar:check` (run by `npm run verify` and CI) recomputes the hash, validates the
grammar structure and checks the manifest wiring. It never touches the network.

## Updating

```bash
npm run grammar:sync -- --version 1.2.0
npm run verify
git add syntaxes/loxia.tmLanguage.json grammar.lock.json
git commit -m "chore(grammar): sync with loxia 1.2.0"
```

The script downloads `loxia.tmLanguage.json` and `SHA256SUMS` from the release, verifies
the checksum and rewrites the lock. It fails on a non-release URL, a missing checksum or
an unexpected `scopeName`. For an offline or pre-release check:

```bash
npm run grammar:sync -- --version 1.2.0 --from /tmp/loxia.tmLanguage.json --dry-run
```

The `.github/workflows/sync-grammar.yml` workflow does the same on demand and opens a PR,
so the diff is reviewed like any other change.

## Policy

- **Never hand-edit** `syntaxes/loxia.tmLanguage.json`; the main repo's generator test
  fails on drift and this repo's hash check would fail too.
- The extension version and the language version are independent. `grammar.lock.json`
  says which language the highlighting was built from; `package.json` versions the
  extension.
- The VSIX embeds the grammar. There is **no runtime download**; Installing the extension
  must work offline.
- Other editors (Sublime Text, TextMate, Shiki consumers) can consume the release assets
  directly; see `editors/README.md` in the main repo.
