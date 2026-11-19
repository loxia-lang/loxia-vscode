import { spawn, type ChildProcess } from "node:child_process";

import { MessageReader, encodeMessage, type JsonRpcMessage } from "../protocol";
import type { CliCommand, Logger, TraceLevel, WorkspaceFolderInfo } from "../types";
import type { PublishDiagnosticsParams } from "./types";

export type LspState = "starting" | "ready" | "stopped" | "error";

export interface DidOpenDocument {
  uri: string;
  version: number;
  text: string;
}

export interface LspClientOptions {
  command: CliCommand;
  cwd: string;
  logger: Logger;
  initializationOptions: Record<string, unknown>;
  rootUri: string | null;
  workspaceFolders: WorkspaceFolderInfo[] | null;
  onDiagnostics: (params: PublishDiagnosticsParams) => void;
  onState?: (state: LspState, detail?: string) => void;
  onNotification?: (method: string, params: unknown) => void;
  trace?: () => TraceLevel;
  requestTimeoutMs?: number;
  clientVersion?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: NodeJS.Timeout;
  method: string;
}

/**
 * Minimal LSP client over stdio. The framing is ours (`protocol.ts`), the server is
 * the `loxia lsp` process, and every request has a timeout so a wedged server does
 * not freeze the editor.
 */
export class LspClient {
  private readonly reader: MessageReader;
  private readonly pending = new Map<number, PendingRequest>();
  private process: ChildProcess | null = null;
  private nextId = 1;
  private stopping = false;
  private state: LspState = "stopped";

  constructor(private readonly options: LspClientOptions) {
    this.reader = new MessageReader(
      (message) => this.handleMessage(message),
      (error) => this.options.logger.error(`[lsp] ${error.message}`),
    );
  }

  getState(): LspState {
    return this.state;
  }

