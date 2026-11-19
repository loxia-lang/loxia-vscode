import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providers = readFileSync("src/lsp/providers.ts", "utf8");
const client = readFileSync("src/lsp/client.ts", "utf8");
const cli = readFileSync("src/cli.ts", "utf8");
const manager = readFileSync("src/lsp/manager.ts", "utf8");
const manifest = readFileSync("package.json", "utf8");

test("the client covers every server method it registers", () => {
  for (const method of [
    "textDocument/formatting",
    "textDocument/hover",
    "textDocument/definition",
    "textDocument/completion",
    "textDocument/signatureHelp",
    "textDocument/inlayHint",
    "textDocument/codeAction",
    "textDocument/prepareRename",
    "textDocument/rename",
    "textDocument/documentSymbol",
    "workspace/symbol",
  ]) {
    assert.ok(providers.includes(method), `client does not call ${method}`);
  }
  assert.ok(client.includes("textDocument/publishDiagnostics"));
  assert.ok(client.includes("initializationOptions"));
  assert.ok(manager.includes("workspace/didChangeConfiguration"));
});

test("the provider registrations use the current VS Code APIs", () => {
  assert.ok(providers.includes("vscode.languages.registerWorkspaceSymbolProvider"));
  assert.ok(!providers.includes("vscode.workspace.registerWorkspaceSymbolProvider"));
  assert.ok(providers.includes("vscode.languages.registerInlayHintsProvider"));
  assert.ok(providers.includes("vscode.languages.registerCodeActionsProvider"));
  assert.ok(providers.includes("vscode.languages.registerRenameProvider"));
});

test("the extension does not depend on vscode-languageclient", () => {
  assert.ok(!manifest.includes("vscode-languageclient"));
});

test("the CLI autodetection still includes the Python fallbacks", () => {
  assert.ok(cli.includes('"loxia"'));
  assert.ok(cli.includes('"python3"'));
  assert.ok(cli.includes('"python"'));
  assert.ok(cli.includes('"py"'));
});
