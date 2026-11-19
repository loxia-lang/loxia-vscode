import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const grammarPath = path.join(root, "syntaxes", "loxia.tmLanguage.json");
const lockPath = path.join(root, "grammar.lock.json");
const packagePath = path.join(root, "package.json");
const vscodeIgnorePath = path.join(root, ".vscodeignore");

function fail(message) {
  console.error(`grammar: ${message}`);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const grammarBytes = readFileSync(grammarPath);
const grammar = JSON.parse(grammarBytes.toString("utf8"));
const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
const ignore = readFileSync(vscodeIgnorePath, "utf8");

if (typeof lock.languageVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(lock.languageVersion)) {
  fail("grammar.lock.json has no valid languageVersion");
}
if (typeof lock.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(lock.sha256)) {
  fail("grammar.lock.json has no valid sha256");
}
const digest = createHash("sha256").update(grammarBytes).digest("hex");
if (digest !== lock.sha256) {
  fail(
    `syntaxes/loxia.tmLanguage.json (${digest}) does not match grammar.lock.json (${lock.sha256}); run npm run grammar:sync -- --version ${lock.languageVersion}`,
  );
}
if (!String(lock.source).includes(`/v${lock.languageVersion}/`)) {
  fail("grammar.lock.json source does not point at the pinned language release");
}

if (grammar.scopeName !== "source.loxia") {
  fail(`unexpected scopeName ${String(grammar.scopeName)}`);
}
if (!Array.isArray(grammar.fileTypes) || !grammar.fileTypes.includes("lx")) {
  fail("grammar fileTypes must include lx");
}
if (grammar.repository === undefined || typeof grammar.repository !== "object") {
  fail("grammar has no repository");
}

const language = manifest.contributes?.languages?.[0];
const grammarContribution = manifest.contributes?.grammars?.[0];
if (language?.id !== "loxia" || !language.extensions?.includes(".lx")) {
  fail("package.json does not register the loxia language/.lx");
}
if (grammarContribution?.scopeName !== grammar.scopeName) {
  fail("package.json scopeName does not match the grammar");
}
if (
  grammarContribution?.path !== "./syntaxes/loxia.tmLanguage.json" ||
  language?.configuration !== "./language-configuration.json"
) {
  fail("package.json points at the wrong grammar or language configuration");
}

for (const required of ["!syntaxes/**", "!dist/extension.js", "!media/**", "!package.json"]) {
  if (!ignore.includes(required)) {
    fail(`.vscodeignore is missing ${required}`);
  }
}

const version = manifest.version;
console.log(
  `grammar OK — loxia ${lock.languageVersion}, extension ${version}, sha256 ${digest.slice(0, 12)}…`,
);
