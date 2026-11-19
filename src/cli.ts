import { spawn, type ChildProcess } from "node:child_process";

import type { CliCommand, Logger, LoxiaSettings } from "./types";

const DEFAULT_PROBE_TIMEOUT_MS = 4_000;

export function candidateCommands(
  settings: LoxiaSettings,
  platform: NodeJS.Platform,
): CliCommand[] {
  const explicit = settings.cliPath.trim();
  if (explicit.length > 0) {
    return [{ command: explicit, args: settings.cliArgs }];
  }

  const candidates: CliCommand[] = [
    { command: "loxia", args: [] },
    { command: "python3", args: ["-m", "loxia"] },
    { command: "python", args: ["-m", "loxia"] },
  ];
  if (platform === "win32") {
    candidates.push({ command: "py", args: ["-3", "-m", "loxia"] });
  }
  return candidates;
}

export async function probeCommand(
  candidate: CliCommand,
  cwd: string | undefined,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(ok);
    };

    let child: ChildProcess;
    try {
      child = spawn(candidate.command, [...candidate.args, "--version"], {
        cwd: cwd ?? process.cwd(),
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      finish(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      finish(code === 0);
    });
  });
}

export async function detectCli(
  settings: LoxiaSettings,
  cwd: string | undefined,
  platform: NodeJS.Platform,
  logger?: Logger,
): Promise<CliCommand | null> {
  for (const candidate of candidateCommands(settings, platform)) {
    logger?.info(`[cli] tentando ${candidate.command} ${candidate.args.join(" ")}`.trim());
    if (await probeCommand(candidate, cwd)) {
      logger?.info(`[cli] usando ${candidate.command} ${candidate.args.join(" ")}`.trim());
      return candidate;
    }
  }
  return null;
}

export function serverCommand(cli: CliCommand, settings: LoxiaSettings): CliCommand {
  return {
    command: cli.command,
    args: [...cli.args, ...settings.serverArgs],
  };
}

export function runArgs(
  cli: CliCommand,
  file: string,
  settings: LoxiaSettings,
  scriptArgs: readonly string[],
): string[] {
  return [
    ...cli.args,
    "run",
    ...(settings.runDebug ? ["--debug"] : []),
    file,
    ...(scriptArgs.length > 0 ? ["--", ...scriptArgs] : []),
  ];
}

export function buildArgs(
  cli: CliCommand,
  file: string,
  output: string,
  settings: LoxiaSettings,
): string[] {
  return [
    ...cli.args,
    "build",
    file,
    "--emit=exe",
    "-o",
    output,
    "--color=never",
    ...(settings.compiledMaxHeap.length > 0 ? ["--max-heap", settings.compiledMaxHeap] : []),
  ];
}

export function checkArgs(cli: CliCommand, file: string): string[] {
  return [...cli.args, "check", file];
}

export function replArgs(cli: CliCommand): string[] {
  return [...cli.args, "repl"];
}

export function binaryArgs(output: string, scriptArgs: readonly string[]): string[] {
  return [output, ...scriptArgs];
}

/**
 * Turns the compiler's stderr into an actionable hint for the two prerequisites
 * that actually bite compiled-mode users: the LLVM extra and the Boehm GC.
 */
export function classifyBuildFailure(output: string): string | null {
  const text = output.toLowerCase();
  if (text.includes("llvmlite") || text.includes("no module named 'llvmlite'")) {
    return 'The native backend needs the LLVM extra: install with `uv tool install "loxia[llvm]"` (or `pipx install "loxia[llvm]"`).';
  }
  if (text.includes("gc.h") || text.includes("libgc") || text.includes("bdw-gc")) {
    return "The native backend needs the Boehm GC: install libgc-dev (Debian/Ubuntu), bdw-gc (Homebrew) or the equivalent package.";
  }
  if (
    text.includes("command not found: cc") ||
    text.includes("failed to find tool") ||
    text.includes("linker") ||
    text.includes("undefined reference")
  ) {
    return "The native backend needs a C compiler/linker (cc, gcc or clang) on PATH.";
  }
  if (text.includes("not supported by the backend yet")) {
    return "This program uses a feature the native backend does not support yet. Run it interpreted instead.";
  }
  return null;
}
