import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import * as vscode from "vscode";

import { buildArgs, checkArgs, classifyBuildFailure, replArgs, runArgs } from "./cli";
import { commandLine, compiledOutputPath, formatCommand, shellKindFor, splitArgs } from "./paths";
import type { CliCommand, LoxiaSettings, ResolvedRunMode } from "./types";

export interface RunServiceDeps {
  context: vscode.ExtensionContext;
  output: vscode.OutputChannel;
  getSettings(): LoxiaSettings;
  getCli(): Promise<CliCommand | null>;
}

interface BuildResult {
  code: number | null;
  output: string;
}

export class RunService {
  private readonly terminals = new Set<vscode.Terminal>();
  private missingCliShown = false;

  constructor(private readonly deps: RunServiceDeps) {}

  async run(document: vscode.TextDocument): Promise<void> {
    const settings = this.deps.getSettings();
    const mode = settings.runMode === "ask" ? await this.askMode() : settings.runMode;
    if (mode === undefined) {
      return;
    }
    await this.runWithMode(document, mode, settings.runArgs, settings);
  }

  async runInterpreted(document: vscode.TextDocument): Promise<void> {
    const settings = this.deps.getSettings();
    await this.runWithMode(document, "interpreted", settings.runArgs, settings);
  }

  async runCompiled(document: vscode.TextDocument): Promise<void> {
    const settings = this.deps.getSettings();
    await this.runWithMode(document, "compiled", settings.runArgs, settings);
  }

  async runWithArguments(document: vscode.TextDocument): Promise<void> {
    const settings = this.deps.getSettings();
    const input = await vscode.window.showInputBox({
      title: "Loxia: run with arguments",
      prompt: "Arguments passed to the program after --",
      value: settings.runArgs.join(" "),
      ignoreFocusOut: true,
    });
    if (input === undefined) {
      return;
    }
    let args: string[];
    try {
      args = splitArgs(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Loxia: ${message}`);
      return;
    }
    const mode = settings.runMode === "ask" ? await this.askMode() : settings.runMode;
    if (mode === undefined) {
      return;
    }
    await this.runWithMode(document, mode, args, settings);
  }

  async build(document: vscode.TextDocument): Promise<void> {
    const settings = this.deps.getSettings();
    if (!(await this.prepare(document, settings, true))) {
      return;
    }
    const cli = await this.deps.getCli();
    if (cli === null) {
      this.showMissingCli();
      return;
    }
    const file = document.uri.fsPath;
    const cwd = this.cwd(document, settings);
    const output = compiledOutputPath(
      this.workspaceRoot(document),
      file,
      settings.compiledOutputDir,
      process.platform,
    );
    const built = await this.compile(cli, file, output, cwd, settings);
    if (built === null) {
      return;
    }
    const action = await vscode.window.showInformationMessage(
      `Loxia: built ${path.basename(built)}`,
      "Run",
    );
    if (action === "Run") {
      this.launch("Loxia: run", built, settings.runArgs, cwd);
    }
  }

  async check(document: vscode.TextDocument): Promise<void> {
    const settings = this.deps.getSettings();
    if (!(await this.prepare(document, settings, false))) {
      return;
    }
    const cli = await this.deps.getCli();
    if (cli === null) {
      this.showMissingCli();
      return;
    }
    const cwd = this.cwd(document, settings);
    this.launch("Loxia: check", cli.command, checkArgs(cli, document.uri.fsPath), cwd);
  }

  async repl(): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "Loxia: the REPL is disabled in untrusted workspaces. Trust the workspace to execute code.",
      );
      return;
    }
    const cli = await this.deps.getCli();
    if (cli === null) {
      this.showMissingCli();
      return;
    }
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    this.launch("Loxia: REPL", cli.command, replArgs(cli), folder);
  }

  showOutput(): void {
    this.deps.output.show(true);
  }

  dispose(): void {
    for (const terminal of this.terminals) {
      terminal.dispose();
    }
    this.terminals.clear();
  }

  private async runWithMode(
    document: vscode.TextDocument,
    mode: ResolvedRunMode,
    scriptArgs: readonly string[],
    settings: LoxiaSettings,
  ): Promise<void> {
    if (!(await this.prepare(document, settings, true))) {
      return;
    }
    const cli = await this.deps.getCli();
    if (cli === null) {
      this.showMissingCli();
      return;
    }

    const file = document.uri.fsPath;
    const cwd = this.cwd(document, settings);
    if (mode === "interpreted") {
      this.launch("Loxia: run", cli.command, runArgs(cli, file, settings, scriptArgs), cwd);
      return;
    }

    const output = compiledOutputPath(
      this.workspaceRoot(document),
      file,
      settings.compiledOutputDir,
      process.platform,
    );
    const built = await this.compile(cli, file, output, cwd, settings);
    if (built !== null) {
      this.launch("Loxia: run", built, scriptArgs, cwd);
    }
  }

  private async compile(
    cli: CliCommand,
    file: string,
    output: string,
    cwd: string,
    settings: LoxiaSettings,
  ): Promise<string | null> {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const args = buildArgs(cli, file, output, settings);
    this.deps.output.appendLine(`$ ${formatCommand(cli.command, args)}`);
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loxia: compiling ${path.basename(file)}`,
        cancellable: true,
      },
      async (_progress, token) => {
        if (token.isCancellationRequested) {
          return null;
        }
        const result = await this.spawnBuild(cli, args, cwd, token);
        if (result.code === 0) {
          this.deps.output.appendLine(`Loxia: built ${output}`);
          return output;
        }
        if (token.isCancellationRequested) {
          return null;
        }
        const hint = classifyBuildFailure(result.output);
        this.deps.output.show(true);
        const message = hint ?? "Build failed. See the Loxia Run output for the compiler log.";
        const choice = await vscode.window.showErrorMessage(`Loxia: ${message}`, "Show Output");
        if (choice === "Show Output") {
          this.deps.output.show(true);
        }
        return null;
      },
    );
  }

