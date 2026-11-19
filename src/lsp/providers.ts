import * as vscode from "vscode";

import type { FeatureName, LoxiaSettings } from "../types";
import {
  toCodeAction,
  toCompletionItem,
  toDocumentSymbol,
  toHover,
  toInlayHint,
  toLocation,
  toPrepareRename,
  toSignatureHelp,
  toSymbolInformation,
  toTextEdits,
  toWorkspaceEdit,
} from "./convert";
import type {
  CodeAction,
  CompletionItem,
  CompletionList,
  Diagnostic,
  DocumentSymbol,
  Hover,
  InlayHint,
  Location,
  LocationLink,
  PrepareRenameResult,
  SignatureHelp,
  SymbolInformation,
  TextEdit,
} from "./types";

export interface ProviderDeps {
  request<T>(method: string, params: unknown): Promise<T | undefined>;
  getSettings(): LoxiaSettings;
  rawDiagnostics: Map<string, Diagnostic[]>;
  isReady(): boolean;
}

function enabled(deps: ProviderDeps, feature: FeatureName): boolean {
  const settings = deps.getSettings();
  return settings.features[feature];
}

function documentUri(document: vscode.TextDocument): { uri: string } {
  return { uri: document.uri.toString() };
}

function positionParams(
  document: vscode.TextDocument,
  position: vscode.Position,
): { textDocument: { uri: string }; position: vscode.Position } {
  return {
    textDocument: { uri: document.uri.toString() },
    position,
  };
}

export function registerProviders(deps: ProviderDeps): vscode.Disposable[] {
  const providers: vscode.Disposable[] = [];

  providers.push(
    vscode.languages.registerDocumentFormattingEditProvider("loxia", {
      provideDocumentFormattingEdits: async (document) => {
        if (!enabled(deps, "formatting")) {
          return undefined;
        }
        const editor = vscode.window.activeTextEditor;
        const options = editor?.document === document ? editor.options : undefined;
        const edits = await deps.request<TextEdit[]>("textDocument/formatting", {
          ...documentUri(document),
          options: {
            tabSize: typeof options?.tabSize === "number" ? options.tabSize : 2,
            insertSpaces: options?.insertSpaces ?? true,
          },
        });
        return toTextEdits(edits);
      },
    }),
  );

  providers.push(
    vscode.languages.registerHoverProvider("loxia", {
      provideHover: async (document, position) => {
        if (!enabled(deps, "hover")) {
          return undefined;
        }
        const hover = await deps.request<Hover>(
          "textDocument/hover",
          positionParams(document, position),
        );
        return hover === undefined ? undefined : toHover(hover, position);
      },
    }),
  );

  providers.push(
    vscode.languages.registerDefinitionProvider("loxia", {
      provideDefinition: async (document, position) => {
        if (!enabled(deps, "definition")) {
          return undefined;
        }
        const result = await deps.request<Location | Location[] | LocationLink[]>(
          "textDocument/definition",
          positionParams(document, position),
        );
        if (result === undefined || result === null) {
          return undefined;
        }
        const items = Array.isArray(result) ? result : [result];
        return items.map(toLocation);
      },
    }),
  );

  providers.push(
    vscode.languages.registerCompletionItemProvider(
      "loxia",
      {
        provideCompletionItems: async (document, position) => {
          if (!enabled(deps, "completion")) {
            return undefined;
          }
          const result = await deps.request<CompletionList | CompletionItem[]>(
            "textDocument/completion",
            positionParams(document, position),
          );
          if (result === undefined || result === null) {
            return undefined;
          }
          const items = Array.isArray(result) ? result : result.items;
          return items.map(toCompletionItem);
        },
      },
      ".",
    ),
  );

  providers.push(
    vscode.languages.registerInlayHintsProvider("loxia", {
      provideInlayHints: async (document, range) => {
        if (!enabled(deps, "inlayHints")) {
          return [];
        }
        const result = await deps.request<InlayHint[]>("textDocument/inlayHint", {
          ...documentUri(document),
          range: {
            start: { line: range.start.line, character: range.start.character },
            end: { line: range.end.line, character: range.end.character },
          },
        });
        return (result ?? []).map(toInlayHint);
      },
    }),
  );

  providers.push(
    vscode.languages.registerSignatureHelpProvider(
      "loxia",
      {
        provideSignatureHelp: async (document, position) => {
          if (!enabled(deps, "signatureHelp")) {
            return undefined;
          }
          const result = await deps.request<SignatureHelp>(
            "textDocument/signatureHelp",
            positionParams(document, position),
          );
          return result === undefined ? undefined : toSignatureHelp(result);
        },
      },
      "(",
      ",",
    ),
  );

  providers.push(
    vscode.languages.registerCodeActionsProvider(
      "loxia",
      {
        provideCodeActions: async (document, range, context) => {
          if (!enabled(deps, "codeActions")) {
            return [];
          }
          const uri = document.uri.toString();
          const actions = await deps.request<CodeAction[]>("textDocument/codeAction", {
            ...documentUri(document),
            range: {
              start: { line: range.start.line, character: range.start.character },
              end: { line: range.end.line, character: range.end.character },
            },
            context: {
              diagnostics: deps.rawDiagnostics.get(uri) ?? [],
              only: context.only ? [context.only.value] : undefined,
            },
          });
          return (actions ?? []).map(toCodeAction);
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
  );

  providers.push(
    vscode.languages.registerRenameProvider("loxia", {
      prepareRename: async (document, position) => {
        if (!enabled(deps, "rename")) {
          throw new Error("Loxia: rename is disabled (loxia.features.rename).");
        }
        const result = await deps.request<PrepareRenameResult>(
          "textDocument/prepareRename",
          positionParams(document, position),
        );
        if (result === undefined) {
          throw new Error("Loxia: rename is only supported for symbols.");
        }
        if (result.defaultBehavior === true) {
          const wordRange = document.getWordRangeAtPosition(position);
          return {
            range: wordRange ?? new vscode.Range(position, position),
            placeholder: wordRange ? document.getText(wordRange) : "",
          };
        }
        return toPrepareRename(result);
      },
      provideRenameEdits: async (document, position, newName) => {
        if (!enabled(deps, "rename")) {
          return undefined;
        }
        const edit = await deps.request<Parameters<typeof toWorkspaceEdit>[0]>(
          "textDocument/rename",
          { ...positionParams(document, position), newName },
        );
        return toWorkspaceEdit(edit);
      },
    }),
  );

  providers.push(
    vscode.languages.registerDocumentSymbolProvider("loxia", {
      provideDocumentSymbols: async (document) => {
        if (!enabled(deps, "documentSymbols")) {
          return [];
        }
        const result = await deps.request<DocumentSymbol[] | SymbolInformation[]>(
          "textDocument/documentSymbol",
          documentUri(document),
        );
        if (result === undefined || result.length === 0) {
          return [];
        }
        const first = result[0];
        if (first !== undefined && "location" in first) {
          return (result as SymbolInformation[]).map(toSymbolInformation);
        }
        return (result as DocumentSymbol[]).map(toDocumentSymbol);
      },
    }),
  );

  providers.push(
    vscode.languages.registerWorkspaceSymbolProvider({
      provideWorkspaceSymbols: async (query) => {
        if (!enabled(deps, "workspaceSymbols")) {
          return [];
        }
        const result = await deps.request<SymbolInformation[]>("workspace/symbol", { query });
        return (result ?? []).map(toSymbolInformation);
      },
    }),
  );

  return providers;
}
