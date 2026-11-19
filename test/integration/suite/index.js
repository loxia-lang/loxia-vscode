const assert = require("node:assert/strict");
const path = require("node:path");
const vscode = require("vscode");

const EXTENSION_ID = "loxia-lang.loxia";

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out");
}

async function run() {
  console.log("[loxia] integration suite: start");
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `extension ${EXTENSION_ID} not found`);
  await extension.activate();

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    "loxia.run",
    "loxia.runInterpreted",
    "loxia.runCompiled",
    "loxia.runWithArgs",
    "loxia.build",
    "loxia.check",
    "loxia.repl",
    "loxia.restartServer",
  ]) {
    assert.ok(commands.includes(command), `missing command ${command}`);
  }

  const languages = await vscode.languages.getLanguages();
  assert.ok(languages.includes("loxia"), "loxia is not a registered language");

  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "the fixture workspace is not open");
  const document = await vscode.workspace.openTextDocument(
    path.join(folder.uri.fsPath, "hello.lx"),
  );
  assert.equal(document.languageId, "loxia");
  await vscode.window.showTextDocument(document);

  const diagnostics = await waitFor(() => {
    const current = vscode.languages.getDiagnostics(document.uri);
    return current.length > 0 ? current : undefined;
  }, 15_000);
  assert.equal(diagnostics[0].code, "E2001");
  assert.equal(diagnostics[0].source, "loxia");
  assert.match(diagnostics[0].message, /fake diagnostic/);

  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  console.log("[loxia] integration suite: ok");
}

module.exports = { run };
