import path from "node:path";

import * as vscode from "vscode";

import { serverSettings } from "../config";
import { serverCommand } from "../cli";
import type { StatusBar } from "../status";
import type { CliCommand, Logger, LoxiaSettings } from "../types";
import { LspClient, type LspState } from "./client";
import { toDiagnostic } from "./convert";
import type { Diagnostic, PublishDiagnosticsParams } from "./types";

export type ManagerState = LspState | "disabled" | "missing-cli";

export interface LspManagerDeps {
  context: vscode.ExtensionContext;
  logger: Logger;
  diagnostics: vscode.DiagnosticCollection;
  rawDiagnostics: Map<string, Diagnostic[]>;
  getSettings(): LoxiaSettings;
  getCli(): Promise<CliCommand | null>;
  status: StatusBar;
  clientVersion: string;
}

export class LspManager {
  private client: LspClient | null = null;
  private state: ManagerState = "stopped";

  constructor(private readonly deps: LspManagerDeps) {}

  getState(): ManagerState {
    return this.state;
  }

  isReady(): boolean {
    return this.state === "ready";
  }

  async start(): Promise<void> {
    const settings = this.deps.getSettings();
    if (!settings.lspEnabled) {
      this.setState("disabled");
      this.deps.status.set("disabled");
      return;
    }
    if (this.client !== null) {
      return;
    }

    this.setState("starting");
    this.deps.status.set("starting");
    const cli = await this.deps.getCli();
    if (cli === null) {
      this.setState("missing-cli");
      this.deps.status.set("missing-cli");
      this.warnMissingCli();
      return;
    }

    const folders = vscode.workspace.workspaceFolders ?? [];
    const first = folders[0];
    const client = new LspClient({
      command: serverCommand(cli, settings),
      cwd: this.serverCwd(settings),
      logger: this.deps.logger,
      initializationOptions: serverSettings(settings),
      rootUri: first?.uri.toString() ?? null,
      workspaceFolders: folders.map((folder) => ({
        uri: folder.uri.toString(),
        name: folder.name,
      })),
      clientVersion: this.deps.clientVersion,
      onDiagnostics: (params) => this.onDiagnostics(params),
      onState: (state, detail) => this.onClientState(state, detail),
      trace: () => this.deps.getSettings().trace,
    });
    this.client = client;

    try {
      await client.start();
      this.setState("ready");
      this.deps.status.set("ready");
      this.openDocuments();
    } catch (error) {
      this.client = null;
      const message = error instanceof Error ? error.message : String(error);
      this.setState("error");
      this.deps.status.set("error");
      this.deps.logger.error(`[lsp] não iniciou: ${message}`);
      void client.stop();
      this.showStartError(message);
    }
  }

  async stop(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (client !== null) {
      await client.stop();
    }
    this.clearDiagnostics();
    this.setState("stopped");
    this.deps.status.set("stopped");
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async updateConfiguration(): Promise<void> {
    const settings = this.deps.getSettings();
    if (!settings.lspEnabled) {
      await this.stop();
      this.setState("disabled");
      this.deps.status.set("disabled");
      return;
    }
    if (this.client === null) {
      await this.start();
      return;
    }
    this.client.notify("workspace/didChangeConfiguration", {
      settings: serverSettings(settings),
    });
    if (settings.features.diagnostics) {
      this.refreshOpenDocuments();
    } else {
      this.clearDiagnostics();
    }
  }

  didOpen(document: vscode.TextDocument): void {
    if (this.client === null || this.state !== "ready") {
      return;
    }
    this.client.didOpen({
      uri: document.uri.toString(),
      version: document.version,
      text: document.getText(),
    });
  }

  didChange(document: vscode.TextDocument): void {
    if (this.client === null || this.state !== "ready") {
      return;
    }
    this.client.didChange({
      uri: document.uri.toString(),
      version: document.version,
      text: document.getText(),
    });
  }

  didSave(document: vscode.TextDocument): void {
    if (this.client === null || this.state !== "ready") {
      return;
    }
    this.client.didSave(document.uri.toString());
  }

  didClose(document: vscode.TextDocument): void {
    if (this.client !== null && this.state === "ready") {
      this.client.didClose(document.uri.toString());
    }
    this.deps.rawDiagnostics.delete(document.uri.toString());
    this.deps.diagnostics.delete(document.uri);
  }

  async request<T>(method: string, params: unknown): Promise<T | undefined> {
    if (this.client === null || this.state !== "ready") {
      return undefined;
    }
    try {
      return await this.client.request<T>(method, params);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.info(`[lsp] ${method}: ${message}`);
      return undefined;
    }
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  private onDiagnostics(params: PublishDiagnosticsParams): void {
    this.deps.rawDiagnostics.set(params.uri, params.diagnostics);
    const settings = this.deps.getSettings();
    if (!settings.features.diagnostics) {
      this.deps.diagnostics.delete(vscode.Uri.parse(params.uri));
      return;
    }
    this.deps.diagnostics.set(vscode.Uri.parse(params.uri), params.diagnostics.map(toDiagnostic));
  }

  private onClientState(state: LspState, detail?: string): void {
    if (state === "error") {
      this.deps.logger.error(`[lsp] ${detail ?? "erro"}`);
      this.deps.status.set("error");
    } else if (state === "starting") {
      this.deps.status.set("starting");
    }
  }

  private openDocuments(): void {
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === "loxia") {
        this.didOpen(document);
      }
    }
  }

  private refreshOpenDocuments(): void {
    if (this.client === null) {
      return;
    }
    for (const document of vscode.workspace.textDocuments) {
      if (document.languageId === "loxia") {
        this.didChange(document);
      }
    }
  }

  private clearDiagnostics(): void {
    this.deps.diagnostics.clear();
    this.deps.rawDiagnostics.clear();
  }

  private serverCwd(settings: LoxiaSettings): string {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    if (settings.serverCwd.length === 0) {
      return folder;
    }
    return path.isAbsolute(settings.serverCwd)
      ? settings.serverCwd
      : path.resolve(folder, settings.serverCwd);
  }

  private warnMissingCli(): void {
    const key = "loxia.missingCliWarned";
    if (this.deps.context.globalState.get<boolean>(key) === true) {
      return;
    }
    void vscode.window
      .showWarningMessage(
        "Loxia: the loxia CLI was not found. Syntax highlighting works, but the language server and Run need it.",
        "Install",
        "Open Settings",
        "Don't show again",
      )
      .then(async (choice) => {
        if (choice === "Install") {
          await vscode.commands.executeCommand("loxia.openInstallDocs");
        } else if (choice === "Open Settings") {
          await vscode.commands.executeCommand("loxia.openSettings");
        } else if (choice === "Don't show again") {
          await this.deps.context.globalState.update(key, true);
        }
      });
  }

  private showStartError(message: string): void {
    void vscode.window
      .showErrorMessage(
        `Loxia: language server failed to start (${message}).`,
        "Show Output",
        "Restart",
      )
      .then(async (choice) => {
        if (choice === "Show Output") {
          await vscode.commands.executeCommand("loxia.showLspOutput");
        } else if (choice === "Restart") {
          await vscode.commands.executeCommand("loxia.restartServer");
        }
      });
  }

  private setState(state: ManagerState): void {
    this.state = state;
  }
}
