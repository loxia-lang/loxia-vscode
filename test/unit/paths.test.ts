import assert from "node:assert/strict";
import test from "node:test";

import {
  commandLine,
  compiledOutputPath,
  formatCommand,
  quoteShellArg,
  shellKindFor,
  splitArgs,
  substituteVariables,
} from "../../src/paths";
import type { VariableContext } from "../../src/types";

const context: VariableContext = {
  workspaceFolder: "/work/project",
  file: "/work/project/src/main.lx",
  userHome: "/home/dev",
  env: { HOME: "/home/dev", CI: "1" },
};

test("substituteVariables resolves the VS Code variables we support", () => {
  assert.equal(substituteVariables("${workspaceFolder}", context), "/work/project");
  assert.equal(substituteVariables("${workspaceFolderBasename}", context), "project");
  assert.equal(substituteVariables("${file}", context), "/work/project/src/main.lx");
  assert.equal(substituteVariables("${fileBasename}", context), "main.lx");
  assert.equal(substituteVariables("${fileDirname}", context), "/work/project/src");
  assert.equal(substituteVariables("${fileBasenameNoExtension}", context), "main");
  assert.equal(substituteVariables("${userHome}/bin", context), "/home/dev/bin");
  assert.equal(substituteVariables("${env:CI}", context), "1");
});

test("substituteVariables preserves unknown placeholders", () => {
  assert.equal(substituteVariables("${unknown}/x", context), "${unknown}/x");
  assert.equal(substituteVariables("${env:MISSING}", context), "");
});

test("compiledOutputPath keeps the source tree under outputDir", () => {
  assert.equal(
    compiledOutputPath("/work/project", "/work/project/src/main.lx", ".loxia/bin", "linux"),
    "/work/project/.loxia/bin/src/main",
  );
  assert.equal(
    compiledOutputPath("/work/project", "/work/project/main.lx", ".loxia/bin", "win32"),
    "/work/project/.loxia/bin/main.exe",
  );
});

test("compiledOutputPath supports an absolute output directory", () => {
  assert.equal(
    compiledOutputPath("/work/project", "/work/project/main.lx", "/tmp/loxia", "linux"),
    "/tmp/loxia/main",
  );
});

test("compiledOutputPath does not escape the workspace for external files", () => {
  assert.equal(
    compiledOutputPath("/work/project", "/other/main.lx", ".loxia/bin", "linux"),
    "/work/project/.loxia/bin/main",
  );
});

test("splitArgs handles quotes, escapes and empty quoted strings", () => {
  assert.deepEqual(splitArgs("a b"), ["a", "b"]);
  assert.deepEqual(splitArgs('a "b c" d'), ["a", "b c", "d"]);
  assert.deepEqual(splitArgs("'a b' c"), ["a b", "c"]);
  assert.deepEqual(splitArgs('a "" b'), ["a", "", "b"]);
  assert.deepEqual(splitArgs("a\\ b"), ["a b"]);
  assert.deepEqual(splitArgs(""), []);
  assert.throws(() => splitArgs('"unterminated'), /Unterminated quote/);
});

test("formatCommand is only for logs, but keeps every argument", () => {
  assert.equal(formatCommand("loxia", ["run", "a.lx", "--", "x"]), "loxia run a.lx -- x");
});

test("shellKindFor detects the terminal families", () => {
  assert.equal(shellKindFor("/bin/bash", "linux"), "posix");
  assert.equal(shellKindFor("C:\\Windows\\System32\\cmd.exe", "win32"), "cmd");
  assert.equal(
    shellKindFor("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "win32"),
    "powershell",
  );
  assert.equal(shellKindFor("C:\\Program Files\\Git\\bin\\bash.exe", "win32"), "posix");
  assert.equal(shellKindFor("C:\\Windows\\System32\\wsl.exe", "win32"), "posix");
});

test("quoteShellArg quotes for POSIX, PowerShell and cmd", () => {
  assert.equal(quoteShellArg("a b", "posix"), "'a b'");
  assert.equal(quoteShellArg("x'y", "posix"), "'x'\\''y'");
  assert.equal(quoteShellArg("a b", "powershell"), "'a b'");
  assert.equal(quoteShellArg("x'y", "powershell"), "'x''y'");
  assert.equal(quoteShellArg("a b", "cmd"), '"a b"');
  assert.equal(quoteShellArg('x"y', "cmd"), '"x\\"y"');
  assert.equal(quoteShellArg("C:\\", "cmd"), '"C:\\\\"');
  assert.equal(quoteShellArg('a\\"b', "cmd"), '"a\\\\\\"b"');
  assert.equal(quoteShellArg("", "posix"), "''");
});

test("commandLine keeps the command and arguments as separate words", () => {
  assert.equal(
    commandLine("python3", ["-m", "loxia", "run", "/a b/main.lx", "--", "x y"], "posix"),
    "'python3' '-m' 'loxia' 'run' '/a b/main.lx' '--' 'x y'",
  );
  assert.equal(
    commandLine("C:\\Program Files\\Python\\python.exe", ["-m", "loxia"], "powershell"),
    "& 'C:\\Program Files\\Python\\python.exe' '-m' 'loxia'",
  );
  assert.equal(
    commandLine("C:\\Program Files\\Python\\python.exe", ["-m", "loxia"], "cmd"),
    '"C:\\Program Files\\Python\\python.exe" "-m" "loxia"',
  );
});
