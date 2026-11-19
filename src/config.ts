import { substituteVariables, substituteVariablesInArray } from "./paths";
import {
  FEATURE_NAMES,
  type FeatureFlags,
  type FeatureName,
  type LoxiaSettings,
  type RunMode,
  type TraceLevel,
  type VariableContext,
} from "./types";

export type SettingsReader = (key: string, fallback: unknown) => unknown;

export const SETTING_KEYS = [
  "lsp.enabled",
  "cli.path",
  "cli.args",
  "server.args",
  "server.cwd",
  "lsp.trace",
  ...FEATURE_NAMES.map((name) => `features.${name}`),
  "run.mode",
  "run.args",
  "run.cwd",
  "run.debug",
  "run.saveBeforeRun",
  "run.compiled.outputDir",
  "run.compiled.maxHeap",
  "statusBar.enabled",
] as const;

const RUN_MODES: readonly RunMode[] = ["interpreted", "compiled", "ask"];
const TRACE_LEVELS: readonly TraceLevel[] = ["off", "messages", "verbose"];

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown, fallback: readonly string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  return [...fallback];
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function readSettings(get: SettingsReader, context: VariableContext): LoxiaSettings {
  const features = Object.fromEntries(
    FEATURE_NAMES.map((name) => [name, readBoolean(get(`features.${name}`, true), true)]),
  ) as FeatureFlags;

  return {
    lspEnabled: readBoolean(get("lsp.enabled", true), true),
    cliPath: substituteVariables(readString(get("cli.path", ""), ""), context).trim(),
    cliArgs: substituteVariablesInArray(readStringArray(get("cli.args", []), []), context),
    serverArgs: readStringArray(get("server.args", ["lsp"]), ["lsp"]),
    serverCwd: substituteVariables(readString(get("server.cwd", ""), ""), context),
    trace: readEnum(get("lsp.trace", "off"), TRACE_LEVELS, "off"),
    features,
    runMode: readEnum(get("run.mode", "interpreted"), RUN_MODES, "interpreted"),
    runArgs: readStringArray(get("run.args", []), []),
    runCwd: substituteVariables(readString(get("run.cwd", ""), ""), context),
    runDebug: readBoolean(get("run.debug", false), false),
    saveBeforeRun: readBoolean(get("run.saveBeforeRun", true), true),
    compiledOutputDir: substituteVariables(
      readString(get("run.compiled.outputDir", ".loxia/bin"), ".loxia/bin"),
      context,
    ),
    compiledMaxHeap: readString(get("run.compiled.maxHeap", ""), "").trim(),
    statusBarEnabled: readBoolean(get("statusBar.enabled", true), true),
  };
}

export function featureEnabled(settings: LoxiaSettings, name: FeatureName): boolean {
  return settings.features[name];
}

/** Options the server understands through `initializationOptions`. */
export function serverSettings(settings: LoxiaSettings): Record<string, unknown> {
  return {
    inlayHints: { enabled: settings.features.inlayHints },
    completion: { inheritedMembers: settings.features.completionInheritedMembers },
  };
}
