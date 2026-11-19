export const FEATURE_NAMES = [
  "diagnostics",
  "hover",
  "definition",
  "completion",
  "completionInheritedMembers",
  "signatureHelp",
  "inlayHints",
  "formatting",
  "codeActions",
  "rename",
  "documentSymbols",
  "workspaceSymbols",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureFlags = Record<FeatureName, boolean>;

export type RunMode = "interpreted" | "compiled" | "ask";
export type ResolvedRunMode = Exclude<RunMode, "ask">;
export type TraceLevel = "off" | "messages" | "verbose";

export interface LoxiaSettings {
  lspEnabled: boolean;
  cliPath: string;
  cliArgs: string[];
  serverArgs: string[];
  serverCwd: string;
  trace: TraceLevel;
  features: FeatureFlags;
  runMode: RunMode;
  runArgs: string[];
  runCwd: string;
  runDebug: boolean;
  saveBeforeRun: boolean;
  compiledOutputDir: string;
  compiledMaxHeap: string;
  statusBarEnabled: boolean;
}

export interface CliCommand {
  command: string;
  args: string[];
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface VariableContext {
  workspaceFolder?: string;
  file?: string;
  userHome: string;
  env: NodeJS.ProcessEnv;
}

export interface WorkspaceFolderInfo {
  uri: string;
  name: string;
}
