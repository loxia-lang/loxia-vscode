import { rmSync } from "node:fs";

for (const target of ["dist", "out", ".vscode-test"]) {
  rmSync(target, { recursive: true, force: true });
}
