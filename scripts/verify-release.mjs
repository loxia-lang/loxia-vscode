import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const changelog = readFileSync("CHANGELOG.md", "utf8");
const version = manifest.version;
const tag = process.env.GITHUB_REF_NAME ?? "";
const refType = process.env.GITHUB_REF_TYPE ?? "";

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`package.json version '${version}' is not semver`);
  process.exit(1);
}
if (refType === "tag" && tag !== `v${version}`) {
  console.error(`tag ${tag} does not match package.json version ${version}`);
  process.exit(1);
}
if (!changelog.includes(`## [${version}]`) && !changelog.includes(`## ${version}`)) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
if (manifest.publisher !== "loxia-lang" || manifest.name !== "loxia") {
  console.error("package.json must publish as loxia-lang.loxia");
  process.exit(1);
}

console.log(
  `release OK — ${manifest.publisher}.${manifest.name}@${version}${tag ? ` (${tag})` : ""}`,
);
