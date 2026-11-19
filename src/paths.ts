import path from "node:path";

import type { VariableContext } from "./types";

/**
 * Substitutes the VS Code variables that make sense for this extension. Unknown
 * placeholders are preserved so a bad setting fails visibly instead of silently
 * becoming an empty string.
 */
export function substituteVariables(value: string, context: VariableContext): string {
  return value.replace(/\$\{([^}]+)\}/g, (match, name: string) => {
    if (name.startsWith("env:")) {
      return context.env[name.slice(4)] ?? "";
    }
    switch (name) {
      case "workspaceFolder":
        return context.workspaceFolder ?? "";
      case "workspaceFolderBasename":
        return context.workspaceFolder ? path.basename(context.workspaceFolder) : "";
      case "userHome":
        return context.userHome;
      case "file":
        return context.file ?? "";
      case "fileBasename":
        return context.file ? path.basename(context.file) : "";
      case "fileDirname":
        return context.file ? path.dirname(context.file) : "";
      case "fileExtname":
        return context.file ? path.extname(context.file) : "";
      case "fileBasenameNoExtension":
        return context.file ? path.basename(context.file, path.extname(context.file)) : "";
      default:
        return match;
    }
  });
}

export function substituteVariablesInArray(
  values: readonly string[],
  context: VariableContext,
): string[] {
  return values.map((value) => substituteVariables(value, context));
}

/**
 * A compiled artifact keeps the source tree shape under `outputDir`, so two files
 * named `main.lx` in different modules do not overwrite each other.
 */
export function compiledOutputPath(
  workspaceRoot: string,
  filePath: string,
  outputDir: string,
  platform: NodeJS.Platform,
): string {
  const base = path.isAbsolute(outputDir) ? outputDir : path.join(workspaceRoot, outputDir);
  const relative = path.relative(workspaceRoot, filePath);
  const safeRelative =
    relative === "" || relative.startsWith("..") || path.isAbsolute(relative)
      ? path.basename(filePath)
      : relative;
  const parsed = path.parse(safeRelative);
  const targetDir = path.join(base, parsed.dir);
  const name = `${parsed.name}${platform === "win32" ? ".exe" : ""}`;
  return path.join(targetDir, name);
}

/** Splits the `Run with Arguments…` input using shell-like quotes. */
export function splitArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === undefined) {
      break;
    }
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && index + 1 < input.length) {
        index += 1;
        current += input[index] ?? "";
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (char === "\\" && index + 1 < input.length) {
      index += 1;
      current += input[index] ?? "";
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        args.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }

  if (quote !== null) {
    throw new Error("Unterminated quote in arguments.");
  }
  if (hasToken) {
    args.push(current);
  }
  return args;
}

export function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

export type ShellKind = "posix" | "powershell" | "cmd";

/** The terminal profile decides the quoting rules; `vscode.env.shell` names it. */
export function shellKindFor(shellPath: string, platform: NodeJS.Platform): ShellKind {
  if (platform !== "win32") {
    return "posix";
  }
  const name = path.win32.basename(shellPath).toLowerCase();
  if (name === "cmd" || name === "cmd.exe") {
    return "cmd";
  }
  if (
    name === "wsl" ||
    name === "wsl.exe" ||
    name === "sh" ||
    name === "sh.exe" ||
    name.includes("bash") ||
    name.includes("zsh") ||
    name.includes("fish")
  ) {
    return "posix";
  }
  // PowerShell is the VS Code default on Windows; unknown shells get its rules.
  return "powershell";
}

export function quoteShellArg(value: string, kind: ShellKind): string {
  if (kind === "powershell") {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (kind === "cmd") {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Quotes the command and every argument for the terminal's shell. PowerShell needs
 * `&` to invoke a quoted command; POSIX and cmd accept the quoted command directly.
 */
export function commandLine(command: string, args: readonly string[], kind: ShellKind): string {
  const quoted = [command, ...args].map((value) => quoteShellArg(value, kind)).join(" ");
  return kind === "powershell" ? `& ${quoted}` : quoted;
}
