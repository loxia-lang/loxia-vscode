import assert from "node:assert/strict";
import test from "node:test";

import { SETTING_KEYS, featureEnabled, readSettings, serverSettings } from "../../src/config";
import type { LoxiaSettings, VariableContext } from "../../src/types";

const context: VariableContext = {
  workspaceFolder: "/work/project",
  file: "/work/project/main.lx",
  userHome: "/home/dev",
  env: {},
};

function settings(overrides: Record<string, unknown> = {}): LoxiaSettings {
  return readSettings((key, fallback) => (key in overrides ? overrides[key] : fallback), context);
}

test("readSettings defaults are the documented ones", () => {
  const value = settings();
  assert.equal(value.lspEnabled, true);
  assert.equal(value.cliPath, "");
  assert.deepEqual(value.serverArgs, ["lsp"]);
  assert.equal(value.trace, "off");
  assert.equal(value.runMode, "interpreted");
  assert.equal(value.runDebug, false);
  assert.equal(value.saveBeforeRun, true);
  assert.equal(value.compiledOutputDir, ".loxia/bin");
  assert.equal(value.features.diagnostics, true);
  assert.equal(value.features.inlayHints, true);
  assert.equal(value.statusBarEnabled, true);
});

test("readSettings substitutes variables in CLI, cwd and output settings", () => {
  const value = settings({
    "cli.path": "python3",
    "cli.args": ["-m", "loxia"],
    "server.cwd": "${workspaceFolder}",
    "run.cwd": "${workspaceFolder}/sub",
    "run.compiled.outputDir": "${workspaceFolder}/out",
  });
  assert.equal(value.cliPath, "python3");
  assert.deepEqual(value.cliArgs, ["-m", "loxia"]);
  assert.equal(value.serverCwd, "/work/project");
  assert.equal(value.runCwd, "/work/project/sub");
  assert.equal(value.compiledOutputDir, "/work/project/out");
});

test("readSettings validates enums and ignores unknown values", () => {
  assert.equal(settings({ "run.mode": "compiled" }).runMode, "compiled");
  assert.equal(settings({ "run.mode": "jit" }).runMode, "interpreted");
  assert.equal(settings({ "lsp.trace": "verbose" }).trace, "verbose");
  assert.equal(settings({ "lsp.trace": "everything" }).trace, "off");
});

test("featureEnabled gates each provider", () => {
  const value = settings({ "features.hover": false, "features.inlayHints": false });
  assert.equal(featureEnabled(value, "hover"), false);
  assert.equal(featureEnabled(value, "inlayHints"), false);
  assert.equal(featureEnabled(value, "diagnostics"), true);
});

test("serverSettings maps the first-class features to the LSP initialization options", () => {
  const value = settings({
    "features.inlayHints": false,
    "features.completionInheritedMembers": false,
  });
  assert.deepEqual(serverSettings(value), {
    inlayHints: { enabled: false },
    completion: { inheritedMembers: false },
  });
});

test("SETTING_KEYS covers the manifest surface", () => {
  assert.equal(SETTING_KEYS.length, 26);
  assert.ok(SETTING_KEYS.includes("features.diagnostics"));
  assert.ok(SETTING_KEYS.includes("run.compiled.maxHeap"));
});
