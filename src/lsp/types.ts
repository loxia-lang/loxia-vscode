export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface LocationLink {
  targetUri: string;
  targetRange: Range;
  targetSelectionRange?: Range;
  originSelectionRange?: Range;
}

export interface MarkupContent {
  kind: "markdown" | "plaintext";
  value: string;
}

export type MarkedString = string | { language: string; value: string };

export interface Hover {
  contents: MarkupContent | MarkedString | MarkedString[];
  range?: Range;
}

export interface DiagnosticCode {
  value: string | number;
  target?: string;
}

export interface Diagnostic {
  range: Range;
  severity?: number;
  code?: string | number | DiagnosticCode;
  source?: string;
  message: string;
  relatedInformation?: Array<{ location: Location; message: string }>;
}

export interface PublishDiagnosticsParams {
  uri: string;
  version?: number;
  diagnostics: Diagnostic[];
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface InsertReplaceEdit {
  insert: Range;
  replace: Range;
  newText: string;
}

export interface TextDocumentEdit {
  textDocument: { uri: string; version?: number | null };
  edits: TextEdit[];
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: Array<TextDocumentEdit | { kind: string }>;
}

export interface CompletionItem {
  label: string | { label: string };
  kind?: number;
  detail?: string;
  documentation?: MarkupContent | MarkedString;
  insertText?: string;
  sortText?: string;
  filterText?: string;
  textEdit?: TextEdit | InsertReplaceEdit;
}

export interface CompletionList {
  isIncomplete?: boolean;
  items: CompletionItem[];
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: MarkupContent | MarkedString;
}

export interface SignatureInformation {
  label: string;
  documentation?: MarkupContent | MarkedString;
  parameters?: ParameterInformation[];
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

export interface CodeAction {
  title: string;
  kind?: string;
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: { title: string; command: string; arguments?: unknown[] };
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

export interface InlayHintLabelPart {
  value: string;
}

export interface InlayHint {
  position: Position;
  label: string | InlayHintLabelPart[];
  kind?: number;
  paddingLeft?: boolean;
  paddingRight?: boolean;
}

export interface PrepareRenameResult {
  range: Range;
  placeholder?: string;
  defaultBehavior?: boolean;
}
