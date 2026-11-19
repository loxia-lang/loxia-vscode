import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArgs,
  candidateCommands,
  classifyBuildFailure,
  runArgs,
  serverCommand,
} from "../../src/cli";
import { readSettings } from "../../src/config";
import type { LoxiaSettings, VariableContext } from "../../src/types";

const context: VariableContext = {
  workspaceFolder: "/work/project",
  userHome: "/home/dev",
  env: {},
};

function settings(overrides: Record<string, unknown> = {}): LoxiaSettings {
  return readSettings((key, fallback) => (key in overrides ? overrides[key] : fallback), context);
}

test("candidateCommands autodetects loxia and the Python module", () => {
  assert.deepEqual(candidateCommands(settings(), "linux"), [
    { command: "loxia", args: [] },
    { command: "python3", args: ["-m", "loxia"] },
    { command: "python", args: ["-m", "loxia"] },
  ]);
  assert.deepEqual(candidateCommands(settings(), "win32").at(-1), {
    command: "py",
    args: ["-3", "-m", "loxia"],
  });
});

test("an explicit CLI path disables autodetection", () => {
  assert.deepEqual(
    candidateCommands(
      settings({ "cli.path": "uv", "cli.args": ["run", "python", "-m", "loxia"] }),
      "linux",
    ),
    [{ command: "uv", args: ["run", "python", "-m", "loxia"] }],
  );
});

test("serverCommand appends the LSP subcommand after the CLI prefix", () => {
  assert.deepEqual(serverCommand({ command: "python3", args: ["-m", "loxia"] }, settings()), {
    command: "python3",
    args: ["-m", "loxia", "lsp"],
  });
});

test("runArgs passes script args after -- and only emits --debug when asked", () => {
  const cli = { command: "loxia", args: [] };
  assert.deepEqual(runArgs(cli, "main.lx", settings(), ["a", "-b"]), [
    "run",
    "main.lx",
    "--",
    "a",
    "-b",
  ]);
  assert.deepEqual(runArgs(cli, "main.lx", settings({ "run.debug": true }), []), [
    "run",
    "--debug",
    "main.lx",
  ]);
});

test("buildArgs targets an explicit native executable", () => {
  const args = buildArgs(
    { command: "python3", args: ["-m", "loxia"] },
    "main.lx",
    "/work/project/.loxia/bin/main",
    settings({ "run.compiled.maxHeap": "512M" }),
  );
  assert.deepEqual(args, [
    "-m",
    "loxia",
    "build",
    "main.lx",
    "--emit=exe",
    "-o",
    "/work/project/.loxia/bin/main",
    "--color=never",
    "--max-heap",
    "512M",
  ]);
});

test("classifyBuildFailure turns the common prerequisites into hints", () => {
  assert.match(classifyBuildFailure("No module named 'llvmlite'") ?? "", /LLVM extra/);
  assert.match(classifyBuildFailure("fatal error: gc.h: No such file") ?? "", /Boehm GC/);
  assert.match(classifyBuildFailure("command not found: cc") ?? "", /C compiler/);
  assert.match(
    classifyBuildFailure("error: not supported by the backend yet") ?? "",
    /interpreted/,
  );
  assert.equal(classifyBuildFailure("some unrelated failure"), null);
});