  async start(): Promise<void> {
    this.setState("starting");
    const child = spawn(this.options.command.command, this.options.command.args, {
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.process = child;

    child.stdout?.on("data", (chunk: Buffer) => this.reader.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trimEnd();
      if (text.length > 0) {
        this.options.logger.info(`[server] ${text}`);
      }
    });
    child.once("error", (error) => {
      if (!this.stopping) {
        this.setState("error", error.message);
      }
      this.rejectPending(error);
    });
    child.once("exit", (code, signal) => {
      this.process = null;
      if (this.stopping) {
        this.setState("stopped");
      } else {
        this.setState("error", `LSP exited (${code ?? signal ?? "unknown"})`);
      }
      this.rejectPending(new Error(`LSP exited (${code ?? signal ?? "unknown"})`));
    });

    await this.waitForSpawn(child);
    await this.request(
      "initialize",
      {
        processId: process.pid,
        clientInfo: {
          name: "loxia-vscode",
          version: this.options.clientVersion ?? "1.1.0",
        },
        rootUri: this.options.rootUri,
        workspaceFolders: this.options.workspaceFolders,
        initializationOptions: this.options.initializationOptions,
        capabilities: {
          workspace: {
            configuration: false,
            workspaceFolders: true,
            fileOperations: {
              willRename: {
                filters: [{ scheme: "file", pattern: { glob: "**/*.lx" } }],
              },
            },
          },
          textDocument: {
            synchronization: { dynamicRegistration: false },
            completion: {
              completionItem: {
                snippetSupport: false,
                documentationFormat: ["markdown", "plaintext"],
              },
            },
            hover: { contentFormat: ["markdown", "plaintext"] },
            definition: {},
            references: {},
            documentHighlight: {},
            typeDefinition: {},
            implementation: {},
            typeHierarchy: {},
            rename: { prepareSupport: true },
            codeAction: {
              codeActionLiteralSupport: {
                codeActionKind: { valueSet: ["quickfix"] },
              },
            },
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
            inlayHint: {},
            signatureHelp: {},
            formatting: {},
          },
        },
      },
      15_000,
    );
    this.notify("initialized", {});
    this.setState("ready");
  }

  request<T>(
    method: string,
    params: unknown,
    timeoutMs = this.options.requestTimeoutMs ?? 10_000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId;
      this.nextId += 1;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout em ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
        method,
      });
      if (!this.send({ jsonrpc: "2.0", id, method, params })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`LSP não está rodando (${method})`));
      }
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  didOpen(document: DidOpenDocument): void {
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri: document.uri,
        languageId: "loxia",
        version: document.version,
        text: document.text,
      },
    });
  }

  didChange(document: DidOpenDocument): void {
    this.notify("textDocument/didChange", {
      textDocument: { uri: document.uri, version: document.version },
      contentChanges: [{ text: document.text }],
    });
  }

  didSave(uri: string): void {
    this.notify("textDocument/didSave", { textDocument: { uri } });
  }

  didClose(uri: string): void {
    this.notify("textDocument/didClose", { textDocument: { uri } });
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      return;
    }
    this.stopping = true;
    const child = this.process;
    if (child === null) {
      this.setState("stopped");
      return;
    }
    try {
      await this.request("shutdown", null, 500);
    } catch {
      // The server may already be gone; the exit notification below is best effort.
    }
    this.notify("exit", {});
    await new Promise<void>((resolve) => {
      const current = this.process;
      if (current === null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        current.kill();
        resolve();
      }, 300);
      current.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.process = null;
    this.setState("stopped");
  }

  kill(): void {
    this.stopping = true;
    this.process?.kill();
    this.process = null;
    this.rejectPending(new Error("LSP encerrado"));
    this.setState("stopped");
  }

  private waitForSpawn(child: ChildProcess): Promise<void> {
    if (child.pid !== undefined) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (error) => reject(error));
    });
  }

  private send(payload: JsonRpcMessage): boolean {
    const child = this.process;
    if (child === null || child.stdin === null || !child.stdin.writable) {
      return false;
    }
    this.trace("→", payload);
    child.stdin.write(encodeMessage(payload));
    return true;
  }

  private handleMessage(message: JsonRpcMessage): void {
    this.trace("←", message);
    if (message.id !== undefined && message.method !== undefined) {
      // The server does not use client requests today; answering null keeps it unblocked.
      this.send({ jsonrpc: "2.0", id: message.id, result: null });
      return;
    }
    if (message.id !== undefined) {
      if (typeof message.id !== "number") {
        return;
      }
      const pending = this.pending.get(message.id);
      if (pending === undefined) {
        return;
      }
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error !== undefined) {
        pending.reject(new Error(message.error.message || "erro LSP"));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
      this.options.onDiagnostics(message.params as PublishDiagnosticsParams);
      return;
    }
    if (message.method === "window/showMessage") {
      const params = message.params as { type?: number; message?: string };
      this.options.logger.info(`[server] ${params.message ?? ""}`);
      return;
    }
    if (message.method === "window/logMessage") {
      const params = message.params as { message?: string };
      this.options.logger.info(`[server] ${params.message ?? ""}`);
      return;
    }
    if (message.method !== undefined) {
      this.options.onNotification?.(message.method, message.params);
    }
  }

  private trace(direction: "→" | "←", payload: JsonRpcMessage): void {
    const level = this.options.trace?.() ?? "off";
    if (level === "off") {
      return;
    }
    if (level === "verbose") {
      this.options.logger.info(`[lsp] ${direction} ${JSON.stringify(payload)}`);
      return;
    }
    const label = payload.method ?? "response";
    this.options.logger.info(
      `[lsp] ${direction} ${label}${payload.id !== undefined ? ` #${payload.id}` : ""}`,
    );
  }

  private rejectPending(error: unknown): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private setState(state: LspState, detail?: string): void {
    this.state = state;
    this.options.onState?.(state, detail);
  }
}
