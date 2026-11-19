import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const directory = path.resolve("test/unit");
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => path.join(directory, name));

if (files.length === 0) {
  console.error("No unit tests found in test/unit");
  process.exit(1);
}

const binary = process.platform === "win32" ? "node_modules/.bin/tsx.cmd" : "node_modules/.bin/tsx";
const result = spawnSync(binary, ["--test", ...files], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
