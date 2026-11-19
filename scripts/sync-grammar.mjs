import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const grammarPath = path.join(root, "syntaxes", "loxia.tmLanguage.json");
const lockPath = path.join(root, "grammar.lock.json");

function usage() {
  console.error(
    [
      "Usage: npm run grammar:sync -- --version <X.Y.Z> [--repo loxia-lang/loxia] [--from file] [--dry-run]",
      "",
      "  --version   language release to pin (required)",
      "  --repo      GitHub repository (default: loxia-lang/loxia)",
      "  --from      read loxia.tmLanguage.json from a local file instead of the release",
      "  --dry-run   validate and print, but do not write",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const options = {
    version: undefined,
    repo: "loxia-lang/loxia",
    from: undefined,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--version") {
      options.version = argv[++index];
    } else if (value.startsWith("--version=")) {
      options.version = value.slice("--version=".length);
    } else if (value === "--repo") {
      options.repo = argv[++index] ?? options.repo;
    } else if (value.startsWith("--repo=")) {
      options.repo = value.slice("--repo=".length);
    } else if (value === "--from") {
      options.from = argv[++index];
    } else if (value.startsWith("--from=")) {
      options.from = value.slice("--from=".length);
    } else if (value === "--dry-run") {
      options.dryRun = true;
    } else {
      usage();
    }
  }
  if (!options.version || !/^\d+\.\d+\.\d+$/.test(options.version)) {
    usage();
  }
  return options;
}

function checksum(text) {
  return createHash("sha256").update(text).digest("hex");
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  return response.text();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const base = `https://github.com/${options.repo}/releases/download/v${options.version}`;
  const source = `${base}/loxia.tmLanguage.json`;

  let text;
  if (options.from) {
    text = await readFile(options.from, "utf8");
  } else {
    text = await download(source);
  }

  const digest = checksum(text);
  if (!options.from) {
    const sums = await download(`${base}/SHA256SUMS`);
    const line = sums
      .split(/\r?\n/)
      .find((entry) => entry.trim().endsWith("loxia.tmLanguage.json"));
    if (!line) {
      throw new Error(`SHA256SUMS from ${base} does not list loxia.tmLanguage.json`);
    }
    const expected = line.trim().split(/\s+/)[0];
    if (expected !== digest) {
      throw new Error(`checksum mismatch: release ${expected}, downloaded ${digest}`);
    }
  }

  let grammar;
  try {
    grammar = JSON.parse(text);
  } catch (error) {
    throw new Error(`loxia.tmLanguage.json is not valid JSON: ${error.message}`);
  }
  if (grammar.scopeName !== "source.loxia") {
    throw new Error(`unexpected scopeName ${String(grammar.scopeName)}`);
  }

  const lock = {
    languageVersion: options.version,
    source,
    sha256: digest,
  };
  if (options.dryRun) {
    console.log(JSON.stringify(lock, null, 2));
    console.log(`grammar: ${grammar.scopeName}, ${text.length} bytes`);
    return;
  }

  await writeFile(grammarPath, text, "utf8");
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  console.log(`grammar: pinned loxia ${options.version} (${digest.slice(0, 12)}…)`);
}

main().catch((error) => {
  console.error(`grammar sync failed: ${error.message}`);
  process.exit(1);
});
