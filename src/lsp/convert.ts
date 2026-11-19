import * as vscode from "vscode";

import type {
  CodeAction,
  CompletionItem,
  Diagnostic,
  DocumentSymbol,
  Hover,
  InlayHint,
  Location,
  LocationLink,
  MarkedString,
  MarkupContent,
  Position,
  PrepareRenameResult,
  Range,
  SignatureHelp,
  SymbolInformation,
  TextDocumentEdit,
  TextEdit,
  WorkspaceEdit,
} from "./types";

const DIAGNOSTIC_SEVERITY: Record<number, vscode.DiagnosticSeverity> = {
  1: vscode.DiagnosticSeverity.Error,
  2: vscode.DiagnosticSeverity.Warning,
  3: vscode.DiagnosticSeverity.Information,
  4: vscode.DiagnosticSeverity.Hint,
};

// LSP starts at 1; the VS Code enum starts at 0.
const SYMBOL_KIND: Record<number, vscode.SymbolKind> = {
  1: vscode.SymbolKind.File,
  2: vscode.SymbolKind.Module,
  3: vscode.SymbolKind.Namespace,
  4: vscode.SymbolKind.Package,
  5: vscode.SymbolKind.Class,
  6: vscode.SymbolKind.Method,
  7: vscode.SymbolKind.Property,
  8: vscode.SymbolKind.Field,
  9: vscode.SymbolKind.Constructor,
  10: vscode.SymbolKind.Enum,
  11: vscode.SymbolKind.Interface,
  12: vscode.SymbolKind.Function,
  13: vscode.SymbolKind.Variable,
  14: vscode.SymbolKind.Constant,
  15: vscode.SymbolKind.String,
  16: vscode.SymbolKind.Number,
  17: vscode.SymbolKind.Boolean,
  18: vscode.SymbolKind.Array,
  19: vscode.SymbolKind.Object,
  20: vscode.SymbolKind.Key,
  21: vscode.SymbolKind.Null,
  22: vscode.SymbolKind.EnumMember,
  23: vscode.SymbolKind.Struct,
  24: vscode.SymbolKind.Event,
  25: vscode.SymbolKind.Operator,
  26: vscode.SymbolKind.TypeParameter,
};

const COMPLETION_KIND: Record<number, vscode.CompletionItemKind> = {
  1: vscode.CompletionItemKind.Text,
  2: vscode.CompletionItemKind.Method,
  3: vscode.CompletionItemKind.Function,
  4: vscode.CompletionItemKind.Constructor,
  5: vscode.CompletionItemKind.Field,
  6: vscode.CompletionItemKind.Variable,
  7: vscode.CompletionItemKind.Class,
  8: vscode.CompletionItemKind.Interface,
  9: vscode.CompletionItemKind.Module,
  10: vscode.CompletionItemKind.Property,
  11: vscode.CompletionItemKind.Unit,
  12: vscode.CompletionItemKind.Value,
  13: vscode.CompletionItemKind.Enum,
  14: vscode.CompletionItemKind.Keyword,
  15: vscode.CompletionItemKind.Snippet,
  16: vscode.CompletionItemKind.Color,
  17: vscode.CompletionItemKind.File,
  18: vscode.CompletionItemKind.Reference,
  19: vscode.CompletionItemKind.Folder,
  20: vscode.CompletionItemKind.EnumMember,
  21: vscode.CompletionItemKind.Constant,
  22: vscode.CompletionItemKind.Struct,
  23: vscode.CompletionItemKind.Event,
  24: vscode.CompletionItemKind.Operator,
  25: vscode.CompletionItemKind.TypeParameter,
};

export function toPosition(position: Position): vscode.Position {
  return new vscode.Position(position.line, position.character);
}

export function toRange(range: Range): vscode.Range {
  return new vscode.Range(toPosition(range.start), toPosition(range.end));
}

export function toLocation(location: Location | LocationLink): vscode.Location {
  if ("targetUri" in location) {
    return new vscode.Location(
      vscode.Uri.parse(location.targetUri),
      toRange(location.targetSelectionRange ?? location.targetRange),
    );
  }
  return new vscode.Location(vscode.Uri.parse(location.uri), toRange(location.range));
}

export function toTextEdits(edits: TextEdit[] | undefined): vscode.TextEdit[] {
  return (edits ?? []).map((edit) => new vscode.TextEdit(toRange(edit.range), edit.newText));
}

function isTextDocumentEdit(
  change: TextDocumentEdit | { kind: string },
): change is TextDocumentEdit {
  return "textDocument" in change && "edits" in change;
}

export function toWorkspaceEdit(edit: WorkspaceEdit | undefined): vscode.WorkspaceEdit | undefined {
  if (edit === undefined) {
    return undefined;
  }
  const result = new vscode.WorkspaceEdit();
  for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
    result.set(vscode.Uri.parse(uri), toTextEdits(edits));
  }
  for (const change of edit.documentChanges ?? []) {
    if (isTextDocumentEdit(change)) {
      result.set(vscode.Uri.parse(change.textDocument.uri), toTextEdits(change.edits));
    }
  }
  return result;
}

function markedString(value: MarkedString): string {
  if (typeof value === "string") {
    return value;
  }
  return `\`\`\`${value.language}\n${value.value}\n\`\`\``;
}

export function toMarkdown(
  contents: MarkupContent | MarkedString | MarkedString[] | undefined,
): vscode.MarkdownString | undefined {
  if (contents === undefined) {
    return undefined;
  }
  let value: string;
  if (typeof contents === "string") {
    value = contents;
  } else if (Array.isArray(contents)) {
    value = contents.map(markedString).join("\n\n");
  } else if ("kind" in contents) {
    value = contents.value;
  } else {
    value = markedString(contents);
  }
  const markdown = new vscode.MarkdownString(value);
  markdown.isTrusted = false;
  return markdown;
}

