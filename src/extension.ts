import os from "node:os";

import * as vscode from "vscode";

import { detectCli } from "./cli";
import { readSettings } from "./config";
import { LspManager } from "./lsp/manager";
import { registerProviders } from "./lsp/providers";
import type { Diagnostic } from "./lsp/types";
import { RunService } from "./run";
import { StatusBar } from "./status";
import type { CliCommand, Logger, LoxiaSettings, VariableContext } from "./types";

class CliResolver {
  private cached: CliCommand | null | undefined;

  constructor(
    private readonly getSettings: () => LoxiaSettings,
    private readonly logger: Logger,
  ) {}

  async get(force = false): Promise<CliCommand | null> {
    if (!force && this.cached !== undefined) {
      return this.cached;
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this.cached = await detectCli(this.getSettings(), folder, process.platform, this.logger);
    return this.cached;
  }

  reset(): void {
    this.cached = undefined;
  }
}

function channelLogger(channel: vscode.OutputChannel): Logger {
  return {
    info: (message) => channel.appendLine(message),
    warn: (message) => channel.appendLine(`[warn] ${message}`),
    error: (message) => channel.appendLine(`[error] ${message}`),
  };
}

function activeDocument(): vscode.TextDocument | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor?.document.languageId === "loxia") {
    return editor.document;
  }
  for (const visible of vscode.window.visibleTextEditors) {
    if (visible.document.languageId === "loxia") {
      return visible.document;
    }
  }
  return vscode.workspace.textDocuments.find((document) => document.languageId === "loxia");
}

function currentSettings(): LoxiaSettings {
  const config = vscode.workspace.getConfiguration("loxia");
  const document = activeDocument();
  const folder = document
    ? vscode.workspace.getWorkspaceFolder(document.uri)
    : vscode.workspace.workspaceFolders?.[0];
  const context: VariableContext = {
    workspaceFolder: folder?.uri.fsPath,
    file: document?.uri.fsPath,
    userHome: os.homedir(),
    env: process.env,
  };
  return readSettings((key, fallback) => config.get(key, fallback), context);
}

function isUri(value: unknown): value is vscode.Uri {
  return (
    typeof value === "object" &&
    value !== null &&
    "scheme" in value &&
    "path" in value &&
    typeof (value as { scheme?: unknown }).scheme === "string"
  );
}

async function documentFor(resource: unknown): Promise<vscode.TextDocument | undefined> {
  if (isUri(resource)) {
    const opened = await vscode.workspace.openTextDocument(resource);
    if (opened.languageId === "loxia") {
      return opened;
    }
  }
  return activeDocument();
}

function packageVersion(context: vscode.ExtensionContext): string {
  const version = (context.extension.packageJSON as { version?: unknown }).version;
  return typeof version === "string" ? version : "1.1.0";
}

export function activate(context: vscode.ExtensionContext): void {
  const lspOutput = vscode.window.createOutputChannel("Loxia Language Server");
  const runOutput = vscode.window.createOutputChannel("Loxia Run");
  const diagnostics = vscode.languages.createDiagnosticCollection("loxia");
  const rawDiagnostics = new Map<string, Diagnostic[]>();
  const status = new StatusBar();
  const logger = channelLogger(lspOutput);

  const cliResolver = new CliResolver(currentSettings, logger);
  const lsp = new LspManager({
    context,
    logger,
    diagnostics,
    rawDiagnostics,
    getSettings: currentSettings,
    getCli: () => cliResolver.get(),
    status,
    clientVersion: packageVersion(context),
  });
  const run = new RunService({
    context,
    output: runOutput,
    getSettings: currentSettings,
    getCli: () => cliResolver.get(),
  });

  const initial = currentSettings();
  status.setEnabled(initial.statusBarEnabled);
  status.set("stopped");

  context.subscriptions.push(
    lspOutput,
    runOutput,
    diagnostics,
    status,
    ...registerProviders({
      request: (method, params) => lsp.request(method, params),
      getSettings: currentSettings,
      rawDiagnostics,
      isReady: () => lsp.isReady(),
    }),
  );

  const withDocument = (
    action: (document: vscode.TextDocument) => Promise<void>,
  ): ((resource?: unknown) => Promise<void>) => {
    return async (resource?: unknown) => {
      const document = await documentFor(resource);
      if (document === undefined) {
        void vscode.window.showErrorMessage("Loxia: open a .lx file first.");
        return;
      }
      await vscode.window.showTextDocument(document);
      await action(document);
    };
  };

  const register = (
    command: string,
    handler: (resource?: unknown) => Promise<void>,
  ): vscode.Disposable =>
    vscode.commands.registerCommand(command, (...args: unknown[]) => handler(args[0]));

  context.subscriptions.push(
    register(
      "loxia.run",
      withDocument((document) => run.run(document)),
    ),
    register(
      "loxia.runInterpreted",
      withDocument((document) => run.runInterpreted(document)),
    ),
    register(
      "loxia.runCompiled",
      withDocument((document) => run.runCompiled(document)),
    ),
    register(
      "loxia.runWithArgs",
      withDocument((document) => run.runWithArguments(document)),
    ),
    register(
      "loxia.build",
      withDocument((document) => run.build(document)),
    ),
    register(
      "loxia.check",
      withDocument((document) => run.check(document)),
    ),
    register("loxia.repl", async () => run.repl()),
    register("loxia.restartServer", async () => {
      cliResolver.reset();
      await lsp.restart();
    }),
    register("loxia.showOutput", async () => run.showOutput()),
    register("loxia.showLspOutput", async () => lspOutput.show(true)),
    register("loxia.openSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:loxia-lang.loxia",
      );
    }),
    register("loxia.openInstallDocs", async () => {
      await vscode.env.openExternal(
        vscode.Uri.parse("https://github.com/loxia-lang/loxia#install"),
      );
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      if (document.languageId === "loxia") {
        lsp.didOpen(document);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === "loxia") {
        lsp.didChange(event.document);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === "loxia") {
        lsp.didSave(document);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (document.languageId === "loxia") {
        lsp.didClose(document);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      const restart =
        event.affectsConfiguration("loxia.lsp.enabled") ||
        event.affectsConfiguration("loxia.cli") ||
        event.affectsConfiguration("loxia.server");
      if (restart) {
        cliResolver.reset();
        void lsp.restart();
        status.setEnabled(currentSettings().statusBarEnabled);
        return;
      }
      if (event.affectsConfiguration("loxia.features")) {
        void lsp.updateConfiguration();
      }
      if (event.affectsConfiguration("loxia.statusBar.enabled")) {
        status.setEnabled(currentSettings().statusBarEnabled);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void lsp.restart();
    }),
    { dispose: () => void lsp.dispose() },
    { dispose: () => run.dispose() },
  );

  void lsp.start();
}

export function deactivate(): void {
  // Disposables registered in `context.subscriptions` own the lifecycle.
}
