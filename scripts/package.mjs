import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const version = manifest.version;
const output = path.join("dist", `loxia-${version}.vsix`);

mkdirSync("dist", { recursive: true });

const win = process.platform === "win32";
const compile = spawnSync("npm", ["run", "compile"], { stdio: "inherit", shell: win });
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const npx = win ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["--no-install", "vsce", "package", "--out", output, "--no-dependencies"],
  { stdio: "inherit", shell: win },
);
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`vsix: ${path.resolve(output)}`);