  private spawnBuild(
    cli: CliCommand,
    args: string[],
    cwd: string,
    token: vscode.CancellationToken,
  ): Promise<BuildResult> {
    return new Promise<BuildResult>((resolve) => {
      let text = "";
      let settled = false;
      const finish = (code: number | null): void => {
        if (settled) {
          return;
        }
        settled = true;
        resolve({ code, output: text });
      };

      let child;
      try {
        child = spawn(cli.command, args, {
          cwd,
          env: process.env,
          windowsHide: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.deps.output.appendLine(message);
        finish(1);
        return;
      }

      const append = (chunk: Buffer): void => {
        const value = chunk.toString("utf8");
        text += value;
        this.deps.output.append(value);
      };
      child.stdout?.on("data", append);
      child.stderr?.on("data", append);
      child.once("error", (error) => {
        const message = error.message;
        text += `${message}\n`;
        this.deps.output.appendLine(message);
        finish(1);
      });
      child.once("close", (code) => finish(code));
      token.onCancellationRequested(() => {
        this.deps.output.appendLine("Loxia: build cancelled.");
        child.kill();
        finish(null);
      });
    });
  }

  private launch(name: string, command: string, args: readonly string[], cwd: string): void {
    // A normal shell terminal (not `shellPath`) stays open after the program exits, so
    // the output is still there when the user looks back. `sendText` is safe here
    // because every word is quoted for the active shell.
    const kind = shellKindFor(vscode.env.shell, process.platform);
    const line = commandLine(command, args, kind);
    const terminal = vscode.window.createTerminal({ name, cwd });
    this.terminals.add(terminal);
    terminal.show();
    this.deps.output.appendLine(`$ ${line}`);
    terminal.sendText(line, true);
  }

  private async prepare(
    document: vscode.TextDocument,
    settings: LoxiaSettings,
    requireTrust: boolean,
  ): Promise<boolean> {
    if (requireTrust && !vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        "Loxia: running code is disabled in untrusted workspaces. Trust the workspace to run or build.",
      );
      return false;
    }
    if (document.isUntitled || document.uri.scheme !== "file") {
      void vscode.window.showErrorMessage("Loxia: save the file before running or building.");
      return false;
    }
    if (document.isDirty) {
      if (!settings.saveBeforeRun) {
        void vscode.window.showWarningMessage("Loxia: save the file before running or building.");
        return false;
      }
      if (!(await document.save())) {
        return false;
      }
    }
    return true;
  }

  private async askMode(): Promise<ResolvedRunMode | undefined> {
    const items: Array<vscode.QuickPickItem & { mode: ResolvedRunMode }> = [
      {
        label: "$(play) Interpreted",
        description: "tree-walk interpreter; no build",
        mode: "interpreted",
      },
      {
        label: "$(gear) Compiled",
        description: "native binary via --emit=exe; needs llvmlite, libgc and a C compiler",
        mode: "compiled",
      },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: "Loxia: run mode",
      placeHolder: "How should this file run?",
    });
    return picked?.mode;
  }

  private workspaceRoot(document: vscode.TextDocument): string {
    return (
      vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
      path.dirname(document.uri.fsPath)
    );
  }

  private cwd(document: vscode.TextDocument, settings: LoxiaSettings): string {
    const root = this.workspaceRoot(document);
    if (settings.runCwd.length === 0) {
      return root;
    }
    return path.isAbsolute(settings.runCwd) ? settings.runCwd : path.resolve(root, settings.runCwd);
  }

  private showMissingCli(): void {
    if (this.missingCliShown) {
      return;
    }
    this.missingCliShown = true;
    void vscode.window
      .showErrorMessage(
        "Loxia: the loxia CLI was not found. Install it or set loxia.cli.path.",
        "Install",
        "Open Settings",
      )
      .then(async (choice) => {
        if (choice === "Install") {
          await vscode.commands.executeCommand("loxia.openInstallDocs");
        } else if (choice === "Open Settings") {
          await vscode.commands.executeCommand("loxia.openSettings");
        }
        this.missingCliShown = false;
      });
  }
}
