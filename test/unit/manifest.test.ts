import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SETTING_KEYS } from "../../src/config";

interface Manifest {
  name: string;
  publisher: string;
  version: string;
  main: string;
  engines: { vscode: string };
  activationEvents: string[];
  capabilities: {
    untrustedWorkspaces: { supported: string; restrictedConfigurations: string[] };
  };
  contributes: {
    languages: Array<{ id: string; extensions: string[]; configuration: string }>;
    grammars: Array<{ language: string; scopeName: string; path: string }>;
    commands: Array<{ command: string }>;
    menus: Record<string, Array<{ command?: string; submenu?: string; when?: string }>>;
    configuration: { properties: Record<string, unknown> };
  };
}

function manifest(): Manifest {
  return JSON.parse(readFileSync("package.json", "utf8")) as Manifest;
}

test("package.json is the loxia-lang.loxia extension", () => {
  const value = manifest();
  assert.equal(value.publisher, "loxia-lang");
  assert.equal(value.name, "loxia");
  assert.match(value.version, /^\d+\.\d+\.\d+$/);
  assert.equal(value.main, "./dist/extension.js");
  assert.match(value.engines.vscode, /^\^1\.\d+\.\d+$/);
});

test("the language and grammar contributions are wired together", () => {
  const value = manifest();
  const language = value.contributes.languages[0];
  const grammar = value.contributes.grammars[0];
  assert.equal(language?.id, "loxia");
  assert.deepEqual(language?.extensions, [".lx"]);
  assert.equal(language?.configuration, "./language-configuration.json");
  assert.equal(grammar?.scopeName, "source.loxia");
  assert.equal(grammar?.path, "./syntaxes/loxia.tmLanguage.json");
});

test("activation covers .lx files and the restart command", () => {
  const value = manifest();
  assert.ok(value.activationEvents.includes("onLanguage:loxia"));
  assert.ok(value.activationEvents.includes("onCommand:loxia.restartServer"));
});

test("every documented setting exists in the manifest", () => {
  const properties = manifest().contributes.configuration.properties;
  for (const key of SETTING_KEYS) {
    assert.ok(`loxia.${key}` in properties, `missing setting loxia.${key}`);
  }
});

test("the play button, palette and run menu expose the expected commands", () => {
  const value = manifest();
  const commands = new Set(value.contributes.commands.map((command) => command.command));
  for (const command of [
    "loxia.run",
    "loxia.runInterpreted",
    "loxia.runCompiled",
    "loxia.runWithArgs",
    "loxia.build",
    "loxia.check",
    "loxia.repl",
    "loxia.restartServer",
    "loxia.showOutput",
    "loxia.showLspOutput",
    "loxia.openSettings",
    "loxia.openInstallDocs",
  ]) {
    assert.ok(commands.has(command), `missing command ${command}`);
  }
  assert.ok(
    value.contributes.menus["editor/title/run"]?.some(
      (item) => item.command === "loxia.run" && item.when === "resourceLangId == loxia",
    ),
    "the play button is not wired to loxia.run",
  );
});

test("untrusted workspaces keep Run disabled and restrict the CLI settings", () => {
  const capabilities = manifest().capabilities.untrustedWorkspaces;
  assert.equal(capabilities.supported, "limited");
  assert.ok(capabilities.restrictedConfigurations.includes("loxia.cli.path"));
});

test("the grammar lock, hash and asset script agree", () => {
  const result = spawnSync(process.execPath, ["scripts/check-grammar.mjs"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("the VSIX allowlist includes the runtime pieces and excludes sources", () => {
  const ignore = readFileSync(".vscodeignore", "utf8");
  for (const entry of ["!dist/extension.js", "!syntaxes/**", "!media/**", "!README.md"]) {
    assert.ok(ignore.includes(entry), `missing ${entry}`);
  }
  assert.ok(!ignore.includes("!src/**"));
});

test("the project ships the files the Marketplace requires", () => {
  for (const file of ["README.md", "CHANGELOG.md", "LICENSE", "LICENSE-MIT", "LICENSE-APACHE"]) {
    assert.doesNotThrow(() => readFileSync(file), file);
  }
});