export function toDiagnostic(item: Diagnostic): vscode.Diagnostic {
  const diagnostic = new vscode.Diagnostic(
    toRange(item.range),
    item.message,
    DIAGNOSTIC_SEVERITY[item.severity ?? 1] ?? vscode.DiagnosticSeverity.Error,
  );
  if (item.code !== undefined) {
    if (typeof item.code === "object") {
      diagnostic.code = item.code.target
        ? { value: item.code.value, target: vscode.Uri.parse(item.code.target) }
        : item.code.value;
    } else {
      diagnostic.code = item.code;
    }
  }
  diagnostic.source = item.source ?? "loxia";
  if (item.relatedInformation !== undefined) {
    diagnostic.relatedInformation = item.relatedInformation.map(
      (related) =>
        new vscode.DiagnosticRelatedInformation(toLocation(related.location), related.message),
    );
  }
  return diagnostic;
}

export function toSymbolKind(kind: number): vscode.SymbolKind {
  return SYMBOL_KIND[kind] ?? vscode.SymbolKind.Variable;
}

export function toCompletionKind(kind: number | undefined): vscode.CompletionItemKind {
  return COMPLETION_KIND[kind ?? 1] ?? vscode.CompletionItemKind.Text;
}

export function toDocumentSymbol(item: DocumentSymbol): vscode.DocumentSymbol {
  const symbol = new vscode.DocumentSymbol(
    item.name,
    item.detail ?? "",
    toSymbolKind(item.kind),
    toRange(item.range),
    toRange(item.selectionRange),
  );
  symbol.children = (item.children ?? []).map(toDocumentSymbol);
  return symbol;
}

export function toSymbolInformation(item: SymbolInformation): vscode.SymbolInformation {
  return new vscode.SymbolInformation(
    item.name,
    toSymbolKind(item.kind),
    item.containerName ?? "",
    toLocation(item.location),
  );
}

export function toCompletionItem(item: CompletionItem): vscode.CompletionItem {
  const label = typeof item.label === "string" ? item.label : item.label.label;
  const completion = new vscode.CompletionItem(label, toCompletionKind(item.kind));
  completion.detail = item.detail;
  completion.documentation = toMarkdown(item.documentation);
  completion.insertText = item.insertText;
  completion.sortText = item.sortText;
  completion.filterText = item.filterText;
  if (item.textEdit !== undefined) {
    if ("insert" in item.textEdit && "replace" in item.textEdit) {
      // @types/vscode 1.85 only exposes TextEdit; prefer the replace range when the
      // server sends an InsertReplaceEdit.
      completion.textEdit = new vscode.TextEdit(
        toRange(item.textEdit.replace),
        item.textEdit.newText,
      );
    } else {
      completion.textEdit = new vscode.TextEdit(
        toRange(item.textEdit.range),
        item.textEdit.newText,
      );
    }
  }
  return completion;
}

export function toSignatureHelp(result: SignatureHelp): vscode.SignatureHelp {
  const help = new vscode.SignatureHelp();
  help.signatures = result.signatures.map((signature) => {
    const item = new vscode.SignatureInformation(
      signature.label,
      toMarkdown(signature.documentation),
    );
    item.parameters = (signature.parameters ?? []).map(
      (parameter) =>
        new vscode.ParameterInformation(parameter.label, toMarkdown(parameter.documentation)),
    );
    return item;
  });
  help.activeSignature = result.activeSignature ?? 0;
  help.activeParameter = result.activeParameter ?? 0;
  return help;
}

function toCodeActionKind(kind: string | undefined): vscode.CodeActionKind {
  if (kind === undefined) {
    return vscode.CodeActionKind.Empty;
  }
  const [base, ...rest] = kind.split(".");
  const root =
    base === "quickfix"
      ? vscode.CodeActionKind.QuickFix
      : base === "refactor"
        ? vscode.CodeActionKind.Refactor
        : base === "source"
          ? vscode.CodeActionKind.Source
          : vscode.CodeActionKind.Empty;
  return rest.length > 0 ? root.append(rest.join(".")) : root;
}

export function toCodeAction(action: CodeAction): vscode.CodeAction {
  const item = new vscode.CodeAction(action.title, toCodeActionKind(action.kind));
  item.isPreferred = action.isPreferred ?? false;
  item.edit = toWorkspaceEdit(action.edit);
  if (action.command !== undefined) {
    item.command = {
      title: action.command.title,
      command: action.command.command,
      arguments: action.command.arguments,
    };
  }
  return item;
}

export function toHover(hover: Hover, fallbackPosition: vscode.Position): vscode.Hover {
  const range = hover.range
    ? toRange(hover.range)
    : new vscode.Range(fallbackPosition, fallbackPosition);
  return new vscode.Hover(toMarkdown(hover.contents) ?? new vscode.MarkdownString(""), range);
}

export function toInlayHint(item: InlayHint): vscode.InlayHint {
  const label = Array.isArray(item.label)
    ? item.label.map((part) => part.value).join("")
    : item.label;
  const hint = new vscode.InlayHint(
    toPosition(item.position),
    label,
    item.kind === 1 ? vscode.InlayHintKind.Type : vscode.InlayHintKind.Parameter,
  );
  hint.paddingLeft = item.paddingLeft ?? false;
  hint.paddingRight = item.paddingRight ?? false;
  return hint;
}

export function toPrepareRename(result: PrepareRenameResult): {
  range: vscode.Range;
  placeholder: string;
} {
  return {
    range: toRange(result.range),
    placeholder: result.placeholder ?? "",
  };
}
